import { NextRequest, NextResponse } from "next/server";
import { hasInsforgeAdminKey, insforgeAdmin } from "@/lib/insforge-admin";
import { isNextResponse, requireChannelAccess } from "@/lib/plan-gate";
import { updateUserIntegration } from "@/lib/integrations";
import {
  createTelegramLinkToken,
  ensureLocalTelegramPolling,
  getTelegramBotUsername,
  getTelegramIntegration,
  isLocalTelegramDev,
  isTelegramBotConfigured,
  pollTelegramLinkViaGetUpdates,
  restoreProductionTelegramWebhook,
} from "@/lib/telegram";

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Internal Server Error";
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, userId } = body as { action?: string; userId?: string };

    if (!userId) {
      return NextResponse.json({ error: "User ID is required." }, { status: 400 });
    }

    if (!hasInsforgeAdminKey) {
      return NextResponse.json(
        { error: "Server database key is not configured (INSFORGE_API_KEY)." },
        { status: 500 }
      );
    }

    if (action === "connect") {
      const channelGate = await requireChannelAccess(userId, "telegram");
      if (isNextResponse(channelGate)) return channelGate;

      if (!isTelegramBotConfigured()) {
        return NextResponse.json(
          {
            error:
              "Telegram bot is not configured. Add TELEGRAM_BOT_TOKEN to the server env, or use simulated mode.",
            configured: false,
          },
          { status: 500 }
        );
      }

      const linkToken = createTelegramLinkToken(userId);
      const username = await getTelegramBotUsername();
      if (!username) {
        return NextResponse.json(
          { error: "Could not resolve Telegram bot username. Check TELEGRAM_BOT_TOKEN." },
          { status: 502 }
        );
      }

      const deepLink = `https://t.me/${username}?start=${encodeURIComponent(linkToken)}`;
      const existing = (await getTelegramIntegration(userId)) || {};

      await updateUserIntegration(insforgeAdmin.database, userId, "telegram", {
        ...existing,
        connected: existing.connected || false,
        pendingLinkToken: linkToken,
        pendingLinkExpiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      });

      // Localhost cannot receive Telegram webhooks — clear webhook so status polls can use getUpdates.
      let localPolling = false;
      if (isLocalTelegramDev() && !existing.connected) {
        const ensured = await ensureLocalTelegramPolling();
        localPolling = ensured.ok;
        if (!ensured.ok) {
          console.warn("[telegram-connect] local getUpdates prep failed:", ensured.description);
        }
      }

      return NextResponse.json({
        success: true,
        status: existing.connected ? "connected" : "linking",
        deepLink,
        botUsername: username,
        linkToken,
        localPolling,
      });
    }

    if (action === "status") {
      // Local-dev: detect /start via getUpdates (production webhook never hits localhost).
      if (isLocalTelegramDev()) {
        await pollTelegramLinkViaGetUpdates(userId);
      }

      const telegram = await getTelegramIntegration(userId);
      if (telegram?.connected) {
        return NextResponse.json({
          success: true,
          status: "connected",
          isSimulated: !!telegram.isSimulated,
          chatId: telegram.chatId,
          username: telegram.username,
        });
      }
      return NextResponse.json({
        success: true,
        status: telegram?.pendingLinkToken ? "linking" : "disconnected",
      });
    }

    if (action === "disconnect") {
      await updateUserIntegration(insforgeAdmin.database, userId, "telegram", null);
      if (isLocalTelegramDev()) {
        void restoreProductionTelegramWebhook().catch(() => undefined);
      }
      return NextResponse.json({ success: true, status: "disconnected" });
    }

    if (action === "connect-simulated") {
      const channelGate = await requireChannelAccess(userId, "telegram");
      if (isNextResponse(channelGate)) return channelGate;

      await updateUserIntegration(insforgeAdmin.database, userId, "telegram", {
        connected: true,
        chatId: "simulated-chat",
        username: "simulated_user",
        firstName: "Simulated",
        isSimulated: true,
        connectedAt: new Date().toISOString(),
        recentMessages: [
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
        ],
      });

      return NextResponse.json({
        success: true,
        status: "connected",
        isSimulated: true,
      });
    }

    return NextResponse.json({ error: "Invalid action." }, { status: 400 });
  } catch (err: unknown) {
    console.error("Telegram connect API exception:", err);
    return NextResponse.json({ error: getErrorMessage(err) }, { status: 500 });
  }
}
