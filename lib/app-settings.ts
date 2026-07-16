import { hasInsforgeAdminKey, insforgeAdmin } from "@/lib/insforge-admin";
import {
  DEFAULT_FEATURE_FLAGS,
  type FeatureFlags,
} from "@/lib/feature-flags";

export type { FeatureFlags };
export { DEFAULT_FEATURE_FLAGS };

const FEATURE_FLAGS_KEY = "feature_flags";

function mergeFlags(raw: unknown): FeatureFlags {
  const value = (raw && typeof raw === "object" ? raw : {}) as Partial<FeatureFlags>;
  return {
    integrations: {
      ...DEFAULT_FEATURE_FLAGS.integrations,
      ...(value.integrations || {}),
    },
    surfaces: {
      ...DEFAULT_FEATURE_FLAGS.surfaces,
      ...(value.surfaces || {}),
    },
  };
}

export async function getFeatureFlags(): Promise<FeatureFlags> {
  if (!hasInsforgeAdminKey) return DEFAULT_FEATURE_FLAGS;

  const { data, error } = await insforgeAdmin.database
    .from("app_settings")
    .select("value")
    .eq("key", FEATURE_FLAGS_KEY)
    .maybeSingle();

  if (error || !data) return DEFAULT_FEATURE_FLAGS;
  return mergeFlags(data.value);
}

export async function setFeatureFlags(flags: FeatureFlags): Promise<{ error?: string }> {
  if (!hasInsforgeAdminKey) {
    return { error: "INSFORGE_API_KEY is required" };
  }

  const merged = mergeFlags(flags);
  const { data: existing } = await insforgeAdmin.database
    .from("app_settings")
    .select("key")
    .eq("key", FEATURE_FLAGS_KEY)
    .maybeSingle();

  if (existing) {
    const { error } = await insforgeAdmin.database
      .from("app_settings")
      .update({ value: merged, updated_at: new Date().toISOString() })
      .eq("key", FEATURE_FLAGS_KEY);
    if (error) return { error: error.message };
  } else {
    const { error } = await insforgeAdmin.database.from("app_settings").insert([
      {
        key: FEATURE_FLAGS_KEY,
        value: merged,
        updated_at: new Date().toISOString(),
      },
    ]);
    if (error) return { error: error.message };
  }

  return {};
}
