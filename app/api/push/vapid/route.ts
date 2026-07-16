import { NextResponse } from "next/server";
import { isPushConfigured } from "@/lib/push";

export async function GET() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";
  return NextResponse.json({
    configured: isPushConfigured(),
    publicKey,
  });
}
