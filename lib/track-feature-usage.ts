import { hasInsforgeAdminKey, insforgeAdmin } from "@/lib/insforge-admin";

export type TrackFeatureUsageInput = {
  userId?: string | null;
  feature: string;
  action?: string;
  metadata?: Record<string, unknown>;
};

/** Fire-and-forget usage event. Never throws to callers. */
export async function trackFeatureUsage(input: TrackFeatureUsageInput): Promise<void> {
  try {
    if (!hasInsforgeAdminKey || !input.feature) return;

    await insforgeAdmin.database.from("feature_usage_events").insert([
      {
        user_id: input.userId || null,
        feature: input.feature,
        action: input.action || "use",
        metadata: input.metadata || {},
      },
    ]);
  } catch (err) {
    console.error("[trackFeatureUsage]", err);
  }
}
