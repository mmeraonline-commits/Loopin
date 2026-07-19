import { NextRequest, NextResponse } from "next/server";
import { isEmailConfigured, sendEmailToUser } from "@/lib/email";
import { buildTestEmailTemplate } from "@/lib/email-templates";
import { hasInsforgeAdminKey, insforgeAdmin } from "@/lib/insforge-admin";

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

    let recipientName = "";
    if (hasInsforgeAdminKey) {
      const { data } = await insforgeAdmin.database
        .from("users")
        .select("name, email")
        .eq("id", userId)
        .maybeSingle();
      recipientName =
        (typeof data?.name === "string" && data.name) ||
        (typeof data?.email === "string" ? data.email.split("@")[0] : "") ||
        "";
    }

    const tpl = buildTestEmailTemplate({ recipientName });
    const result = await sendEmailToUser(userId, {
      subject: "Loopin · Email delivery check",
      html: tpl.html,
      text: tpl.text,
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
