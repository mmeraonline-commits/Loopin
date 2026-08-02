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

/** Mail.ReadWrite required for categories + draft replies. */
const OUTLOOK_SCOPES = [
  "openid",
  "profile",
  "offline_access",
  "User.Read",
  "Mail.ReadWrite",
  "Mail.Send",
  "MailboxSettings.ReadWrite",
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

async function refreshOutlookToken(
  userId: string,
  outlook: OutlookIntegration,
  integrations: Record<string, unknown>
) {
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

async function graphFetch(token: string, path: string, init?: RequestInit & { preferTextBody?: boolean }) {
  const { preferTextBody, ...fetchInit } = init || {};
  const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    ...fetchInit,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(preferTextBody ? { Prefer: 'outlook.body-content-type="text"' } : {}),
      ...(fetchInit.headers || {}),
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

function mapMessage(m: {
  id: string;
  conversationId?: string;
  subject?: string;
  from?: { emailAddress?: { name?: string; address?: string } };
  receivedDateTime?: string;
  bodyPreview?: string;
  body?: { content?: string; contentType?: string };
  isRead?: boolean;
  isDraft?: boolean;
  categories?: string[];
  internetMessageId?: string;
}) {
  const address = m.from?.emailAddress?.address || "";
  const name = m.from?.emailAddress?.name || "";
  const from = name && address ? `${name} <${address}>` : name || address || "Unknown";
  return {
    id: m.id,
    conversationId: m.conversationId || "",
    threadId: m.conversationId || "",
    subject: m.subject || "(no subject)",
    from,
    email: address,
    date: m.receivedDateTime,
    snippet: m.bodyPreview || "",
    body: m.body?.content || m.bodyPreview || "",
    isRead: !!m.isRead,
    isDraft: !!m.isDraft,
    categories: m.categories || [],
    labels: m.categories || [],
    rfcMessageId: m.internetMessageId || undefined,
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
        const maxResults = Math.min(Number(params?.maxResults || 15), 25);
        const includeBody = params?.includeBody === true;
        const folder = String(params?.folder || "inbox");
        const select = [
          "id",
          "conversationId",
          "subject",
          "from",
          "receivedDateTime",
          "bodyPreview",
          "isRead",
          "isDraft",
          "categories",
          "internetMessageId",
          ...(includeBody ? ["body"] : []),
        ].join(",");
        const path =
          folder === "inbox"
            ? `/me/mailFolders/inbox/messages?$top=${maxResults}&$select=${select}&$orderby=receivedDateTime desc`
            : `/me/messages?$top=${maxResults}&$select=${select}&$orderby=receivedDateTime desc`;
        const data = await graphFetch(token, path, { preferTextBody: includeBody });
        result = mcpText({
          messages: (data.value || []).map(mapMessage),
        });
        break;
      }

      case "outlook_get_message": {
        const messageId = params?.id;
        if (!messageId) {
          error = { code: -32602, message: "Argument 'id' is required" };
          break;
        }
        const detail = await graphFetch(
          token,
          `/me/messages/${encodeURIComponent(messageId)}?$select=id,conversationId,subject,from,receivedDateTime,bodyPreview,body,isRead,isDraft,categories,internetMessageId`,
          { preferTextBody: true }
        );
        result = mcpText(mapMessage(detail));
        break;
      }

      case "outlook_ensure_categories": {
        const defs = (params?.categories || []) as Array<{
          name: string;
          color?: string;
        }>;
        const existing = await graphFetch(token, "/me/outlook/masterCategories");
        const byName = new Map<string, string>(
          (existing.value || []).map((c: { displayName?: string; id?: string }) => [
            String(c.displayName || ""),
            String(c.id || ""),
          ])
        );
        const categoryIds: Record<string, string> = {};
        for (const def of defs) {
          if (!def.name) continue;
          const found = byName.get(def.name);
          if (found) {
            categoryIds[def.name] = found;
            continue;
          }
          const created = await graphFetch(token, "/me/outlook/masterCategories", {
            method: "POST",
            body: JSON.stringify({
              displayName: def.name,
              color: def.color || "preset0",
            }),
          });
          categoryIds[def.name] = created.id;
          byName.set(def.name, created.id);
        }
        result = mcpText({ categoryIds, categories: Object.keys(categoryIds) });
        break;
      }

      case "outlook_set_categories": {
        const messageId = params?.messageId as string | undefined;
        const add = (params?.addCategories || []) as string[];
        const remove = (params?.removeCategories || []) as string[];
        if (!messageId) {
          error = { code: -32602, message: "Argument 'messageId' is required" };
          break;
        }
        const current = await graphFetch(
          token,
          `/me/messages/${encodeURIComponent(messageId)}?$select=id,categories`
        );
        const set = new Set<string>((current.categories || []) as string[]);
        for (const c of add) if (c) set.add(c);
        for (const c of remove) set.delete(c);
        const categories = Array.from(set);
        await graphFetch(token, `/me/messages/${encodeURIComponent(messageId)}`, {
          method: "PATCH",
          body: JSON.stringify({ categories }),
        });
        result = mcpText({ success: true, messageId, categories });
        break;
      }

      case "outlook_create_reply_draft": {
        const messageId = params?.messageId as string | undefined;
        const body = String(params?.body || "");
        if (!messageId) {
          error = { code: -32602, message: "Argument 'messageId' is required" };
          break;
        }
        if (!body.trim()) {
          error = { code: -32602, message: "Argument 'body' is required" };
          break;
        }
        // createReply with comment sets the reply text; never sends.
        const draft = await graphFetch(
          token,
          `/me/messages/${encodeURIComponent(messageId)}/createReply`,
          {
            method: "POST",
            body: JSON.stringify({ comment: body }),
          }
        );
        result = mcpText({
          success: true,
          draft: {
            id: draft.id,
            conversationId: draft.conversationId,
            subject: draft.subject,
            webLink: draft.webLink,
          },
        });
        break;
      }

      case "outlook_conversation_has_draft": {
        const conversationId = params?.conversationId as string | undefined;
        if (!conversationId) {
          error = { code: -32602, message: "Argument 'conversationId' is required" };
          break;
        }
        // Escape single quotes for OData string literal
        const escaped = conversationId.replace(/'/g, "''");
        const data = await graphFetch(
          token,
          `/me/mailFolders/drafts/messages?$filter=conversationId eq '${escaped}'&$top=1&$select=id,conversationId,isDraft`
        );
        const drafts = data.value || [];
        result = mcpText({ hasDraft: drafts.length > 0, draftId: drafts[0]?.id || null });
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
          events: (data.value || []).map(
            (e: {
              id: string;
              subject?: string;
              start?: { dateTime?: string; date?: string };
              end?: { dateTime?: string; date?: string };
              location?: { displayName?: string };
              isOnlineMeeting?: boolean;
              webLink?: string;
            }) => ({
              id: e.id,
              title: e.subject || "(no title)",
              start: e.start?.dateTime || e.start?.date,
              end: e.end?.dateTime || e.end?.date,
              location: e.location?.displayName || "",
              isOnlineMeeting: !!e.isOnlineMeeting,
              webLink: e.webLink || "",
            })
          ),
        });
        break;
      }

      case "outlook_create_event": {
        const summary = params?.summary;
        const start = params?.start;
        const end = params?.end;
        const timeZone = String(params?.timeZone || "UTC");
        if (!summary || !start || !end) {
          error = { code: -32602, message: "Arguments 'summary', 'start', and 'end' are required" };
          break;
        }
        // Graph expects local wall-clock in dateTime + IANA/Windows timeZone (UTC ok).
        const startDt = String(start).replace(/Z$/i, "").replace(/([+-]\d{2}:\d{2})$/, "");
        const endDt = String(end).replace(/Z$/i, "").replace(/([+-]\d{2}:\d{2})$/, "");
        const created = await graphFetch(token, "/me/events", {
          method: "POST",
          body: JSON.stringify({
            subject: summary,
            start: { dateTime: startDt, timeZone },
            end: { dateTime: endDt, timeZone },
            body: {
              contentType: "Text",
              content: params?.description || "",
            },
            isReminderOn: params?.isReminderOn !== false,
            reminderMinutesBeforeStart:
              typeof params?.reminderMinutesBeforeStart === "number"
                ? params.reminderMinutesBeforeStart
                : 30,
          }),
        });
        result = mcpText({
          success: true,
          id: created.id,
          title: created.subject,
          webLink: created.webLink,
          start: created.start,
          end: created.end,
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
