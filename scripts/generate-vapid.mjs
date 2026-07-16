import fs from "fs";
import path from "path";
import webpush from "web-push";

const envPath = path.join(process.cwd(), ".env.local");
const keys = webpush.generateVAPIDKeys();

let env = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";

function upsert(content, key, value) {
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, "m");
  if (re.test(content)) return content.replace(re, line);
  return `${content.trimEnd()}\n${line}\n`;
}

env = upsert(env, "NEXT_PUBLIC_VAPID_PUBLIC_KEY", keys.publicKey);
env = upsert(env, "VAPID_PRIVATE_KEY", keys.privateKey);
env = upsert(env, "VAPID_SUBJECT", "mailto:alerts@omnisync.local");

fs.writeFileSync(envPath, env.endsWith("\n") ? env : `${env}\n`, "utf8");
console.log("Compatible web-push VAPID keys saved. Restart next dev, then Disable + Enable push again.");
