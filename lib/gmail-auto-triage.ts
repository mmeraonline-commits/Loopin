/**
 * Gmail auto-triage: classifies new inbox mail into Urgent / Needs Reply /
 * Notification / Promotional / Other, applies the matching native Gmail label,
 * and (Pro plan and above) saves a tone-matched native Gmail draft reply on
 * Urgent / Needs Reply threads via drafts.create. Never sends anything.
 *
 * Runs from trigger/gmail-triage.ts on a schedule. Every side effect below is
 * guarded so re-running this on the same message is a no-op (see the
 * Loopin/Processed label and the per-thread draft check).
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

const APP_URL = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export type TriageCategory = "urgent" | "needs_reply" | "notification" | "promotional" | "other";

const TRIAGE_LABEL_DEFS = [
  { name: LOOPIN_LABEL_NAMES.urgent, bg: "#fb4c2f", text: "#ffffff" },
  { name: LOOPIN_LABEL_NAMES.needs_reply, bg: "#ffad47", text: "#000000" },
  { name: LOOPIN_LABEL_NAMES.notification, bg: "#666666", text: "#ffffff" },
  { name: LOOPIN_LABEL_NAMES.promotional, bg: "#653e9b", text: "#ffffff" },
  { name: LOOPIN_LABEL_NAMES.processed, bg: "#4986e7", text: "#ffffff" },
];

function labelNameForCategory(category: TriageCategory): string | null {
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

type GmailLabelMap = Record<string, string>;

type GmailSyncBookkeeping = {
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

type ClassifiedMessage = GmailListMessage & { category: TriageCategory; reason: string };

type UserPlanRow = {
  plan?: string;
  integrations?: { gmail?: { connected?: boolean; isSimulated?: boolean } | null } | null;
  assistant_settings?: GmailSyncBookkeeping | null;
};

async function callGmailMcp(userId: string, method: string, params: Record<string, unknown> = {}) {
  const res = await fetch(`${APP_URL}/api/gmail-mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ method, params, userId }),
  });
  const json = await res.json();
  if (json.error) {
    throw new Error(json.error.message || `Gmail MCP error (${method})`);
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

async function loadSyncBookkeeping(userId: string): Promise<GmailSyncBookkeeping> {
  if (!hasInsforgeAdminKey) return {};
  const { data } = await insforgeAdmin.database
    .from("users")
    .select("assistant_settings")
    .eq("id", userId)
    .maybeSingle();
  return ((data?.assistant_settings || {}) as GmailSyncBookkeeping) || {};
}

async function patchSyncBookkeeping(userId: string, patch: GmailSyncBookkeeping) {
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

/** Lists existing labels before creating (gmail_ensure_labels), so re-running this never creates duplicates. */
async function ensureTriageLabels(userId: string): Promise<GmailLabelMap> {
  const result = await callGmailMcp(userId, "gmail_ensure_labels", { labels: TRIAGE_LABEL_DEFS });
  const map: GmailLabelMap = { ...(result.labelIds || {}) };
  await patchSyncBookkeeping(userId, { gmailLabelIds: map });
  return map;
}

async function fetchNewUnprocessedMessages(
  userId: string,
  syncStartedAt: string
): Promise<GmailListMessage[]> {
  const after = formatGmailAfterDate(syncStartedAt);
  // Do NOT require is:unread — opening the email in Gmail would otherwise
  // permanently skip labeling/drafting. Loopin/Processed is the idempotency marker.
  const q = after
    ? `label:inbox -label:${LOOPIN_LABEL_NAMES.processed} after:${after} newer_than:3d`
    : `label:inbox -label:${LOOPIN_LABEL_NAMES.processed} newer_than:1d`;

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

function toGmailMessageInput(msg: GmailListMessage): GmailMessageInput {
  return { from: msg.from, subject: msg.subject, snippet: msg.snippet, body: msg.body, labels: msg.labels };
}

/** Obvious bulk/marketing/system mail never needs an LLM call — same cost pattern as alert-auto-generation. */
function heuristicPrecheck(msg: GmailListMessage): TriageCategory | null {
  const input = toGmailMessageInput(msg);
  // Own product mail first — alert subjects often look "urgent" / "needs reply" to Gemini.
  if (isLoopinOwnEmail(input)) return "notification";
  if (isPromotionalEmail(input)) return "promotional";
  if (isNotificationEmail(input)) return "notification";
  return null;
}

/** Used only if Gemini is unavailable or errors — keeps labeling working without the LLM. */
function fallbackHeuristicCategory(msg: GmailListMessage): TriageCategory {
  const c = classifyGmailMessage(toGmailMessageInput(msg));
  return c.category === "inbox" ? "other" : c.category;
}

function normalizeCategory(value: unknown): TriageCategory {
  const allowed: TriageCategory[] = ["urgent", "needs_reply", "notification", "promotional", "other"];
  return allowed.includes(value as TriageCategory) ? (value as TriageCategory) : "other";
}

/**
 * Classification prompt — reviewed categories/tone before being wired into the pipeline.
 * One batched call for the whole unfiltered batch, mirroring buildAiCandidates in
 * lib/alert-auto-generation.ts (same model, same responseMimeType: "application/json" pattern).
 */
function buildClassificationPrompt(messages: GmailListMessage[]): string {
  const payload = messages.slice(0, 15).map((m) => ({
    id: m.id,
    from: m.from || "",
    subject: m.subject || "",
    snippet: (m.snippet || m.body || "").slice(0, 400),
  }));

  return `You are Loopin's Gmail triage assistant. Classify each email into exactly one category.

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
- Mail FROM Loopin (e.g. loopin@…, subjects like "Loopin Alert", "Loopin · …", "[Preview] Loopin …") is ALWAYS "notification" — never draft a reply to our own product emails.
- When unsure between "needs_reply" and "other", choose "other" (false negatives are cheaper than drafting a reply nobody needed).
- Do not invent facts. Classify every provided id exactly once.`;
}

async function classifyMessages(messages: GmailListMessage[]): Promise<ClassifiedMessage[]> {
  const classified: ClassifiedMessage[] = [];
  const remaining: GmailListMessage[] = [];

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
      classified.push({ ...msg, category: fallbackHeuristicCategory(msg), reason: "Gemini not configured — heuristic fallback" });
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

    // Fail-open: anything Gemini didn't return still gets processed, never silently dropped.
    for (const msg of remaining) {
      if (!seen.has(msg.id)) {
        classified.push({ ...msg, category: fallbackHeuristicCategory(msg), reason: "Not returned by Gemini — heuristic fallback" });
      }
    }
  } catch (err) {
    console.error("[gmail-auto-triage] Gemini classification failed, falling back to heuristics:", err);
    for (const msg of remaining) {
      classified.push({ ...msg, category: fallbackHeuristicCategory(msg), reason: "Gemini error — heuristic fallback" });
    }
  }

  return classified;
}

/** Starter: labeling only. Pro and above: labeling + native Gmail drafts, gated per-category by settings. */
function canAutoDraftCategory(
  category: TriageCategory,
  planId: unknown,
  draftSettings: { autoDraftReplies: boolean; gmailAutoDraftCategories: { urgent: boolean; needs_reply: boolean } }
): boolean {
  if (category !== "urgent" && category !== "needs_reply") return false;
  if (planRank(getPlan(planId).id) < planRank("pro")) return false;
  if (!draftSettings.autoDraftReplies) return false;
  return draftSettings.gmailAutoDraftCategories[category] !== false;
}

/** Belt-and-suspenders idempotency: skip drafting if the thread already carries a Gmail draft. */
async function threadHasExistingDraft(userId: string, threadId: string): Promise<boolean> {
  try {
    const thread = await callGmailMcp(userId, "gmail_get_thread", { id: threadId });
    const messages = (thread?.messages || []) as Array<{ labelIds?: string[]; labels?: string[] }>;
    return messages.some((m) => (m.labelIds || m.labels || []).includes("DRAFT"));
  } catch (err) {
    console.error("[gmail-auto-triage] Thread draft-check failed:", err);
    return false;
  }
}

export type GmailAutoTriageResult = {
  scanned: number;
  labeled: number;
  drafted: number;
  skipped: number;
  categories: Record<string, number>;
  errors: string[];
};

const EMPTY_RESULT: GmailAutoTriageResult = {
  scanned: 0,
  labeled: 0,
  drafted: 0,
  skipped: 0,
  categories: {},
  errors: [],
};

/**
 * Process only NEW Gmail since gmailInboxSyncStartedAt (set on first run).
 * Applies Loopin/* labels natively and creates real Gmail thread drafts for
 * Urgent / Needs Reply mail on Pro+ plans. Never sends anything. Safe to
 * re-run: already-processed messages are excluded from the next list query.
 */
export async function runGmailAutoTriage(userId: string): Promise<GmailAutoTriageResult> {
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
    const gmail = row.integrations?.gmail;
    if (!gmail?.connected || gmail?.isSimulated) return EMPTY_RESULT;

    let bookkeeping: GmailSyncBookkeeping = row.assistant_settings || {};
    const now = new Date().toISOString();

    if (!bookkeeping.gmailInboxSyncStartedAt) {
      await patchSyncBookkeeping(userId, { gmailInboxSyncStartedAt: now });
      bookkeeping = { ...bookkeeping, gmailInboxSyncStartedAt: now };
    }

    const errors: string[] = [];
    let labelIds: GmailLabelMap = {};
    try {
      labelIds = await ensureTriageLabels(userId);
    } catch (err) {
      // Rate limit / transient failure creating labels — keep going so drafting
      // (which doesn't need label ids) and next-run label retry still work.
      console.error("[gmail-auto-triage] Label setup failed:", err);
      errors.push(`label-setup: ${err instanceof Error ? err.message : "unknown error"}`);
    }
    const processedLabelId = labelIds[LOOPIN_LABEL_NAMES.processed];

    let messages: GmailListMessage[];
    try {
      messages = await fetchNewUnprocessedMessages(userId, bookkeeping.gmailInboxSyncStartedAt!);
    } catch (err) {
      console.error("[gmail-auto-triage] Message list failed:", err);
      return { ...EMPTY_RESULT, errors: [...errors, err instanceof Error ? err.message : "Gmail list failed"] };
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

        const categoryLabelName = labelNameForCategory(msg.category);
        const addLabelIds: string[] = [];
        if (categoryLabelName && labelIds[categoryLabelName]) {
          addLabelIds.push(labelIds[categoryLabelName]);
        }

        const shouldTryDraft =
          draftBudget > 0 &&
          !!msg.threadId &&
          !isLoopinOwnEmail(toGmailMessageInput(msg)) &&
          canAutoDraftCategory(msg.category, row.plan, draftSettings);

        if (shouldTryDraft && msg.threadId) {
          const alreadyDrafted = await threadHasExistingDraft(userId, msg.threadId);
          if (!alreadyDrafted) {
            const draftBody = await generateAlertReplyDraft({
              title: msg.subject || "Email",
              description: msg.snippet || "",
              fullDetails: msg.body || msg.snippet || "",
              sourceApp: "gmail",
              tone: draftSettings.responseTone,
              toneInstructions: draftSettings.toneInstructions,
              toneSignOff: draftSettings.toneSignOff,
              toneSamples: draftSettings.toneSamples,
              toneKnowledgeSummary: draftSettings.toneKnowledgeSummary,
            });

            if (draftBody) {
              const to = parseReplyTo(msg.from || "");
              const subject = msg.subject || "Re:";
              await callGmailMcp(userId, "gmail_create_draft", {
                to,
                subject: subject.startsWith("Re:") ? subject : `Re: ${subject}`,
                body: draftBody,
                threadId: msg.threadId,
                inReplyTo: msg.rfcMessageId,
                references: msg.rfcMessageId,
              });
              drafted += 1;
              draftBudget -= 1;
            }
          }
        }

        if (addLabelIds.length > 0) {
          await callGmailMcp(userId, "gmail_modify_labels", {
            messageId: msg.id,
            addLabelIds: processedLabelId ? [...addLabelIds, processedLabelId] : addLabelIds,
          });
          labeled += 1;
        } else if (processedLabelId) {
          await callGmailMcp(userId, "gmail_modify_labels", {
            messageId: msg.id,
            addLabelIds: [processedLabelId],
          });
          skipped += 1;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        console.error(`[gmail-auto-triage] Failed to process message ${msg.id}:`, err);
        errors.push(`${msg.id}: ${message}`);
      }
    }

    return { scanned: messages.length, labeled, drafted, skipped, categories, errors };
  } catch (err) {
    console.error("[gmail-auto-triage] Fatal error:", err);
    return { ...EMPTY_RESULT, errors: [err instanceof Error ? err.message : "Gmail auto-triage failed"] };
  }
}
