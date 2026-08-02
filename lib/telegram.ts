import { createHmac } from "crypto";
import { resolveAppUrl } from "@/lib/app-url";
import { hasInsforgeAdminKey, insforgeAdmin } from "@/lib/insforge-admin";
import { updateUserIntegration } from "@/lib/integrations";

export type TelegramMessage = {
  id: string;
  chatId: string;
  chatName: string;
  from: string;
  body: string;
  timestamp: string;
  fromMe: boolean;
  replyToMessageId?: string;
};

export type TelegramIntegration = {
  connected?: boolean;
  chatId?: string;
  username?: string;
  firstName?: string;
  isSimulated?: boolean;
  connectedAt?: string;
  pendingLinkToken?: string | null;
  pendingLinkExpiresAt?: string | null;
  recentMessages?: TelegramMessage[];
};

export type TelegramFrom = {
  id?: number;
  username?: string;
  first_name?: string;
};

export type TelegramChat = {
  id?: number;
  title?: string;
  username?: string;
  type?: string;
};

export type TelegramBotMessage = {
  message_id?: number;
  text?: string;
  date?: number;
  from?: TelegramFrom;
  chat?: TelegramChat;
  reply_to_message?: { message_id?: number };
};

export type TelegramUpdate = {
  update_id?: number;
  message?: TelegramBotMessage;
};

const LINK_TTL_MS = 15 * 60 * 1000;
const MAX_RECENT = 50;

/** In-process offset for local getUpdates polling (dev only). */
let localGetUpdatesOffset = 0;
let localWebhookCleared = false;

function linkSecret() {
  return (
    process.env.TELEGRAM_WEBHOOK_SECRET ||
    process.env.TELEGRAM_BOT_TOKEN ||
    "loopin-telegram-dev"
  );
}

export function isTelegramBotConfigured() {
  const token = process.env.TELEGRAM_BOT_TOKEN || "";
  return Boolean(token && token !== "your_telegram_bot_token_here");
}

export function getTelegramBotToken() {
  return process.env.TELEGRAM_BOT_TOKEN || "";
}

/** True when this Next process is running with a localhost APP_URL (local connect flow). */
export function isLocalTelegramDev(): boolean {
  const candidates = [process.env.APP_URL, process.env.NEXT_PUBLIC_APP_URL];
  return candidates.some((raw) =>
    /localhost|127\.0\.0\.1|0\.0\.0\.0/i.test(String(raw || ""))
  );
}

export function createTelegramLinkToken(userId: string): string {
  const exp = Date.now() + LINK_TTL_MS;
  const data = `${userId}.${exp}`;
  const sig = createHmac("sha256", linkSecret()).update(data).digest("hex").slice(0, 16);
  return `${userId}.${exp}.${sig}`;
}

export function parseTelegramLinkToken(token: string): { userId: string } | null {
  const parts = String(token || "").trim().split(".");
  if (parts.length !== 3) return null;
  const [userId, expStr, sig] = parts;
  const exp = Number(expStr);
  if (!userId || !Number.isFinite(exp) || Date.now() > exp) return null;
  const expected = createHmac("sha256", linkSecret())
    .update(`${userId}.${exp}`)
    .digest("hex")
    .slice(0, 16);
  if (sig !== expected) return null;
  return { userId };
}

export async function telegramApi(
  method: string,
  body?: Record<string, unknown>
): Promise<{ ok: boolean; result?: unknown; description?: string }> {
  const token = getTelegramBotToken();
  if (!token) return { ok: false, description: "TELEGRAM_BOT_TOKEN is not configured" };

  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  const json = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    result?: unknown;
    description?: string;
  };
  return {
    ok: !!json.ok,
    result: json.result,
    description: json.description,
  };
}

export async function getTelegramBotUsername(): Promise<string | null> {
  const data = await telegramApi("getMe");
  if (!data.ok || !data.result || typeof data.result !== "object") return null;
  const username = (data.result as { username?: string }).username;
  return username || null;
}

export async function getTelegramIntegration(
  userId: string
): Promise<TelegramIntegration | null> {
  if (!hasInsforgeAdminKey) return null;
  const { data: dbUser } = await insforgeAdmin.database
    .from("users")
    .select("integrations")
    .eq("id", userId)
    .maybeSingle();
  return (dbUser?.integrations?.telegram as TelegramIntegration) || null;
}

export async function completeTelegramLink(params: {
  userId: string;
  chatId: string;
  from?: TelegramFrom;
}): Promise<boolean> {
  if (!hasInsforgeAdminKey) return false;
  const { userId, chatId, from } = params;
  const existing = (await getTelegramIntegration(userId)) || {};

  await updateUserIntegration(insforgeAdmin.database, userId, "telegram", {
    ...existing,
    connected: true,
    chatId,
    username: from?.username || existing.username,
    firstName: from?.first_name || existing.firstName,
    isSimulated: false,
    connectedAt: new Date().toISOString(),
    pendingLinkToken: null,
    pendingLinkExpiresAt: null,
    recentMessages: existing.recentMessages || [],
  });

  await telegramApi("sendMessage", {
    chat_id: chatId,
    text: "Loopin is connected. I'll use this chat for alerts and briefings. You can message me anytime.",
  });
  return true;
}

/**
 * Handle /start deep-link (and bare /start). Returns true if a link was completed.
 */
export async function handleTelegramStartCommand(params: {
  text: string;
  chatId: string;
  from?: TelegramFrom;
}): Promise<{ linked: boolean; replied: boolean }> {
  const { text, chatId, from } = params;
  if (!text.startsWith("/start")) {
    return { linked: false, replied: false };
  }

  const payload = text.slice("/start".length).trim();
  if (payload) {
    const parsed = parseTelegramLinkToken(payload);
    if (parsed?.userId && hasInsforgeAdminKey) {
      await completeTelegramLink({ userId: parsed.userId, chatId, from });
      return { linked: true, replied: true };
    }
  }

  await telegramApi("sendMessage", {
    chat_id: chatId,
    text: "Open Loopin → Integrations → Telegram and tap Connect to link your account.",
  });
  return { linked: false, replied: true };
}

/** Clear webhook so local getUpdates can receive /start (Telegram allows only one delivery mode). */
export async function ensureLocalTelegramPolling(): Promise<{ ok: boolean; description?: string }> {
  if (localWebhookCleared) return { ok: true };
  const cleared = await telegramApi("deleteWebhook", { drop_pending_updates: false });
  if (cleared.ok) localWebhookCleared = true;
  return { ok: cleared.ok, description: cleared.description };
}

/** Re-point webhook at production after local linking (optional best-effort). */
export async function restoreProductionTelegramWebhook(): Promise<void> {
  const url = `${resolveAppUrl()}/api/telegram-webhook`;
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const body: Record<string, unknown> = { url };
  if (secret) body.secret_token = secret;
  const res = await telegramApi("setWebhook", body);
  if (res.ok) localWebhookCleared = false;
}

/**
 * Local-dev path: poll getUpdates for /start <token> matching this user and complete linking.
 * Call from telegram-connect status while APP_URL is localhost.
 */
export async function pollTelegramLinkViaGetUpdates(userId: string): Promise<boolean> {
  if (!isTelegramBotConfigured() || !hasInsforgeAdminKey) return false;

  const existing = await getTelegramIntegration(userId);
  if (existing?.connected) return true;
  if (!existing?.pendingLinkToken) return false;

  const ensured = await ensureLocalTelegramPolling();
  if (!ensured.ok) {
    console.warn("[telegram] deleteWebhook failed (getUpdates blocked):", ensured.description);
    return false;
  }

  const data = await telegramApi("getUpdates", {
    ...(localGetUpdatesOffset > 0 ? { offset: localGetUpdatesOffset } : {}),
    timeout: 0,
    allowed_updates: ["message"],
    limit: 50,
  });

  if (!data.ok) {
    // Conflict means a webhook is still set — retry clear next poll.
    if (/webhook/i.test(String(data.description || ""))) {
      localWebhookCleared = false;
    }
    console.warn("[telegram] getUpdates failed:", data.description);
    return false;
  }

  const updates = (Array.isArray(data.result) ? data.result : []) as TelegramUpdate[];
  for (const update of updates) {
    if (typeof update.update_id === "number") {
      localGetUpdatesOffset = Math.max(localGetUpdatesOffset, update.update_id + 1);
    }

    const message = update.message;
    if (!message?.chat?.id) continue;
    const text = String(message.text || "").trim();
    if (!text.startsWith("/start")) continue;

    const payload = text.slice("/start".length).trim();
    if (!payload) continue;

    const parsed = parseTelegramLinkToken(payload);
    const matchesPending =
      payload === existing.pendingLinkToken || parsed?.userId === userId;
    if (!matchesPending || !parsed?.userId) continue;

    await completeTelegramLink({
      userId: parsed.userId,
      chatId: String(message.chat.id),
      from: message.from,
    });

    // Best-effort: restore production webhook so deployed app keeps receiving updates.
    void restoreProductionTelegramWebhook().catch(() => undefined);
    return true;
  }

  return false;
}

export async function appendTelegramMessage(
  userId: string,
  message: TelegramMessage
): Promise<void> {
  if (!hasInsforgeAdminKey) return;
  const { data: dbUser } = await insforgeAdmin.database
    .from("users")
    .select("integrations")
    .eq("id", userId)
    .maybeSingle();
  if (!dbUser) return;

  const current = (dbUser.integrations?.telegram || {}) as TelegramIntegration;
  if (!current.connected) return;

  const recent = [...(current.recentMessages || []), message].slice(-MAX_RECENT);
  await updateUserIntegration(insforgeAdmin.database, userId, "telegram", {
    ...current,
    recentMessages: recent,
  });
}

export function mcpText(payload: unknown) {
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
  };
}
