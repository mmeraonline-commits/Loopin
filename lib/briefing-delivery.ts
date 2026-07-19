import { hasInsforgeAdminKey, insforgeAdmin } from "@/lib/insforge-admin";
import { sanitizeUserPreferences, type UserPreferences } from "@/lib/assistant-preferences";
import { notifyUserOfAlert } from "@/lib/alert-notify";

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
  const outbound = list.filter((c) => c === "push" || c === "whatsapp" || c === "email");
  if (!outbound.length) return { skipped: true, reason: "in_app only" };

  return notifyUserOfAlert(input.userId, outbound, {
    title,
    body,
    url: `/dashboard/briefing/${input.briefingId}`,
    tag: `briefing-${input.briefingId}`,
  });
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
