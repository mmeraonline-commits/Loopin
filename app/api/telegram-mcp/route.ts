import { NextRequest, NextResponse } from "next/server";
import { hasInsforgeAdminKey, insforgeAdmin } from "@/lib/insforge-admin";
import { trackFeatureUsage } from "@/lib/track-feature-usage";
import { updateUserIntegration } from "@/lib/integrations";
import {
  appendTelegramMessage,
  getTelegramIntegration,
  isTelegramBotConfigured,
  mcpText,
  telegramApi,
  type TelegramMessage,
} from "@/lib/telegram";

const SIMULATED_MESSAGES: TelegramMessage[] = [
  {
    id: "tg_sim_1",
    chatId: "simulated-chat",
    chatName: "Loopin Bot",
    from: "Simulated",
    body: "Hey Loopin — can you remind me about the vendor contract tomorrow?",
    timestamp: new Date(Date.now() - 3600_000).toISOString(),
    fromMe: false,
  },
  {
    id: "tg_sim_2",
    chatId: "simulated-chat",
    chatName: "Loopin Bot",
    from: "Loopin",
    body: "Sure — I'll flag it in your next briefing.",
    timestamp: new Date(Date.now() - 3500_000).toISOString(),
    fromMe: true,
  },
  {
    id: "tg_sim_3",
    chatId: "simulated-chat",
    chatName: "Loopin Bot",
    from: "Simulated",
    body: "Also ping me if Sarah replies on Slack about Thursday.",
    timestamp: new Date(Date.now() - 1800_000).toISOString(),
    fromMe: false,
  },
];

export async function POST(req: NextRequest) {
  try {
    const { method, params, userId, id = 1 } = await req.json();

    if (!method || !userId) {
      return NextResponse.json(
        {
          jsonrpc: "2.0",
          error: { code: -32600, message: "Invalid Request: method and userId are required" },
          id,
        },
        { status: 400 }
      );
    }

    if (!hasInsforgeAdminKey) {
      return NextResponse.json(
        {
          jsonrpc: "2.0",
          error: { code: -32000, message: "INSFORGE_API_KEY is not configured" },
          id,
        },
        { status: 500 }
      );
    }

    const telegram = await getTelegramIntegration(userId);
    if (!telegram?.connected) {
      return NextResponse.json(
        {
          jsonrpc: "2.0",
          error: { code: -32001, message: "Telegram integration is not connected." },
          id,
        },
        { status: 400 }
      );
    }

    const isSimulated = !!telegram.isSimulated;
    let result: unknown = null;
    let error: { code: number; message: string } | null = null;

    const recent: TelegramMessage[] = isSimulated
      ? [...SIMULATED_MESSAGES, ...(telegram.recentMessages || [])]
      : [...(telegram.recentMessages || [])];

    switch (method) {
      case "telegram_get_recent_messages": {
        const messages = [...recent].sort(
          (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );
        result = mcpText({ messages });
        break;
      }

      case "telegram_get_chat_history": {
        const chatId = String(params?.chatId || telegram.chatId || "");
        const limit = Number(params?.limit) || 20;
        const history = recent
          .filter((m) => String(m.chatId) === chatId)
          .slice(-limit)
          .map((m) => ({
            messageId: m.id,
            from: m.from,
            body: m.body,
            timestamp: m.timestamp,
            fromMe: m.fromMe,
          }));
        result = mcpText({ messages: history });
        break;
      }

      case "telegram_send_message": {
        const chatId = String(params?.chatId || params?.to || telegram.chatId || "");
        const text = String(params?.text || params?.body || "").trim();
        if (!chatId || !text) {
          error = { code: -32602, message: "Arguments 'chatId' (or to) and 'text' (or body) are required" };
          break;
        }

        if (isSimulated) {
          const msg: TelegramMessage = {
            id: `tg_sim_out_${Date.now()}`,
            chatId,
            chatName: "Loopin Bot",
            from: "Loopin",
            body: text,
            timestamp: new Date().toISOString(),
            fromMe: true,
          };
          await appendTelegramMessage(userId, msg);
          result = mcpText({ success: true, messageId: msg.id, chatId, simulated: true });
          break;
        }

        if (!isTelegramBotConfigured()) {
          error = { code: -32000, message: "TELEGRAM_BOT_TOKEN is not configured" };
          break;
        }

        const sent = await telegramApi("sendMessage", { chat_id: chatId, text });
        if (!sent.ok) {
          error = { code: -32000, message: sent.description || "Telegram sendMessage failed" };
          break;
        }

        const sentMsg = sent.result as { message_id?: number } | undefined;
        const msg: TelegramMessage = {
          id: String(sentMsg?.message_id || `tg_out_${Date.now()}`),
          chatId,
          chatName: "Telegram",
          from: "Loopin",
          body: text,
          timestamp: new Date().toISOString(),
          fromMe: true,
        };
        await appendTelegramMessage(userId, msg);
        result = mcpText({ success: true, messageId: msg.id, chatId });
        break;
      }

      case "telegram_reply_message": {
        const chatId = String(params?.chatId || params?.to || telegram.chatId || "");
        const text = String(params?.text || params?.body || params?.content || "").trim();
        const replyToMessageId = String(
          params?.replyToMessageId || params?.messageId || ""
        );
        if (!chatId || !text || !replyToMessageId) {
          error = {
            code: -32602,
            message: "Arguments 'chatId', 'replyToMessageId', and 'text' are required",
          };
          break;
        }

        if (isSimulated) {
          const msg: TelegramMessage = {
            id: `tg_sim_reply_${Date.now()}`,
            chatId,
            chatName: "Loopin Bot",
            from: "Loopin",
            body: text,
            timestamp: new Date().toISOString(),
            fromMe: true,
            replyToMessageId,
          };
          await appendTelegramMessage(userId, msg);
          result = mcpText({ success: true, messageId: msg.id, chatId, replyToMessageId, simulated: true });
          break;
        }

        if (!isTelegramBotConfigured()) {
          error = { code: -32000, message: "TELEGRAM_BOT_TOKEN is not configured" };
          break;
        }

        const sent = await telegramApi("sendMessage", {
          chat_id: chatId,
          text,
          reply_to_message_id: Number(replyToMessageId) || replyToMessageId,
        });
        if (!sent.ok) {
          error = { code: -32000, message: sent.description || "Telegram reply failed" };
          break;
        }

        const sentMsg = sent.result as { message_id?: number } | undefined;
        const msg: TelegramMessage = {
          id: String(sentMsg?.message_id || `tg_reply_${Date.now()}`),
          chatId,
          chatName: "Telegram",
          from: "Loopin",
          body: text,
          timestamp: new Date().toISOString(),
          fromMe: true,
          replyToMessageId,
        };
        await appendTelegramMessage(userId, msg);
        result = mcpText({ success: true, messageId: msg.id, chatId, replyToMessageId });
        break;
      }

      case "telegram_disconnect": {
        await updateUserIntegration(insforgeAdmin.database, userId, "telegram", null);
        result = mcpText({ success: true, disconnected: true });
        break;
      }

      default:
        error = { code: -32601, message: `Method not found: ${method}` };
    }

    if (error) {
      return NextResponse.json({ jsonrpc: "2.0", error, id }, { status: 400 });
    }

    void trackFeatureUsage({
      userId,
      feature: "telegram",
      action: method || "use",
    });

    return NextResponse.json({ jsonrpc: "2.0", result, id });
  } catch (err: unknown) {
    console.error("Telegram MCP exception:", err);
    return NextResponse.json(
      {
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message: err instanceof Error ? err.message : "Internal error",
        },
        id: 1,
      },
      { status: 500 }
    );
  }
}
