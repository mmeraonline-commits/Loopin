import { NextRequest, NextResponse } from "next/server";
import { isAdminResponse, requireAdmin } from "@/lib/admin-auth";
import { hasInsforgeAdminKey, insforgeAdmin } from "@/lib/insforge-admin";
import { clampSeats, isPlanId, type PlanId } from "@/lib/plans";

function normalizeCode(raw: unknown): string {
  return String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

function generateCode(plan: PlanId): string {
  const prefix = plan === "team" ? "TEAM" : plan.toUpperCase();
  const chunk = () => Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${prefix}-${chunk()}-${chunk()}`;
}

export async function GET(req: NextRequest) {
  const admin = requireAdmin(req);
  if (isAdminResponse(admin)) return admin;

  if (!hasInsforgeAdminKey) {
    return NextResponse.json({ error: "INSFORGE_API_KEY is required" }, { status: 503 });
  }

  try {
    const { data, error } = await insforgeAdmin.database
      .from("plan_codes")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ codes: data || [] });
  } catch (err: unknown) {
    console.error("[admin/plan-codes GET]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal Server Error" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const admin = requireAdmin(req);
  if (isAdminResponse(admin)) return admin;

  if (!hasInsforgeAdminKey) {
    return NextResponse.json({ error: "INSFORGE_API_KEY is required" }, { status: 503 });
  }

  try {
    const body = await req.json();
    const planRaw = body.plan as string;
    if (!isPlanId(planRaw)) {
      return NextResponse.json({ error: "Valid plan is required" }, { status: 400 });
    }
    const plan = planRaw as PlanId;
    const seats = clampSeats(plan, body.seats);
    const maxRedemptions = Math.max(1, Math.floor(Number(body.max_redemptions) || 1));
    const note = typeof body.note === "string" ? body.note.trim() : null;
    const expiresAt =
      typeof body.expires_at === "string" && body.expires_at.trim()
        ? body.expires_at
        : null;
    let code = normalizeCode(body.code);
    if (!code) code = generateCode(plan);

    const { data, error } = await insforgeAdmin.database
      .from("plan_codes")
      .insert([
        {
          code,
          plan,
          seats,
          max_redemptions: maxRedemptions,
          redemption_count: 0,
          expires_at: expiresAt,
          is_active: true,
          note,
        },
      ])
      .select("*")
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ code: data });
  } catch (err: unknown) {
    console.error("[admin/plan-codes POST]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal Server Error" },
      { status: 500 }
    );
  }
}
