import { NextRequest, NextResponse } from "next/server";
import { isAdminResponse, requireAdmin } from "@/lib/admin-auth";
import { hasInsforgeAdminKey, insforgeAdmin } from "@/lib/insforge-admin";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const admin = requireAdmin(req);
  if (isAdminResponse(admin)) return admin;

  if (!hasInsforgeAdminKey) {
    return NextResponse.json({ error: "INSFORGE_API_KEY is required" }, { status: 503 });
  }

  try {
    const { id } = await ctx.params;

    const [userRes, alertsRes, rulesRes, briefingsRes, usageRes] = await Promise.all([
      insforgeAdmin.database
        .from("users")
        .select(
          "id, email, phone, name, avatar_url, auth_provider, integrations, dashboard_brief, is_disabled, plan, seats, last_login_at, created_at, updated_at"
        )
        .eq("id", id)
        .maybeSingle(),
      insforgeAdmin.database
        .from("alerts")
        .select("*")
        .eq("user_id", id)
        .order("created_at", { ascending: false })
        .limit(20),
      insforgeAdmin.database
        .from("alert_rules")
        .select("*")
        .eq("user_id", id)
        .order("created_at", { ascending: false })
        .limit(20),
      insforgeAdmin.database
        .from("generated_briefings")
        .select("id, title, summary, created_at, schedule_id")
        .eq("user_id", id)
        .order("created_at", { ascending: false })
        .limit(10),
      insforgeAdmin.database
        .from("feature_usage_events")
        .select("id, feature, action, metadata, created_at")
        .eq("user_id", id)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

    if (userRes.error) {
      return NextResponse.json({ error: userRes.error.message }, { status: 500 });
    }
    if (!userRes.data) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({
      user: userRes.data,
      alerts: alertsRes.data || [],
      alertRules: rulesRes.data || [],
      briefings: briefingsRes.data || [],
      usage: usageRes.data || [],
    });
  } catch (err: unknown) {
    console.error("[admin/users/[id]]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal Server Error" },
      { status: 500 }
    );
  }
}
