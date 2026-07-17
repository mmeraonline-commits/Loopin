import { NextRequest, NextResponse } from "next/server";
import { hasInsforgeAdminKey, insforgeAdmin } from "@/lib/insforge-admin";

const APP_URL = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Internal Server Error";
}

/**
 * Lists native Gmail drafts for the dashboard "ready to review" section.
 * These are drafts created in the user's real Gmail Drafts folder (drafts.create),
 * not the in-app Confirm Queue.
 */
export async function GET(req: NextRequest) {
  try {
    if (!hasInsforgeAdminKey) {
      return NextResponse.json({ error: "INSFORGE_API_KEY is required" }, { status: 503 });
    }

    const userId = req.nextUrl.searchParams.get("userId");
    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    const { data: userRow, error: userError } = await insforgeAdmin.database
      .from("users")
      .select("integrations")
      .eq("id", userId)
      .maybeSingle();

    if (userError || !userRow) {
      return NextResponse.json({ error: userError?.message || "User not found" }, { status: 404 });
    }

    const gmail = userRow.integrations?.gmail;
    if (!gmail?.connected) {
      return NextResponse.json({ drafts: [], count: 0, connected: false });
    }

    const res = await fetch(`${APP_URL}/api/gmail-mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        method: "gmail_list_drafts",
        params: { maxResults: 8 },
        userId,
      }),
    });
    const json = await res.json();
    if (json.error) {
      return NextResponse.json(
        { error: json.error.message || "Failed to list Gmail drafts", drafts: [], count: 0 },
        { status: 502 }
      );
    }

    const text = json.result?.content?.[0]?.text;
    const parsed = text ? JSON.parse(text) : { drafts: [] };
    const drafts = Array.isArray(parsed.drafts) ? parsed.drafts : [];

    return NextResponse.json({
      drafts,
      count: drafts.length,
      connected: true,
    });
  } catch (err: unknown) {
    console.error("[gmail-triage/drafts]", err);
    return NextResponse.json({ error: getErrorMessage(err) }, { status: 500 });
  }
}
