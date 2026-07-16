import { NextRequest, NextResponse } from "next/server";
import { hasInsforgeAdminKey, insforgeAdmin } from "@/lib/insforge-admin";
import { trackFeatureUsage } from "@/lib/track-feature-usage";

type DiscordIntegration = {
  connected?: boolean;
  accessToken?: string;
  refreshToken?: string | null;
  expiresAt?: number | null;
  guildId?: string | null;
  isSimulated?: boolean;
};

async function getDiscordIntegration(userId: string): Promise<DiscordIntegration | null> {
  const { data: dbUser, error } = await insforgeAdmin.database
    .from("users")
    .select("integrations")
    .eq("id", userId)
    .maybeSingle();

  if (error || !dbUser) return null;
  return (dbUser.integrations?.discord as DiscordIntegration) || null;
}

async function discordFetch(path: string, token: string, init?: RequestInit) {
  const res = await fetch(`https://discord.com/api/v10${path}`, {
    ...init,
    headers: {
      Authorization: token.startsWith("Bot ") ? token : `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) {
    throw new Error(data.message || data.error || `Discord API error (${res.status})`);
  }
  return data;
}

function mcpText(payload: unknown) {
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
  };
}

function botAuth() {
  const token = process.env.DISCORD_BOT_TOKEN;
  return token ? `Bot ${token}` : null;
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

    const discord = await getDiscordIntegration(userId);
    if (!discord?.connected || !discord.accessToken || discord.isSimulated) {
      return NextResponse.json(
        {
          jsonrpc: "2.0",
          error: { code: -32001, message: "Discord is not connected with a real OAuth token." },
          id,
        },
        { status: 400 }
      );
    }

    let result = null;
    let error = null;

    switch (method) {
      case "discord_get_guilds": {
        const guilds = await discordFetch("/users/@me/guilds", discord.accessToken);
        result = mcpText({
          guilds: (guilds || []).map((g: { id: string; name: string; owner?: boolean; icon?: string }) => ({
            id: g.id,
            name: g.name,
            owner: !!g.owner,
            icon: g.icon || null,
          })),
        });
        break;
      }

      case "discord_get_channels": {
        const bot = botAuth();
        if (!bot) {
          error = {
            code: -32004,
            message: "DISCORD_BOT_TOKEN is required to list channels. Add it to .env.local.",
          };
          break;
        }
        const guildId = params?.guildId || discord.guildId;
        if (!guildId) {
          error = { code: -32602, message: "Argument 'guildId' is required (or reconnect and pick a server)." };
          break;
        }
        const channels = await discordFetch(`/guilds/${guildId}/channels`, bot);
        result = mcpText({
          channels: (channels || [])
            .filter((c: { type: number }) => c.type === 0 || c.type === 5)
            .map((c: { id: string; name: string; type: number; position?: number }) => ({
              id: c.id,
              name: c.name,
              type: c.type,
              position: c.position ?? 0,
            })),
        });
        break;
      }

      case "discord_get_recent_messages": {
        const bot = botAuth();
        if (!bot) {
          error = {
            code: -32004,
            message: "DISCORD_BOT_TOKEN is required to read messages. Add it to .env.local.",
          };
          break;
        }
        const guildId = params?.guildId || discord.guildId;
        if (!guildId) {
          error = { code: -32602, message: "Argument 'guildId' is required." };
          break;
        }
        const channels = await discordFetch(`/guilds/${guildId}/channels`, bot);
        const textChannels = (channels || [])
          .filter((c: { type: number }) => c.type === 0)
          .slice(0, 5);

        const recent: Array<Record<string, unknown>> = [];
        for (const channel of textChannels) {
          try {
            const messages = await discordFetch(`/channels/${channel.id}/messages?limit=5`, bot);
            for (const m of messages || []) {
              recent.push({
                id: m.id,
                messageId: m.id,
                channelId: channel.id,
                channelName: channel.name,
                guildId,
                author: m.author?.global_name || m.author?.username || "unknown",
                content: m.content || "",
                timestamp: m.timestamp,
                canReply: true,
              });
            }
          } catch {
            // Missing access to some channels is normal
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

      case "discord_post_message":
      case "discord_reply_message": {
        const bot = botAuth();
        if (!bot) {
          error = {
            code: -32004,
            message: "DISCORD_BOT_TOKEN is required to post/reply. Add it to .env.local.",
          };
          break;
        }
        const channelId = params?.channelId;
        const content = params?.content || params?.text;
        const replyToMessageId =
          params?.replyToMessageId ||
          params?.messageId ||
          params?.message_id ||
          null;
        if (!channelId || !content) {
          error = {
            code: -32602,
            message:
              method === "discord_reply_message"
                ? "Arguments 'channelId', 'content', and 'replyToMessageId' (or messageId) are required"
                : "Arguments 'channelId' and 'content' are required",
          };
          break;
        }
        if (method === "discord_reply_message" && !replyToMessageId) {
          error = {
            code: -32602,
            message: "Argument 'replyToMessageId' (or messageId) is required to reply",
          };
          break;
        }

        const body: Record<string, unknown> = {
          content: String(content).slice(0, 2000),
        };
        if (replyToMessageId) {
          body.message_reference = {
            message_id: String(replyToMessageId),
            channel_id: String(channelId),
            fail_if_not_exists: false,
          };
          // Show as reply ping without forcing mention noise
          body.allowed_mentions = { replied_user: Boolean(params?.mentionAuthor) };
        }

        const posted = await discordFetch(`/channels/${channelId}/messages`, bot, {
          method: "POST",
          body: JSON.stringify(body),
        });
        result = mcpText({
          ok: true,
          id: posted.id,
          channelId,
          content: posted.content,
          repliedTo: replyToMessageId || null,
          isReply: Boolean(replyToMessageId),
        });
        break;
      }

      default:
        error = { code: -32601, message: `Method not found: ${method}` };
    }

    if (error) {
      return NextResponse.json({ jsonrpc: "2.0", error, id }, { status: 400 });
    }

    void trackFeatureUsage({ userId, feature: "discord", action: method || "use" });
    return NextResponse.json({ jsonrpc: "2.0", result, id });
  } catch (err: unknown) {
    console.error("Discord MCP error:", err);
    return NextResponse.json(
      {
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message: err instanceof Error ? err.message : "Internal Server Error",
        },
        id: 1,
      },
      { status: 500 }
    );
  }
}
