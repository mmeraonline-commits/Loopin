import { NextRequest, NextResponse } from "next/server";
import { hasInsforgeAdminKey } from "@/lib/insforge-admin";
import { sendWhatsAppAlertToUser } from "@/lib/alert-notify";

export async function POST(req: NextRequest) {
  try {
    if (!hasInsforgeAdminKey) {
      return NextResponse.json({ error: "Server misconfigured" }, { status: 503 });
    }

    const { userId } = await req.json();
    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    const result = await sendWhatsAppAlertToUser(userId, {
      title: "Loopin WhatsApp test",
      body: "WhatsApp alert delivery is working. Custom alert rules set to WhatsApp will message this number.",
      url: "/dashboard?tab=alerts",
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error || "WhatsApp send failed" }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to send WhatsApp test" },
      { status: 500 }
    );
  }
}
