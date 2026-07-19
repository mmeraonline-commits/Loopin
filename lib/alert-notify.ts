import { hasInsforgeAdminKey, insforgeAdmin } from "@/lib/insforge-admin";
import { sendPushToUser } from "@/lib/push";
import { escapeHtml, sendEmailToUser } from "@/lib/email";
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

function normalizeMethods(method: string | string[] | undefined): string[] {
  if (Array.isArray(method)) {
    return [...new Set(method.map((m) => String(m || "").toLowerCase().trim()).filter(Boolean))];
  }
  const single = String(method || "in_app").toLowerCase().trim();
  return single ? [single] : ["in_app"];
}

/**
 * Deliver an alert via one or more channels (in_app / push / whatsapp / email).
 * Always safe to call — failures are logged and do not throw.
 * `in_app` is a no-op here (caller already inserted the alert row).
 */
export async function notifyUserOfAlert(
  userId: string,
  method: string | string[] | undefined,
  payload: AlertNotifyPayload
) {
  const channels = normalizeMethods(method);
  const results: Record<string, unknown> = { channels };

  for (const channel of channels) {
    try {
      if (channel === "in_app") {
        results.in_app = { ok: true };
        continue;
      }

      if (channel === "push") {
        results.push = await sendPushToUser(userId, payload);
        continue;
      }

      if (channel === "whatsapp") {
        results.whatsapp = await sendWhatsAppAlertToUser(userId, payload);
        continue;
      }

      if (channel === "email") {
        const appUrl =
          process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
        const absoluteUrl = payload.url
          ? payload.url.startsWith("http")
            ? payload.url
            : `${appUrl}${payload.url}`
          : `${appUrl}/dashboard?tab=alerts`;
        results.email = await sendEmailToUser(userId, {
          subject: `Loopin Alert: ${payload.title}`,
          html: `<div style="font-family:system-ui,sans-serif;line-height:1.5">
  <h2 style="margin:0 0 8px">${escapeHtml(payload.title)}</h2>
  <p style="margin:0 0 16px;color:#334155">${escapeHtml(payload.body)}</p>
  <p><a href="${escapeHtml(absoluteUrl)}" style="color:#7c3aed;font-weight:600">Open in Loopin</a></p>
</div>`,
          text: `${payload.title}\n\n${payload.body}\n\nOpen: ${absoluteUrl}`,
        });
        continue;
      }
    } catch (err) {
      console.error(`[alert-notify] ${channel} failed:`, err);
      results[channel] = {
        ok: false,
        error: err instanceof Error ? err.message : "notify failed",
      };
    }
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
