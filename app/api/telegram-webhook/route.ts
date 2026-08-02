import { NextRequest, NextResponse } from "next/server";
import { hasInsforgeAdminKey, insforgeAdmin } from "@/lib/insforge-admin";
import { updateUserIntegration } from "@/lib/integrations";
import {
  appendTelegramMessage,
  handleTelegramStartCommand,
  type TelegramIntegration,
  type TelegramUpdate,
} from "@/lib/telegram";

async function findUserIdByChatId(chatId: string): Promise<string | null> {
  if (!hasInsforgeAdminKey) return null;
  // Prefer matching via recent linked users — scan is acceptable for early bot volume.
  const { data: users } = await insforgeAdmin.database
    .from("users")
    .select("id, integrations");
  const rows = (users || []) as Array<{
    id: string;
    integrations?: { telegram?: TelegramIntegration | null };
  }>;
  for (const row of rows) {
    const tg = row.integrations?.telegram;
    if (tg?.connected && String(tg.chatId) === chatId) return row.id;
  }
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (secret) {
      const header = req.headers.get("x-telegram-bot-api-secret-token");
      if (header !== secret) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const update = (await req.json()) as TelegramUpdate;
    const message = update.message;
    if (!message?.chat?.id) {
      return NextResponse.json({ ok: true });
    }

    const chatId = String(message.chat.id);
    const text = String(message.text || "").trim();
    const from = message.from;
    const chatName =
      message.chat.title ||
      from?.username ||
      from?.first_name ||
      "Telegram";

    // Deep-link connect: /start <token>
    if (text.startsWith("/start")) {
      await handleTelegramStartCommand({ text, chatId, from });
      return NextResponse.json({ ok: true });
    }

    const userId = await findUserIdByChatId(chatId);
    if (!userId || !text) {
      return NextResponse.json({ ok: true });
    }

    await appendTelegramMessage(userId, {
      id: String(message.message_id || `${chatId}-${message.date || Date.now()}`),
      chatId,
      chatName,
      from: from?.username || from?.first_name || "Telegram",
      body: text,
      timestamp: new Date((message.date || Math.floor(Date.now() / 1000)) * 1000).toISOString(),
      fromMe: false,
      replyToMessageId: message.reply_to_message?.message_id
        ? String(message.reply_to_message.message_id)
        : undefined,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[telegram-webhook]", err);
    // Always 200 to Telegram so it does not retry forever on app bugs.
    return NextResponse.json({ ok: true });
  }
}
