import { hasInsforgeAdminKey, insforgeAdmin } from "@/lib/insforge-admin";
import { sanitizeUserPreferences, type UserPreferences } from "@/lib/assistant-preferences";
import { notifyUserOfAlert } from "@/lib/alert-notify";
import { sendEmailToUser } from "@/lib/email";
import { buildBriefingEmailTemplate } from "@/lib/email-templates";

/**
 * Deliver a generated briefing to the user's preferred channels
 * (push / WhatsApp / email). in_app is already satisfied by the DB row.
 */
export async function deliverBriefingToChannels(input: {
  userId: string;
  briefingId: string;
  title?: string;
  summary?: string;
  channels?: string[];
  statsLine?: string;
}): Promise<Record<string, unknown>> {
  let channels = input.channels;
  if (!channels?.length && hasInsforgeAdminKey) {
    const { data } = await insforgeAdmin.database
      .from("users")
      .select("assistant_settings")
      .eq("id", input.userId)
      .maybeSingle();
    const prefs = sanitizeUserPreferences(
      (data?.assistant_settings || {}) as Record<string, unknown>
    );
    channels = prefs.briefingChannels;
  }

  const list = (channels || ["in_app"]).map((c) => c.toLowerCase());
  const title = input.title || "Your Loopin briefing is ready";
  const body = (input.summary || "Open Loopin to read your latest digest.").slice(0, 280);
  const results: Record<string, unknown> = {};

  const pushWa = list.filter((c) => c === "push" || c === "whatsapp");
  if (pushWa.length) {
    results.notify = await notifyUserOfAlert(input.userId, pushWa, {
      title,
      body,
      url: `/dashboard/briefing/${input.briefingId}`,
      tag: `briefing-${input.briefingId}`,
    });
  }

  if (list.includes("email")) {
    const tpl = buildBriefingEmailTemplate({
      title,
      summary: input.summary || body,
      briefingId: input.briefingId,
      statsLine: input.statsLine,
    });
    results.email = await sendEmailToUser(input.userId, {
      subject: `Loopin · ${title}`,
      html: tpl.html,
      text: tpl.text,
    });
  }

  if (!pushWa.length && !list.includes("email")) {
    return { skipped: true, reason: "in_app only" };
  }

  return results;
}

export async function loadUserPreferences(userId: string): Promise<UserPreferences> {
  if (!hasInsforgeAdminKey) {
    return sanitizeUserPreferences(null);
  }
  try {
    const { data } = await insforgeAdmin.database
      .from("users")
      .select("assistant_settings, name")
      .eq("id", userId)
      .maybeSingle();
    return sanitizeUserPreferences((data?.assistant_settings || {}) as Record<string, unknown>, {
      displayName: typeof data?.name === "string" ? data.name : "",
    });
  } catch {
    return sanitizeUserPreferences(null);
  }
}
