import { NextRequest, NextResponse } from "next/server";
import { hasInsforgeAdminKey } from "@/lib/insforge-admin";
import { runGmailAutoTriage } from "@/lib/gmail-auto-triage";
import { trackFeatureUsage } from "@/lib/track-feature-usage";

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Internal Server Error";
}

/**
 * Manual on-demand runner — mirrors /api/alerts/generate. The real schedule is
 * trigger/gmail-triage.ts (every 5 min); this lets you run the same job
 * immediately for one user (e.g. from curl/Postman) without needing
 * `trigger dev` running, for local testing and debugging.
 */
export async function POST(req: NextRequest) {
  try {
    if (!hasInsforgeAdminKey) {
      return NextResponse.json(
        { error: "INSFORGE_API_KEY is required to run Gmail auto-triage." },
        { status: 503 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const userId = body?.userId as string | undefined;

    if (!userId) {
      return NextResponse.json({ error: "User ID is required" }, { status: 400 });
    }

    const result = await runGmailAutoTriage(userId);
    void trackFeatureUsage({ userId, feature: "gmail_triage", action: "run" });
    return NextResponse.json({ success: true, ...result });
  } catch (err: unknown) {
    console.error("Error in POST /api/gmail-triage/run:", err);
    return NextResponse.json({ error: getErrorMessage(err) }, { status: 500 });
  }
}
