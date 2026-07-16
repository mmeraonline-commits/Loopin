import { NextRequest, NextResponse } from "next/server";
import { hasInsforgeAdminKey } from "@/lib/insforge-admin";
import { fetchInboxItems } from "@/lib/inbox";
import { denySurface, isNextResponse, loadUserPlan } from "@/lib/plan-usage";

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Internal Server Error";
}

export async function GET(req: NextRequest) {
  try {
    if (!hasInsforgeAdminKey) {
      return NextResponse.json(
        { error: "INSFORGE_API_KEY is required to load inbox with RLS enabled." },
        { status: 503 }
      );
    }

    const userId = req.nextUrl.searchParams.get("userId");
    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    const user = await loadUserPlan(userId);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    const locked = denySurface(user.plan, "inbox", "Unified inbox");
    if (locked) return locked;

    const { items, connectedApps } = await fetchInboxItems(userId);

    return NextResponse.json({
      items,
      connectedApps,
      counts: {
        total: items.length,
        unread: items.filter((item) => item.unread).length,
        needsReply: items.filter((item) => item.needsReply).length,
        draftReady: items.filter((item) => item.needsReply && !!item.draftReply).length,
        byApp: connectedApps.reduce<Record<string, number>>((acc, app) => {
          acc[app] = items.filter((item) => item.app === app).length;
          return acc;
        }, {}),
      },
    });
  } catch (err: unknown) {
    console.error("Error in GET /api/inbox:", err);
    return NextResponse.json({ error: getErrorMessage(err) }, { status: 500 });
  }
}
