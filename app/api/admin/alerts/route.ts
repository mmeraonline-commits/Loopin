import { NextRequest, NextResponse } from "next/server";
import { isAdminResponse, requireAdmin } from "@/lib/admin-auth";
import { hasInsforgeAdminKey, insforgeAdmin } from "@/lib/insforge-admin";

export async function GET(req: NextRequest) {
  const admin = requireAdmin(req);
  if (isAdminResponse(admin)) return admin;

  if (!hasInsforgeAdminKey) {
    return NextResponse.json({ error: "INSFORGE_API_KEY is required" }, { status: 503 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type") || "alerts";
    const status = searchParams.get("status");
    const limit = Math.min(Number(searchParams.get("limit") || 100), 500);

    if (type === "rules") {
      let query = insforgeAdmin.database
        .from("alert_rules")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (status) query = query.eq("status", status);

      const { data, error } = await query;
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ rules: data || [] });
    }

    let query = insforgeAdmin.database
      .from("alerts")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (status) query = query.eq("status", status);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ alerts: data || [] });
  } catch (err: unknown) {
    console.error("[admin/alerts GET]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal Server Error" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  const admin = requireAdmin(req);
  if (isAdminResponse(admin)) return admin;

  if (!hasInsforgeAdminKey) {
    return NextResponse.json({ error: "INSFORGE_API_KEY is required" }, { status: 503 });
  }

  try {
    const body = await req.json();
    const id = body.id as string | undefined;
    const target = (body.target as string) || "alerts";
    const status = body.status as string | undefined;

    if (!id || !status) {
      return NextResponse.json({ error: "id and status are required" }, { status: 400 });
    }

    const table = target === "rules" ? "alert_rules" : "alerts";
    const { data, error } = await insforgeAdmin.database
      .from(table)
      .update({ status })
      .eq("id", id)
      .select("*")
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ item: data });
  } catch (err: unknown) {
    console.error("[admin/alerts PATCH]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal Server Error" },
      { status: 500 }
    );
  }
}
