import { NextRequest, NextResponse } from "next/server";
import { hasInsforgeAdminKey, insforgeAdmin } from "@/lib/insforge-admin";
import { getAppUrl, updateUserIntegration } from "@/lib/integrations";
import { isNextResponse, requireChannelAccess } from "@/lib/plan-gate";

const OUTLOOK_SCOPES = [
  "openid",
  "profile",
  "offline_access",
  "User.Read",
  "Mail.Read",
  "Mail.Send",
  "Calendars.ReadWrite",
].join(" ");

export async function GET() {
  const clientId = process.env.MICROSOFT_CLIENT_ID || process.env.OUTLOOK_CLIENT_ID || "";
  const redirectUri = `${getAppUrl()}/auth/outlook-callback`;
  const authUrl = clientId
    ? `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=${encodeURIComponent(clientId)}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&response_mode=query&scope=${encodeURIComponent(OUTLOOK_SCOPES)}`
    : "";

  return NextResponse.json({
    clientId,
    authUrl,
    configured: Boolean(
      clientId && (process.env.MICROSOFT_CLIENT_SECRET || process.env.OUTLOOK_CLIENT_SECRET)
    ),
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

    const channelGate = await requireChannelAccess(userId, "outlook");
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

    const redirectUri = `${getAppUrl()}/auth/outlook-callback`;
    const tokenRes = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
        scope: OUTLOOK_SCOPES,
      }),
    });

    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || tokenData.error) {
      return NextResponse.json(
        {
          error: `Microsoft OAuth exchange failed: ${tokenData.error_description || tokenData.error || tokenRes.statusText}`,
        },
        { status: 400 }
      );
    }

    const { access_token, refresh_token, expires_in } = tokenData;

    let email: string | null = null;
    try {
      const meRes = await fetch("https://graph.microsoft.com/v1.0/me", {
        headers: { Authorization: `Bearer ${access_token}` },
      });
      if (meRes.ok) {
        const me = await meRes.json();
        email = me.mail || me.userPrincipalName || null;
      }
    } catch {
      // optional profile enrichment
    }

    const result = await updateUserIntegration(insforgeAdmin.database, userId, "outlook", {
      connected: true,
      accessToken: access_token,
      refreshToken: refresh_token || null,
      expiresAt: Date.now() + (expires_in || 3600) * 1000,
      email,
      isSimulated: false,
      connectedAt: new Date().toISOString(),
    });

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      connected: true,
      email,
    });
  } catch (err: unknown) {
    console.error("Outlook connect exception:", err);
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
