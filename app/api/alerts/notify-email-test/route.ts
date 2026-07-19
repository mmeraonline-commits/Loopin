import { NextRequest, NextResponse } from "next/server";
import { isEmailConfigured, sendEmailToUser } from "@/lib/email";

/** Send a test email via Resend to the signed-in user's account email. */
export async function POST(req: NextRequest) {
  try {
    const { userId } = await req.json();
    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }
    if (!isEmailConfigured()) {
      return NextResponse.json(
        { error: "Email is not configured. Set RESEND_API_KEY (and RESEND_FROM) on the server." },
        { status: 503 }
      );
    }

    const result = await sendEmailToUser(userId, {
      subject: "Loopin test email",
      html: `<div style="font-family:system-ui,sans-serif;line-height:1.5">
  <h2 style="margin:0 0 8px">Email delivery works</h2>
  <p style="margin:0;color:#334155">This is a test from Loopin Settings. Alerts and briefings can reach you here.</p>
</div>`,
      text: "Email delivery works. This is a test from Loopin Settings.",
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error || "Failed to send test email", skipped: result.skipped },
        { status: result.skipped ? 400 : 500 }
      );
    }

    return NextResponse.json({ ok: true, id: result.id });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal Server Error" },
      { status: 500 }
    );
  }
}
