/**
 * Run Outlook auto-triage for the first live Outlook-connected user.
 * Prints only counts (no emails / tokens).
 *
 * Usage:
 *   node scripts/test-outlook-triage.mjs
 *   node scripts/test-outlook-triage.mjs --backdate 2
 *   node scripts/test-outlook-triage.mjs http://localhost:3000 --backdate 2
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { createAdminClient } from "@insforge/sdk";

function loadEnvLocal() {
  const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i <= 0) continue;
    let v = t.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    const key = t.slice(0, i).trim();
    if (!process.env[key]) process.env[key] = v;
  }
}

loadEnvLocal();

const args = process.argv.slice(2);
const backdateIdx = args.indexOf("--backdate");
const backdateDays =
  backdateIdx >= 0 ? Math.max(1, Number(args[backdateIdx + 1] || 2) || 2) : 0;
const RUN_URL = (args.find((a) => a.startsWith("http")) || "http://localhost:3000").replace(
  /\/$/,
  ""
);

async function main() {
  const apiKey = process.env.INSFORGE_API_KEY || process.env.INSFORGE_ADMIN_KEY;
  if (!apiKey) {
    console.error("Missing INSFORGE_API_KEY");
    process.exit(1);
  }

  const admin = createAdminClient({
    baseUrl:
      process.env.NEXT_PUBLIC_INSFORGE_URL ||
      "https://3ewxfrr2.us-east.insforge.app",
    apiKey,
  });

  const { data, error } = await admin.database
    .from("users")
    .select("id, plan, integrations, assistant_settings")
    .order("updated_at", { ascending: false })
    .limit(30);

  if (error) {
    console.error("DB_ERR", error.message || error);
    process.exit(1);
  }

  const targets = (data || []).filter(
    (u) =>
      u.integrations?.outlook?.connected &&
      !u.integrations?.outlook?.isSimulated
  );

  console.log("outlook_users=", targets.length);
  if (!targets.length) {
    console.error("No live Outlook-connected users found");
    process.exit(2);
  }

  const user = targets[0];
  console.log("target_plan=", user.plan || "unknown");

  if (backdateDays > 0) {
    const since = new Date(Date.now() - backdateDays * 24 * 60 * 60 * 1000).toISOString();
    const settings = {
      ...(user.assistant_settings || {}),
      outlookInboxSyncStartedAt: since,
    };
    const { error: updErr } = await admin.database
      .from("users")
      .update({
        assistant_settings: settings,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);
    if (updErr) {
      console.error("WATERMARK_ERR", updErr.message || updErr);
      process.exit(1);
    }
    console.log("watermark_set_days_ago=", backdateDays);
  }

  console.log(`POST ${RUN_URL}/api/outlook-triage/run ...`);

  const res = await fetch(`${RUN_URL}/api/outlook-triage/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId: user.id }),
  });

  const body = await res.json().catch(() => ({}));
  console.log("STATUS=", res.status);
  console.log(
    JSON.stringify(
      {
        success: body.success,
        scanned: body.scanned,
        labeled: body.labeled,
        drafted: body.drafted,
        skipped: body.skipped,
        categories: body.categories,
        errors: body.errors,
      },
      null,
      2
    )
  );

  if (!res.ok) process.exit(1);
  if ((body.drafted || 0) > 0) {
    console.log("OK — drafts created. Check Outlook Drafts folder.");
  } else if ((body.scanned || 0) === 0) {
    console.log(
      "OK — no unprocessed inbox mail in the lookback window. New mail after the watermark will be drafted."
    );
  } else {
    console.log(
      "OK — messages labeled; drafted=0 means none were Urgent/Needs Reply (or drafts already existed)."
    );
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
