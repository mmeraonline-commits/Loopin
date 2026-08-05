import { NextRequest, NextResponse } from "next/server";
import { hasInsforgeAdminKey, insforgeAdmin } from "@/lib/insforge-admin";

function sanitizeContact(body: Record<string, unknown>) {
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 120) : "";
  const email =
    typeof body.email === "string" && body.email.trim()
      ? body.email.trim().toLowerCase().slice(0, 200)
      : null;
  const identifiers = Array.isArray(body.identifiers)
    ? body.identifiers
        .filter((v): v is string => typeof v === "string")
        .map((v) => v.trim().slice(0, 120))
        .filter(Boolean)
        .slice(0, 20)
    : [];
  const notes =
    typeof body.notes === "string" ? body.notes.trim().slice(0, 500) : "";
  return { name, email, identifiers, notes };
}

export async function GET(req: NextRequest) {
  try {
    const userId = req.nextUrl.searchParams.get("userId");
    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }
    if (!hasInsforgeAdminKey) {
      return NextResponse.json({ error: "Server key missing" }, { status: 503 });
    }

    const { data, error } = await insforgeAdmin.database
      .from("vip_contacts")
      .select("*")
      .eq("user_id", userId)
      .order("name", { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ contacts: data || [] });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal Server Error" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const userId = body.userId as string | undefined;
    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }
    if (!hasInsforgeAdminKey) {
      return NextResponse.json({ error: "Server key missing" }, { status: 503 });
    }

    const contact = sanitizeContact(body);
    if (!contact.name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const { data, error } = await insforgeAdmin.database
      .from("vip_contacts")
      .insert([
        {
          user_id: userId,
          ...contact,
          updated_at: new Date().toISOString(),
        },
      ])
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ contact: data });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal Server Error" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const userId = body.userId as string | undefined;
    const id = body.id as string | undefined;
    if (!userId || !id) {
      return NextResponse.json({ error: "userId and id are required" }, { status: 400 });
    }
    if (!hasInsforgeAdminKey) {
      return NextResponse.json({ error: "Server key missing" }, { status: 503 });
    }

    const contact = sanitizeContact(body);
    if (!contact.name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const { data, error } = await insforgeAdmin.database
      .from("vip_contacts")
      .update({ ...contact, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", userId)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    return NextResponse.json({ contact: data });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal Server Error" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");
    const id = searchParams.get("id");
    if (!userId || !id) {
      return NextResponse.json({ error: "userId and id are required" }, { status: 400 });
    }
    if (!hasInsforgeAdminKey) {
      return NextResponse.json({ error: "Server key missing" }, { status: 503 });
    }

    const { error } = await insforgeAdmin.database
      .from("vip_contacts")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal Server Error" },
      { status: 500 }
    );
  }
}
