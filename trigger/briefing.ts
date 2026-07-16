import { task, schedules } from "@trigger.dev/sdk/v3";
import { hasInsforgeAdminKey, insforgeAdmin } from "../lib/insforge-admin";
import { insforge } from "../lib/insforge";

const APP_URL = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

function getDb() {
  return hasInsforgeAdminKey ? insforgeAdmin.database : insforge.database;
}

function getNextRunTime(scheduledTimeStr: string, frequency: string): Date {
  const now = new Date();
  const [hours, minutes] = scheduledTimeStr.split(":").map(Number);
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, 0, 0);
  if (date <= now) {
    if (frequency === "hourly") date.setHours(date.getHours() + 1);
    else if (frequency === "weekly") date.setDate(date.getDate() + 7);
    else date.setDate(date.getDate() + 1);
  }
  return date;
}

/** Cron: every 15 minutes, dispatch due briefing schedules. */
export const briefingCron = schedules.task({
  id: "briefing-cron",
  cron: "*/15 * * * *",
  run: async () => {
    const now = new Date().toISOString();
    console.log(`[briefing-cron] Checking for due schedules at ${now}`);

    const db = getDb();
    const { data: dueSchedules, error } = await db
      .from("briefing_schedules")
      .select("*")
      .lte("next_run_at", now);

    if (error) {
      console.error("[briefing-cron] DB error:", error);
      return;
    }

    if (!dueSchedules || dueSchedules.length === 0) {
      console.log("[briefing-cron] No schedules due.");
      return;
    }

    console.log(`[briefing-cron] ${dueSchedules.length} schedule(s) due — dispatching jobs...`);

    for (const schedule of dueSchedules) {
      const nextRun = getNextRunTime(schedule.scheduled_time, schedule.frequency);
      await db
        .from("briefing_schedules")
        .update({ next_run_at: nextRun.toISOString(), updated_at: now })
        .eq("id", schedule.id);

      await generateBriefingTask.trigger({
        scheduleId: schedule.id,
        userId: schedule.user_id,
      });

      console.log(`[briefing-cron] Triggered job for schedule "${schedule.name}" (user ${schedule.user_id})`);
    }
  },
});

/**
 * Generator task: calls the same /api/briefings path as the dashboard
 * so Slack/Gmail/WhatsApp + Gemini stay in one place.
 * Requires APP_URL to be reachable from the Trigger worker (localhost in `trigger dev`).
 */
export const generateBriefingTask = task({
  id: "generate-briefing-task",
  run: async (payload: { scheduleId?: string; userId: string }) => {
    const { scheduleId, userId } = payload;
    console.log(`[generate-briefing-task] Starting for user=${userId} schedule=${scheduleId || "default"}`);

    const res = await fetch(`${APP_URL}/api/briefings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, scheduleId }),
    });

    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error("[generate-briefing-task] API failed:", body?.error || res.statusText);
      return { success: false, error: body?.error || res.statusText };
    }

    console.log(`[generate-briefing-task] Saved briefing: ${body?.title || body?.id || "ok"}`);
    return { success: true, title: body?.title, id: body?.id };
  },
});
