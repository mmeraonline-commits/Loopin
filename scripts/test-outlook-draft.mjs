/**
 * Smoke-test Outlook reply draft creation (never sends).
 * Usage: node scripts/test-outlook-draft.mjs
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

const RUN_URL = (process.argv[2] || "http://localhost:3000").replace(/\/$/, "");

async function mcp(userId, method, params = {}) {
  const res = await fetch(`${RUN_URL}/api/outlook-mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ method, params, userId }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) {
    throw new Error(json.error?.message || json.error || `MCP ${method} failed (${res.status})`);
  }
  const text = json.result?.content?.[0]?.text;
  return text ? JSON.parse(text) : json.result;
}

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
    .select("id, integrations")
    .order("updated_at", { ascending: false })
    .limit(30);

  if (error) {
    console.error("DB_ERR", error.message || error);
    process.exit(1);
  }

  const user = (data || []).find(
    (u) =>
      u.integrations?.outlook?.connected &&
      !u.integrations?.outlook?.isSimulated
  );
  if (!user) {
    console.error("No live Outlook user");
    process.exit(2);
  }

  console.log("Listing inbox...");
  const list = await mcp(user.id, "outlook_list_messages", {
    folder: "inbox",
    maxResults: 3,
  });
  const msg = (list.messages || [])[0];
  if (!msg?.id) {
    console.error("No inbox messages to draft against");
    process.exit(3);
  }

  console.log("Creating reply draft (never sends)...");
  const draft = await mcp(user.id, "outlook_create_reply_draft", {
    messageId: msg.id,
    body:
      "Thanks for your note — looping back shortly.\n\n— Drafted by Loopin (test; not sent)",
  });

  console.log(
    JSON.stringify(
      {
        sourceSubject: msg.subject || null,
        draftId: draft?.draft?.id || null,
        draftSubject: draft?.draft?.subject || null,
        success: !!draft?.success,
      },
      null,
      2
    )
  );
  console.log("OK — open Outlook Drafts to confirm the reply draft is there.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
