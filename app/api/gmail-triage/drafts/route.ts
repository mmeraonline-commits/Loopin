import { NextRequest, NextResponse } from "next/server";
import { hasInsforgeAdminKey, insforgeAdmin } from "@/lib/insforge-admin";

const APP_URL = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

/** Show drafts from roughly the last two calendar days (covers "today" across timezones). */
const RECENT_DRAFT_MS = 48 * 60 * 60 * 1000;

type GmailDraftRow = {
  id?: string;
  subject?: string;
  date?: string;
  to?: string;
  snippet?: string;
  body?: string;
  gmailUrl?: string;
  threadId?: string;
  messageId?: string;
};

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Internal Server Error";
}

function hasUsableSubject(subject?: string): boolean {
  const s = String(subject || "").trim();
  return Boolean(s) && !/^no subject$/i.test(s);
}

function isRecentDraft(date?: string): boolean {
  if (!date) return false;
  const ms = new Date(date).getTime();
  if (Number.isNaN(ms)) return false;
  return Date.now() - ms <= RECENT_DRAFT_MS;
}

/**
 * Lists native Gmail drafts for the dashboard "ready to review" section.
 * Only recent / Loopin-created drafts — not old unused drafts sitting in Gmail.
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
      .select("integrations, assistant_settings")
      .eq("id", userId)
      .maybeSingle();

    if (userError || !userRow) {
      return NextResponse.json({ error: userError?.message || "User not found" }, { status: 404 });
    }

    const gmail = userRow.integrations?.gmail;
    if (!gmail?.connected) {
      return NextResponse.json({ drafts: [], count: 0, connected: false });
    }

    const trackedIds = new Set(
      (
        ((userRow.assistant_settings || {}) as { loopinGmailDraftIds?: Array<{ id?: string; createdAt?: string }> })
          .loopinGmailDraftIds || []
      )
        .filter((d) => {
          if (!d?.id) return false;
          if (!d.createdAt) return true;
          const age = Date.now() - new Date(d.createdAt).getTime();
          return !Number.isNaN(age) && age <= 7 * 24 * 60 * 60 * 1000;
        })
        .map((d) => String(d.id))
    );

    const res = await fetch(`${APP_URL}/api/gmail-mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        method: "gmail_list_drafts",
        params: { maxResults: 20 },
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
    const allDrafts: GmailDraftRow[] = Array.isArray(parsed.drafts) ? parsed.drafts : [];

    const drafts = allDrafts.filter((d) => {
      if (d.id && trackedIds.has(String(d.id))) return true;
      return isRecentDraft(d.date) && hasUsableSubject(d.subject);
    });

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
