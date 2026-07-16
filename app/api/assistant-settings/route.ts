import { NextRequest, NextResponse } from "next/server";
import { hasInsforgeAdminKey, insforgeAdmin } from "@/lib/insforge-admin";

/** Persist assistant settings (tone, auto-draft) used by server-side auto-draft jobs. */
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
      .from("users")
      .select("assistant_settings")
      .eq("id", userId)
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({
      settings: data?.assistant_settings || {
        responseTone: "friendly",
        autoDraftReplies: true,
      },
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal Server Error" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const { userId, settings } = await req.json();
    if (!userId || !settings || typeof settings !== "object") {
      return NextResponse.json({ error: "userId and settings are required" }, { status: 400 });
    }
    if (!hasInsforgeAdminKey) {
      return NextResponse.json({ error: "Server key missing" }, { status: 503 });
    }

    const patch = {
      responseTone: settings.responseTone || "friendly",
      autoDraftReplies:
        typeof settings.autoDraftReplies === "boolean" ? settings.autoDraftReplies : true,
    };

    const { data, error } = await insforgeAdmin.database
      .from("users")
      .update({ assistant_settings: patch })
      .eq("id", userId)
      .select("assistant_settings")
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ settings: data?.assistant_settings || patch });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal Server Error" },
      { status: 500 }
    );
  }
}
