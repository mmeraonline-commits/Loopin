import { NextRequest, NextResponse } from "next/server";
import { hasInsforgeAdminKey, insforgeAdmin } from "@/lib/insforge-admin";
import { updateUserIntegration } from "@/lib/integrations";
import { trackFeatureUsage } from "@/lib/track-feature-usage";

type OutlookIntegration = {
  connected?: boolean;
  accessToken?: string;
  refreshToken?: string | null;
  expiresAt?: number | null;
  email?: string | null;
  isSimulated?: boolean;
};

const OUTLOOK_SCOPES = [
  "openid",
  "profile",
  "offline_access",
  "User.Read",
  "Mail.Read",
  "Mail.Send",
  "Calendars.ReadWrite",
].join(" ");

async function getOutlookIntegration(userId: string) {
  const { data: dbUser, error } = await insforgeAdmin.database
    .from("users")
    .select("integrations")
    .eq("id", userId)
    .maybeSingle();

  if (error || !dbUser) return { integrations: null, outlook: null as OutlookIntegration | null };
  return {
    integrations: dbUser.integrations || {},
    outlook: (dbUser.integrations?.outlook as OutlookIntegration) || null,
  };
}

async function refreshOutlookToken(userId: string, outlook: OutlookIntegration, integrations: Record<string, unknown>) {
  if (!outlook.refreshToken) return outlook.accessToken || null;

  const needsRefresh = !outlook.expiresAt || outlook.expiresAt < Date.now() + 60_000;
  if (!needsRefresh && outlook.accessToken) return outlook.accessToken;

  const clientId = process.env.MICROSOFT_CLIENT_ID || process.env.OUTLOOK_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET || process.env.OUTLOOK_CLIENT_SECRET;
  if (!clientId || !clientSecret) return outlook.accessToken || null;

  const tokenRes = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: outlook.refreshToken,
      grant_type: "refresh_token",
      scope: OUTLOOK_SCOPES,
    }),
  });

  const tokenData = await tokenRes.json();
  if (!tokenRes.ok || tokenData.error) {
    throw new Error(tokenData.error_description || tokenData.error || "Failed to refresh Outlook token");
  }

  const updated = {
    ...outlook,
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token || outlook.refreshToken,
    expiresAt: Date.now() + (tokenData.expires_in || 3600) * 1000,
  };

  await updateUserIntegration(insforgeAdmin.database, userId, "outlook", {
    ...(typeof integrations.outlook === "object" && integrations.outlook
      ? (integrations.outlook as Record<string, unknown>)
      : {}),
    ...updated,
  });

  return updated.accessToken as string;
}

async function graphFetch(token: string, path: string, init?: RequestInit) {
  const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) {
    throw new Error(data.error?.message || `Microsoft Graph error (${res.status})`);
  }
  return data;
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

    const { integrations, outlook } = await getOutlookIntegration(userId);
    if (!outlook?.connected || !outlook.accessToken || outlook.isSimulated) {
      return NextResponse.json(
        {
          jsonrpc: "2.0",
          error: { code: -32001, message: "Outlook is not connected with a real OAuth token." },
          id,
        },
        { status: 400 }
      );
    }

    const token = await refreshOutlookToken(userId, outlook, integrations || {});
    if (!token) {
      return NextResponse.json(
        {
          jsonrpc: "2.0",
          error: { code: -32001, message: "Outlook access token is unavailable." },
          id,
        },
        { status: 400 }
      );
    }

    let result = null;
    let error = null;

    switch (method) {
      case "outlook_list_messages": {
        const maxResults = Number(params?.maxResults || 15);
        const data = await graphFetch(
          token,
          `/me/messages?$top=${maxResults}&$select=id,subject,from,receivedDateTime,bodyPreview,isRead&$orderby=receivedDateTime desc`
        );
        result = mcpText({
          messages: (data.value || []).map((m: {
            id: string;
            subject?: string;
            from?: { emailAddress?: { name?: string; address?: string } };
            receivedDateTime?: string;
            bodyPreview?: string;
            isRead?: boolean;
          }) => ({
            id: m.id,
            subject: m.subject || "(no subject)",
            from: m.from?.emailAddress?.name || m.from?.emailAddress?.address || "Unknown",
            email: m.from?.emailAddress?.address || "",
            date: m.receivedDateTime,
            snippet: m.bodyPreview || "",
            isRead: !!m.isRead,
          })),
        });
        break;
      }

      case "outlook_list_events": {
        const now = new Date();
        const timeMin = params?.timeMin || now.toISOString();
        const timeMax =
          params?.timeMax ||
          new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
        const data = await graphFetch(
          token,
          `/me/calendarView?startDateTime=${encodeURIComponent(timeMin)}&endDateTime=${encodeURIComponent(timeMax)}&$top=20&$orderby=start/dateTime`
        );
        result = mcpText({
          events: (data.value || []).map((e: {
            id: string;
            subject?: string;
            start?: { dateTime?: string; date?: string };
            end?: { dateTime?: string; date?: string };
            location?: { displayName?: string };
            isOnlineMeeting?: boolean;
          }) => ({
            id: e.id,
            title: e.subject || "(no title)",
            start: e.start?.dateTime || e.start?.date,
            end: e.end?.dateTime || e.end?.date,
            location: e.location?.displayName || "",
            isOnlineMeeting: !!e.isOnlineMeeting,
          })),
        });
        break;
      }

      case "outlook_create_event": {
        const summary = params?.summary;
        const start = params?.start;
        const end = params?.end;
        if (!summary || !start || !end) {
          error = { code: -32602, message: "Arguments 'summary', 'start', and 'end' are required" };
          break;
        }
        const created = await graphFetch(token, "/me/events", {
          method: "POST",
          body: JSON.stringify({
            subject: summary,
            start: { dateTime: start, timeZone: "UTC" },
            end: { dateTime: end, timeZone: "UTC" },
            body: {
              contentType: "Text",
              content: params?.description || "",
            },
          }),
        });
        result = mcpText({
          success: true,
          id: created.id,
          title: created.subject,
          webLink: created.webLink,
        });
        break;
      }

      case "outlook_disconnect": {
        await updateUserIntegration(insforgeAdmin.database, userId, "outlook", null);
        result = mcpText({ success: true, disconnected: true });
        break;
      }

      default:
        error = { code: -32601, message: `Method not found: ${method}` };
    }

    if (error) {
      return NextResponse.json({ jsonrpc: "2.0", error, id }, { status: 400 });
    }

    void trackFeatureUsage({ userId, feature: "outlook", action: method || "use" });
    return NextResponse.json({ jsonrpc: "2.0", result, id });
  } catch (err: unknown) {
    console.error("Outlook MCP exception:", err);
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json(
      { jsonrpc: "2.0", error: { code: -32603, message }, id: 1 },
      { status: 500 }
    );
  }
}
