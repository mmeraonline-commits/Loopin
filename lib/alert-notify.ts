import { hasInsforgeAdminKey, insforgeAdmin } from "@/lib/insforge-admin";
import { sendPushToUser } from "@/lib/push";
import {
  callWhatsAppWorker,
  isWhatsAppWorkerConfigured,
} from "@/lib/whatsapp-worker-client";

export type AlertNotifyPayload = {
  title: string;
  body: string;
  url?: string;
  icon?: string;
  tag?: string;
};

type WhatsAppIntegration = {
  connected?: boolean;
  isSimulated?: boolean;
  phoneNumber?: string;
};

/**
 * Deliver an alert via the user's preferred channel(s).
 * Always safe to call — failures are logged and do not throw.
 */
export async function notifyUserOfAlert(
  userId: string,
  method: string | undefined,
  payload: AlertNotifyPayload
) {
  const channel = (method || "in_app").toLowerCase();
  const results: Record<string, unknown> = { channel };

  try {
    if (channel === "push" || channel === "email") {
      // Email provider not wired yet — push is the best available extra channel.
      results.push = await sendPushToUser(userId, payload);
    }

    if (channel === "whatsapp") {
      results.whatsapp = await sendWhatsAppAlertToUser(userId, payload);
    }
  } catch (err) {
    console.error("[alert-notify] Failed:", err);
    results.error = err instanceof Error ? err.message : "notify failed";
  }

  return results;
}

export async function sendWhatsAppAlertToUser(
  userId: string,
  payload: AlertNotifyPayload
): Promise<{ ok: boolean; error?: string; to?: string }> {
  if (!hasInsforgeAdminKey) {
    return { ok: false, error: "Server database key missing" };
  }

  const { data: dbUser, error } = await insforgeAdmin.database
    .from("users")
    .select("integrations")
    .eq("id", userId)
    .maybeSingle();

  if (error || !dbUser) {
    return { ok: false, error: "User not found" };
  }

  const whatsapp = (dbUser.integrations?.whatsapp || null) as WhatsAppIntegration | null;
  if (!whatsapp?.connected || whatsapp.isSimulated) {
    return { ok: false, error: "WhatsApp is not connected" };
  }

  const phone = String(whatsapp.phoneNumber || "").replace(/[^\d]/g, "");
  if (phone.length < 8) {
    return {
      ok: false,
      error: "No WhatsApp phone number on file. Reconnect WhatsApp with your number.",
    };
  }

  const appUrl =
    process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const absoluteUrl = payload.url
    ? payload.url.startsWith("http")
      ? payload.url
      : `${appUrl}${payload.url}`
    : undefined;

  if (isWhatsAppWorkerConfigured()) {
    const proxied = await callWhatsAppWorker("/notify", {
      userId,
      title: payload.title,
      body: payload.body,
      url: absoluteUrl,
      phoneNumber: whatsapp.phoneNumber,
    });
    const data = proxied.data as { ok?: boolean; error?: string; to?: string };
    if (!proxied.ok || !data.ok) {
      return {
        ok: false,
        error: data.error || "WhatsApp worker notify failed",
      };
    }
    return { ok: true, to: data.to };
  }

  const {
    getWhatsAppSession,
    hasWhatsAppAuth,
    initWhatsAppConnection,
    waitForWhatsAppReady,
  } = await import("@/lib/whatsapp");

  if (!hasWhatsAppAuth(userId)) {
    return {
      ok: false,
      error: "WhatsApp session expired. Reconnect WhatsApp from Integrations.",
    };
  }

  let session = getWhatsAppSession(userId);
  if (!session || session.status === "disconnected") {
    session = await initWhatsAppConnection(userId, whatsapp.phoneNumber);
  }
  await waitForWhatsAppReady(session, { connectTimeoutMs: 20000, historyTimeoutMs: 0 });

  if (session.status !== "connected") {
    return {
      ok: false,
      error: `WhatsApp is ${session.status}. Keep the phone online and reconnect if needed.`,
    };
  }

  const jid = `${phone}@s.whatsapp.net`;
  const text = [
    `*Loopin Alert*`,
    payload.title,
    "",
    payload.body,
    absoluteUrl ? `\nOpen: ${absoluteUrl}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    await session.sock.sendMessage(jid, { text });
    return { ok: true, to: jid };
  } catch (err: unknown) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to send WhatsApp alert",
    };
  }
}
