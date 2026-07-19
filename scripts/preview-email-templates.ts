/**
 * Send every Loopin email template sample to a preview inbox.
 * Usage: npx tsx scripts/preview-email-templates.ts [email]
 */
import { Resend } from "resend";
import { readFileSync } from "fs";
import { resolve } from "path";
import { EMAIL_TEMPLATE_SAMPLES } from "../lib/email-templates";

function loadEnvLocal() {
  try {
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
  } catch {
    /* ignore */
  }
}

loadEnvLocal();

const to = process.argv[2] || "maccidomuhammad1313@gmail.com";

function fromAddress() {
  const raw =
    process.env.RESEND_FROM ||
    process.env.RESEND_FROM_EMAIL ||
    process.env.EMAIL_FROM;
  if (!raw) return null;
  if (raw.includes("<") && raw.includes(">")) return raw;
  if (raw.includes("@")) return `Loopin <${raw.trim()}>`;
  return raw;
}

async function main() {
  const apiKey = process.env.RESEND_API_KEY;
  const from = fromAddress();
  if (!apiKey || !from) {
    console.error("Missing RESEND_API_KEY or RESEND_FROM(_EMAIL)");
    process.exit(1);
  }

  const resend = new Resend(apiKey);
  console.log(`Sending ${EMAIL_TEMPLATE_SAMPLES.length} template samples to ${to}`);
  console.log("Templates:");
  for (const s of EMAIL_TEMPLATE_SAMPLES) {
    console.log(`  - ${s.id}: ${s.label}`);
  }

  let ok = 0;
  let fail = 0;
  for (const sample of EMAIL_TEMPLATE_SAMPLES) {
    const tpl = sample.build();
    const { data, error } = await resend.emails.send({
      from,
      to: [to],
      subject: `[Preview] ${sample.subject}`,
      html: tpl.html,
      text: tpl.text,
    });
    if (error) {
      fail += 1;
      console.error(`FAIL ${sample.id}: ${error.message || error}`);
    } else {
      ok += 1;
      console.log(`OK ${sample.id} (${sample.label}) id=${data?.id || "?"}`);
    }
  }

  console.log(`Done. sent=${ok} failed=${fail}`);
  process.exit(fail ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
