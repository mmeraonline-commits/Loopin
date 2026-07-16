import { NextRequest, NextResponse } from "next/server";
import { getPlanUsage } from "@/lib/plan-usage";

export async function GET(req: NextRequest) {
  try {
    const userId = req.nextUrl.searchParams.get("userId");
    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    const usage = await getPlanUsage(userId);
    if (!usage) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({
      planId: usage.planId,
      planName: usage.plan.name,
      priceLabel: usage.plan.priceLabel,
      seats: usage.seats,
      channels: usage.plan.channels,
      surfaces: usage.plan.surfaces,
      limits: usage.limits,
      used: usage.used,
      remaining: usage.remaining,
      periodStart: usage.periodStart,
      featureBullets: usage.plan.featureBullets,
    });
  } catch (err: unknown) {
    console.error("[usage GET]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal Server Error" },
      { status: 500 }
    );
  }
}
