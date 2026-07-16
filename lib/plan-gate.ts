import { NextResponse } from "next/server";
import {
  assertSendQuota,
  denyChannel,
  isNextResponse,
  loadUserPlan,
} from "@/lib/plan-usage";
import type { ChannelId } from "@/lib/plans";

/** Gate a connect/send route by plan channel + optional send quota. */
export async function requireChannelAccess(userId: string, channel: ChannelId) {
  const user = await loadUserPlan(userId);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  const denied = denyChannel(user.plan, channel);
  if (denied) return denied;
  return { user } as const;
}

export async function requireSendAccess(userId: string) {
  const result = await assertSendQuota(userId);
  if (isNextResponse(result)) return result;
  return result;
}

export { isNextResponse };
