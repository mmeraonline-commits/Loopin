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
    const [
      usersRes,
      disabledRes,
      rulesRes,
      alertsRes,
      briefingsRes,
      waitlistRes,
      usageRes,
    ] = await Promise.all([
      insforgeAdmin.database.from("users").select("id, integrations, is_disabled, created_at"),
      insforgeAdmin.database.from("users").select("id").eq("is_disabled", true),
      insforgeAdmin.database.from("alert_rules").select("id, status"),
      insforgeAdmin.database.from("alerts").select("id, status"),
      insforgeAdmin.database.from("generated_briefings").select("id"),
      insforgeAdmin.database.from("waitlist_signups").select("id"),
      insforgeAdmin.database
        .from("feature_usage_events")
        .select("feature, created_at")
        .gte("created_at", daysAgoIso(30))
        .limit(5000),
    ]);

    const users = usersRes.data || [];
    const integrationKeys = [
      "gmail",
      "whatsapp",
      "slack",
      "outlook",
      "discord",
      "linkedin",
      "calendly",
    ] as const;

    const connectionRates: Record<string, { connected: number; total: number; rate: number }> = {};
    for (const key of integrationKeys) {
      const connected = users.filter((u: any) => u.integrations?.[key]?.connected).length;
      connectionRates[key] = {
        connected,
        total: users.length,
        rate: users.length ? Math.round((connected / users.length) * 100) : 0,
      };
    }

    const rules = rulesRes.data || [];
    const alerts = alertsRes.data || [];
    const openAlerts = alerts.filter(
      (a: any) => a.status === "open" || a.status === "new" || a.status === "active" || !a.status
    );
    const activeRules = rules.filter(
      (r: any) => r.status === "active" || r.status === "enabled" || !r.status
    );

    const usageEvents = usageRes.data || [];
    const since7 = daysAgoIso(7);
    const countByFeature = (events: any[]) => {
      const map: Record<string, number> = {};
      for (const e of events) {
        map[e.feature] = (map[e.feature] || 0) + 1;
      }
      return Object.entries(map)
        .map(([feature, count]) => ({ feature, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);
    };

    return NextResponse.json({
      users: {
        total: users.length,
        disabled: (disabledRes.data || []).length,
      },
      alerts: {
        rules: rules.length,
        activeRules: activeRules.length,
        total: alerts.length,
        open: openAlerts.length,
      },
      briefings: (briefingsRes.data || []).length,
      waitlist: (waitlistRes.data || []).length,
      connectionRates,
      topFeatures: {
        last7d: countByFeature(usageEvents.filter((e: any) => e.created_at >= since7)),
        last30d: countByFeature(usageEvents),
      },
    });
  } catch (err: unknown) {
    console.error("[admin/overview]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal Server Error" },
      { status: 500 }
    );
  }
}
