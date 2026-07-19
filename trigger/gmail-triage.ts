import { schedules, task } from "@trigger.dev/sdk/v3";

/** Production Cloudflare worker — set APP_URL in Trigger env to override. */
const DEFAULT_APP_URL = "https://omnisync.mamutech-online.workers.dev";

/** Fallback if Cloudflare all=true is unavailable. */
const DEFAULT_USER_IDS = ["b3c6d0bf-9858-4cbe-8912-18609fe2d431"];

const APP_URL = (
  process.env.APP_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  DEFAULT_APP_URL
).replace(/\/$/, "");

function resolveUserIds(): string[] {
  const fromEnv = (process.env.GMAIL_TRIAGE_USER_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return fromEnv.length > 0 ? fromEnv : DEFAULT_USER_IDS;
}

async function runTriageForUser(userId: string) {
  const res = await fetch(`${APP_URL}/api/gmail-triage/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId }),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body?.error || `gmail-triage/run HTTP ${res.status}`);
  }
  return body as {
    scanned?: number;
    labeled?: number;
    drafted?: number;
    errors?: string[];
  };
}

/** Prefer Cloudflare listing every live Gmail user (multi-user). */
async function tryRunAllOnCloudflare(): Promise<Record<string, unknown> | null> {
  const secret = process.env.TRIGGER_SECRET_KEY || "";
  if (!secret) return null;

  const res = await fetch(`${APP_URL}/api/gmail-triage/run`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify({ all: true }),
  });

  const body = await res.json().catch(() => ({}));
  if (res.status === 400 || res.status === 401) return null;
  if (!res.ok) {
    throw new Error(body?.error || `gmail-triage/run all HTTP ${res.status}`);
  }
  return {
    ok: true,
    mode: "cloudflare-all",
    appUrl: APP_URL,
    usersScanned: body.usersScanned ?? 0,
    targets: body.targets ?? 0,
    results: body.results ?? [],
  };
}

export const gmailTriageForUserTask = task({
  id: "gmail-triage-for-user",
  run: async (payload: { userId: string }) => {
    const body = await runTriageForUser(payload.userId);
    console.log(
      `[gmail-triage-for-user] user=${payload.userId} scanned=${body.scanned ?? 0} labeled=${body.labeled ?? 0} drafted=${body.drafted ?? 0}`
    );
    return { success: true, ...body };
  },
});

export const gmailTriageCron = schedules.task({
  id: "gmail-triage-cron",
  cron: "*/5 * * * *",
  run: async () => {
    console.log(`[gmail-triage-cron] appUrl=${APP_URL}`);

    try {
      const allResult = await tryRunAllOnCloudflare();
      if (allResult) {
        console.log(
          `[gmail-triage-cron] cloudflare-all users=${allResult.usersScanned} targets=${allResult.targets}`
        );
        return allResult;
      }
    } catch (err) {
      console.warn(
        "[gmail-triage-cron] cloudflare-all failed, falling back:",
        err instanceof Error ? err.message : String(err)
      );
    }

    const userIds = resolveUserIds();
    console.log(`[gmail-triage-cron] per-user fallback users=${userIds.length}`);

    const results: Array<Record<string, unknown>> = [];
    for (const userId of userIds) {
      try {
        const body = await runTriageForUser(userId);
        results.push({
          userId,
          ok: true,
          scanned: body.scanned ?? 0,
          labeled: body.labeled ?? 0,
          drafted: body.drafted ?? 0,
          errors: body.errors ?? [],
        });
        console.log(
          `[gmail-triage-cron] user=${userId} scanned=${body.scanned ?? 0} labeled=${body.labeled ?? 0} drafted=${body.drafted ?? 0}`
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[gmail-triage-cron] user=${userId} failed:`, message);
        results.push({ userId, ok: false, error: message });
      }
    }

    return {
      ok: true,
      mode: "per-user",
      appUrl: APP_URL,
      targets: userIds.length,
      results,
    };
  },
});
