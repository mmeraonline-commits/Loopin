/**
 * Upload required Cloudflare Worker secrets for omnisync from .env.local + WhatsApp worker secret.
 * Usage: node scripts/cf-set-secrets.mjs
 */
import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";

const root = process.cwd();
const envPath = path.join(root, ".env.local");
const waSecretPath = path.join(root, "whatsapp-worker-secret.txt");

function loadEnv(file) {
  const map = {};
  if (!fs.existsSync(file)) return map;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 1) continue;
    map[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return map;
}

const env = loadEnv(envPath);
const appUrl = "https://omnisync.mamutech-online.workers.dev";
const waUrl = "https://whatsapp-worker-production-b141.up.railway.app";
const waSecret = fs.existsSync(waSecretPath)
  ? fs.readFileSync(waSecretPath, "utf8").trim()
  : "";

const secrets = {
  APP_URL: appUrl,
  NEXT_PUBLIC_APP_URL: appUrl,
  NEXT_PUBLIC_INSFORGE_URL: env.NEXT_PUBLIC_INSFORGE_URL,
  NEXT_PUBLIC_INSFORGE_ANON_KEY: env.NEXT_PUBLIC_INSFORGE_ANON_KEY,
  INSFORGE_API_KEY: env.INSFORGE_API_KEY,
  GEMINI_API_KEY: env.GEMINI_API_KEY,
  GOOGLE_CLIENT_ID: env.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: env.GOOGLE_CLIENT_SECRET,
  SLACK_CLIENT_ID: env.SLACK_CLIENT_ID,
  SLACK_CLIENT_SECRET: env.SLACK_CLIENT_SECRET,
  DISCORD_CLIENT_ID: env.DISCORD_CLIENT_ID,
  DISCORD_CLIENT_SECRET: env.DISCORD_CLIENT_SECRET,
  DISCORD_BOT_TOKEN: env.DISCORD_BOT_TOKEN,
  CALENDLY_CLIENT_ID: env.CALENDLY_CLIENT_ID,
  CALENDLY_CLIENT_SECRET: env.CALENDLY_CLIENT_SECRET,
  TRIGGER_SECRET_KEY: env.TRIGGER_SECRET_KEY,
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY: env.VAPID_PRIVATE_KEY,
  VAPID_SUBJECT: "mailto:maccidomuhammad1313@gmail.com",
  ADMIN_EMAILS: env.ADMIN_EMAILS,
  NEXT_PUBLIC_ADMIN_EMAILS: env.NEXT_PUBLIC_ADMIN_EMAILS,
  WHATSAPP_WORKER_URL: waUrl,
  WHATSAPP_WORKER_SECRET: waSecret,
};

let failed = 0;
for (const [name, value] of Object.entries(secrets)) {
  if (!value) {
    console.log(`SKIP ${name}`);
    continue;
  }
  const r = spawnSync(
    "npx",
    ["wrangler", "secret", "put", name, "--name", "omnisync"],
    { input: value, encoding: "utf8", shell: true }
  );
  if (r.status === 0) {
    console.log(`OK ${name}`);
  } else {
    failed += 1;
    console.log(`FAIL ${name}`);
    if (r.stderr) console.log(r.stderr.slice(0, 300));
  }
}

process.exit(failed ? 1 : 0);
