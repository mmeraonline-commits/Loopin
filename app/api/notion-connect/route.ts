import { NextRequest, NextResponse } from "next/server";
import { hasInsforgeAdminKey, insforgeAdmin } from "@/lib/insforge-admin";
import { getAppUrl, updateUserIntegration } from "@/lib/integrations";
import { isNextResponse, requireChannelAccess } from "@/lib/plan-gate";

function defaultRedirectUri() {
  return `${getAppUrl()}/auth/notion-callback`;
}

function resolveRedirectUri(requested?: string | null) {
  const fallback = defaultRedirectUri();
  if (!requested || typeof requested !== "string") return fallback;
  try {
    const url = new URL(requested);
    if (url.pathname.replace(/\/$/, "") !== "/auth/notion-callback") return fallback;
    const host = url.hostname;
    const allowed =
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === new URL(getAppUrl()).hostname;
    if (!allowed) return fallback;
    return `${url.origin}/auth/notion-callback`;
  } catch {
    return fallback;
  }
}

export async function GET() {
  const clientId = process.env.NOTION_CLIENT_ID || "";
  const clientSecret = process.env.NOTION_CLIENT_SECRET || "";
  const redirectUri = defaultRedirectUri();
  const authUrl =
    clientId && clientId !== "your_notion_client_id_here"
      ? `https://api.notion.com/v1/oauth/authorize?client_id=${encodeURIComponent(clientId)}&response_type=code&owner=user&redirect_uri=${encodeURIComponent(redirectUri)}`
      : "";

  return NextResponse.json({
    clientId,
    authUrl,
    redirectUri,
    configured: Boolean(
      authUrl && clientSecret && clientSecret !== "your_notion_client_secret_here"
    ),
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { code, userId, action, redirectUri: requestedRedirect } = body as {
      code?: string;
      userId?: string;
      action?: string;
      redirectUri?: string;
    };

    if (!userId) {
      return NextResponse.json({ error: "User ID is required." }, { status: 400 });
    }

    if (action === "connect-simulated") {
      const channelGate = await requireChannelAccess(userId, "notion");
      if (isNextResponse(channelGate)) return channelGate;
      if (!hasInsforgeAdminKey) {
        return NextResponse.json(
          { error: "Server database key is not configured (INSFORGE_API_KEY)." },
          { status: 500 }
        );
      }
      const result = await updateUserIntegration(insforgeAdmin.database, userId, "notion", {
        connected: true,
        isSimulated: true,
        workspaceName: "Simulated Workspace",
        workspaceId: "sim-workspace",
        connectedAt: new Date().toISOString(),
      });
      if (result.error) {
        return NextResponse.json({ error: result.error }, { status: 500 });
      }
      return NextResponse.json({ success: true, status: "connected", isSimulated: true });
    }

    if (action === "disconnect") {
      if (!hasInsforgeAdminKey) {
        return NextResponse.json(
          { error: "Server database key is not configured (INSFORGE_API_KEY)." },
          { status: 500 }
        );
      }
      const result = await updateUserIntegration(insforgeAdmin.database, userId, "notion", null);
      if (result.error) {
        return NextResponse.json({ error: result.error }, { status: 500 });
      }
      return NextResponse.json({ success: true, status: "disconnected" });
    }

    if (action === "save-defaults") {
      if (!hasInsforgeAdminKey) {
        return NextResponse.json(
          { error: "Server database key is not configured (INSFORGE_API_KEY)." },
          { status: 500 }
        );
      }
      const channelGate = await requireChannelAccess(userId, "notion");
      if (isNextResponse(channelGate)) return channelGate;

      const {
        defaultParentPageId,
        defaultParentPageTitle,
        defaultDatabaseId,
        defaultDatabaseTitle,
      } = body as {
        defaultParentPageId?: string | null;
        defaultParentPageTitle?: string | null;
        defaultDatabaseId?: string | null;
        defaultDatabaseTitle?: string | null;
      };

      const { data: dbUser } = await insforgeAdmin.database
        .from("users")
        .select("integrations")
        .eq("id", userId)
        .maybeSingle();
      const current = (dbUser?.integrations?.notion || {}) as Record<string, unknown>;
      if (!current.connected) {
        return NextResponse.json({ error: "Notion is not connected." }, { status: 400 });
      }

      const result = await updateUserIntegration(insforgeAdmin.database, userId, "notion", {
        ...current,
        defaultParentPageId: defaultParentPageId || null,
        defaultParentPageTitle: defaultParentPageTitle || null,
        defaultDatabaseId: defaultDatabaseId || null,
        defaultDatabaseTitle: defaultDatabaseTitle || null,
      });
      if (result.error) {
        return NextResponse.json({ error: result.error }, { status: 500 });
      }
      return NextResponse.json({ success: true });
    }

    if (!code) {
      return NextResponse.json(
        { error: "Authorization code and User ID are required." },
        { status: 400 }
      );
    }

    const channelGate = await requireChannelAccess(userId, "notion");
    if (isNextResponse(channelGate)) return channelGate;

    if (!hasInsforgeAdminKey) {
      return NextResponse.json(
        { error: "Server database key is not configured (INSFORGE_API_KEY)." },
        { status: 500 }
      );
    }

    const clientId = process.env.NOTION_CLIENT_ID;
    const clientSecret = process.env.NOTION_CLIENT_SECRET;
    if (!clientId || !clientSecret || clientId === "your_notion_client_id_here") {
      return NextResponse.json(
        {
          error:
            "Notion OAuth credentials (NOTION_CLIENT_ID / NOTION_CLIENT_SECRET) are not configured.",
        },
        { status: 500 }
      );
    }

    const redirectUri = resolveRedirectUri(requestedRedirect);
    const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    const tokenRes = await fetch("https://api.notion.com/v1/oauth/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      }),
    });

    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || tokenData.error) {
      return NextResponse.json(
        {
          error: `Notion OAuth exchange failed (redirect_uri=${redirectUri}): ${
            tokenData.error_description || tokenData.message || tokenData.error || tokenRes.statusText
          }`,
        },
        { status: 400 }
      );
    }

    const result = await updateUserIntegration(insforgeAdmin.database, userId, "notion", {
      connected: true,
      accessToken: tokenData.access_token,
      workspaceId: tokenData.workspace_id || null,
      workspaceName: tokenData.workspace_name || null,
      botId: tokenData.bot_id || null,
      isSimulated: false,
      connectedAt: new Date().toISOString(),
    });

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      workspaceName: tokenData.workspace_name || null,
    });
  } catch (err: unknown) {
    console.error("Notion connect exception:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal Server Error" },
      { status: 500 }
    );
  }
}
