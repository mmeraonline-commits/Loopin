import { schedules, task } from "@trigger.dev/sdk/v3";
import { insforge } from "../lib/insforge";
import { hasInsforgeAdminKey, insforgeAdmin } from "../lib/insforge-admin";
import {
  generateAutomaticAlertsForUser,
  getConnectedMonitorableApps,
} from "../lib/alert-auto-generation";
import { runMonitorAlertRule } from "../lib/monitor-alert-rule";

type AlertRule = {
  id: string;
  frequency?: string;
};

type IntegrationValue = { connected?: boolean; isSimulated?: boolean } | null | undefined;

type UserRow = {
  id: string;
  integrations?: Record<string, IntegrationValue> | null;
};

const MONITORABLE_APPS = ["gmail", "whatsapp", "slack", "discord"] as const;

function getDb() {
  return hasInsforgeAdminKey ? insforgeAdmin.database : insforge.database;
}

function getNextCheckAt(frequency?: string): string {
  const next = new Date();
  if (frequency === "hourly") next.setHours(next.getHours() + 1);
  else if (frequency === "daily") next.setDate(next.getDate() + 1);
  else if (frequency === "15_minutes") next.setMinutes(next.getMinutes() + 15);
  else next.setMinutes(next.getMinutes() + 5);
  return next.toISOString();
}

function hasConnectedMonitorableApp(user: UserRow): boolean {
  const integrations = user.integrations;
  if (!integrations || typeof integrations !== "object") return false;
  for (const app of MONITORABLE_APPS) {
    const value = integrations[app];
    if (value && typeof value === "object" && value.connected === true && value.isSimulated !== true) {
      return true;
    }
  }
  return false;
}

/**
 * Every 5 minutes: only user-defined alert rules (higher priority).
 */
export const alertsCron = schedules.task({
  id: "alerts-cron",
  cron: "*/5 * * * *",
  run: async () => {
    const now = new Date().toISOString();
    const db = getDb();
    const { data: rules, error } = await db
      .from("alert_rules")
      .select("*")
      .eq("status", "active")
      .lte("next_check_at", now);

    if (error) {
      console.error("[alerts-cron] DB error:", error);
      return;
    }

    for (const rule of (rules || []) as AlertRule[]) {
      await monitorAlertRuleTask.trigger({ ruleId: rule.id });
      await db
        .from("alert_rules")
        .update({ next_check_at: getNextCheckAt(rule.frequency), updated_at: now })
        .eq("id", rule.id);
    }

    return { ok: true, rulesTriggered: (rules || []).length };
  },
});

/**
 * Every 30 minutes: AI auto-alerts for users with connected apps.
 * Cheaper than fanning out every 5 min to every user row.
 */
export const alertsAutoGenerateCron = schedules.task({
  id: "alerts-auto-generate-cron",
  cron: "*/30 * * * *",
  run: async () => {
    const db = getDb();
    const { data: users, error } = await db.from("users").select("id, integrations");

    if (error) {
      console.error("[alerts-auto-generate-cron] Users fetch error:", error);
      return { ok: false, error: error.message || String(error) };
    }

    const rows = (users || []) as UserRow[];
    const targets = rows.filter(hasConnectedMonitorableApp);

    console.log(
      `[alerts-auto-generate-cron] users=${rows.length} withApps=${targets.length}`
    );

    for (const user of targets) {
      await autoGenerateAlertsForUserTask.trigger({ userId: user.id });
    }

    return { ok: true, usersScanned: rows.length, triggered: targets.length };
  },
});

export const monitorAlertRuleTask = task({
  id: "monitor-alert-rule",
  run: async (payload: { ruleId: string }) => {
    return runMonitorAlertRule(payload.ruleId);
  },
});

export const autoGenerateAlertsForUserTask = task({
  id: "auto-generate-alerts-for-user",
  run: async (payload: { userId: string }) => {
    const apps = await getConnectedMonitorableApps(payload.userId);
    if (apps.length === 0) {
      return { success: true, created: 0, scanned: 0, reason: "No connected monitored apps" };
    }

    const result = await generateAutomaticAlertsForUser(payload.userId);
    return { success: true, ...result };
  },
});
