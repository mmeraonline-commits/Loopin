/** Cloudflare / OpenNext stub — Baileys runs on the WhatsApp worker, not in the Worker bundle. */
export type Chat = { id: string; name?: string; unreadCount?: number };
export type Message = {
  key: { id: string; remoteJid: string; fromMe: boolean };
  pushName?: string;
  message?: Record<string, unknown>;
  messageTimestamp?: number;
};

function unavailable(fn: string): never {
  throw new Error(
    `WhatsApp.${fn} is unavailable in the Cloudflare deployment. Configure WHATSAPP_WORKER_URL and WHATSAPP_WORKER_SECRET.`
  );
}

export function hasWhatsAppAuth(_userId: string) {
  return false;
}
export function getWhatsAppSession(_userId: string) {
  return null;
}
export async function initWhatsAppConnection(..._args: unknown[]) {
  return unavailable("initWhatsAppConnection");
}
export async function disconnectWhatsApp(..._args: unknown[]) {
  return unavailable("disconnectWhatsApp");
}
export async function waitForWhatsAppReady(..._args: unknown[]) {
  return unavailable("waitForWhatsAppReady");
}
export function extractWhatsAppText(..._args: unknown[]) {
  return "";
}
export function normalizeWhatsAppTimestamp(..._args: unknown[]) {
  return 0;
}
export async function sendWhatsAppMessage(..._args: unknown[]) {
  return unavailable("sendWhatsAppMessage");
}
export async function getWhatsAppChats(..._args: unknown[]) {
  return unavailable("getWhatsAppChats");
}
export async function getWhatsAppMessages(..._args: unknown[]) {
  return unavailable("getWhatsAppMessages");
}
