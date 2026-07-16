import { NextRequest, NextResponse } from "next/server";
import { isAdminResponse, requireAdmin } from "@/lib/admin-auth";
import { hasInsforgeAdminKey, insforgeAdmin } from "@/lib/insforge-admin";
import { clampSeats, isPlanId } from "@/lib/plans";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const admin = requireAdmin(req);
  if (isAdminResponse(admin)) return admin;

  if (!hasInsforgeAdminKey) {
    return NextResponse.json({ error: "INSFORGE_API_KEY is required" }, { status: 503 });
  }

  try {
    const { id } = await ctx.params;
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const body = await req.json();
    const patch: Record<string, unknown> = {};

    if (typeof body.is_active === "boolean") patch.is_active = body.is_active;
    if (typeof body.note === "string") patch.note = body.note.trim();
    if (typeof body.max_redemptions === "number") {
      patch.max_redemptions = Math.max(1, Math.floor(body.max_redemptions));
    }
    if (body.expires_at === null) patch.expires_at = null;
    else if (typeof body.expires_at === "string") patch.expires_at = body.expires_at;

    if (isPlanId(body.plan)) {
      patch.plan = body.plan;
      if (typeof body.seats === "number") {
        patch.seats = clampSeats(body.plan, body.seats);
      }
    } else if (typeof body.seats === "number" && isPlanId(body.currentPlan)) {
      patch.seats = clampSeats(body.currentPlan, body.seats);
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const { data, error } = await insforgeAdmin.database
      .from("plan_codes")
      .update(patch)
      .eq("id", id)
      .select("*")
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ code: data });
  } catch (err: unknown) {
    console.error("[admin/plan-codes PATCH]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal Server Error" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const admin = requireAdmin(req);
  if (isAdminResponse(admin)) return admin;

  if (!hasInsforgeAdminKey) {
    return NextResponse.json({ error: "INSFORGE_API_KEY is required" }, { status: 503 });
  }

  try {
    const { id } = await ctx.params;
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const { error } = await insforgeAdmin.database.from("plan_codes").delete().eq("id", id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    console.error("[admin/plan-codes DELETE]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal Server Error" },
      { status: 500 }
    );
  }
}
