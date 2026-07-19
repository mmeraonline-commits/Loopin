import { NextRequest, NextResponse } from "next/server";
import { hasInsforgeAdminKey, insforgeAdmin } from "@/lib/insforge-admin";
import { runGmailAutoTriage } from "@/lib/gmail-auto-triage";
import { trackFeatureUsage } from "@/lib/track-feature-usage";

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Internal Server Error";
}

type GmailIntegration = { connected?: boolean; isSimulated?: boolean } | null | undefined;

type UserIntegrationsRow = {
  id: string;
  integrations?: { gmail?: GmailIntegration } | null;
};

function hasLiveGmail(user: UserIntegrationsRow): boolean {
  const gmail = user.integrations?.gmail;
  if (!gmail || typeof gmail !== "object") return false;
  if (gmail.connected !== true) return false;
  if (gmail.isSimulated === true) return false;
  return true;
}

function isAuthorizedCron(req: NextRequest): boolean {
  const expected =
    process.env.TRIGGER_SECRET_KEY ||
    process.env.CRON_SECRET ||
    process.env.GMAIL_TRIAGE_CRON_SECRET ||
    "";
  if (!expected) return false;
  const auth = req.headers.get("authorization") || "";
  return auth === `Bearer ${expected}`;
}

/**
 * Manual / cron runner for Gmail auto-triage.
 * - `{ userId }` — triage one user (dashboard / curl)
 * - `{ all: true }` + `Authorization: Bearer <TRIGGER_SECRET_KEY>` — triage every
 *   live Gmail user (Trigger.dev cron). Runs on Cloudflare so Trigger only needs APP_URL.
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
    const runAll = body?.all === true;
    const userId = body?.userId as string | undefined;

    if (runAll) {
      if (!isAuthorizedCron(req)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }

      const db = insforgeAdmin.database;
      const { data: users, error } = await db.from("users").select("id, integrations");
      if (error) {
        return NextResponse.json(
          { error: error.message || String(error) },
          { status: 500 }
        );
      }

      const rows = (users || []) as UserIntegrationsRow[];
      let targets = rows.filter(hasLiveGmail);
      if (targets.length === 0) {
        targets = rows;
      }

      const results: Array<Record<string, unknown>> = [];
      for (const user of targets) {
        try {
          const result = await runGmailAutoTriage(user.id);
          void trackFeatureUsage({ userId: user.id, feature: "gmail_triage", action: "run" });
          results.push({
            userId: user.id,
            ok: true,
            scanned: result.scanned ?? 0,
            labeled: result.labeled ?? 0,
            drafted: result.drafted ?? 0,
            errors: result.errors ?? [],
          });
        } catch (err) {
          results.push({
            userId: user.id,
            ok: false,
            error: getErrorMessage(err),
          });
        }
      }

      return NextResponse.json({
        success: true,
        usersScanned: rows.length,
        targets: targets.length,
        results,
      });
    }

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
