export type PlanId = "starter" | "pro" | "business" | "team";

export type ChannelId =
  | "gmail"
  | "whatsapp"
  | "slack"
  | "discord"
  | "outlook"
  | "linkedin"
  | "calendly";

export type SurfaceId = "inbox" | "aiAgent" | "alerts" | "briefing" | "followUps";

export type PlanDefinition = {
  id: PlanId;
  name: string;
  priceMonthly: number;
  priceLabel: string;
  description: string;
  seats: { min: number; max: number; default: number };
  channels: ChannelId[];
  surfaces: {
    inbox: boolean;
    aiAgent: boolean;
    alerts: boolean;
    briefing: boolean;
    followUps: boolean;
    aiSuggestedAlerts: boolean;
    liveAlertsTimeline: boolean;
    calendly: boolean;
    prioritySupport: boolean;
    perSeatConfirmationQueues: boolean;
  };
  /** null = unlimited */
  limits: {
    alertRules: number | null;
    aiActionsPerMonth: number | null;
    sendsPerMonth: number | null;
  };
  featureBullets: string[];
};

const ALL_CHANNELS: ChannelId[] = [
  "gmail",
  "whatsapp",
  "slack",
  "discord",
  "outlook",
  "linkedin",
  "calendly",
];

export const PLAN_ORDER: PlanId[] = ["starter", "pro", "business", "team"];

export const PLANS: Record<PlanId, PlanDefinition> = {
  starter: {
    id: "starter",
    name: "Starter",
    priceMonthly: 99,
    priceLabel: "$99",
    description: "Gmail + WhatsApp with daily briefs and capped sends",
    seats: { min: 1, max: 1, default: 1 },
    channels: ["gmail", "whatsapp"],
    surfaces: {
      inbox: false,
      aiAgent: false,
      alerts: false,
      briefing: true,
      followUps: true,
      aiSuggestedAlerts: false,
      liveAlertsTimeline: false,
      calendly: false,
      prioritySupport: false,
      perSeatConfirmationQueues: false,
    },
    limits: {
      alertRules: 0,
      aiActionsPerMonth: 0,
      sendsPerMonth: 20,
    },
    featureBullets: [
      "Gmail + WhatsApp",
      "Daily AI briefing",
      "Follow-up tracker",
      "20 confirmed sends / month",
      "Confirm-before-send",
    ],
  },
  pro: {
    id: "pro",
    name: "Pro",
    priceMonthly: 199,
    priceLabel: "$199",
    description: "Add Slack/Discord, AI Agent, inbox, and alert rules",
    seats: { min: 1, max: 1, default: 1 },
    channels: ["gmail", "whatsapp", "slack", "discord"],
    surfaces: {
      inbox: true,
      aiAgent: true,
      alerts: true,
      briefing: true,
      followUps: true,
      aiSuggestedAlerts: true,
      liveAlertsTimeline: true,
      calendly: false,
      prioritySupport: false,
      perSeatConfirmationQueues: false,
    },
    limits: {
      alertRules: 10,
      aiActionsPerMonth: 100,
      sendsPerMonth: 100,
    },
    featureBullets: [
      "Everything in Starter",
      "+ Slack + Discord",
      "Unified inbox & reply",
      "AI Agent (100 actions / mo)",
      "10 custom alert rules",
      "100 confirmed sends / month",
    ],
  },
  business: {
    id: "business",
    name: "Business",
    priceMonthly: 399,
    priceLabel: "$399",
    description: "All channels, Calendly, and higher AI/send caps",
    seats: { min: 1, max: 1, default: 1 },
    channels: [...ALL_CHANNELS],
    surfaces: {
      inbox: true,
      aiAgent: true,
      alerts: true,
      briefing: true,
      followUps: true,
      aiSuggestedAlerts: true,
      liveAlertsTimeline: true,
      calendly: true,
      prioritySupport: true,
      perSeatConfirmationQueues: false,
    },
    limits: {
      alertRules: null,
      aiActionsPerMonth: 500,
      sendsPerMonth: 500,
    },
    featureBullets: [
      "Everything in Pro",
      "All channels + Outlook",
      "Calendly book/cancel",
      "Unlimited alert rules",
      "500 AI actions / month",
      "500 confirmed sends / month",
      "Priority support",
    ],
  },
  team: {
    id: "team",
    name: "Team / Agency",
    priceMonthly: 699,
    priceLabel: "$699",
    description: "5–10 seats, uncapped sends, per-seat confirmation queues",
    seats: { min: 5, max: 10, default: 5 },
    channels: [...ALL_CHANNELS],
    surfaces: {
      inbox: true,
      aiAgent: true,
      alerts: true,
      briefing: true,
      followUps: true,
      aiSuggestedAlerts: true,
      liveAlertsTimeline: true,
      calendly: true,
      prioritySupport: true,
      perSeatConfirmationQueues: true,
    },
    limits: {
      alertRules: null,
      aiActionsPerMonth: 1000, // per seat
      sendsPerMonth: null,
    },
    featureBullets: [
      "Everything in Business",
      "5–10 seats",
      "1,000 AI actions / mo per seat",
      "Unlimited confirmed sends per seat",
      "Per-seat confirmation queues",
    ],
  },
};

export function isPlanId(value: unknown): value is PlanId {
  return typeof value === "string" && PLAN_ORDER.includes(value as PlanId);
}

export function getPlan(planId: unknown): PlanDefinition {
  if (isPlanId(planId)) return PLANS[planId];
  return PLANS.starter;
}

export function planRank(planId: PlanId): number {
  return PLAN_ORDER.indexOf(planId);
}

export function clampSeats(planId: PlanId, seats: number | null | undefined): number {
  const plan = getPlan(planId);
  const raw = typeof seats === "number" && Number.isFinite(seats) ? Math.floor(seats) : plan.seats.default;
  return Math.min(plan.seats.max, Math.max(plan.seats.min, raw));
}

export function canUseChannel(planId: unknown, channel: ChannelId): boolean {
  return getPlan(planId).channels.includes(channel);
}

export function canUseSurface(
  planId: unknown,
  surface: keyof PlanDefinition["surfaces"]
): boolean {
  return !!getPlan(planId).surfaces[surface];
}

export type MonthlyLimits = {
  alertRules: number | null;
  aiActions: number | null;
  sends: number | null;
};

export function getMonthlyLimits(planId: unknown, seats?: number | null): MonthlyLimits {
  const plan = getPlan(planId);
  const seatCount = clampSeats(plan.id, seats);
  const aiBase = plan.limits.aiActionsPerMonth;
  const sendBase = plan.limits.sendsPerMonth;

  return {
    alertRules: plan.limits.alertRules,
    aiActions: aiBase === null ? null : plan.id === "team" ? aiBase * seatCount : aiBase,
    sends: sendBase === null ? null : sendBase,
  };
}

export function nextUpgradePlan(planId: unknown): PlanId | null {
  const plan = getPlan(planId);
  const idx = planRank(plan.id);
  if (idx < 0 || idx >= PLAN_ORDER.length - 1) return null;
  return PLAN_ORDER[idx + 1];
}

export function channelLabel(channel: ChannelId): string {
  const labels: Record<ChannelId, string> = {
    gmail: "Gmail",
    whatsapp: "WhatsApp",
    slack: "Slack",
    discord: "Discord",
    outlook: "Outlook",
    linkedin: "LinkedIn",
    calendly: "Calendly",
  };
  return labels[channel];
}
