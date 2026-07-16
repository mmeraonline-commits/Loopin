import { hasInsforgeAdminKey, insforgeAdmin } from "./insforge-admin";
import {
  appLogo,
  fetchConnectedActivity,
  type AppActivity,
} from "./alert-auto-generation";
import { encodeReplyRef, type ReplyRef } from "./send-reply";
import { classifyInboxItem } from "./inbox-classify";

const APP_URL = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

const INBOX_APPS = new Set(["gmail", "whatsapp", "slack", "discord", "outlook"]);
const REPLYABLE_APPS = new Set(["gmail", "whatsapp", "slack", "discord"]);

type IntegrationValue = {
  connected?: boolean;
  isSimulated?: boolean;
};

export type InboxItem = {
  id: string;
  app: string;
  title: string;
  preview: string;
  body: string;
  from?: string;
  time?: string;
  unread?: boolean;
  canReply: boolean;
  logo: string;
  replyRef?: ReplyRef;
  fullDetails: string;
  labels?: string[];
  category?: string;
  needsReply?: boolean;
  classifyReason?: string;
  draftReply?: string | null;
};

function isString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function parseTime(value?: string): number {
  if (!value) return 0;
  const ms = Date.parse(value);
  if (!Number.isNaN(ms)) return ms;
  const asNum = Number(value);
  if (!Number.isNaN(asNum)) return asNum < 1e12 ? asNum * 1000 : asNum;
  return 0;
}

export async function getConnectedInboxApps(userId: string): Promise<string[]> {
  if (!hasInsforgeAdminKey) return [];

  const { data: userRow, error } = await insforgeAdmin.database
    .from("users")
    .select("integrations")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.error("[inbox] User integrations fetch failed:", error);
    return [];
  }

  const integrations = ((userRow as { integrations?: Record<string, IntegrationValue | null> } | null)
    ?.integrations || {}) as Record<string, IntegrationValue | null>;

  return Object.entries(integrations)
    .filter(([, value]) => !!value?.connected && !value?.isSimulated)
    .map(([key]) => key)
    .filter((app) => INBOX_APPS.has(app));
}

async function fetchOutlookActivity(userId: string): Promise<AppActivity[]> {
  try {
    const res = await fetch(`${APP_URL}/api/outlook-mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        method: "outlook_list_messages",
        params: { maxResults: 20 },
        userId,
      }),
    });
    const json = await res.json();
    const text = json.result?.content?.[0]?.text;
    const messages = text ? JSON.parse(text).messages || [] : [];

    return (messages as Array<{
      id?: string;
      subject?: string;
      from?: string;
      email?: string;
      snippet?: string;
      date?: string;
      isRead?: boolean;
    }>).map((message) => ({
      id: message.id || `outlook-${message.date}`,
      app: "outlook",
      title: message.subject || "Outlook message",
      description: message.snippet || "",
      body: `From: ${message.from || "Unknown"}${message.email ? ` <${message.email}>` : ""}\nSubject: ${message.subject || ""}\n${message.snippet || ""}`,
      time: message.date,
      unread: message.isRead === false,
      replyRef: {
        app: "outlook",
        messageId: message.id,
        emailId: message.id,
      },
    }));
  } catch (error) {
    console.error("[inbox] Outlook MCP fetch failed:", error);
    return [];
  }
}

function extractFrom(app: string, title: string, body: string, description: string): string | undefined {
  if (app === "gmail" || app === "outlook") {
    const match = body.match(/From:\s*(.+)/i);
    return match?.[1]?.trim() || undefined;
  }
  if (app === "discord") {
    const author = body.split(":")[0]?.trim();
    return author || undefined;
  }
  if (app === "whatsapp") return title;
  if (app === "slack") return description ? undefined : title;
  return undefined;
}

function toInboxItem(activity: AppActivity & { unread?: boolean }): InboxItem {
  const fullDetails = activity.replyRef
    ? encodeReplyRef(activity.replyRef, activity.body || activity.description || "")
    : activity.body || activity.description || "";

  const from = extractFrom(activity.app, activity.title, activity.body, activity.description);
  const classified = classifyInboxItem({
    app: activity.app,
    title: activity.title,
    preview: activity.description,
    body: activity.body,
    from,
    labels: activity.labels,
  });

  return {
    id: `${activity.app}:${activity.id}`,
    app: activity.app,
    title: activity.title,
    preview: activity.description || activity.body || "",
    body: activity.body || activity.description || "",
    from,
    time: activity.time,
    unread:
      activity.unread ??
      (activity.app === "gmail" ? true : false),
    canReply: REPLYABLE_APPS.has(activity.app),
    logo: appLogo(activity.app),
    replyRef: activity.replyRef,
    fullDetails,
    labels: activity.labels,
    category: classified.category,
    needsReply: classified.needsReply,
    classifyReason: classified.reason,
  };
}

export async function fetchInboxItems(userId: string): Promise<{
  items: InboxItem[];
  connectedApps: string[];
}> {
  const connectedApps = await getConnectedInboxApps(userId);
  if (connectedApps.length === 0) {
    return { items: [], connectedApps: [] };
  }

  const monitorApps = connectedApps.filter((app) => app !== "outlook");
  const [activity, outlook] = await Promise.all([
    monitorApps.length > 0 ? fetchConnectedActivity(userId, monitorApps) : Promise.resolve([] as AppActivity[]),
    connectedApps.includes("outlook") ? fetchOutlookActivity(userId) : Promise.resolve([] as AppActivity[]),
  ]);

  const items = [...activity, ...outlook]
    .filter((item) => isString(item.id) && isString(item.app))
    .map((item) => toInboxItem(item))
    .sort((a, b) => parseTime(b.time) - parseTime(a.time));

  // Attach any saved inbox drafts from assistant_settings
  const { data: userRow } = await insforgeAdmin.database
    .from("users")
    .select("assistant_settings")
    .eq("id", userId)
    .maybeSingle();
  const drafts =
    ((userRow?.assistant_settings as { inboxDrafts?: Record<string, string> } | null)?.inboxDrafts) ||
    {};

  for (const item of items) {
    if (drafts[item.id]) {
      item.draftReply = drafts[item.id];
    }
  }

  return { items, connectedApps };
}
