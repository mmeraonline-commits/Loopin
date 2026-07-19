/**
 * User preference fields stored in users.assistant_settings (jsonb).
 * Tone/draft fields live alongside these; Advanced tone sources stay Business+-gated
 * via /api/tone/sources and are never overwritten by a Settings save.
 */

export type DetailLevel = "minimal" | "standard" | "detailed";
export type BriefingCadence = "morning" | "twice_daily" | "manual";
export type SyncFrequency = "real_time" | "15_minutes" | "hourly";
export type AlertPriorityFilter = "all" | "medium_high" | "high";

export type UserPreferences = {
  displayName: string;
  roleContext: string;
  timezone: string;
  detailLevel: DetailLevel;
  proactiveSuggestions: boolean;
  briefingCadence: BriefingCadence;
  briefingChannels: string[];
  syncFrequency: SyncFrequency;
  alertPriority: AlertPriorityFilter;
  alertMethods: string[];
};

export const DEFAULT_USER_PREFERENCES: UserPreferences = {
  displayName: "",
  roleContext: "Personal productivity, communication triage, and executive follow-ups",
  timezone: "America/New_York",
  detailLevel: "standard",
  proactiveSuggestions: true,
  briefingCadence: "morning",
  briefingChannels: ["in_app", "email"],
  syncFrequency: "real_time",
  alertPriority: "medium_high",
  alertMethods: ["in_app"],
};

const DETAIL_LEVELS = new Set<DetailLevel>(["minimal", "standard", "detailed"]);
const CADENCES = new Set<BriefingCadence>(["morning", "twice_daily", "manual"]);
const SYNC_FREQS = new Set<SyncFrequency>(["real_time", "15_minutes", "hourly"]);
const PRIORITIES = new Set<AlertPriorityFilter>(["all", "medium_high", "high"]);
const CHANNELS = new Set(["in_app", "email", "whatsapp", "push"]);
const ALERT_METHODS = new Set(["in_app", "email", "push", "whatsapp"]);

function asString(value: unknown, max: number, fallback = ""): string {
  if (typeof value !== "string") return fallback;
  return value.trim().slice(0, max);
}

function asStringArray(value: unknown, allowed: Set<string>, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;
  const next = value
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.toLowerCase().trim())
    .filter((v) => allowed.has(v));
  return next.length ? [...new Set(next)] : fallback;
}

export function sanitizeUserPreferences(
  raw: Record<string, unknown> | null | undefined,
  fallback: Partial<UserPreferences> = {}
): UserPreferences {
  const base = { ...DEFAULT_USER_PREFERENCES, ...fallback };
  if (!raw || typeof raw !== "object") return base;

  const detailLevel = DETAIL_LEVELS.has(raw.detailLevel as DetailLevel)
    ? (raw.detailLevel as DetailLevel)
    : base.detailLevel;
  const briefingCadence = CADENCES.has(raw.briefingCadence as BriefingCadence)
    ? (raw.briefingCadence as BriefingCadence)
    : base.briefingCadence;
  const syncFrequency = SYNC_FREQS.has(raw.syncFrequency as SyncFrequency)
    ? (raw.syncFrequency as SyncFrequency)
    : base.syncFrequency;
  const alertPriority = PRIORITIES.has(raw.alertPriority as AlertPriorityFilter)
    ? (raw.alertPriority as AlertPriorityFilter)
    : base.alertPriority;

  return {
    displayName: asString(raw.displayName, 80, base.displayName),
    roleContext: asString(raw.roleContext, 500, base.roleContext),
    timezone: asString(raw.timezone, 80, base.timezone) || base.timezone,
    detailLevel,
    proactiveSuggestions:
      typeof raw.proactiveSuggestions === "boolean"
        ? raw.proactiveSuggestions
        : base.proactiveSuggestions,
    briefingCadence,
    briefingChannels: asStringArray(raw.briefingChannels, CHANNELS, base.briefingChannels),
    syncFrequency,
    alertPriority,
    alertMethods: asStringArray(raw.alertMethods, ALERT_METHODS, base.alertMethods),
  };
}

/** Map detail level to a short prompt instruction. */
export function detailLevelGuide(level: DetailLevel | string | undefined): string {
  switch (level) {
    case "minimal":
      return "Keep output minimal: only essential action items, 2–4 short bullets max.";
    case "detailed":
      return "Be detailed: include context, named entities, deadlines, and suggested next steps.";
    default:
      return "Use a standard executive summary: clear bullets with just enough context.";
  }
}

/** Priority ranks for filtering alerts. */
export function alertPriorityRank(priority: string | undefined): number {
  const p = (priority || "medium").toLowerCase();
  if (p === "high" || p === "urgent" || p === "critical") return 3;
  if (p === "medium" || p === "medium_high") return 2;
  return 1;
}

/** Returns true if an alert priority passes the user's threshold filter. */
export function passesAlertPriorityFilter(
  alertPriority: string | undefined,
  filter: AlertPriorityFilter | string | undefined
): boolean {
  const f = (filter || "all") as AlertPriorityFilter;
  if (f === "all") return true;
  const rank = alertPriorityRank(alertPriority);
  if (f === "high") return rank >= 3;
  if (f === "medium_high") return rank >= 2;
  return true;
}

/** Merge rule notification method with Settings alertMethods (union). */
export function resolveNotifyMethods(
  ruleMethod: string | undefined,
  settingsMethods: string[] | undefined
): string[] {
  const fromSettings = (settingsMethods || [])
    .map((m) => m.toLowerCase().trim())
    .filter((m) => ALERT_METHODS.has(m));
  const rule = (ruleMethod || "in_app").toLowerCase().trim();
  const set = new Set<string>(fromSettings.length ? fromSettings : [rule]);
  if (rule && ALERT_METHODS.has(rule)) set.add(rule);
  // Always keep in_app implied for DB row; extra channels are for outbound notify
  return [...set];
}

export const MANAGED_BRIEFING_PREFIX = "Settings · ";

export function managedBriefingNames(cadence: BriefingCadence): { name: string; time: string }[] {
  if (cadence === "manual") return [];
  if (cadence === "twice_daily") {
    return [
      { name: `${MANAGED_BRIEFING_PREFIX}Morning digest`, time: "09:00" },
      { name: `${MANAGED_BRIEFING_PREFIX}Evening digest`, time: "18:00" },
    ];
  }
  return [{ name: `${MANAGED_BRIEFING_PREFIX}Morning digest`, time: "09:00" }];
}
