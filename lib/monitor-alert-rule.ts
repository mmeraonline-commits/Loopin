import { hasInsforgeAdminKey, insforgeAdmin } from "@/lib/insforge-admin";
import { publishAlertRealtimeEvent } from "@/lib/alerts-realtime";
import {
  type AppActivity,
  appLogo,
  fetchConnectedActivity,
} from "@/lib/alert-auto-generation";
import { encodeReplyRef } from "@/lib/send-reply";
import { maybeAutoDraftAlertReply } from "@/lib/auto-draft-reply";
import { notifyUserOfAlert } from "@/lib/alert-notify";

export type AlertRuleRow = {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  apps?: string[];
  condition?: string;
  priority?: string;
  frequency?: string;
  action?: string;
  notification_method?: string;
  status?: string;
};

export function matchesAlertCondition(rule: AlertRuleRow, item: AppActivity): boolean {
  const haystack = `${item.title} ${item.description} ${item.body}`.toLowerCase();
  const condition = (rule.condition || rule.name || "").toLowerCase();

  // Prefer multi-word phrases from the condition (quoted or comma-separated-ish keywords)
  const phrases = condition
    .split(/[,;|]/)
    .map((p) => p.trim())
    .filter((p) => p.length > 2);

  for (const phrase of phrases) {
    if (phrase.includes(" ") && haystack.includes(phrase)) return true;
  }

  const terms = condition
    .split(/[^a-z0-9@._+-]+/)
    .filter((term) => term.length > 3)
    .filter(
      (term) =>
        !["when", "with", "from", "that", "this", "have", "has", "alert", "mentions", "email", "message"].includes(
          term
        )
    );

  const hitCount = terms.filter((term) => haystack.includes(term)).length;
  if (terms.length > 0 && hitCount >= Math.min(2, terms.length)) return true;
  if (terms.some((term) => haystack.includes(term) && term.length >= 6)) return true;

  // Fallback: urgent intent if the rule itself asks for urgency-style monitoring
  if (/urgent|deadline|invoice|follow.?up|asap|blocked/i.test(condition)) {
    const urgentTerms = [
      "urgent",
      "deadline",
      "asap",
      "blocked",
      "follow up",
      "follow-up",
      "invoice",
      "approve",
      "review",
    ];
    return urgentTerms.some((term) => haystack.includes(term));
  }

  return false;
}

export async function runMonitorAlertRule(ruleId: string): Promise<{
  success: boolean;
  matches: number;
  created: number;
  error?: string;
}> {
  if (!hasInsforgeAdminKey) {
    return { success: false, matches: 0, created: 0, error: "INSFORGE_API_KEY missing" };
  }

  const db = insforgeAdmin.database;
  const { data: rule, error } = await db
    .from("alert_rules")
    .select("*")
    .eq("id", ruleId)
    .maybeSingle();

  if (error || !rule) {
    return { success: false, matches: 0, created: 0, error: error?.message || "Rule not found" };
  }

  const typedRule = rule as AlertRuleRow;
  if (typedRule.status && typedRule.status !== "active") {
    return { success: true, matches: 0, created: 0 };
  }

  const activity = await fetchConnectedActivity(typedRule.user_id, typedRule.apps || []);
  const matches = activity.filter((item) => matchesAlertCondition(typedRule, item));
  let created = 0;

  for (const match of matches.slice(0, 8)) {
    const dedupeKey = `${typedRule.id}:${match.app}:${match.id}`;
    const { data: existing } = await db
      .from("alerts")
      .select("id")
      .eq("dedupe_key", dedupeKey)
      .maybeSingle();

    if (existing) continue;

    const detailsBase = match.body || match.description || typedRule.condition || "";
    const fullDetails = match.replyRef
      ? encodeReplyRef(match.replyRef, detailsBase)
      : detailsBase;

    const { data: alert, error: insertError } = await db
      .from("alerts")
      .insert({
        user_id: typedRule.user_id,
        rule_id: typedRule.id,
        dedupe_key: dedupeKey,
        title: typedRule.name,
        description:
          match.description ||
          typedRule.description ||
          "Alert condition matched in connected app activity.",
        full_details: fullDetails,
        source_app: match.app,
        app_logo: appLogo(match.app),
        priority: typedRule.priority || "medium",
        status: "triggered",
        condition: typedRule.condition || "",
        requires_response:
          typedRule.action === "draft_reply" ||
          (!!match &&
            (match.app === "gmail" || match.app === "outlook") &&
            /urgent|asap|please (reply|respond)|can you|could you|let me know|\?/i.test(
              `${match.title} ${match.description} ${match.body}`
            ) &&
            !/unsubscribe|noreply|no-reply|newsletter|% off|security alert|storage/i.test(
              `${match.from || ""} ${match.title} ${match.description} ${match.body}`
            )),
        suggested_action:
          typedRule.action === "create_task"
            ? "Convert this alert into a task and assign a due date."
            : typedRule.action === "mark_follow_up"
              ? "Create a follow-up so this conversation does not go stale."
              : typedRule.action === "draft_reply"
                ? "Draft is auto-prepared in Confirm queue — review and Confirm & send."
                : "Review the alert and respond from the connected app if needed.",
      })
      .select()
      .single();

    if (insertError) {
      console.error("[monitor-alert-rule] Alert insert failed:", insertError);
      continue;
    }

    created += 1;
    if (alert) {
      const draftResult = await maybeAutoDraftAlertReply(alert);
      const enriched = draftResult.drafted
        ? {
            ...alert,
            draft_reply: draftResult.draft,
            draft_status: "pending_confirm",
            suggested_action: "Review the auto-draft and Confirm & send when ready.",
          }
        : alert;
      await publishAlertRealtimeEvent(typedRule.user_id, "alert_created", { alert: enriched });
      await notifyUserOfAlert(typedRule.user_id, typedRule.notification_method, {
        title: typedRule.name,
        body: draftResult.drafted
          ? `Draft ready — confirm before send: ${match.description || typedRule.description || "New alert"}`
          : match.description || typedRule.description || "New alert matched your rule",
        url: "/dashboard?tab=alerts&queue=confirm",
        icon: appLogo(match.app),
        tag: `rule-${typedRule.id}-${match.id}`,
      }).catch((err) => console.error("[monitor-alert-rule] notify failed:", err));
    }
  }

  await db
    .from("alert_rules")
    .update({ last_checked_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", ruleId);

  return { success: true, matches: matches.length, created };
}
