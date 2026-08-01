/**
 * Outlook auto-triage: same categories as Gmail (Urgent / Needs Reply /
 * Notification / Promotional / Other), applied as native Outlook categories,
 * plus (Pro+) tone-matched reply drafts via createReply. Never sends.
 */

import { GoogleGenAI } from "@google/genai";
import { hasInsforgeAdminKey, insforgeAdmin } from "./insforge-admin";
import { getPlan, planRank } from "./plans";
import {
  classifyGmailMessage,
  isLoopinOwnEmail,
  isNotificationEmail,
  isPromotionalEmail,
  LOOPIN_LABEL_NAMES,
  type GmailMessageInput,
} from "./gmail-email-classifier";
import { generateAlertReplyDraft, loadAssistantSettings } from "./auto-draft-reply";

const APP_URL =
  process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export type TriageCategory = "urgent" | "needs_reply" | "notification" | "promotional" | "other";

/** Graph masterCategory color presets (closest to Gmail label colors). */
const TRIAGE_CATEGORY_DEFS = [
  { name: LOOPIN_LABEL_NAMES.urgent, color: "preset0" },
  { name: LOOPIN_LABEL_NAMES.needs_reply, color: "preset3" },
  { name: LOOPIN_LABEL_NAMES.notification, color: "preset12" },
  { name: LOOPIN_LABEL_NAMES.promotional, color: "preset8" },
  { name: LOOPIN_LABEL_NAMES.processed, color: "preset7" },
];

function categoryNameFor(category: TriageCategory): string | null {
  switch (category) {
    case "urgent":
      return LOOPIN_LABEL_NAMES.urgent;
    case "needs_reply":
      return LOOPIN_LABEL_NAMES.needs_reply;
    case "notification":
      return LOOPIN_LABEL_NAMES.notification;
    case "promotional":
      return LOOPIN_LABEL_NAMES.promotional;
    case "other":
      return null;
  }
}

type OutlookSyncBookkeeping = {
  outlookInboxSyncStartedAt?: string;
  loopinOutlookDraftIds?: Array<{ id: string; createdAt: string; subject?: string }>;
};

type OutlookListMessage = {
  id: string;
  conversationId?: string;
  threadId?: string;
  from?: string;
  subject?: string;
  snippet?: string;
  body?: string;
  date?: string;
  categories?: string[];
  labels?: string[];
  rfcMessageId?: string;
};

type ClassifiedMessage = OutlookListMessage & { category: TriageCategory; reason: string };

type UserPlanRow = {
  plan?: string;
  integrations?: { outlook?: { connected?: boolean; isSimulated?: boolean } | null } | null;
  assistant_settings?: OutlookSyncBookkeeping | null;
};

async function callOutlookMcp(userId: string, method: string, params: Record<string, unknown> = {}) {
  const res = await fetch(`${APP_URL}/api/outlook-mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ method, params, userId }),
  });
  const json = await res.json();
  if (json.error) {
    throw new Error(json.error.message || `Outlook MCP error (${method})`);
  }
  const text = json.result?.content?.[0]?.text;
  return text ? JSON.parse(text) : json.result;
}

async function loadSyncBookkeeping(userId: string): Promise<OutlookSyncBookkeeping> {
  if (!hasInsforgeAdminKey) return {};
  const { data } = await insforgeAdmin.database
    .from("users")
    .select("assistant_settings")
    .eq("id", userId)
    .maybeSingle();
  return ((data?.assistant_settings || {}) as OutlookSyncBookkeeping) || {};
}

async function patchSyncBookkeeping(userId: string, patch: OutlookSyncBookkeeping) {
  if (!hasInsforgeAdminKey) return;
  const current = await loadSyncBookkeeping(userId);
  await insforgeAdmin.database
    .from("users")
    .update({
      assistant_settings: { ...current, ...patch },
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);
}

async function rememberLoopinDraft(userId: string, draft: { id?: string; subject?: string }) {
  if (!draft.id) return;
  const current = await loadSyncBookkeeping(userId);
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const prev = (current.loopinOutlookDraftIds || []).filter((d) => {
    const t = new Date(d.createdAt).getTime();
    return d.id && !Number.isNaN(t) && t >= cutoff;
  });
  const next = [
    { id: draft.id, createdAt: new Date().toISOString(), subject: draft.subject },
    ...prev.filter((d) => d.id !== draft.id),
  ].slice(0, 40);
  await patchSyncBookkeeping(userId, { loopinOutlookDraftIds: next });
}

async function ensureTriageCategories(userId: string) {
  await callOutlookMcp(userId, "outlook_ensure_categories", {
    categories: TRIAGE_CATEGORY_DEFS,
  });
}

async function fetchNewUnprocessedMessages(
  userId: string,
  syncStartedAt: string
): Promise<OutlookListMessage[]> {
  const list = await callOutlookMcp(userId, "outlook_list_messages", {
    folder: "inbox",
    maxResults: 12,
    includeBody: true,
  });

  const messages: OutlookListMessage[] = list.messages || [];
  const startedMs = new Date(syncStartedAt).getTime();
  const processed = LOOPIN_LABEL_NAMES.processed;

  return messages.filter((m) => {
    const cats = m.categories || m.labels || [];
    if (cats.includes(processed)) return false;
    if (!m.date) return true;
    const msgMs = new Date(m.date).getTime();
    // First few days of sync: only messages since sync start (with 1m slack)
    if (!Number.isNaN(startedMs) && msgMs < startedMs - 60_000) return false;
    // Cap lookback similar to Gmail newer_than:3d
    if (Date.now() - msgMs > 3 * 24 * 60 * 60 * 1000) return false;
    return true;
  });
}

function toMessageInput(msg: OutlookListMessage): GmailMessageInput {
  return {
    from: msg.from,
    subject: msg.subject,
    snippet: msg.snippet,
    body: msg.body,
    labels: msg.categories || msg.labels,
  };
}

function heuristicPrecheck(msg: OutlookListMessage): TriageCategory | null {
  const input = toMessageInput(msg);
  if (isLoopinOwnEmail(input)) return "notification";
  if (isPromotionalEmail(input)) return "promotional";
  if (isNotificationEmail(input)) return "notification";
  return null;
}

function fallbackHeuristicCategory(msg: OutlookListMessage): TriageCategory {
  const c = classifyGmailMessage(toMessageInput(msg));
  return c.category === "inbox" ? "other" : c.category;
}

function normalizeCategory(value: unknown): TriageCategory {
  const allowed: TriageCategory[] = ["urgent", "needs_reply", "notification", "promotional", "other"];
  return allowed.includes(value as TriageCategory) ? (value as TriageCategory) : "other";
}

function buildClassificationPrompt(messages: OutlookListMessage[]): string {
  const payload = messages.slice(0, 15).map((m) => ({
    id: m.id,
    from: m.from || "",
    subject: m.subject || "",
    snippet: (m.snippet || m.body || "").slice(0, 400),
  }));

  return `You are Loopin's Outlook triage assistant. Classify each email into exactly one category.

Emails (id, from, subject, snippet):
${JSON.stringify(payload, null, 2)}

Return valid JSON only:
[
  { "id": "must match an email id",
    "category": "urgent" | "needs_reply" | "notification" | "promotional" | "other",
    "reason": "short justification" }
]

Category rules:
- "urgent": a real human needs something time-sensitive (deadlines, ASAP, blocked work, same-day asks). Marketing fake-urgency ("sale ends tonight", "last chance") is NEVER urgent.
- "needs_reply": a real human asks a question, requests approval/feedback, or clearly expects a response, but it is not time-critical.
- "notification": automated system/account mail — security alerts, sign-in notices, receipts, invoices, shipping updates, calendar/system notices, no-reply senders.
- "promotional": marketing, newsletters, sales, anything with unsubscribe/offer language.
- "other": everything else (FYI threads, CCs with no ask, mail you cannot judge).

Rules:
- Judge sender type first: no-reply/bulk senders are never "urgent" or "needs_reply".
- Mail FROM Loopin is ALWAYS "notification" — never draft a reply to our own product emails.
- When unsure between "needs_reply" and "other", choose "other".
- Do not invent facts. Classify every provided id exactly once.`;
}

async function classifyMessages(messages: OutlookListMessage[]): Promise<ClassifiedMessage[]> {
  const classified: ClassifiedMessage[] = [];
  const remaining: OutlookListMessage[] = [];

  for (const msg of messages) {
    const preset = heuristicPrecheck(msg);
    if (preset) {
      classified.push({ ...msg, category: preset, reason: "Heuristic pre-filter" });
    } else {
      remaining.push(msg);
    }
  }

  if (remaining.length === 0) return classified;

  const geminiApiKey = process.env.GEMINI_API_KEY;
  if (!geminiApiKey) {
    for (const msg of remaining) {
      classified.push({
        ...msg,
        category: fallbackHeuristicCategory(msg),
        reason: "Gemini not configured — heuristic fallback",
      });
    }
    return classified;
  }

  try {
    const ai = new GoogleGenAI({ apiKey: geminiApiKey });
    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-lite",
      contents: buildClassificationPrompt(remaining),
      config: { responseMimeType: "application/json" },
    });

    const parsed = JSON.parse(response.text || "[]");
    const byId = new Map(remaining.map((m) => [m.id, m]));
    const seen = new Set<string>();

    if (Array.isArray(parsed)) {
      for (const item of parsed) {
        const msg = byId.get(String(item?.id));
        if (!msg || seen.has(msg.id)) continue;
        seen.add(msg.id);
        classified.push({
          ...msg,
          category: normalizeCategory(item?.category),
          reason: String(item?.reason || "Gemini classification"),
        });
      }
    }

    for (const msg of remaining) {
      if (!seen.has(msg.id)) {
        classified.push({
          ...msg,
          category: fallbackHeuristicCategory(msg),
          reason: "Not returned by Gemini — heuristic fallback",
        });
      }
    }
  } catch (err) {
    console.error("[outlook-auto-triage] Gemini classification failed, falling back:", err);
    for (const msg of remaining) {
      classified.push({
        ...msg,
        category: fallbackHeuristicCategory(msg),
        reason: "Gemini error — heuristic fallback",
      });
    }
  }

  return classified;
}

function canAutoDraftCategory(
  category: TriageCategory,
  planId: unknown,
  draftSettings: {
    autoDraftReplies: boolean;
    gmailAutoDraftCategories: { urgent: boolean; needs_reply: boolean };
  }
): boolean {
  if (category !== "urgent" && category !== "needs_reply") return false;
  if (planRank(getPlan(planId).id) < planRank("pro")) return false;
  if (!draftSettings.autoDraftReplies) return false;
  return draftSettings.gmailAutoDraftCategories[category] !== false;
}

async function conversationHasDraft(userId: string, conversationId: string): Promise<boolean> {
  try {
    const result = await callOutlookMcp(userId, "outlook_conversation_has_draft", {
      conversationId,
    });
    return !!result?.hasDraft;
  } catch (err) {
    console.error("[outlook-auto-triage] Draft check failed:", err);
    return false;
  }
}

export type OutlookAutoTriageResult = {
  scanned: number;
  labeled: number;
  drafted: number;
  skipped: number;
  categories: Record<string, number>;
  errors: string[];
};

const EMPTY_RESULT: OutlookAutoTriageResult = {
  scanned: 0,
  labeled: 0,
  drafted: 0,
  skipped: 0,
  categories: {},
  errors: [],
};

export async function runOutlookAutoTriage(userId: string): Promise<OutlookAutoTriageResult> {
  if (!hasInsforgeAdminKey) {
    return { ...EMPTY_RESULT, errors: ["Missing INSFORGE_API_KEY"] };
  }

  try {
    const { data: userRow, error: userError } = await insforgeAdmin.database
      .from("users")
      .select("plan, integrations, assistant_settings")
      .eq("id", userId)
      .maybeSingle();

    if (userError || !userRow) {
      return { ...EMPTY_RESULT, errors: [userError?.message || "User not found"] };
    }

    const row = userRow as UserPlanRow;
    const outlook = row.integrations?.outlook;
    if (!outlook?.connected || outlook?.isSimulated) return EMPTY_RESULT;

    let bookkeeping: OutlookSyncBookkeeping = row.assistant_settings || {};
    const now = new Date().toISOString();

    if (!bookkeeping.outlookInboxSyncStartedAt) {
      await patchSyncBookkeeping(userId, { outlookInboxSyncStartedAt: now });
      bookkeeping = { ...bookkeeping, outlookInboxSyncStartedAt: now };
    }

    const errors: string[] = [];
    try {
      await ensureTriageCategories(userId);
    } catch (err) {
      console.error("[outlook-auto-triage] Category setup failed:", err);
      errors.push(`category-setup: ${err instanceof Error ? err.message : "unknown error"}`);
    }

    let messages: OutlookListMessage[];
    try {
      messages = await fetchNewUnprocessedMessages(userId, bookkeeping.outlookInboxSyncStartedAt!);
    } catch (err) {
      console.error("[outlook-auto-triage] Message list failed:", err);
      return {
        ...EMPTY_RESULT,
        errors: [...errors, err instanceof Error ? err.message : "Outlook list failed"],
      };
    }

    if (messages.length === 0) return { ...EMPTY_RESULT, errors };

    const classified = await classifyMessages(messages);
    const draftSettings = await loadAssistantSettings(userId);

    const categories: Record<string, number> = {};
    let labeled = 0;
    let drafted = 0;
    let skipped = 0;
    let draftBudget = 5;

    for (const msg of classified) {
      try {
        categories[msg.category] = (categories[msg.category] || 0) + 1;

        const categoryLabel = categoryNameFor(msg.category);
        const addCategories = [
          ...(categoryLabel ? [categoryLabel] : []),
          LOOPIN_LABEL_NAMES.processed,
        ];

        const conversationId = msg.conversationId || msg.threadId || "";
        const shouldTryDraft =
          draftBudget > 0 &&
          !!conversationId &&
          !isLoopinOwnEmail(toMessageInput(msg)) &&
          canAutoDraftCategory(msg.category, row.plan, draftSettings);

        if (shouldTryDraft && conversationId) {
          const alreadyDrafted = await conversationHasDraft(userId, conversationId);
          if (!alreadyDrafted) {
            const draftBody = await generateAlertReplyDraft({
              title: msg.subject || "Email",
              description: msg.snippet || "",
              fullDetails: msg.body || msg.snippet || "",
              sourceApp: "outlook",
              tone: draftSettings.responseTone,
              toneInstructions: draftSettings.toneInstructions,
              toneSignOff: draftSettings.toneSignOff,
              toneSamples: draftSettings.toneSamples,
              toneKnowledgeSummary: draftSettings.toneKnowledgeSummary,
            });

            if (draftBody) {
              const created = await callOutlookMcp(userId, "outlook_create_reply_draft", {
                messageId: msg.id,
                body: draftBody,
              });
              const draftId = created?.draft?.id as string | undefined;
              if (draftId) {
                await rememberLoopinDraft(userId, {
                  id: draftId,
                  subject: created?.draft?.subject || msg.subject,
                });
              }
              drafted += 1;
              draftBudget -= 1;
            }
          }
        }

        await callOutlookMcp(userId, "outlook_set_categories", {
          messageId: msg.id,
          addCategories,
        });
        if (categoryLabel) labeled += 1;
        else skipped += 1;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        console.error(`[outlook-auto-triage] Failed to process message ${msg.id}:`, err);
        errors.push(`${msg.id}: ${message}`);
      }
    }

    return { scanned: messages.length, labeled, drafted, skipped, categories, errors };
  } catch (err) {
    console.error("[outlook-auto-triage] Fatal error:", err);
    return {
      ...EMPTY_RESULT,
      errors: [err instanceof Error ? err.message : "Outlook auto-triage failed"],
    };
  }
}
