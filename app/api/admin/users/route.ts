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
    const q = (searchParams.get("q") || "").trim().toLowerCase();
    const limit = Math.min(Number(searchParams.get("limit") || 100), 500);

    const { data, error } = await insforgeAdmin.database
      .from("users")
      .select(
        "id, email, phone, name, avatar_url, auth_provider, integrations, is_disabled, plan, seats, last_login_at, created_at"
      )
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    let users = data || [];
    if (q) {
      users = users.filter((u: any) => {
        const hay = `${u.email || ""} ${u.name || ""} ${u.phone || ""}`.toLowerCase();
        return hay.includes(q);
      });
    }

    return NextResponse.json({ users });
  } catch (err: unknown) {
    console.error("[admin/users GET]", err);
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
    if (!id) {
      return NextResponse.json({ error: "User id is required" }, { status: 400 });
    }

    const patch: Record<string, unknown> = {};
    if (typeof body.name === "string") patch.name = body.name.trim();
    if (typeof body.email === "string") patch.email = body.email.trim().toLowerCase();
    if (typeof body.is_disabled === "boolean") patch.is_disabled = body.is_disabled;
    if (body.plan === "starter" || body.plan === "pro" || body.plan === "business" || body.plan === "team") {
      patch.plan = body.plan;
      const seatDefaults: Record<string, number> = { starter: 1, pro: 1, business: 1, team: 5 };
      const seatMins: Record<string, number> = { starter: 1, pro: 1, business: 1, team: 5 };
      const seatMaxes: Record<string, number> = { starter: 1, pro: 1, business: 1, team: 10 };
      const raw = typeof body.seats === "number" ? Math.floor(body.seats) : seatDefaults[body.plan];
      patch.seats = Math.min(seatMaxes[body.plan], Math.max(seatMins[body.plan], raw));
    } else if (typeof body.seats === "number") {
      patch.seats = Math.max(1, Math.min(10, Math.floor(body.seats)));
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const { data, error } = await insforgeAdmin.database
      .from("users")
      .update(patch)
      .eq("id", id)
      .select(
        "id, email, phone, name, avatar_url, auth_provider, integrations, is_disabled, plan, seats, last_login_at, created_at"
      )
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ user: data });
  } catch (err: unknown) {
    console.error("[admin/users PATCH]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal Server Error" },
      { status: 500 }
    );
  }
}
