import { NextRequest, NextResponse } from "next/server";
import { hasInsforgeAdminKey, insforgeAdmin } from "@/lib/insforge-admin";
import { getAppUrl, updateUserIntegration } from "@/lib/integrations";
import { isNextResponse, requireChannelAccess } from "@/lib/plan-gate";

const DISCORD_SCOPES = ["identify", "guilds", "bot"].join(" ");
const DISCORD_BOT_PERMISSIONS = "68608";

export async function GET() {
  const clientId = process.env.DISCORD_CLIENT_ID || "";
  const redirectUri = `${getAppUrl()}/auth/discord-callback`;
  const authUrl = clientId
    ? `https://discord.com/api/oauth2/authorize?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(DISCORD_SCOPES)}&permissions=${DISCORD_BOT_PERMISSIONS}`
    : "";

  return NextResponse.json({
    clientId,
    authUrl,
    configured: Boolean(clientId && process.env.DISCORD_CLIENT_SECRET),
    botConfigured: Boolean(process.env.DISCORD_BOT_TOKEN),
  });
}

export async function POST(req: NextRequest) {
  try {
    const { code, userId, guildId } = await req.json();

    if (!code || !userId) {
      return NextResponse.json(
        { error: "Authorization code and User ID are required." },
        { status: 400 }
      );
    }

    const channelGate = await requireChannelAccess(userId, "discord");
    if (isNextResponse(channelGate)) return channelGate;

    if (!hasInsforgeAdminKey) {
      return NextResponse.json(
        { error: "Server database key is not configured (INSFORGE_API_KEY)." },
        { status: 500 }
      );
    }

    const clientId = process.env.DISCORD_CLIENT_ID;
    const clientSecret = process.env.DISCORD_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return NextResponse.json(
        { error: "Discord OAuth credentials (DISCORD_CLIENT_ID / DISCORD_CLIENT_SECRET) are not configured." },
        { status: 500 }
      );
    }

    const redirectUri = `${getAppUrl()}/auth/discord-callback`;
    const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      }),
    });

    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || tokenData.error) {
      return NextResponse.json(
        {
          error: `Discord OAuth exchange failed: ${tokenData.error_description || tokenData.error || tokenRes.statusText}`,
        },
        { status: 400 }
      );
    }

    const accessToken = tokenData.access_token as string | undefined;
    if (!accessToken) {
      return NextResponse.json({ error: "Discord did not return an access token." }, { status: 400 });
    }

    const meRes = await fetch("https://discord.com/api/users/@me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const me = await meRes.json();

    const result = await updateUserIntegration(insforgeAdmin.database, userId, "discord", {
      connected: true,
      accessToken,
      refreshToken: tokenData.refresh_token || null,
      expiresAt: tokenData.expires_in ? Date.now() + tokenData.expires_in * 1000 : null,
      discordUserId: me?.id || null,
      username: me?.username || null,
      globalName: me?.global_name || null,
      guildId: guildId || tokenData.guild?.id || null,
      guildName: tokenData.guild?.name || null,
      isSimulated: false,
      connectedAt: new Date().toISOString(),
    });

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      connected: true,
      username: me?.username || null,
      guildName: tokenData.guild?.name || null,
    });
  } catch (err: unknown) {
    console.error("Discord connect exception:", err);
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
