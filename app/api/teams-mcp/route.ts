import { NextRequest, NextResponse } from "next/server";
import { hasInsforgeAdminKey, insforgeAdmin } from "@/lib/insforge-admin";
import { updateUserIntegration } from "@/lib/integrations";
import { trackFeatureUsage } from "@/lib/track-feature-usage";

type TeamsIntegration = {
  connected?: boolean;
  accessToken?: string;
  refreshToken?: string | null;
  expiresAt?: number | null;
  email?: string | null;
  displayName?: string | null;
  isSimulated?: boolean;
};

const TEAMS_SCOPES = [
  "openid",
  "profile",
  "offline_access",
  "User.Read",
  "Chat.ReadWrite",
  "ChannelMessage.Read.All",
  "ChannelMessage.Send",
  "Team.ReadBasic.All",
  "Channel.ReadBasic.All",
].join(" ");

const SIMULATED_CHATS = [
  { id: "19:sim-chat-1", topic: "Product Sync", chatType: "group" },
  { id: "19:sim-chat-2", topic: "Alex Rivera", chatType: "oneOnOne" },
];

const SIMULATED_MESSAGES: Record<string, Array<Record<string, unknown>>> = {
  "19:sim-chat-1": [
    {
      id: "msg-1",
      chatId: "19:sim-chat-1",
      chatName: "Product Sync",
      from: "Alex Rivera",
      body: "Can we review the launch checklist before Friday?",
      timestamp: new Date(Date.now() - 3600_000).toISOString(),
      fromMe: false,
    },
    {
      id: "msg-2",
      chatId: "19:sim-chat-1",
      chatName: "Product Sync",
      from: "You",
      body: "Yes — I'll send a draft this afternoon.",
      timestamp: new Date(Date.now() - 1800_000).toISOString(),
      fromMe: true,
    },
  ],
  "19:sim-chat-2": [
    {
      id: "msg-3",
      chatId: "19:sim-chat-2",
      chatName: "Alex Rivera",
      from: "Alex Rivera",
      body: "Are you free for a quick Teams huddle at 3?",
      timestamp: new Date(Date.now() - 900_000).toISOString(),
      fromMe: false,
    },
  ],
};

function mcpText(payload: unknown) {
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
  };
}

function messageBody(item: { body?: { content?: string; contentType?: string } }) {
  const raw = item.body?.content || "";
  if (item.body?.contentType === "html") {
    return raw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }
  return raw.trim();
}

async function getTeams(userId: string) {
  const { data: dbUser, error } = await insforgeAdmin.database
    .from("users")
    .select("integrations")
    .eq("id", userId)
    .maybeSingle();

  if (error || !dbUser) {
    return { integrations: null as Record<string, unknown> | null, teams: null as TeamsIntegration | null };
  }
  return {
    integrations: (dbUser.integrations || {}) as Record<string, unknown>,
    teams: (dbUser.integrations?.teams as TeamsIntegration) || null,
  };
}

async function refreshTeamsToken(
  userId: string,
  teams: TeamsIntegration,
  integrations: Record<string, unknown>
) {
  if (!teams.refreshToken) return teams.accessToken || null;

  const needsRefresh = !teams.expiresAt || teams.expiresAt < Date.now() + 60_000;
  if (!needsRefresh && teams.accessToken) return teams.accessToken;

  const clientId = process.env.MICROSOFT_CLIENT_ID || process.env.OUTLOOK_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET || process.env.OUTLOOK_CLIENT_SECRET;
  if (!clientId || !clientSecret) return teams.accessToken || null;

  const tokenRes = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: teams.refreshToken,
      grant_type: "refresh_token",
      scope: TEAMS_SCOPES,
    }),
  });

  const tokenData = await tokenRes.json();
  if (!tokenRes.ok || tokenData.error) {
    throw new Error(tokenData.error_description || tokenData.error || "Failed to refresh Teams token");
  }

  const updated = {
    ...teams,
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token || teams.refreshToken,
    expiresAt: Date.now() + (tokenData.expires_in || 3600) * 1000,
  };

  await updateUserIntegration(insforgeAdmin.database, userId, "teams", {
    ...(typeof integrations.teams === "object" && integrations.teams
      ? (integrations.teams as Record<string, unknown>)
      : {}),
    ...updated,
  });

  return updated.accessToken as string;
}

async function graphGet(token: string, path: string) {
  const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json.error?.message || `Graph GET ${path} failed (${res.status})`);
  }
  return json;
}

async function graphPost(token: string, path: string, body: unknown) {
  const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json.error?.message || `Graph POST ${path} failed (${res.status})`);
  }
  return json;
}

function chatLabel(chat: { topic?: string; chatType?: string; id?: string }) {
  return chat.topic || (chat.chatType === "oneOnOne" ? "Direct chat" : chat.id || "Teams chat");
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

    const { integrations, teams } = await getTeams(userId);
    if (!teams?.connected) {
      return NextResponse.json(
        {
          jsonrpc: "2.0",
          error: { code: -32001, message: "Microsoft Teams is not connected." },
          id,
        },
        { status: 400 }
      );
    }

    let result = null;
    let error: { code: number; message: string } | null = null;

    if (teams.isSimulated) {
      switch (method) {
        case "teams_list_chats": {
          result = mcpText({ chats: SIMULATED_CHATS });
          break;
        }
        case "teams_get_recent_messages": {
          const all = Object.values(SIMULATED_MESSAGES).flat();
          all.sort(
            (a, b) =>
              new Date(String(b.timestamp)).getTime() - new Date(String(a.timestamp)).getTime()
          );
          result = mcpText({ messages: all.slice(0, 25) });
          break;
        }
        case "teams_get_chat_history": {
          const chatId = params?.chatId as string | undefined;
          if (!chatId) {
            error = { code: -32602, message: "Argument 'chatId' is required" };
            break;
          }
          result = mcpText({ messages: SIMULATED_MESSAGES[chatId] || [] });
          break;
        }
        case "teams_send_message":
        case "teams_reply_message": {
          const chatId = (params?.chatId || params?.to) as string | undefined;
          const text = (params?.text || params?.body || params?.content) as string | undefined;
          if (!chatId || !text) {
            error = { code: -32602, message: "Arguments 'chatId' and 'text' are required" };
            break;
          }
          const msg = {
            id: `sim-${Date.now()}`,
            chatId,
            chatName: SIMULATED_CHATS.find((c) => c.id === chatId)?.topic || chatId,
            from: "You",
            body: text,
            timestamp: new Date().toISOString(),
            fromMe: true,
            replyToMessageId: params?.replyToMessageId || null,
          };
          if (!SIMULATED_MESSAGES[chatId]) SIMULATED_MESSAGES[chatId] = [];
          SIMULATED_MESSAGES[chatId].push(msg);
          result = mcpText({ success: true, message: msg });
          break;
        }
        default:
          error = { code: -32601, message: `Method not found: ${method}` };
      }

      if (error) {
        return NextResponse.json({ jsonrpc: "2.0", error, id }, { status: 400 });
      }
      void trackFeatureUsage({ userId, feature: "teams", action: method || "use" });
      return NextResponse.json({ jsonrpc: "2.0", result, id });
    }

    if (!teams.accessToken) {
      return NextResponse.json(
        {
          jsonrpc: "2.0",
          error: { code: -32001, message: "Teams is not connected with a real OAuth token." },
          id,
        },
        { status: 400 }
      );
    }

    const token = await refreshTeamsToken(userId, teams, integrations || {});

    switch (method) {
      case "teams_list_chats": {
        const data = await graphGet(token!, "/me/chats?$top=50&$expand=members");
        result = mcpText({
          chats: (data.value || []).map(
            (c: { id: string; topic?: string; chatType?: string }) => ({
              id: c.id,
              topic: chatLabel(c),
              chatType: c.chatType || "unknown",
            })
          ),
        });
        break;
      }

      case "teams_get_chat_history": {
        const chatId = params?.chatId as string | undefined;
        const limit = Number(params?.limit || 20);
        if (!chatId) {
          error = { code: -32602, message: "Argument 'chatId' is required" };
          break;
        }
        const data = await graphGet(
          token!,
          `/me/chats/${encodeURIComponent(chatId)}/messages?$top=${Math.min(50, Math.max(1, limit))}`
        );
        result = mcpText({
          messages: (data.value || []).map(
            (m: {
              id: string;
              createdDateTime?: string;
              from?: { user?: { displayName?: string } };
              body?: { content?: string; contentType?: string };
            }) => ({
              id: m.id,
              chatId,
              from: m.from?.user?.displayName || "Unknown",
              body: messageBody(m),
              timestamp: m.createdDateTime || null,
            })
          ),
        });
        break;
      }

      case "teams_get_recent_messages": {
        const chatsData = await graphGet(token!, "/me/chats?$top=10");
        const recent: Array<Record<string, unknown>> = [];
        for (const chat of (chatsData.value || []).slice(0, 6)) {
          try {
            const history = await graphGet(
              token!,
              `/me/chats/${encodeURIComponent(chat.id)}/messages?$top=5`
            );
            for (const m of history.value || []) {
              recent.push({
                id: m.id,
                chatId: chat.id,
                chatName: chatLabel(chat),
                from: m.from?.user?.displayName || "Unknown",
                body: messageBody(m),
                text: messageBody(m),
                timestamp: m.createdDateTime || null,
              });
            }
          } catch {
            // skip chats we can't read
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

      case "teams_send_message":
      case "teams_reply_message": {
        const chatId = (params?.chatId || params?.to || params?.channelId) as string | undefined;
        const text = (params?.text || params?.body || params?.content) as string | undefined;
        if (!chatId || !text) {
          error = { code: -32602, message: "Arguments 'chatId' and 'text' are required" };
          break;
        }
        const created = await graphPost(token!, `/me/chats/${encodeURIComponent(chatId)}/messages`, {
          body: { contentType: "text", content: text },
        });
        result = mcpText({
          success: true,
          id: created.id,
          chatId,
          timestamp: created.createdDateTime || null,
        });
        break;
      }

      default:
        error = { code: -32601, message: `Method not found: ${method}` };
    }

    if (error) {
      return NextResponse.json({ jsonrpc: "2.0", error, id }, { status: 400 });
    }

    void trackFeatureUsage({ userId, feature: "teams", action: method || "use" });
    return NextResponse.json({ jsonrpc: "2.0", result, id });
  } catch (err: unknown) {
    console.error("Teams MCP exception:", err);
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json(
      { jsonrpc: "2.0", error: { code: -32603, message }, id: 1 },
      { status: 500 }
    );
  }
}
