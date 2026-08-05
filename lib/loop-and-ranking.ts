/**
 * AI-ranked task list + The Loop (waiting-on-others) detection.
 * Runs as a single batched Gemini call using messages already fetched
 * by the briefing pipeline — no duplicate integration fetches.
 */
import { GoogleGenAI } from "@google/genai";
import { hasInsforgeAdminKey, insforgeAdmin } from "@/lib/insforge-admin";
import { GEMINI_MODEL } from "@/lib/gemini";

export type RankPriority = "P0" | "P1" | "P2" | "P3";

export type PipelineMessage = {
  id?: string;
  source: string;
  sender: string;
  timestamp: string;
  content: string;
  direction?: "incoming" | "outgoing" | "unknown";
  threadKey?: string;
};

export type VipContact = {
  id?: string;
  name: string;
  email?: string | null;
  identifiers?: string[] | null;
  notes?: string | null;
};

export type RankedTaskResult = {
  task: string;
  source: string;
  priority: RankPriority;
  reason: string;
  sender?: string;
  item_key?: string;
};

export type LoopCommitmentResult = {
  sender: string;
  promised_text: string;
  source: string;
  promised_at: string;
  thread_key?: string;
  message_id?: string;
};

const PRIORITY_ORDER: Record<RankPriority, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };

export function sortRankedTasks<T extends { priority: string }>(tasks: T[]): T[] {
  return [...tasks].sort((a, b) => {
    const pa = PRIORITY_ORDER[(a.priority as RankPriority) || "P2"] ?? 2;
    const pb = PRIORITY_ORDER[(b.priority as RankPriority) || "P2"] ?? 2;
    return pa - pb;
  });
}

export async function loadVipContacts(userId: string): Promise<VipContact[]> {
  if (!hasInsforgeAdminKey) return [];
  const { data, error } = await insforgeAdmin.database
    .from("vip_contacts")
    .select("id, name, email, identifiers, notes")
    .eq("user_id", userId)
    .order("name", { ascending: true });
  if (error) {
    console.error("[loop-and-ranking] load VIP contacts:", error.message);
    return [];
  }
  return (data || []) as VipContact[];
}

export async function loadLoopOverdueDays(userId: string): Promise<number> {
  if (!hasInsforgeAdminKey) return 3;
  const { data } = await insforgeAdmin.database
    .from("users")
    .select("assistant_settings")
    .eq("id", userId)
    .maybeSingle();
  const settings = (data?.assistant_settings || {}) as Record<string, unknown>;
  const n = Number(settings.loop_overdue_days);
  if (Number.isFinite(n) && n >= 1 && n <= 30) return Math.floor(n);
  return 3;
}

/** Normalize raw MCP messages into a flat list for the ranking/loop LLM call. */
export function normalizePipelineMessages(input: {
  gmail?: any[];
  outlook?: any[];
  slack?: any[];
  discord?: any[];
  telegram?: any[];
  whatsapp?: any[];
  teams?: any[];
  notion?: any[];
  calendar?: any[];
}): PipelineMessage[] {
  const out: PipelineMessage[] = [];

  for (const msg of input.gmail || []) {
    out.push({
      id: msg.id,
      source: "gmail",
      sender: msg.from || "Unknown",
      timestamp: msg.date || "",
      content: [msg.subject, msg.snippet || msg.body].filter(Boolean).join(" — ").slice(0, 800),
      direction: "incoming",
      threadKey: msg.threadId || msg.thread_id || msg.id,
    });
  }

  for (const msg of input.outlook || []) {
    out.push({
      id: msg.id,
      source: "outlook",
      sender: msg.from || "Unknown",
      timestamp: msg.date || "",
      content: [msg.subject, msg.snippet || msg.body].filter(Boolean).join(" — ").slice(0, 800),
      direction: "incoming",
      threadKey: msg.conversationId || msg.id,
    });
  }

  for (const msg of input.slack || []) {
    out.push({
      id: msg.id || msg.ts,
      source: "slack",
      sender: msg.user || msg.userName || (msg.channelName ? `#${msg.channelName}` : "Unknown"),
      timestamp: msg.timestamp || msg.ts || "",
      content: String(msg.text || msg.body || "").slice(0, 800),
      direction: msg.isBot ? "unknown" : "incoming",
      threadKey: msg.thread_ts || msg.channel || msg.id,
    });
  }

  for (const msg of input.discord || []) {
    out.push({
      id: msg.id,
      source: "discord",
      sender: msg.author || msg.from || msg.username || "Unknown",
      timestamp: msg.timestamp || "",
      content: String(msg.content || msg.body || msg.text || "").slice(0, 800),
      direction: "incoming",
      threadKey: msg.channelId || msg.channel_id || msg.id,
    });
  }

  for (const msg of input.telegram || []) {
    out.push({
      id: msg.id,
      source: "telegram",
      sender: msg.from || msg.chatName || "Unknown",
      timestamp: msg.timestamp || "",
      content: String(msg.body || msg.text || "").slice(0, 800),
      direction: msg.outgoing || msg.isFromMe ? "outgoing" : "incoming",
      threadKey: String(msg.chatId || msg.from || msg.id),
    });
  }

  for (const msg of input.whatsapp || []) {
    out.push({
      id: msg.id,
      source: "whatsapp",
      sender: msg.from || msg.chatName || "Unknown",
      timestamp: msg.timestamp || "",
      content: String(msg.body || msg.text || "").slice(0, 800),
      direction: msg.fromMe || msg.isFromMe ? "outgoing" : "incoming",
      threadKey: String(msg.chatId || msg.from || msg.id),
    });
  }

  for (const msg of input.teams || []) {
    out.push({
      id: msg.id,
      source: "teams",
      sender: msg.from || msg.sender || msg.user || "Unknown",
      timestamp: msg.timestamp || msg.createdDateTime || "",
      content: String(msg.body || msg.text || msg.content || "").slice(0, 800),
      direction: "incoming",
      threadKey: msg.chatId || msg.conversationId || msg.id,
    });
  }

  for (const page of input.notion || []) {
    out.push({
      id: page.id,
      source: "notion",
      sender: page.lastEditedBy || page.created_by || "Notion",
      timestamp: page.last_edited_time || page.created_time || "",
      content: String(page.title || page.name || page.snippet || "Notion page").slice(0, 800),
      direction: "unknown",
      threadKey: page.id,
    });
  }

  for (const ev of input.calendar || []) {
    out.push({
      id: ev.id,
      source: ev.app || "calendar",
      sender: ev.organizer || ev.creator || "Calendar",
      timestamp: ev.start || "",
      content: [ev.title, ev.location].filter(Boolean).join(" — ").slice(0, 800),
      direction: "unknown",
      threadKey: ev.id,
    });
  }

  return out.slice(0, 80);
}

function normalizePriority(raw: unknown): RankPriority {
  const p = String(raw || "P2").toUpperCase().replace(/\s/g, "");
  if (p === "P0" || p === "0" || p === "URGENT" || p === "CRITICAL") return "P0";
  if (p === "P1" || p === "1" || p === "HIGH") return "P1";
  if (p === "P3" || p === "3" || p === "LOW") return "P3";
  return "P2";
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  try {
    const parsed = JSON.parse(cleaned);
    if (parsed && typeof parsed === "object") return parsed as Record<string, unknown>;
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
      } catch {
        return null;
      }
    }
  }
  return null;
}

/**
 * Single batched LLM call: ranked tasks + commitment (The Loop) detection.
 */
export async function runRankingAndLoopDetection(opts: {
  items: PipelineMessage[];
  vipContacts: VipContact[];
  userDisplayName?: string;
}): Promise<{ rankedTasks: RankedTaskResult[]; commitments: LoopCommitmentResult[] }> {
  const empty = { rankedTasks: [] as RankedTaskResult[], commitments: [] as LoopCommitmentResult[] };
  if (!opts.items.length) return empty;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn("[loop-and-ranking] GEMINI_API_KEY missing — skip ranking/loop");
    return empty;
  }

  const vipBlock =
    opts.vipContacts.length > 0
      ? opts.vipContacts
          .map((v) => {
            const ids = [v.email, ...(v.identifiers || [])].filter(Boolean).join(", ");
            return `- ${v.name}${ids ? ` (${ids})` : ""}${v.notes ? `: ${v.notes}` : ""}`;
          })
          .join("\n")
      : "(none configured)";

  const itemsBlock = opts.items.map((item, i) => ({
    index: i,
    source: item.source,
    sender: item.sender,
    timestamp: item.timestamp,
    direction: item.direction || "unknown",
    content: item.content,
    id: item.id || null,
    threadKey: item.threadKey || null,
  }));

  const prompt = `You are Loopin's triage engine. Classify communication items into ranked tasks and detect commitments made TO the user by other people ("The Loop").

User: ${opts.userDisplayName || "the user"}

VIP contacts (boost priority when involved):
${vipBlock}

INPUT ITEMS (JSON array):
${JSON.stringify(itemsBlock)}

Return a single JSON object only — no markdown fences, no commentary:
{
  "ranked_tasks": [
    {
      "task": "short action item for the user",
      "source": "gmail|outlook|slack|discord|telegram|whatsapp|teams|notion|calendar",
      "priority": "P0"|"P1"|"P2"|"P3",
      "reason": "one-line reason",
      "sender": "who",
      "item_index": 0
    }
  ],
  "commitments": [
    {
      "sender": "who owes it (not the user)",
      "promised_text": "what was promised",
      "source": "channel",
      "promised_at": "ISO timestamp if known else empty",
      "item_index": 0
    }
  ]
}

RULES:
- Output JSON only
- ranked_tasks: extract actionable items the USER should do; max 20; sort conceptually P0→P3
- P0 = urgent/blocking or VIP + deadline; P1 = important soon; P2 = normal; P3 = low/FYI
- VIP senders or mentions of VIP contacts raise priority by at least one level
- commitments: ONLY promises FROM someone else TO the user (e.g. "I'll send that", "let me get back to you", "I'll check and confirm", "will do by Friday"). Ignore the user's own promises.
- Prefer incoming messages for commitments; skip obvious marketing/newsletters
- If nothing qualifies, return empty arrays`;

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: { responseMimeType: "application/json" },
    });
    const text = response.text || "";
    const parsed = parseJsonObject(text);
    if (!parsed) {
      console.error("[loop-and-ranking] failed to parse model JSON");
      return empty;
    }

    const rawTasks = Array.isArray(parsed.ranked_tasks) ? parsed.ranked_tasks : [];
    const rankedTasks: RankedTaskResult[] = rawTasks
      .filter((t): t is Record<string, unknown> => !!t && typeof t === "object")
      .map((t, i) => {
        const idx = typeof t.item_index === "number" ? t.item_index : -1;
        const srcItem = idx >= 0 && idx < opts.items.length ? opts.items[idx] : undefined;
        return {
          task: String(t.task || "").slice(0, 400),
          source: String(t.source || srcItem?.source || "unknown").slice(0, 40),
          priority: normalizePriority(t.priority),
          reason: String(t.reason || "").slice(0, 240),
          sender: String(t.sender || srcItem?.sender || "").slice(0, 200),
          item_key: srcItem?.id
            ? `${srcItem.source}:${srcItem.id}`
            : `gen:${i}:${String(t.task || "").slice(0, 40)}`,
        };
      })
      .filter((t) => t.task.length > 0);

    const rawCommitments = Array.isArray(parsed.commitments) ? parsed.commitments : [];
    const commitments: LoopCommitmentResult[] = rawCommitments
      .filter((c): c is Record<string, unknown> => !!c && typeof c === "object")
      .map((c) => {
        const idx = typeof c.item_index === "number" ? c.item_index : -1;
        const srcItem = idx >= 0 && idx < opts.items.length ? opts.items[idx] : undefined;
        const promisedAt =
          String(c.promised_at || "").trim() ||
          srcItem?.timestamp ||
          new Date().toISOString();
        return {
          sender: String(c.sender || srcItem?.sender || "Unknown").slice(0, 200),
          promised_text: String(c.promised_text || "").slice(0, 500),
          source: String(c.source || srcItem?.source || "unknown").slice(0, 40),
          promised_at: promisedAt,
          thread_key: srcItem?.threadKey,
          message_id: srcItem?.id,
        };
      })
      .filter((c) => c.promised_text.length > 0);

    return {
      rankedTasks: sortRankedTasks(rankedTasks),
      commitments,
    };
  } catch (err) {
    console.error("[loop-and-ranking] Gemini call failed:", err);
    return empty;
  }
}

export async function persistRankedTasks(
  userId: string,
  tasks: RankedTaskResult[],
  briefingId?: string | null
): Promise<void> {
  if (!hasInsforgeAdminKey) return;

  // Replace previous snapshot for this user (daily ranking is a fresh list)
  await insforgeAdmin.database.from("ranked_tasks").delete().eq("user_id", userId);

  if (!tasks.length) return;

  const rows = sortRankedTasks(tasks).map((t, i) => ({
    user_id: userId,
    task: t.task,
    source: t.source,
    priority: t.priority,
    reason: t.reason,
    sender: t.sender || "",
    item_key: t.item_key || null,
    sort_order: i,
    briefing_id: briefingId || null,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await insforgeAdmin.database.from("ranked_tasks").insert(rows);
  if (error) console.error("[loop-and-ranking] persist ranked_tasks:", error.message);
}

function daysBetween(fromIso: string, to = new Date()): number {
  const from = new Date(fromIso);
  if (Number.isNaN(from.getTime())) return 0;
  return Math.floor((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000));
}

/**
 * Upsert newly detected commitments and refresh overdue/fulfilled status
 * using current inbound messages from the same senders/threads.
 */
export async function persistAndRefreshLoopCommitments(opts: {
  userId: string;
  commitments: LoopCommitmentResult[];
  currentMessages: PipelineMessage[];
  overdueDays: number;
}): Promise<void> {
  if (!hasInsforgeAdminKey) return;
  const { userId, commitments, currentMessages, overdueDays } = opts;
  const now = new Date().toISOString();

  for (const c of commitments) {
    const { data: existing } = await insforgeAdmin.database
      .from("loop_commitments")
      .select("id, status")
      .eq("user_id", userId)
      .eq("source", c.source)
      .eq("sender", c.sender)
      .eq("promised_text", c.promised_text)
      .maybeSingle();

    if (existing?.id) {
      await insforgeAdmin.database
        .from("loop_commitments")
        .update({
          last_checked_at: now,
          thread_key: c.thread_key || null,
          message_id: c.message_id || null,
          overdue_after_days: overdueDays,
          updated_at: now,
        })
        .eq("id", existing.id);
    } else {
      const { error } = await insforgeAdmin.database.from("loop_commitments").insert([
        {
          user_id: userId,
          source: c.source,
          sender: c.sender,
          promised_text: c.promised_text,
          promised_at: (() => {
            const d = new Date(c.promised_at);
            return Number.isNaN(d.getTime()) ? now : d.toISOString();
          })(),
          status: "pending",
          last_checked_at: now,
          thread_key: c.thread_key || null,
          message_id: c.message_id || null,
          overdue_after_days: overdueDays,
          updated_at: now,
        },
      ]);
      if (error && !/duplicate|unique/i.test(error.message)) {
        console.error("[loop-and-ranking] insert commitment:", error.message);
      }
    }
  }

  const { data: openRows } = await insforgeAdmin.database
    .from("loop_commitments")
    .select("*")
    .eq("user_id", userId)
    .in("status", ["pending", "overdue"]);

  for (const row of openRows || []) {
    const senderLower = String(row.sender || "").toLowerCase();
    const promisedAt = row.promised_at as string;
    const promisedMs = new Date(promisedAt).getTime();

    // Fulfillment heuristic: later message from same sender on same thread/source
    // that looks like a delivery / completion (not another open promise).
    const laterFromSender = currentMessages.filter((m) => {
      if ((m.direction || "incoming") === "outgoing") return false;
      const sameSender = (m.sender || "").toLowerCase().includes(senderLower.split(/[<@]/)[0].trim()) ||
        senderLower.includes((m.sender || "").toLowerCase().split(/[<@]/)[0].trim());
      if (!sameSender && m.threadKey !== row.thread_key) return false;
      if (row.thread_key && m.threadKey && m.threadKey !== row.thread_key) {
        // allow sender match across threads
      }
      const ts = m.timestamp ? new Date(m.timestamp).getTime() : 0;
      return sameSender && (!Number.isNaN(promisedMs) ? ts > promisedMs : true);
    });

    const fulfillmentHints =
      /\b(here (it|you) (is|are)|sent|attached|done|completed|finished|as promised|sharing|shared)\b/i;
    const fulfilled = laterFromSender.some((m) => fulfillmentHints.test(m.content));

    let status = row.status as string;
    if (fulfilled) {
      status = "fulfilled";
    } else {
      const threshold = Number(row.overdue_after_days) || overdueDays;
      const age = daysBetween(promisedAt);
      status = age >= threshold ? "overdue" : "pending";
    }

    await insforgeAdmin.database
      .from("loop_commitments")
      .update({
        status,
        last_checked_at: now,
        fulfilled_at: status === "fulfilled" ? now : row.fulfilled_at,
        overdue_after_days: overdueDays,
        updated_at: now,
      })
      .eq("id", row.id);
  }
}

/** Orchestrate ranking + loop persist after briefing message fetch. */
export async function runBriefingRankingAndLoop(opts: {
  userId: string;
  briefingId?: string | null;
  displayName?: string;
  messages: {
    gmail?: any[];
    outlook?: any[];
    slack?: any[];
    discord?: any[];
    telegram?: any[];
    whatsapp?: any[];
    teams?: any[];
    notion?: any[];
    calendar?: any[];
  };
}): Promise<{ rankedCount: number; commitmentCount: number }> {
  const items = normalizePipelineMessages(opts.messages);
  if (!items.length) return { rankedCount: 0, commitmentCount: 0 };

  const [vipContacts, overdueDays] = await Promise.all([
    loadVipContacts(opts.userId),
    loadLoopOverdueDays(opts.userId),
  ]);

  const { rankedTasks, commitments } = await runRankingAndLoopDetection({
    items,
    vipContacts,
    userDisplayName: opts.displayName,
  });

  await Promise.all([
    persistRankedTasks(opts.userId, rankedTasks, opts.briefingId),
    persistAndRefreshLoopCommitments({
      userId: opts.userId,
      commitments,
      currentMessages: items,
      overdueDays,
    }),
  ]);

  return { rankedCount: rankedTasks.length, commitmentCount: commitments.length };
}
