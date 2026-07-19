/**
 * Push Resend secrets from .env.local to Cloudflare Worker (omnisync).
 * Does not print secret values.
 */
import { readFileSync, writeFileSync, unlinkSync } from "fs";
import { resolve } from "path";
import { spawnSync } from "child_process";

function loadEnvLocal() {
  const env = {};
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
    env[t.slice(0, i).trim()] = v;
  }
  return env;
}

const env = loadEnvLocal();
const key = env.RESEND_API_KEY;
const fromRaw = env.RESEND_FROM || env.RESEND_FROM_EMAIL;
if (!key || !fromRaw) {
  console.error("Missing RESEND_API_KEY or RESEND_FROM(_EMAIL) in .env.local");
  process.exit(1);
}
if (key.length < 10) {
  console.error("RESEND_API_KEY looks empty/invalid");
  process.exit(1);
}

const from = fromRaw.includes("<") ? fromRaw : `Loopin <${fromRaw.trim()}>`;
console.log(`Uploading secrets for worker omnisync (from domain: ${fromRaw.includes("@") ? fromRaw.split("@")[1] : "?"})`);

function putSecret(name, value) {
  const r = spawnSync(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["wrangler", "secret", "put", name],
    {
      input: value,
      encoding: "utf8",
      shell: true,
      env: process.env,
    }
  );
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  if (r.status !== 0) {
    console.error(`Failed to put ${name}`);
    process.exit(r.status || 1);
  }
  console.log(`OK ${name} (len=${value.length})`);
}

putSecret("RESEND_API_KEY", key);
putSecret("RESEND_FROM", from);
putSecret("RESEND_FROM_EMAIL", fromRaw.trim());
console.log("SECRETS_DONE");
