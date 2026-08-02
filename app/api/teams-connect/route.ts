import { NextRequest, NextResponse } from "next/server";
import { hasInsforgeAdminKey, insforgeAdmin } from "@/lib/insforge-admin";
import { getAppUrl, updateUserIntegration } from "@/lib/integrations";
import { isNextResponse, requireChannelAccess } from "@/lib/plan-gate";

const TEAMS_SCOPES = [
  "openid",
  "profile",
  "offline_access",
  "User.Read",
  "Chat.ReadWrite",
  "ChannelMessage.Read.All",
  "ChannelMessage.Send",
  "Team.ReadBasic.All",
  "Channel.ReadBasic.All",
].join(" ");

function defaultRedirectUri() {
  return `${getAppUrl()}/auth/teams-callback`;
}

function resolveRedirectUri(requested?: string | null) {
  const fallback = defaultRedirectUri();
  if (!requested || typeof requested !== "string") return fallback;
  try {
    const url = new URL(requested);
    if (url.pathname.replace(/\/$/, "") !== "/auth/teams-callback") return fallback;
    const host = url.hostname;
    const allowed =
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === new URL(getAppUrl()).hostname;
    if (!allowed) return fallback;
    return `${url.origin}/auth/teams-callback`;
  } catch {
    return fallback;
  }
}

export async function GET() {
  const clientId = process.env.MICROSOFT_CLIENT_ID || process.env.OUTLOOK_CLIENT_ID || "";
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET || process.env.OUTLOOK_CLIENT_SECRET || "";
  const redirectUri = defaultRedirectUri();
  const authUrl = clientId
    ? `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=${encodeURIComponent(clientId)}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&response_mode=query&scope=${encodeURIComponent(TEAMS_SCOPES)}`
    : "";

  return NextResponse.json({
    clientId,
    authUrl,
    redirectUri,
    scopes: TEAMS_SCOPES,
    configured: Boolean(clientId && clientSecret),
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
      const channelGate = await requireChannelAccess(userId, "teams");
      if (isNextResponse(channelGate)) return channelGate;
      if (!hasInsforgeAdminKey) {
        return NextResponse.json(
          { error: "Server database key is not configured (INSFORGE_API_KEY)." },
          { status: 500 }
        );
      }
      const result = await updateUserIntegration(insforgeAdmin.database, userId, "teams", {
        connected: true,
        isSimulated: true,
        email: "simulated@teams.loopin",
        displayName: "Simulated Teams",
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
      const result = await updateUserIntegration(insforgeAdmin.database, userId, "teams", null);
      if (result.error) {
        return NextResponse.json({ error: result.error }, { status: 500 });
      }
      return NextResponse.json({ success: true, status: "disconnected" });
    }

    if (!code) {
      return NextResponse.json(
        { error: "Authorization code and User ID are required." },
        { status: 400 }
      );
    }

    const channelGate = await requireChannelAccess(userId, "teams");
    if (isNextResponse(channelGate)) return channelGate;

    if (!hasInsforgeAdminKey) {
      return NextResponse.json(
        { error: "Server database key is not configured (INSFORGE_API_KEY)." },
        { status: 500 }
      );
    }

    const clientId = process.env.MICROSOFT_CLIENT_ID || process.env.OUTLOOK_CLIENT_ID;
    const clientSecret = process.env.MICROSOFT_CLIENT_SECRET || process.env.OUTLOOK_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return NextResponse.json(
        {
          error:
            "Microsoft OAuth credentials (MICROSOFT_CLIENT_ID / MICROSOFT_CLIENT_SECRET) are not configured.",
        },
        { status: 500 }
      );
    }

    const redirectUri = resolveRedirectUri(requestedRedirect);
    const tokenRes = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
        scope: TEAMS_SCOPES,
      }),
    });

    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || tokenData.error) {
      return NextResponse.json(
        {
          error: `Microsoft OAuth exchange failed (redirect_uri=${redirectUri}): ${
            tokenData.error_description || tokenData.error || tokenRes.statusText
          }`,
        },
        { status: 400 }
      );
    }

    const { access_token, refresh_token, expires_in } = tokenData;

    let email: string | null = null;
    let displayName: string | null = null;
    try {
      const meRes = await fetch("https://graph.microsoft.com/v1.0/me", {
        headers: { Authorization: `Bearer ${access_token}` },
      });
      if (meRes.ok) {
        const me = await meRes.json();
        email = me.mail || me.userPrincipalName || null;
        displayName = me.displayName || null;
      }
    } catch {
      // optional
    }

    const result = await updateUserIntegration(insforgeAdmin.database, userId, "teams", {
      connected: true,
      accessToken: access_token,
      refreshToken: refresh_token || null,
      expiresAt: Date.now() + (expires_in || 3600) * 1000,
      email,
      displayName,
      isSimulated: false,
      connectedAt: new Date().toISOString(),
    });

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({ success: true, email, displayName });
  } catch (err: unknown) {
    console.error("Teams connect exception:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal Server Error" },
      { status: 500 }
    );
  }
}
