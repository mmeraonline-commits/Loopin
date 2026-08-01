import { schedules, task } from "@trigger.dev/sdk/v3";
import { resolveAppUrl } from "../lib/app-url";

const APP_URL = resolveAppUrl();

async function runTriageForUser(userId: string) {
  const res = await fetch(`${APP_URL}/api/outlook-triage/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId }),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body?.error || `outlook-triage/run HTTP ${res.status}`);
  }
  return body as {
    scanned?: number;
    labeled?: number;
    drafted?: number;
    errors?: string[];
  };
}

async function tryRunAllOnCloudflare(): Promise<Record<string, unknown> | null> {
  const secret = process.env.TRIGGER_SECRET_KEY || "";
  if (!secret) return null;

  const res = await fetch(`${APP_URL}/api/outlook-triage/run`, {
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
    throw new Error(body?.error || `outlook-triage/run all HTTP ${res.status}`);
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

export const outlookTriageForUserTask = task({
  id: "outlook-triage-for-user",
  run: async (payload: { userId: string }) => {
    const body = await runTriageForUser(payload.userId);
    console.log(
      `[outlook-triage-for-user] user=${payload.userId} scanned=${body.scanned ?? 0} labeled=${body.labeled ?? 0} drafted=${body.drafted ?? 0}`
    );
    return { success: true, ...body };
  },
});

export const outlookTriageCron = schedules.task({
  id: "outlook-triage-cron",
  cron: "*/5 * * * *",
  run: async () => {
    console.log(`[outlook-triage-cron] appUrl=${APP_URL}`);

    try {
      const allResult = await tryRunAllOnCloudflare();
      if (allResult) {
        console.log(
          `[outlook-triage-cron] cloudflare-all users=${allResult.usersScanned} targets=${allResult.targets}`
        );
        return allResult;
      }
    } catch (err) {
      console.warn(
        "[outlook-triage-cron] cloudflare-all failed:",
        err instanceof Error ? err.message : String(err)
      );
    }

    return {
      ok: true,
      mode: "noop-fallback",
      appUrl: APP_URL,
      note: "No all=true run; ensure TRIGGER_SECRET_KEY is set in Trigger env.",
    };
  },
});
