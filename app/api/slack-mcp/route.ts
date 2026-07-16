import { NextRequest, NextResponse } from "next/server";
import { hasInsforgeAdminKey, insforgeAdmin } from "@/lib/insforge-admin";
import { updateUserIntegration } from "@/lib/integrations";
import { trackFeatureUsage } from "@/lib/track-feature-usage";

type SlackIntegration = {
  connected?: boolean;
  accessToken?: string;
  refreshToken?: string | null;
  expiresAt?: number | null;
  isSimulated?: boolean;
};

async function getSlackIntegration(userId: string): Promise<SlackIntegration | null> {
  const { data: dbUser, error } = await insforgeAdmin.database
    .from("users")
    .select("integrations")
    .eq("id", userId)
    .maybeSingle();

  if (error || !dbUser) return null;
  return (dbUser.integrations?.slack as SlackIntegration) || null;
}

async function slackApi(token: string, method: string, params: Record<string, string> = {}) {
  const res = await fetch(`https://slack.com/api/${method}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(params),
  });
  return res.json();
}

function mcpText(payload: unknown) {
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
  };
}

export async function POST(req: NextRequest) {
  try {
    const { method, params, userId, id = 1 } = await req.json();

    if (!method || !userId) {
      return NextResponse.json(
        {
          jsonrpc: "2.0",
          error: { code: -32600, message: "Invalid Request: method and userId are required" },
          id,
        },
        { status: 400 }
      );
    }

    if (!hasInsforgeAdminKey) {
      return NextResponse.json(
        {
          jsonrpc: "2.0",
          error: { code: -32003, message: "Server database key is not configured." },
          id,
        },
        { status: 500 }
      );
    }

    const slack = await getSlackIntegration(userId);
    if (!slack?.connected || !slack.accessToken || slack.isSimulated) {
      return NextResponse.json(
        {
          jsonrpc: "2.0",
          error: { code: -32001, message: "Slack is not connected with a real OAuth token." },
          id,
        },
        { status: 400 }
      );
    }

    let result = null;
    let error = null;

    switch (method) {
      case "slack_list_channels": {
        const data = await slackApi(slack.accessToken, "conversations.list", {
          types: params?.types || "public_channel,private_channel",
          limit: String(params?.limit || 50),
          exclude_archived: "true",
        });
        if (!data.ok) {
          error = { code: -32002, message: data.error || "Failed to list Slack channels" };
          break;
        }
        result = mcpText({
          channels: (data.channels || []).map((c: { id: string; name: string; is_private?: boolean; num_members?: number }) => ({
            id: c.id,
            name: c.name,
            isPrivate: !!c.is_private,
            members: c.num_members || 0,
          })),
        });
        break;
      }

      case "slack_get_history": {
        const channelId = params?.channelId;
        if (!channelId) {
          error = { code: -32602, message: "Argument 'channelId' is required" };
          break;
        }
        const data = await slackApi(slack.accessToken, "conversations.history", {
          channel: channelId,
          limit: String(params?.limit || 20),
        });
        if (!data.ok) {
          error = { code: -32002, message: data.error || "Failed to fetch Slack history" };
          break;
        }
        result = mcpText({
          messages: (data.messages || []).map((m: { user?: string; text?: string; ts?: string }) => ({
            user: m.user || "unknown",
            text: m.text || "",
            ts: m.ts,
            timestamp: m.ts ? new Date(Number(m.ts) * 1000).toISOString() : null,
          })),
        });
        break;
      }

      case "slack_get_recent_messages": {
        const channelsData = await slackApi(slack.accessToken, "conversations.list", {
          types: "public_channel,private_channel",
          limit: "10",
          exclude_archived: "true",
        });
        if (!channelsData.ok) {
          error = { code: -32002, message: channelsData.error || "Failed to list Slack channels" };
          break;
        }

        const recent: Array<Record<string, unknown>> = [];
        for (const channel of (channelsData.channels || []).slice(0, 5)) {
          const history = await slackApi(slack.accessToken, "conversations.history", {
            channel: channel.id,
            limit: "5",
          });
          if (!history.ok) continue;
          for (const m of history.messages || []) {
            recent.push({
              channelId: channel.id,
              channelName: channel.name,
              user: m.user || "unknown",
              text: m.text || "",
              timestamp: m.ts ? new Date(Number(m.ts) * 1000).toISOString() : null,
            });
          }
        }

        recent.sort((a, b) => {
          const at = a.timestamp ? new Date(String(a.timestamp)).getTime() : 0;
          const bt = b.timestamp ? new Date(String(b.timestamp)).getTime() : 0;
          return bt - at;
        });

        result = mcpText({ messages: recent.slice(0, 25) });
        break;
      }

      case "slack_post_message": {
        const channelId = params?.channelId;
        const text = params?.text;
        if (!channelId || !text) {
          error = { code: -32602, message: "Arguments 'channelId' and 'text' are required" };
          break;
        }
        const data = await slackApi(slack.accessToken, "chat.postMessage", {
          channel: channelId,
          text,
          ...(params?.thread_ts ? { thread_ts: String(params.thread_ts) } : {}),
        });
        if (!data.ok) {
          error = { code: -32002, message: data.error || "Failed to post Slack message" };
          break;
        }
        result = mcpText({
          success: true,
          channel: data.channel,
          ts: data.ts,
        });
        break;
      }

      case "slack_disconnect": {
        await updateUserIntegration(insforgeAdmin.database, userId, "slack", null);
        result = mcpText({ success: true, disconnected: true });
        break;
      }

      default:
        error = { code: -32601, message: `Method not found: ${method}` };
    }

    if (error) {
      return NextResponse.json({ jsonrpc: "2.0", error, id }, { status: 400 });
    }

    void trackFeatureUsage({ userId, feature: "slack", action: method || "use" });
    return NextResponse.json({ jsonrpc: "2.0", result, id });
  } catch (err: unknown) {
    console.error("Slack MCP exception:", err);
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json(
      { jsonrpc: "2.0", error: { code: -32603, message }, id: 1 },
      { status: 500 }
    );
  }
}
