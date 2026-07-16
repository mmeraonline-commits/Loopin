import { NextRequest, NextResponse } from "next/server";
import { isAdminResponse, requireAdmin } from "@/lib/admin-auth";
import { hasInsforgeAdminKey, insforgeAdmin } from "@/lib/insforge-admin";

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

export async function GET(req: NextRequest) {
  const admin = requireAdmin(req);
  if (isAdminResponse(admin)) return admin;

  if (!hasInsforgeAdminKey) {
    return NextResponse.json({ error: "INSFORGE_API_KEY is required" }, { status: 503 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const days = Math.min(Math.max(Number(searchParams.get("days") || 30), 1), 90);

    const { data, error } = await insforgeAdmin.database
      .from("feature_usage_events")
      .select("feature, action, created_at, user_id")
      .gte("created_at", daysAgoIso(days))
      .order("created_at", { ascending: false })
      .limit(10000);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const events = data || [];
    const byFeature: Record<string, number> = {};
    const byDay: Record<string, number> = {};
    const byFeatureDay: Record<string, Record<string, number>> = {};

    for (const e of events) {
      byFeature[e.feature] = (byFeature[e.feature] || 0) + 1;
      const day = String(e.created_at).slice(0, 10);
      byDay[day] = (byDay[day] || 0) + 1;
      if (!byFeatureDay[e.feature]) byFeatureDay[e.feature] = {};
      byFeatureDay[e.feature][day] = (byFeatureDay[e.feature][day] || 0) + 1;
    }

    const topFeatures = Object.entries(byFeature)
      .map(([feature, count]) => ({ feature, count }))
      .sort((a, b) => b.count - a.count);

    const daily = Object.entries(byDay)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return NextResponse.json({
      days,
      totalEvents: events.length,
      topFeatures,
      daily,
      byFeatureDay,
    });
  } catch (err: unknown) {
    console.error("[admin/usage]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal Server Error" },
      { status: 500 }
    );
  }
}
