import { NextRequest, NextResponse } from "next/server";
import { hasInsforgeAdminKey, insforgeAdmin } from "@/lib/insforge-admin";
import { isNextResponse, requireChannelAccess } from "@/lib/plan-gate";
import {
  callWhatsAppWorker,
  isWhatsAppWorkerConfigured,
} from "@/lib/whatsapp-worker-client";

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Internal Server Error";
}

async function proxyToWorker(body: Record<string, unknown>) {
  const action = String(body.action || "connect");
  const path =
    action === "status"
      ? "/status"
      : action === "disconnect"
        ? "/disconnect"
        : "/connect";
  const { ok, status, data } = await callWhatsAppWorker(path, body);
  return NextResponse.json(data, { status: ok ? status : status || 502 });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, userId, phoneNumber } = body;

    if (!userId) {
      return NextResponse.json({ error: "User ID is required." }, { status: 400 });
    }

    if (action === "connect") {
      const channelGate = await requireChannelAccess(userId, "whatsapp");
      if (isNextResponse(channelGate)) return channelGate;

      if (!phoneNumber) {
        return NextResponse.json(
          { error: "Phone number is required for connection." },
          { status: 400 }
        );
      }

      if (isWhatsAppWorkerConfigured()) {
        return proxyToWorker(body);
      }

      const {
        disconnectWhatsApp,
        getWhatsAppSession,
        initWhatsAppConnection,
      } = await import("@/lib/whatsapp");

      await disconnectWhatsApp(userId);

      let session = await initWhatsAppConnection(userId, phoneNumber, { forceNew: true });

      if (session.status === "connecting" && !session.pairingCode) {
        for (let attempt = 0; attempt < 40; attempt++) {
          await new Promise((resolve) => setTimeout(resolve, 500));
          session = getWhatsAppSession(userId) ?? session;

          if (session.status === "connected" || session.pairingCode) {
            break;
          }
        }
      }

      if (session.status !== "connected" && !session.pairingCode) {
        return NextResponse.json(
          {
            error:
              "Could not generate a WhatsApp pairing code. Check the phone number (with country code) and try again.",
            status: session.status,
          },
          { status: 504 }
        );
      }

      return NextResponse.json({
        success: true,
        status: session.status,
        pairingCode: session.pairingCode,
      });
    }

    if (action === "status") {
      if (isWhatsAppWorkerConfigured()) {
        return proxyToWorker(body);
      }

      const {
        disconnectWhatsApp,
        getWhatsAppSession,
        hasWhatsAppAuth,
        initWhatsAppConnection,
      } = await import("@/lib/whatsapp");

      const session = getWhatsAppSession(userId);

      if (!session) {
        const { data: dbUser } = await insforgeAdmin.database
          .from("users")
          .select("integrations")
          .eq("id", userId)
          .maybeSingle();

        const integrations = dbUser?.integrations || {};
        if (integrations.whatsapp?.connected) {
          if (integrations.whatsapp.isSimulated) {
            return NextResponse.json({
              success: true,
              status: "connected",
              isSimulated: true,
            });
          }

          if (!hasWhatsAppAuth(userId)) {
            await disconnectWhatsApp(userId);
            return NextResponse.json({
              success: true,
              status: "disconnected",
            });
          }

          initWhatsAppConnection(userId, integrations.whatsapp.phoneNumber).catch(
            console.error
          );
          return NextResponse.json({
            success: true,
            status: "connecting",
          });
        }

        return NextResponse.json({
          success: true,
          status: "disconnected",
        });
      }

      return NextResponse.json({
        success: true,
        status: session.status,
        pairingCode: session.pairingCode,
      });
    }

    if (action === "disconnect") {
      if (isWhatsAppWorkerConfigured()) {
        return proxyToWorker(body);
      }

      const { disconnectWhatsApp } = await import("@/lib/whatsapp");
      await disconnectWhatsApp(userId);
      return NextResponse.json({ success: true, status: "disconnected" });
    }

    if (action === "connect-simulated") {
      const { data: dbUser } = await insforgeAdmin.database
        .from("users")
        .select("integrations")
        .eq("id", userId)
        .maybeSingle();

      const currentIntegrations = dbUser?.integrations || {};
      const updatedIntegrations = {
        ...currentIntegrations,
        whatsapp: {
          connected: true,
          phoneNumber: phoneNumber || "+15550199",
          isSimulated: true,
          connectedAt: new Date().toISOString(),
        },
      };

      await insforgeAdmin.database
        .from("users")
        .update({ integrations: updatedIntegrations })
        .eq("id", userId);

      return NextResponse.json({
        success: true,
        status: "connected",
        isSimulated: true,
      });
    }

    return NextResponse.json({ error: "Invalid action." }, { status: 400 });
  } catch (err: unknown) {
    console.error("WhatsApp connect API exception:", err);
    return NextResponse.json({ error: getErrorMessage(err) }, { status: 500 });
  }
}
