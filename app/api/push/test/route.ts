import { NextRequest, NextResponse } from "next/server";
import { hasInsforgeAdminKey } from "@/lib/insforge-admin";
import { isPushConfigured, sendPushToUser } from "@/lib/push";

export async function POST(req: NextRequest) {
  try {
    if (!hasInsforgeAdminKey) {
      return NextResponse.json({ error: "Server misconfigured" }, { status: 503 });
    }
    if (!isPushConfigured()) {
      return NextResponse.json(
        { error: "VAPID keys missing. Run npm run generate:vapid then restart the server." },
        { status: 503 }
      );
    }

    const { userId } = await req.json();
    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    const result = await sendPushToUser(userId, {
      title: "Loopin push test",
      body: "Push notifications are working on this device.",
      url: "/dashboard?tab=settings",
      icon: "/001-gmail.png",
      tag: `push-test-${Date.now()}`,
    });

    if (result.sent === 0) {
      return NextResponse.json(
        {
          error:
            result.errors?.[0] ||
            "Push was not delivered. Disable push, enable again, then retry. Also check Windows notification settings for your browser.",
          ...result,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      ...result,
      tip: "If you still see nothing, check Windows Focus Assist / Do Not Disturb, and that Chrome notifications are allowed for localhost.",
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to send test push" },
      { status: 500 }
    );
  }
}
