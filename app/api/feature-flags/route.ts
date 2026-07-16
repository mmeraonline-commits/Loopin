import { NextRequest, NextResponse } from "next/server";
import { getFeatureFlags } from "@/lib/app-settings";

/** Public read of feature flags for the dashboard (no admin required). */
export async function GET(_req: NextRequest) {
  try {
    const flags = await getFeatureFlags();
    return NextResponse.json({ flags });
  } catch (err: unknown) {
    console.error("[feature-flags]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal Server Error" },
      { status: 500 }
    );
  }
}
