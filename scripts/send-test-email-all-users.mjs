/**
 * One-off: send a Resend test email to every user with an account email.
 * Loads .env.local — does not print secret values.
 *
 * Usage: node scripts/send-test-email-all-users.mjs
 */
import { createAdminClient } from "@insforge/sdk";
import { Resend } from "resend";
import { readFileSync } from "fs";
import { resolve } from "path";

function loadEnvLocal() {
  try {
    const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {
    /* rely on existing env */
  }
}

loadEnvLocal();

const apiKey = process.env.RESEND_API_KEY;
const fromRaw =
  process.env.RESEND_FROM ||
  process.env.RESEND_FROM_EMAIL ||
  process.env.EMAIL_FROM;
const insforgeUrl =
  process.env.NEXT_PUBLIC_INSFORGE_URL || "https://3ewxfrr2.us-east.insforge.app";
const insforgeKey =
  process.env.INSFORGE_API_KEY || process.env.INSFORGE_ADMIN_KEY || "";

function fromAddress() {
  if (!fromRaw) return null;
  if (fromRaw.includes("<") && fromRaw.includes(">")) return fromRaw;
  if (fromRaw.includes("@")) return `Loopin <${fromRaw.trim()}>`;
  return fromRaw;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function main() {
  if (!apiKey) {
    console.error("Missing RESEND_API_KEY");
    process.exit(1);
  }
  const from = fromAddress();
  if (!from) {
    console.error("Missing RESEND_FROM / RESEND_FROM_EMAIL");
    process.exit(1);
  }
  if (!insforgeKey) {
    console.error("Missing INSFORGE_API_KEY / INSFORGE_ADMIN_KEY");
    process.exit(1);
  }

  console.log(`From: ${from}`);
  console.log(`InsForge: ${insforgeUrl}`);

  const db = createAdminClient({ baseUrl: insforgeUrl, apiKey: insforgeKey });
  const { data: users, error } = await db.database
    .from("users")
    .select("id, email, name")
    .limit(50);

  if (error) {
    console.error("Failed to list users:", error.message || error);
    process.exit(1);
  }

  const list = (users || []).filter(
    (u) => typeof u.email === "string" && u.email.includes("@")
  );
  console.log(`Found ${list.length} user(s) with email (of ${(users || []).length} total).`);

  if (!list.length) {
    process.exit(1);
  }

  const resend = new Resend(apiKey);
  let ok = 0;
  let fail = 0;

  for (const user of list) {
    const to = String(user.email).trim();
    const name = user.name || to.split("@")[0];
    const { data, error: sendError } = await resend.emails.send({
      from,
      to: [to],
      subject: "Loopin test email",
      html: `<div style="font-family:system-ui,sans-serif;line-height:1.5">
  <h2 style="margin:0 0 8px">Hi ${escapeHtml(name)},</h2>
  <p style="margin:0 0 12px;color:#334155">This is a test from Loopin — email delivery via Resend is working.</p>
  <p style="margin:0;color:#64748b;font-size:13px">You can ignore this message.</p>
</div>`,
      text: `Hi ${name},\n\nThis is a test from Loopin — email delivery via Resend is working.\n`,
    });

    if (sendError) {
      fail += 1;
      console.error(`FAIL ${to}: ${sendError.message || JSON.stringify(sendError)}`);
    } else {
      ok += 1;
      console.log(`OK ${to} id=${data?.id || "?"}`);
    }
  }

  console.log(`Done. sent=${ok} failed=${fail}`);
  process.exit(fail ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
