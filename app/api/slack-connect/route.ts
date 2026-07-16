import { NextRequest, NextResponse } from "next/server";
import { hasInsforgeAdminKey, insforgeAdmin } from "@/lib/insforge-admin";
import { getAppUrl, updateUserIntegration } from "@/lib/integrations";
import { isNextResponse, requireChannelAccess } from "@/lib/plan-gate";

const SLACK_SCOPES = [
  "channels:history",
  "channels:read",
  "groups:history",
  "groups:read",
  "im:history",
  "im:read",
  "mpim:history",
  "mpim:read",
  "chat:write",
  "users:read",
].join(",");

export async function GET() {
  const clientId = process.env.SLACK_CLIENT_ID || "";
  const redirectUri = `${getAppUrl()}/auth/slack-callback`;
  const authUrl = clientId
    ? `https://slack.com/oauth/v2/authorize?client_id=${encodeURIComponent(clientId)}&user_scope=${encodeURIComponent(SLACK_SCOPES)}&redirect_uri=${encodeURIComponent(redirectUri)}`
    : "";

  return NextResponse.json({
    clientId,
    authUrl,
    configured: Boolean(clientId && process.env.SLACK_CLIENT_SECRET),
  });
}

export async function POST(req: NextRequest) {
  try {
    const { code, userId } = await req.json();

    if (!code || !userId) {
      return NextResponse.json(
        { error: "Authorization code and User ID are required." },
        { status: 400 }
      );
    }

    const channelGate = await requireChannelAccess(userId, "slack");
    if (isNextResponse(channelGate)) return channelGate;

    if (!hasInsforgeAdminKey) {
      return NextResponse.json(
        { error: "Server database key is not configured (INSFORGE_API_KEY)." },
        { status: 500 }
      );
    }

    const clientId = process.env.SLACK_CLIENT_ID;
    const clientSecret = process.env.SLACK_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return NextResponse.json(
        { error: "Slack OAuth credentials (SLACK_CLIENT_ID / SLACK_CLIENT_SECRET) are not configured." },
        { status: 500 }
      );
    }

    const redirectUri = `${getAppUrl()}/auth/slack-callback`;
    const tokenRes = await fetch("https://slack.com/api/oauth.v2.access", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
      }),
    });

    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.ok) {
      return NextResponse.json(
        { error: `Slack OAuth exchange failed: ${tokenData.error || tokenRes.statusText}` },
        { status: 400 }
      );
    }

    const accessToken =
      tokenData.authed_user?.access_token ||
      tokenData.access_token;
    const refreshToken =
      tokenData.authed_user?.refresh_token ||
      tokenData.refresh_token ||
      null;
    const expiresIn =
      tokenData.authed_user?.expires_in ||
      tokenData.expires_in ||
      null;

    if (!accessToken) {
      return NextResponse.json(
        { error: "Slack did not return an access token. Check OAuth scopes." },
        { status: 400 }
      );
    }

    const result = await updateUserIntegration(insforgeAdmin.database, userId, "slack", {
      connected: true,
      accessToken,
      refreshToken,
      expiresAt: expiresIn ? Date.now() + expiresIn * 1000 : null,
      teamId: tokenData.team?.id || null,
      teamName: tokenData.team?.name || null,
      slackUserId: tokenData.authed_user?.id || tokenData.bot_user_id || null,
      isSimulated: false,
      connectedAt: new Date().toISOString(),
    });

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      connected: true,
      teamName: tokenData.team?.name || null,
    });
  } catch (err: unknown) {
    console.error("Slack connect exception:", err);
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
