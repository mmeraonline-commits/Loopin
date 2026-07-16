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

function getNextCheckAt(frequency?: string): string {
  const next = new Date();
  if (frequency === "hourly") next.setHours(next.getHours() + 1);
  else if (frequency === "daily") next.setDate(next.getDate() + 1);
  else if (frequency === "15_minutes") next.setMinutes(next.getMinutes() + 15);
  else next.setMinutes(next.getMinutes() + 5);
  return next.toISOString();
}

export const alertsCron = schedules.task({
  id: "alerts-cron",
  cron: "*/5 * * * *",
  run: async () => {
    const now = new Date().toISOString();
    const db = hasInsforgeAdminKey ? insforgeAdmin.database : insforge.database;
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

    const { data: users, error: usersError } = await db
      .from("users")
      .select("id, integrations");

    if (usersError) {
      console.error("[alerts-cron] Users fetch error:", usersError);
      return;
    }

    for (const user of (users || []) as { id: string }[]) {
      await autoGenerateAlertsForUserTask.trigger({ userId: user.id });
    }
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
