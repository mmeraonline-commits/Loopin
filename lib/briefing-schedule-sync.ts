import { hasInsforgeAdminKey, insforgeAdmin } from "@/lib/insforge-admin";
import {
  MANAGED_BRIEFING_PREFIX,
  managedBriefingNames,
  type BriefingCadence,
} from "@/lib/assistant-preferences";

/**
 * Compute next run for HH:mm in a given IANA timezone (best-effort).
 * Falls back to server-local interpretation of the clock time.
 */
export function getNextRunAtInTimezone(
  scheduledTime: string,
  timezone: string,
  frequency: "daily" | "hourly" | "weekly" = "daily"
): Date {
  const [hours, minutes] = scheduledTime.split(":").map(Number);
  const now = new Date();

  try {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone || "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    const parts = Object.fromEntries(
      fmt.formatToParts(now).filter((p) => p.type !== "literal").map((p) => [p.type, p.value])
    );
    const y = Number(parts.year);
    const m = Number(parts.month);
    const d = Number(parts.day);
    const curH = Number(parts.hour === "24" ? "0" : parts.hour);
    const curM = Number(parts.minute);

    // Build a UTC guess: interpret the target wall time as if in the user's TZ by
    // computing the offset between "now in TZ" and actual UTC.
    const asUtcGuess = Date.UTC(y, m - 1, d, hours || 0, minutes || 0, 0, 0);
    const nowAsUtcGuess = Date.UTC(y, m - 1, d, curH, curM, Number(parts.second) || 0, 0);
    const offsetMs = nowAsUtcGuess - now.getTime();
    let next = new Date(asUtcGuess - offsetMs);

    if (next.getTime() <= now.getTime()) {
      if (frequency === "hourly") {
        next = new Date(next.getTime() + 60 * 60 * 1000);
      } else if (frequency === "weekly") {
        next = new Date(next.getTime() + 7 * 24 * 60 * 60 * 1000);
      } else {
        next = new Date(next.getTime() + 24 * 60 * 60 * 1000);
      }
    }
    return next;
  } catch {
    const date = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      hours || 0,
      minutes || 0,
      0,
      0
    );
    if (date <= now) date.setDate(date.getDate() + 1);
    return date;
  }
}

/**
 * Upsert/delete "Settings · …" briefing_schedules rows to match cadence.
 * Custom schedules created in the Briefings tab are left alone.
 */
export async function syncManagedBriefingSchedules(input: {
  userId: string;
  cadence: BriefingCadence;
  timezone: string;
  apps: string[];
}): Promise<void> {
  if (!hasInsforgeAdminKey) return;

  const { data: existing, error } = await insforgeAdmin.database
    .from("briefing_schedules")
    .select("id, name")
    .eq("user_id", input.userId);

  if (error) throw new Error(error.message);

  const managed = (existing || []).filter((row: { name?: string }) =>
    String(row.name || "").startsWith(MANAGED_BRIEFING_PREFIX)
  );

  const desired = managedBriefingNames(input.cadence);
  const desiredNames = new Set(desired.map((d) => d.name));

  // Delete managed rows that are no longer wanted
  for (const row of managed) {
    if (!desiredNames.has(row.name)) {
      await insforgeAdmin.database
        .from("briefing_schedules")
        .delete()
        .eq("id", row.id)
        .eq("user_id", input.userId);
    }
  }

  const remaining = managed.filter((r: { name: string }) => desiredNames.has(r.name));
  const remainingNames = new Set(remaining.map((r: { name: string }) => r.name));

  const defaultCategories = ["email", "messages", "calendar", "tasks"];

  for (const item of desired) {
    if (remainingNames.has(item.name)) {
      // Update time / next_run for existing managed row
      const nextRun = getNextRunAtInTimezone(item.time, input.timezone, "daily");
      await insforgeAdmin.database
        .from("briefing_schedules")
        .update({
          scheduled_time: item.time,
          frequency: "daily",
          apps: input.apps,
          categories: defaultCategories,
          priority_level: "medium",
          next_run_at: nextRun.toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", input.userId)
        .eq("name", item.name);
      continue;
    }

    const nextRun = getNextRunAtInTimezone(item.time, input.timezone, "daily");
    await insforgeAdmin.database.from("briefing_schedules").insert({
      user_id: input.userId,
      name: item.name,
      description: "Managed from Settings · Briefings",
      apps: input.apps,
      categories: defaultCategories,
      scheduled_time: item.time,
      frequency: "daily",
      priority_level: "medium",
      next_run_at: nextRun.toISOString(),
    });
  }
}
