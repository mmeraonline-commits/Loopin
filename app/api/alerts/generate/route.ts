import { NextRequest, NextResponse } from "next/server";
import { hasInsforgeAdminKey } from "@/lib/insforge-admin";
import { generateAutomaticAlertsForUser } from "@/lib/alert-auto-generation";
import { trackFeatureUsage } from "@/lib/track-feature-usage";
import { canUseSurface } from "@/lib/plans";
import { denySurface, loadUserPlan } from "@/lib/plan-usage";

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Internal Server Error";
}

export async function POST(req: NextRequest) {
  try {
    if (!hasInsforgeAdminKey) {
      return NextResponse.json(
        { error: "INSFORGE_API_KEY is required to generate alerts with RLS enabled." },
        { status: 503 }
      );
    }

    const body = await req.json();
    const userId = body?.userId as string | undefined;
    const fast = body?.fast !== false;

    if (!userId) {
      return NextResponse.json({ error: "User ID is required" }, { status: 400 });
    }

    const user = await loadUserPlan(userId);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Allow if either Alerts or AI suggested alerts is unlocked.
    if (!canUseSurface(user.plan, "alerts") && !canUseSurface(user.plan, "aiSuggestedAlerts")) {
      return denySurface(user.plan, "alerts", "Alerts")!;
    }

    const result = await generateAutomaticAlertsForUser(userId, { fast });
    void trackFeatureUsage({ userId, feature: "alerts", action: "generate" });
    return NextResponse.json({ success: true, ...result });
  } catch (err: unknown) {
    console.error("Error in POST /api/alerts/generate:", err);
    return NextResponse.json({ error: getErrorMessage(err) }, { status: 500 });
  }
}
