import { GoogleGenAI } from "@google/genai";
import { hasInsforgeAdminKey, insforgeAdmin } from "./insforge-admin";
import { publishAlertRealtimeEvent } from "./alerts-realtime";
import { encodeReplyRef, type ReplyRef } from "./send-reply";
import { sendPushToUser } from "./push";
import { maybeAutoDraftAlertReply } from "./auto-draft-reply";
import {
  isAutomatedOrPromotional,
  looksNeedsReplyDraft,
  looksUrgent,
} from "./alert-message-filters";

const APP_URL = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const monitorableApps = new Set(["gmail", "whatsapp", "slack", "discord"]);

type IntegrationValue = {
  connected?: boolean;
  isSimulated?: boolean;
};

type UserIntegrationRow = {
  integrations?: Record<string, IntegrationValue | null>;
};

export type AppActivity = {
  id: string;
  app: string;
  title: string;
  description: string;
  body: string;
  from?: string;
  time?: string;
  labels?: string[];
  replyRef?: ReplyRef;
};

type AlertCandidate = {
  activityId: string;
  sourceApp: string;
  title: string;
  description: string;
  fullDetails: string;
  priority: "high" | "medium" | "low";
  requiresResponse: boolean;
  condition: string;
  suggestedAction: string;
};

function isString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function appLogo(app: string) {
  if (app === "gmail") return "/001-gmail.png";
  if (app === "whatsapp") return "/002-whatsapp.png";
  if (app === "slack") return "/005-slack.png";
  if (app === "discord") return "/006-discord.png";
  if (app === "linkedin") return "/007-linkedin.png";
  if (app === "calendly") return "/008-calendly.svg";
  if (app === "outlook") return "/003-email.png";
  return "/003-email.png";
}

export { appLogo };

function normalizePriority(value: unknown): "high" | "medium" | "low" {
  return value === "high" || value === "low" ? value : "medium";
}

export async function getConnectedMonitorableApps(userId: string): Promise<string[]> {
  // Read the user's integration map and keep only apps supported by the alert
  // monitor. This prevents the generator from trying to scan unsupported tools.
  const { data: userRow, error } = await insforgeAdmin.database
    .from("users")
    .select("integrations")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.error("[alert-auto-generation] User integrations fetch failed:", error);
    return [];
  }

  const integrations = ((userRow as UserIntegrationRow | null)?.integrations || {}) as Record<string, IntegrationValue | null>;
  return Object.entries(integrations)
    .filter(([, value]) => !!value?.connected && !value?.isSimulated)
    .map(([key]) => key)
    .filter(app => monitorableApps.has(app));
}

export async function fetchConnectedActivity(userId: string, apps: string[] = []): Promise<AppActivity[]> {
  const activity: AppActivity[] = [];

  if (apps.includes("gmail")) {
    try {
      // Reuse the existing Gmail proxy route so OAuth/token-refresh behavior
      // stays centralized in one API surface.
      const res = await fetch(`${APP_URL}/api/gmail-mcp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          method: "gmail_list_messages",
          // Prefer Primary + exclude promo/social so confirm-queue is not flooded.
          params: {
            q: "label:inbox is:unread newer_than:7d -category:promotions -category:social -category:forums",
            maxResults: 15,
          },
          userId
        })
      });
      const json = await res.json();
      const text = json.result?.content?.[0]?.text;
      const messages = text ? JSON.parse(text).messages || [] : [];

      for (const message of messages) {
        activity.push({
          id: message.id,
          app: "gmail",
          title: message.subject || "Unread Gmail message",
          description: message.snippet || "",
          body: `From: ${message.from || "Unknown"}\nSubject: ${message.subject || ""}\n${message.body || message.snippet || ""}`,
          from: message.from || "",
          labels: message.labels || [],
          time: message.date,
          replyRef: {
            app: "gmail",
            messageId: message.id,
            threadId: message.threadId || message.thread_id || undefined,
          },
        });
      }
    } catch (error) {
      console.error("[alert-auto-generation] Gmail MCP fetch failed:", error);
    }
  }

  if (apps.includes("whatsapp")) {
    try {
      // WhatsApp activity is fetched through the app route for the same reason:
      // session management remains owned by the WhatsApp integration layer.
      const res = await fetch(`${APP_URL}/api/whatsapp-mcp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method: "whatsapp_get_recent_messages", userId })
      });
      const json = await res.json();
      const text = json.result?.content?.[0]?.text;
      const messages = text ? JSON.parse(text).messages || [] : [];

      for (const message of messages) {
        activity.push({
          id: message.id || `${message.chatName}-${message.timestamp}`,
          app: "whatsapp",
          title: message.chatName || message.from || "WhatsApp message",
          description: message.body || "",
          body: message.body || "",
          time: message.timestamp,
          replyRef: {
            app: "whatsapp",
            chatId: message.chatId || message.id || message.from,
            messageId: message.id,
          },
        });
      }
    } catch (error) {
      console.error("[alert-auto-generation] WhatsApp MCP fetch failed:", error);
    }
  }

  if (apps.includes("slack")) {
    try {
      const res = await fetch(`${APP_URL}/api/slack-mcp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method: "slack_get_recent_messages", userId })
      });
      const json = await res.json();
      const text = json.result?.content?.[0]?.text;
      const messages = text ? JSON.parse(text).messages || [] : [];

      for (const message of messages) {
        const channel = message.channelName ? `#${message.channelName}` : "Slack";
        activity.push({
          id: message.ts || `${message.channelId}-${message.timestamp}-${message.text?.slice(0, 24)}`,
          app: "slack",
          title: channel,
          description: message.text || "",
          body: message.text || "",
          time: message.timestamp,
          replyRef: {
            app: "slack",
            channelId: message.channelId,
            messageId: message.ts,
          },
        });
      }
    } catch (error) {
      console.error("[alert-auto-generation] Slack MCP fetch failed:", error);
    }
  }

  if (apps.includes("discord")) {
    try {
      const res = await fetch(`${APP_URL}/api/discord-mcp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method: "discord_get_recent_messages", userId })
      });
      const json = await res.json();
      const text = json.result?.content?.[0]?.text;
      const messages = text ? JSON.parse(text).messages || [] : [];

      for (const message of messages) {
        activity.push({
          id: message.id || `${message.channelId}-${message.timestamp}`,
          app: "discord",
          title: message.channelName ? `#${message.channelName}` : "Discord",
          description: message.content || "",
          body: `${message.author || ""}: ${message.content || ""}`,
          time: message.timestamp,
          replyRef: {
            app: "discord",
            channelId: message.channelId,
            messageId: message.id || message.messageId,
          },
        });
      }
    } catch (error) {
      console.error("[alert-auto-generation] Discord MCP fetch failed:", error);
    }
  }

  return activity.filter(item => isString(item.id) && isString(item.app));
}

function activityText(item: Pick<AppActivity, "title" | "description" | "body" | "from">): string {
  return `${item.from || ""} ${item.title} ${item.description} ${item.body}`.toLowerCase();
}

function looksImportantAlert(
  item: Pick<AppActivity, "title" | "description" | "body" | "from" | "app">
): boolean {
  if (isAutomatedOrPromotional(item)) {
    const text = activityText(item);
    return /security alert|passkey|storage (almost )?full|sign[- ]?in|blocked/i.test(text);
  }
  return looksNeedsReplyDraft(item) || looksUrgent(activityText(item));
}

function boostCandidate(candidate: AlertCandidate, source?: AppActivity): AlertCandidate {
  const proxyItem: AppActivity = source || {
    id: candidate.activityId,
    app: candidate.sourceApp,
    title: candidate.title,
    description: candidate.description,
    body: candidate.fullDetails,
    labels: undefined,
  };
  const junk = isAutomatedOrPromotional(proxyItem);
  const draftWorthy = !junk && looksNeedsReplyDraft(proxyItem);
  const urgent = looksUrgent(activityText(proxyItem));

  return {
    ...candidate,
    priority: urgent && draftWorthy ? "high" : candidate.priority,
    // Strict gate: promo/notifications never enter Confirm queue.
    requiresResponse: draftWorthy,
    suggestedAction: draftWorthy
      ? "Review the auto-draft and Confirm & send when ready."
      : junk
        ? "Review this notice — no reply draft needed."
        : candidate.suggestedAction,
  };
}

function mergeAlertCandidates(
  primary: AlertCandidate[],
  secondary: AlertCandidate[],
  activity: AppActivity[]
): AlertCandidate[] {
  const byKey = new Map(activity.map((item) => [`${item.app}:${item.id}`, item]));
  const map = new Map<string, AlertCandidate>();

  for (const candidate of secondary) {
    const key = `${candidate.sourceApp}:${candidate.activityId}`;
    map.set(key, boostCandidate(candidate, byKey.get(key)));
  }

  for (const candidate of primary) {
    const key = `${candidate.sourceApp}:${candidate.activityId}`;
    const existing = map.get(key);
    const boosted = boostCandidate(candidate, byKey.get(key));
    if (!existing) {
      map.set(key, boosted);
      continue;
    }
    map.set(key, {
      ...boosted,
      requiresResponse: boosted.requiresResponse || existing.requiresResponse,
      priority:
        boosted.priority === "high" || existing.priority === "high" ? "high" : boosted.priority,
      suggestedAction: boosted.requiresResponse
        ? "Review the auto-draft and Confirm & send when ready."
        : boosted.suggestedAction,
    });
  }

  return Array.from(map.values())
    .filter((c) => {
      const item = byKey.get(`${c.sourceApp}:${c.activityId}`);
      if (!item) return false;
      // Drop pure junk unless marked requiresResponse somehow (should be false).
      if (isAutomatedOrPromotional(item) && !c.requiresResponse) {
        // Keep only explicit security-style alerts from AI with non-draft.
        return /security|storage|passkey|sign[- ]?in/i.test(`${c.title} ${c.description}`);
      }
      return true;
    })
    .sort((a, b) => {
      if (a.requiresResponse !== b.requiresResponse) return a.requiresResponse ? -1 : 1;
      const rank = { high: 0, medium: 1, low: 2 } as const;
      return rank[a.priority] - rank[b.priority];
    })
    .slice(0, 6);
}

function buildHeuristicCandidates(activity: AppActivity[]): AlertCandidate[] {
  return activity
    .filter((item) => looksNeedsReplyDraft(item) || looksImportantAlert(item))
    .filter((item) => !isAutomatedOrPromotional(item) || /security|storage|passkey/i.test(activityText(item)))
    .slice(0, 6)
    .map((item) => {
      const draft = looksNeedsReplyDraft(item);
      const junk = isAutomatedOrPromotional(item);
      const urgent = looksUrgent(activityText(item));
      const shortTitle =
        item.title && item.title.length > 72 ? `${item.title.slice(0, 69)}…` : item.title;

      return boostCandidate(
        {
          activityId: item.id,
          sourceApp: item.app,
          title:
            shortTitle ||
            (draft
              ? urgent
                ? "Urgent email needs reply"
                : "Email needs reply"
              : "Important app activity"),
          description: item.description || item.title,
          fullDetails: item.body || item.description,
          priority: urgent && draft ? "high" : draft ? "medium" : "medium",
          requiresResponse: draft,
          condition: draft
            ? "Auto-monitor detected a human message that needs a reply"
            : "Auto-monitor detected important connected app activity",
          suggestedAction: draft
            ? "Review the auto-draft and Confirm & send when ready."
            : junk
              ? "Review this notice — no reply draft needed."
              : "Review this item and take the next action.",
        },
        item
      );
    })
    .filter((c) => c.requiresResponse || !isAutomatedOrPromotional({
      app: c.sourceApp,
      title: c.title,
      description: c.description,
      body: c.fullDetails,
    }) || /security|storage|passkey/i.test(`${c.title} ${c.description}`));
}

async function buildAiCandidates(
  activity: AppActivity[],
  options?: { fast?: boolean }
): Promise<AlertCandidate[]> {
  // Prefer cleaner pool for drafting: drop obvious promo before Gemini.
  const usable = activity.filter(
    (item) => !isAutomatedOrPromotional(item) || /security|storage|passkey|sign[- ]?in/i.test(activityText(item))
  );
  const heuristic = buildHeuristicCandidates(usable);

  // Fast path for dashboard open/retry — heuristics only (avoids Gemini timeouts).
  if (options?.fast) return heuristic.slice(0, 5);

  const geminiApiKey = process.env.GEMINI_API_KEY;
  if (!geminiApiKey || usable.length === 0) return heuristic;

  // If heuristics already found reply-needed items, skip Gemini to stay under request limits.
  if (heuristic.some((c) => c.requiresResponse)) {
    return heuristic.slice(0, 5);
  }

  try {
    const ai = new GoogleGenAI({ apiKey: geminiApiKey });
    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-lite",
      contents: `You are Loopin's alert monitor. Return ONLY items that matter.

Real activity:
${JSON.stringify(usable.slice(0, 15), null, 2)}

Return valid JSON only:
[
  {
    "activityId": "must match one activity id",
    "sourceApp": "gmail | whatsapp | slack | discord",
    "title": "short alert title",
    "description": "one sentence summary",
    "fullDetails": "specific details from the real activity",
    "priority": "high" | "medium" | "low",
    "requiresResponse": boolean,
    "condition": "why this alert was triggered",
    "suggestedAction": "recommended next action"
  }
]

Rules:
- requiresResponse=true ONLY for real human messages that expect a reply (urgent/asap, questions, approvals, direct asks).
- requiresResponse=false for newsletters, promotions, marketing, billing receipts, "security alert" system mail, storage warnings, no-reply senders.
- IGNORE unsubscribe links, % off deals, automated notifications.
- Prefer fewer high-quality alerts over many weak ones (max 5).
- Do not invent facts.
- Return [] if nothing deserves attention.`,
      config: { responseMimeType: "application/json" }
    });

    const parsed = JSON.parse(response.text || "[]");
    if (!Array.isArray(parsed)) return heuristic;

    const allowedApps = new Set(["gmail", "whatsapp", "slack", "discord"]);
    const activityIds = new Set(usable.map(item => `${item.app}:${item.id}`));
    const fromAi = parsed
      .filter(item => activityIds.has(`${item.sourceApp}:${item.activityId}`))
      .slice(0, 5)
      .map(item => ({
        activityId: String(item.activityId),
        sourceApp: allowedApps.has(item.sourceApp) ? String(item.sourceApp) : "gmail",
        title: String(item.title || "Important app activity"),
        description: String(item.description || ""),
        fullDetails: String(item.fullDetails || item.description || ""),
        priority: normalizePriority(item.priority),
        requiresResponse: Boolean(item.requiresResponse),
        condition: String(item.condition || "AI auto-monitor detected important connected app activity"),
        suggestedAction: String(item.suggestedAction || "Review this item and take the next action.")
      }));

    return mergeAlertCandidates(fromAi, heuristic, usable);
  } catch (error) {
    console.error("[alert-auto-generation] Gemini alert generation failed:", error);
    return heuristic;
  }
}

export async function generateAutomaticAlertsForUser(
  userId: string,
  options?: { fast?: boolean }
) {
  if (!hasInsforgeAdminKey) {
    console.error("[alert-auto-generation] INSFORGE_API_KEY is required for background alert generation because alerts uses RLS.");
    return { created: 0, scanned: 0, error: "Missing INSFORGE_API_KEY" };
  }

  const apps = await getConnectedMonitorableApps(userId);
  if (apps.length === 0) return { created: 0, scanned: 0 };

  // Gmail native label/draft lives in Inbox (Needs reply), not Alerts.
  const activity = await fetchConnectedActivity(userId, apps);
  if (activity.length === 0) return { created: 0, scanned: 0 };

  // Remove previous promo/notification drafts from Confirm queue.
  let cleaned = 0;
  const { data: pendingDrafts } = await insforgeAdmin.database
    .from("alerts")
    .select("id, title, description, full_details, source_app")
    .eq("user_id", userId)
    .eq("draft_status", "pending_confirm")
    .limit(40);

  const junkIds: string[] = [];
  for (const row of pendingDrafts || []) {
    const junk = isAutomatedOrPromotional({
      app: row.source_app || "gmail",
      title: row.title || "",
      description: row.description || "",
      body: row.full_details || "",
    });
    if (junk) junkIds.push(row.id);
  }

  if (junkIds.length > 0) {
    const { error } = await insforgeAdmin.database
      .from("alerts")
      .update({
        draft_status: "dismissed",
        requires_response: false,
        suggested_action: "Dismissed — automated / promotional message (no reply needed).",
        updated_at: new Date().toISOString(),
      })
      .in("id", junkIds);
    if (!error) {
      cleaned = junkIds.length;
      void publishAlertRealtimeEvent(userId, "alert_updated", {
        draft_status: "dismissed",
        cleaned: junkIds.length,
      });
    }
  }

  const candidates =
    activity.length > 0
      ? await buildAiCandidates(activity, { fast: options?.fast === true })
      : [];
  let created = 0;
  let drafted = 0;
  let draftBudget = 3;

  for (const candidate of candidates) {
    // The dedupe key ties one alert to one source item, so repeated cron runs
    // can safely rescan the same inbox/message history without duplicating rows.
    const dedupeKey = `auto-ai:${userId}:${candidate.sourceApp}:${candidate.activityId}`;
    const { data: existing } = await insforgeAdmin.database
      .from("alerts")
      .select("id, draft_status, requires_response")
      .eq("dedupe_key", dedupeKey)
      .maybeSingle();

    if (existing) {
      // Backfill drafts for older alerts that needed a reply but never got one.
      const needsDraft =
        draftBudget > 0 &&
        candidate.requiresResponse &&
        existing.draft_status !== "pending_confirm" &&
        existing.draft_status !== "sent" &&
        existing.draft_status !== "dismissed";
      if (needsDraft) {
        if (!existing.requires_response) {
          await insforgeAdmin.database
            .from("alerts")
            .update({
              requires_response: true,
              suggested_action: "Review the auto-draft and Confirm & send when ready.",
              updated_at: new Date().toISOString(),
            })
            .eq("id", existing.id);
        }
        const draftResult = await maybeAutoDraftAlertReply({
          id: existing.id,
          user_id: userId,
          title: candidate.title,
          description: candidate.description,
          full_details: candidate.fullDetails,
          source_app: candidate.sourceApp,
          requires_response: true,
        });
        if (draftResult.drafted) {
          drafted += 1;
          draftBudget -= 1;
          await publishAlertRealtimeEvent(userId, "alert_updated", {
            alertId: existing.id,
            draft_status: "pending_confirm",
          });
        }
      }
      continue;
    }

    const sourceActivity = activity.find(
      item => item.app === candidate.sourceApp && item.id === candidate.activityId
    );
    const detailsBase = candidate.fullDetails || sourceActivity?.body || candidate.description;
    const fullDetails = sourceActivity?.replyRef
      ? encodeReplyRef(sourceActivity.replyRef, detailsBase)
      : detailsBase;

    const { data: alert, error } = await insforgeAdmin.database
      .from("alerts")
      .insert({
        user_id: userId,
        rule_id: null,
        dedupe_key: dedupeKey,
        title: candidate.title,
        description: candidate.description,
        full_details: fullDetails,
        source_app: candidate.sourceApp,
        app_logo: appLogo(candidate.sourceApp),
        priority: candidate.priority,
        status: "triggered",
        condition: candidate.condition,
        requires_response: candidate.requiresResponse,
        suggested_action: candidate.suggestedAction
      })
      .select()
      .single();

    if (error) {
      console.error("[alert-auto-generation] Alert insert failed:", error);
      continue;
    }

    created += 1;
    if (alert) {
      const shouldDraft = candidate.requiresResponse && draftBudget > 0;
      const draftResult = shouldDraft
        ? await maybeAutoDraftAlertReply(alert)
        : { drafted: false as const };
      if (draftResult.drafted) {
        drafted += 1;
        draftBudget -= 1;
      }
      const enriched = draftResult.drafted
        ? {
            ...alert,
            draft_reply: draftResult.draft,
            draft_status: "pending_confirm",
            suggested_action: "Review the auto-draft and Confirm & send when ready.",
          }
        : alert;
      await publishAlertRealtimeEvent(userId, "alert_created", { alert: enriched });
      await sendPushToUser(userId, {
        title: draftResult.drafted ? `Draft ready: ${candidate.title}` : candidate.title,
        body: draftResult.drafted
          ? "Open Alerts → Confirm queue to review and send."
          : candidate.description,
        url: "/dashboard?tab=alerts&queue=confirm",
        icon: appLogo(candidate.sourceApp),
        tag: dedupeKey,
      }).catch((err) => console.error("[alert-auto-generation] push failed:", err));
    }
  }

  return {
    created,
    scanned: activity.length,
    drafted,
    cleaned,
  };
}
