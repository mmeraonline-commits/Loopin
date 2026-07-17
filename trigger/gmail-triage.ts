import { schedules, task } from "@trigger.dev/sdk/v3";
import { insforge } from "../lib/insforge";
import { hasInsforgeAdminKey, insforgeAdmin } from "../lib/insforge-admin";
import { runGmailAutoTriage } from "../lib/gmail-auto-triage";

type GmailIntegration = { connected?: boolean; isSimulated?: boolean } | null | undefined;

type UserIntegrationsRow = {
  id: string;
  integrations?: { gmail?: GmailIntegration } | null;
};

function getDb() {
  return hasInsforgeAdminKey ? insforgeAdmin.database : insforge.database;
}

/**
 * Kept separate from alerts-cron so a Gmail triage failure (rate limits, label
 * conflicts, etc.) never blocks alert generation and vice versa.
 */
export const gmailTriageCron = schedules.task({
  id: "gmail-triage-cron",
  cron: "*/5 * * * *",
  run: async () => {
    const db = getDb();
    const { data: users, error } = await db.from("users").select("id, integrations");

    if (error) {
      console.error("[gmail-triage-cron] Users fetch error:", error);
      return;
    }

    for (const user of (users || []) as UserIntegrationsRow[]) {
      const gmail = user.integrations?.gmail;
      if (!gmail?.connected || gmail?.isSimulated) continue;
      await gmailTriageForUserTask.trigger({ userId: user.id });
    }
  },
});

export const gmailTriageForUserTask = task({
  id: "gmail-triage-for-user",
  run: async (payload: { userId: string }) => {
    const result = await runGmailAutoTriage(payload.userId);
    if (result.errors.length > 0) {
      console.error(`[gmail-triage-for-user] user=${payload.userId} errors:`, result.errors);
    }
    return { success: true, ...result };
  },
});
