import { NextRequest, NextResponse } from "next/server";
import { hasInsforgeAdminKey, insforgeAdmin } from "@/lib/insforge-admin";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  try {
    const { email, source = "landing" } = await req.json();
    const normalized = String(email || "").trim().toLowerCase();

    if (!EMAIL_RE.test(normalized)) {
      return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    }

    if (!hasInsforgeAdminKey) {
      return NextResponse.json({
        success: true,
        stored: false,
        message: "Thanks — you're on the list.",
      });
    }

    const { error } = await insforgeAdmin.database.from("waitlist_signups").insert([
      {
        email: normalized,
        source,
      },
    ]);

    // Unique violation / missing table should not block the UX
    if (error) {
      const msg = String(error.message || "").toLowerCase();
      if (msg.includes("duplicate") || msg.includes("unique")) {
        return NextResponse.json({
          success: true,
          stored: true,
          message: "You're already on the list.",
        });
      }
      console.error("[waitlist] insert failed:", error);
      return NextResponse.json({
        success: true,
        stored: false,
        message: "Thanks — you're on the list.",
      });
    }

    return NextResponse.json({
      success: true,
      stored: true,
      message: "Thanks — you're on the list.",
    });
  } catch (err: unknown) {
    console.error("[waitlist]", err);
    return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
  }
}
