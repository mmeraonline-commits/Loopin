import { NextRequest, NextResponse } from "next/server";
import { hasInsforgeAdminKey, insforgeAdmin } from "@/lib/insforge-admin";
import {
  clampSeats,
  getPlan,
  isPlanId,
  planRank,
  type PlanId,
} from "@/lib/plans";
import { trackFeatureUsage } from "@/lib/track-feature-usage";

function normalizeCode(raw: unknown): string {
  return String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

export async function POST(req: NextRequest) {
  try {
    if (!hasInsforgeAdminKey) {
      return NextResponse.json({ error: "Server database key is not configured" }, { status: 500 });
    }

    const body = await req.json();
    const userId = body.userId as string | undefined;
    const code = normalizeCode(body.code);

    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }
    if (!code) {
      return NextResponse.json({ error: "Redeem code is required" }, { status: 400 });
    }

    const { data: user, error: userError } = await insforgeAdmin.database
      .from("users")
      .select("id, plan, seats")
      .eq("id", userId)
      .maybeSingle();

    if (userError || !user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const { data: planCode, error: codeError } = await insforgeAdmin.database
      .from("plan_codes")
      .select("*")
      .eq("code", code)
      .maybeSingle();

    if (codeError) {
      return NextResponse.json({ error: codeError.message }, { status: 500 });
    }
    if (!planCode) {
      return NextResponse.json({ error: "Invalid redeem code" }, { status: 400 });
    }
    if (!planCode.is_active) {
      return NextResponse.json({ error: "This redeem code is inactive" }, { status: 400 });
    }
    if (planCode.expires_at && new Date(planCode.expires_at).getTime() < Date.now()) {
      return NextResponse.json({ error: "This redeem code has expired" }, { status: 400 });
    }
    if (planCode.redemption_count >= planCode.max_redemptions) {
      return NextResponse.json({ error: "This redeem code has no redemptions left" }, { status: 400 });
    }
    if (!isPlanId(planCode.plan)) {
      return NextResponse.json({ error: "Redeem code has an invalid plan" }, { status: 400 });
    }

    const targetPlan = planCode.plan as PlanId;
    const currentPlan = getPlan(user.plan).id;
    const targetSeats = clampSeats(targetPlan, planCode.seats);
    const currentSeats = clampSeats(currentPlan, user.seats);

    const isUpgrade = planRank(targetPlan) > planRank(currentPlan);
    const isSeatBump = targetPlan === currentPlan && targetSeats > currentSeats;
    if (!isUpgrade && !isSeatBump && !(targetPlan === currentPlan && targetSeats === currentSeats)) {
      if (planRank(targetPlan) < planRank(currentPlan)) {
        return NextResponse.json(
          {
            error: `This code is for ${getPlan(targetPlan).name}, which is below your current ${getPlan(currentPlan).name} plan.`,
          },
          { status: 400 }
        );
      }
    }

    const { data: existingRedeem } = await insforgeAdmin.database
      .from("plan_redemptions")
      .select("id")
      .eq("code_id", planCode.id)
      .eq("user_id", userId)
      .maybeSingle();

    if (existingRedeem) {
      return NextResponse.json({ error: "You already redeemed this code" }, { status: 400 });
    }

    const { error: redeemInsertError } = await insforgeAdmin.database
      .from("plan_redemptions")
      .insert([
        {
          code_id: planCode.id,
          user_id: userId,
          plan: targetPlan,
          seats: targetSeats,
        },
      ]);

    if (redeemInsertError) {
      return NextResponse.json({ error: redeemInsertError.message }, { status: 500 });
    }

    const { error: codeUpdateError } = await insforgeAdmin.database
      .from("plan_codes")
      .update({ redemption_count: (planCode.redemption_count || 0) + 1 })
      .eq("id", planCode.id);

    if (codeUpdateError) {
      return NextResponse.json({ error: codeUpdateError.message }, { status: 500 });
    }

    const { data: updatedUser, error: userUpdateError } = await insforgeAdmin.database
      .from("users")
      .update({ plan: targetPlan, seats: targetSeats })
      .eq("id", userId)
      .select("id, plan, seats")
      .maybeSingle();

    if (userUpdateError || !updatedUser) {
      return NextResponse.json(
        { error: userUpdateError?.message || "Failed to update plan" },
        { status: 500 }
      );
    }

    void trackFeatureUsage({
      userId,
      feature: "plan",
      action: "redeem",
      metadata: { code: planCode.code, plan: targetPlan, seats: targetSeats },
    });

    return NextResponse.json({
      ok: true,
      plan: updatedUser.plan,
      seats: updatedUser.seats,
      planName: getPlan(updatedUser.plan).name,
      message: `Upgraded to ${getPlan(updatedUser.plan).name}`,
    });
  } catch (err: unknown) {
    console.error("[plans/redeem]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal Server Error" },
      { status: 500 }
    );
  }
}
