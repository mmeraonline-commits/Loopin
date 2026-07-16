import { NextResponse } from "next/server";
import { hasInsforgeAdminKey, insforgeAdmin } from "@/lib/insforge-admin";
import {
  type ChannelId,
  type PlanDefinition,
  type PlanId,
  canUseChannel,
  canUseSurface,
  clampSeats,
  getMonthlyLimits,
  getPlan,
  nextUpgradePlan,
} from "@/lib/plans";

export type UserPlanRow = {
  id: string;
  plan: PlanId;
  seats: number;
  integrations?: Record<string, unknown>;
};

export type PlanUsageSnapshot = {
  plan: PlanDefinition;
  planId: PlanId;
  seats: number;
  limits: ReturnType<typeof getMonthlyLimits>;
  used: {
    aiActions: number;
    sends: number;
    alertRules: number;
  };
  remaining: {
    aiActions: number | null;
    sends: number | null;
    alertRules: number | null;
  };
  periodStart: string;
};

function monthStartIso(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

function remainingOf(limit: number | null, used: number): number | null {
  if (limit === null) return null;
  return Math.max(0, limit - used);
}

export async function loadUserPlan(userId: string): Promise<UserPlanRow | null> {
  if (!hasInsforgeAdminKey) return null;
  const { data, error } = await insforgeAdmin.database
    .from("users")
    .select("id, plan, seats, integrations")
    .eq("id", userId)
    .maybeSingle();
  if (error || !data) return null;
  const plan = getPlan(data.plan).id;
  return {
    id: data.id,
    plan,
    seats: clampSeats(plan, data.seats),
    integrations: data.integrations || {},
  };
}

async function countUsage(userId: string, feature: string, action: string, since: string) {
  const { data, error } = await insforgeAdmin.database
    .from("feature_usage_events")
    .select("id")
    .eq("user_id", userId)
    .eq("feature", feature)
    .eq("action", action)
    .gte("created_at", since);
  if (error) {
    console.error("[plan-usage] count", feature, action, error);
    return 0;
  }
  return (data || []).length;
}

async function countAlertRules(userId: string) {
  const { data, error } = await insforgeAdmin.database
    .from("alert_rules")
    .select("id")
    .eq("user_id", userId);
  if (error) {
    console.error("[plan-usage] alert rules", error);
    return 0;
  }
  return (data || []).length;
}

export async function getPlanUsage(userId: string): Promise<PlanUsageSnapshot | null> {
  const user = await loadUserPlan(userId);
  if (!user) return null;

  const periodStart = monthStartIso();
  const limits = getMonthlyLimits(user.plan, user.seats);
  const [aiActions, sends, alertRules] = await Promise.all([
    countUsage(userId, "ai_agent", "action", periodStart),
    countUsage(userId, "send", "confirmed", periodStart),
    countAlertRules(userId),
  ]);

  return {
    plan: getPlan(user.plan),
    planId: user.plan,
    seats: user.seats,
    limits,
    used: { aiActions, sends, alertRules },
    remaining: {
      aiActions: remainingOf(limits.aiActions, aiActions),
      sends: remainingOf(limits.sends, sends),
      alertRules: remainingOf(limits.alertRules, alertRules),
    },
    periodStart,
  };
}

export type PlanGateError = {
  error: string;
  code: "PLAN_LOCKED" | "QUOTA_EXCEEDED";
  plan: PlanId;
  upgradeTo: PlanId | null;
  used?: number;
  limit?: number | null;
};

export function planGateResponse(payload: PlanGateError, status: 403 | 429) {
  return NextResponse.json(payload, { status });
}

export function denyChannel(planId: PlanId, channel: ChannelId) {
  if (canUseChannel(planId, channel)) return null;
  return planGateResponse(
    {
      error: `${channel} is not included in your ${getPlan(planId).name} plan. Redeem an upgrade code to unlock it.`,
      code: "PLAN_LOCKED",
      plan: planId,
      upgradeTo: nextUpgradePlan(planId),
    },
    403
  );
}

export function denySurface(planId: PlanId, surface: keyof PlanDefinition["surfaces"], label: string) {
  if (canUseSurface(planId, surface)) return null;
  return planGateResponse(
    {
      error: `${label} is not available on your ${getPlan(planId).name} plan. Redeem an upgrade code to unlock it.`,
      code: "PLAN_LOCKED",
      plan: planId,
      upgradeTo: nextUpgradePlan(planId),
    },
    403
  );
}

export async function assertAiActionQuota(userId: string) {
  const usage = await getPlanUsage(userId);
  if (!usage) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  if (!usage.plan.surfaces.aiAgent) {
    return denySurface(usage.planId, "aiAgent", "AI Agent");
  }
  if (usage.limits.aiActions !== null && usage.used.aiActions >= usage.limits.aiActions) {
    return planGateResponse(
      {
        error: `AI action quota reached (${usage.used.aiActions}/${usage.limits.aiActions} this month).`,
        code: "QUOTA_EXCEEDED",
        plan: usage.planId,
        upgradeTo: nextUpgradePlan(usage.planId),
        used: usage.used.aiActions,
        limit: usage.limits.aiActions,
      },
      429
    );
  }
  return { usage } as const;
}

export async function assertSendQuota(userId: string) {
  const usage = await getPlanUsage(userId);
  if (!usage) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  if (usage.limits.sends !== null && usage.used.sends >= usage.limits.sends) {
    return planGateResponse(
      {
        error: `Confirmed send quota reached (${usage.used.sends}/${usage.limits.sends} this month).`,
        code: "QUOTA_EXCEEDED",
        plan: usage.planId,
        upgradeTo: nextUpgradePlan(usage.planId),
        used: usage.used.sends,
        limit: usage.limits.sends,
      },
      429
    );
  }
  return { usage } as const;
}

export async function assertAlertRuleQuota(userId: string) {
  const usage = await getPlanUsage(userId);
  if (!usage) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  if (!usage.plan.surfaces.alerts || usage.limits.alertRules === 0) {
    return denySurface(usage.planId, "alerts", "Custom alert rules");
  }
  if (usage.limits.alertRules !== null && usage.used.alertRules >= usage.limits.alertRules) {
    return planGateResponse(
      {
        error: `Alert rule limit reached (${usage.used.alertRules}/${usage.limits.alertRules}).`,
        code: "QUOTA_EXCEEDED",
        plan: usage.planId,
        upgradeTo: nextUpgradePlan(usage.planId),
        used: usage.used.alertRules,
        limit: usage.limits.alertRules,
      },
      429
    );
  }
  return { usage } as const;
}

export function isNextResponse(value: unknown): value is NextResponse {
  return value instanceof NextResponse;
}
