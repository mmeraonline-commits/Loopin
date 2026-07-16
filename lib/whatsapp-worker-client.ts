/**
 * Client for the always-on WhatsApp Baileys worker (Railway / Render / Fly).
 * When WHATSAPP_WORKER_URL is unset, the Next app uses in-process Baileys (local dev).
 */

export function isWhatsAppWorkerConfigured() {
  return Boolean(
    process.env.WHATSAPP_WORKER_URL?.trim() &&
      process.env.WHATSAPP_WORKER_SECRET?.trim()
  );
}

export function getWhatsAppWorkerBaseUrl() {
  return (process.env.WHATSAPP_WORKER_URL || "").replace(/\/$/, "");
}

export async function callWhatsAppWorker(
  path: string,
  body: Record<string, unknown>
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  const base = getWhatsAppWorkerBaseUrl();
  const secret = process.env.WHATSAPP_WORKER_SECRET || "";
  if (!base || !secret) {
    return {
      ok: false,
      status: 503,
      data: {
        error:
          "WhatsApp worker is not configured. Set WHATSAPP_WORKER_URL and WHATSAPP_WORKER_SECRET for production.",
      },
    };
  }

  const res = await fetch(`${base}${path.startsWith("/") ? path : `/${path}`}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Worker-Secret": secret,
    },
    body: JSON.stringify(body),
  });

  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok, status: res.status, data };
}
