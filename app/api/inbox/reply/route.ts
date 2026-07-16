import { NextRequest, NextResponse } from "next/server";
import { sendPlatformReply } from "@/lib/send-reply";

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Internal Server Error";
}

export async function POST(req: NextRequest) {
  try {
    const { userId, app, text, fullDetails, activityId } = await req.json();

    if (!userId || !app || !text) {
      return NextResponse.json(
        { error: "Required fields: userId, app, text" },
        { status: 400 }
      );
    }

    if (app === "outlook") {
      return NextResponse.json(
        { error: "Outlook replies are not supported yet. Use Gmail, WhatsApp, Slack, or Discord." },
        { status: 400 }
      );
    }

    const result = await sendPlatformReply({
      userId,
      sourceApp: app,
      text: String(text),
      fullDetails: fullDetails || null,
      activityId: activityId || null,
    });

    return NextResponse.json(result);
  } catch (err: unknown) {
    console.error("Error in POST /api/inbox/reply:", err);
    return NextResponse.json({ error: getErrorMessage(err) }, { status: 400 });
  }
}
