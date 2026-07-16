/**
 * Snoooz-style Gmail: label new mail + create in-thread drafts in Gmail (not dashboard-only).
 * Only processes unread inbox messages without Loopin/Processed, received after sync start.
 */

import { hasInsforgeAdminKey, insforgeAdmin } from "./insforge-admin";
import {
  classifyGmailMessage,
  loopinLabelForCategory,
  LOOPIN_LABEL_NAMES,
} from "./gmail-email-classifier";
import { generateAlertReplyDraft, loadAssistantSettings } from "./auto-draft-reply";

const APP_URL = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

const LOOPIN_LABEL_DEFS = [
  { name: LOOPIN_LABEL_NAMES.promotional, bg: "#653e9b", text: "#ffffff" },
  { name: LOOPIN_LABEL_NAMES.notification, bg: "#666666", text: "#ffffff" },
  { name: LOOPIN_LABEL_NAMES.needs_reply, bg: "#ffad47", text: "#000000" },
  { name: LOOPIN_LABEL_NAMES.urgent, bg: "#fb4c2f", text: "#ffffff" },
  { name: LOOPIN_LABEL_NAMES.processed, bg: "#4986e7", text: "#ffffff" },
];

type GmailLabelMap = Record<string, string>;

type AssistantGmailSettings = {
  gmailInboxSyncStartedAt?: string;
  gmailLabelIds?: GmailLabelMap;
};

type GmailListMessage = {
  id: string;
  threadId?: string;
  from?: string;
  subject?: string;
  snippet?: string;
  body?: string;
  date?: string;
  labels?: string[];
  rfcMessageId?: string;
};

async function callGmailMcp(userId: string, method: string, params: Record<string, unknown> = {}) {
  const res = await fetch(`${APP_URL}/api/gmail-mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ method, params, userId }),
  });
  const json = await res.json();
  if (json.error) {
    throw new Error(json.error.message || "Gmail MCP error");
  }
  const text = json.result?.content?.[0]?.text;
  return text ? JSON.parse(text) : json.result;
}

function parseReplyTo(from: string): string {
  const match = from.match(/<([^>]+)>/);
  return match ? match[1] : from.trim();
}

function formatGmailAfterDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}/${m}/${day}`;
}

async function loadGmailAssistantSettings(userId: string): Promise<AssistantGmailSettings> {
  if (!hasInsforgeAdminKey) return {};
  const { data } = await insforgeAdmin.database
    .from("users")
    .select("assistant_settings")
    .eq("id", userId)
    .maybeSingle();
  return ((data?.assistant_settings || {}) as AssistantGmailSettings) || {};
}

async function saveGmailAssistantSettings(userId: string, patch: AssistantGmailSettings) {
  if (!hasInsforgeAdminKey) return;
  const current = await loadGmailAssistantSettings(userId);
  await insforgeAdmin.database
    .from("users")
    .update({
      assistant_settings: { ...current, ...patch },
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);
}

async function ensureLoopinLabels(userId: string): Promise<GmailLabelMap> {
  const result = await callGmailMcp(userId, "gmail_ensure_labels", {
    labels: LOOPIN_LABEL_DEFS,
  });
  const map: GmailLabelMap = { ...(result.labelIds || {}) };
  await saveGmailAssistantSettings(userId, { gmailLabelIds: map });
  return map;
}

async function fetchNewUnprocessedMessages(
  userId: string,
  syncStartedAt: string
): Promise<GmailListMessage[]> {
  const after = formatGmailAfterDate(syncStartedAt);
  const q = after
    ? `label:inbox is:unread -label:${LOOPIN_LABEL_NAMES.processed} after:${after} newer_than:3d`
    : `label:inbox is:unread -label:${LOOPIN_LABEL_NAMES.processed} newer_than:1d`;

  const list = await callGmailMcp(userId, "gmail_list_messages", {
    q,
    maxResults: 12,
    includeBody: true,
  });

  const messages: GmailListMessage[] = list.messages || [];
  const startedMs = new Date(syncStartedAt).getTime();

  return messages.filter((m) => {
    if (!m.date) return true;
    const msgMs = new Date(m.date).getTime();
    return Number.isNaN(startedMs) || msgMs >= startedMs - 60_000;
  });
}

export type GmailNativeInboxResult = {
  scanned: number;
  labeled: number;
  drafted: number;
  skipped: number;
  categories: Record<string, number>;
  error?: string;
};

/**
 * Process only NEW Gmail since gmailInboxSyncStartedAt (set on first run).
 * Applies Loopin/* labels and creates real Gmail thread drafts for needs-reply/urgent human mail.
 */
export async function processNewGmailInbox(userId: string): Promise<GmailNativeInboxResult> {
  const empty: GmailNativeInboxResult = {
    scanned: 0,
    labeled: 0,
    drafted: 0,
    skipped: 0,
    categories: {},
  };

  if (!hasInsforgeAdminKey) {
    return { ...empty, error: "Missing INSFORGE_API_KEY" };
  }

  try {
    let settings = await loadGmailAssistantSettings(userId);
    const now = new Date().toISOString();

    if (!settings.gmailInboxSyncStartedAt) {
      await saveGmailAssistantSettings(userId, { gmailInboxSyncStartedAt: now });
      settings = { ...settings, gmailInboxSyncStartedAt: now };
    }

    const labelIds = await ensureLoopinLabels(userId);
    const processedLabelId = labelIds[LOOPIN_LABEL_NAMES.processed];

    const messages = await fetchNewUnprocessedMessages(userId, settings.gmailInboxSyncStartedAt!);
    if (messages.length === 0) return empty;

    const assistant = await loadAssistantSettings(userId);
    let labeled = 0;
    let drafted = 0;
    let skipped = 0;
    const categories: Record<string, number> = {};
    let draftBudget = 5;

    for (const msg of messages) {
      const classification = classifyGmailMessage({
        from: msg.from,
        subject: msg.subject,
        snippet: msg.snippet,
        body: msg.body,
        labels: msg.labels,
      });

      categories[classification.category] = (categories[classification.category] || 0) + 1;

      const addLabelNames: string[] = [];
      const categoryLabel = loopinLabelForCategory(classification.category);
      if (classification.shouldLabel && categoryLabel) {
        addLabelNames.push(categoryLabel);
      }

      const addLabelIds = addLabelNames
        .map((name) => labelIds[name])
        .filter(Boolean) as string[];

      const toMarkProcessed = processedLabelId ? [processedLabelId] : [];

      if (addLabelIds.length > 0 || toMarkProcessed.length > 0) {
        await callGmailMcp(userId, "gmail_modify_labels", {
          messageId: msg.id,
          addLabelIds: [...addLabelIds, ...toMarkProcessed],
        });
        if (addLabelIds.length > 0) labeled += 1;
      } else if (toMarkProcessed.length > 0) {
        await callGmailMcp(userId, "gmail_modify_labels", {
          messageId: msg.id,
          addLabelIds: toMarkProcessed,
        });
        skipped += 1;
      }

      if (
        classification.shouldDraft &&
        assistant.autoDraftReplies &&
        draftBudget > 0 &&
        msg.threadId
      ) {
        let full = msg;
        if (!msg.body || !msg.rfcMessageId) {
          full = await callGmailMcp(userId, "gmail_get_message", { id: msg.id });
        }

        const draftBody = await generateAlertReplyDraft({
          title: full.subject || "Email",
          description: full.snippet || "",
          fullDetails: full.body || full.snippet || "",
          sourceApp: "gmail",
          tone: assistant.responseTone,
        });

        if (draftBody) {
          const to = parseReplyTo(full.from || "");
          const subject = full.subject || "Re:";
          await callGmailMcp(userId, "gmail_create_draft", {
            to,
            subject: subject.startsWith("Re:") ? subject : `Re: ${subject}`,
            body: draftBody,
            threadId: full.threadId || msg.threadId,
            inReplyTo: full.rfcMessageId,
            references: full.rfcMessageId,
          });
          drafted += 1;
          draftBudget -= 1;
        }
      }
    }

    return {
      scanned: messages.length,
      labeled,
      drafted,
      skipped,
      categories,
    };
  } catch (err) {
    console.error("[gmail-native-inbox]", err);
    return {
      ...empty,
      error: err instanceof Error ? err.message : "Gmail native inbox failed",
    };
  }
}
