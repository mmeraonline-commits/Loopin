import { NextRequest, NextResponse } from "next/server";
import { isAdminResponse, requireAdmin } from "@/lib/admin-auth";
import { getFeatureFlags, setFeatureFlags, type FeatureFlags } from "@/lib/app-settings";

export async function GET(req: NextRequest) {
  const admin = requireAdmin(req);
  if (isAdminResponse(admin)) return admin;

  try {
    const flags = await getFeatureFlags();
    return NextResponse.json({ flags });
  } catch (err: unknown) {
    console.error("[admin/features GET]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal Server Error" },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  const admin = requireAdmin(req);
  if (isAdminResponse(admin)) return admin;

  try {
    const body = await req.json();
    const flags = body.flags as FeatureFlags | undefined;
    if (!flags || typeof flags !== "object") {
      return NextResponse.json({ error: "flags object is required" }, { status: 400 });
    }

    const result = await setFeatureFlags(flags);
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    const saved = await getFeatureFlags();
    return NextResponse.json({ flags: saved });
  } catch (err: unknown) {
    console.error("[admin/features PUT]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal Server Error" },
      { status: 500 }
    );
  }
}
