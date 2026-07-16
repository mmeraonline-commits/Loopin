import { NextRequest, NextResponse } from "next/server";
import { hasInsforgeAdminKey, insforgeAdmin } from "@/lib/insforge-admin";
import { getAppUrl, updateUserIntegration } from "@/lib/integrations";
import { isNextResponse, requireChannelAccess } from "@/lib/plan-gate";

const LINKEDIN_SCOPES = ["openid", "profile", "email", "w_member_social"].join(" ");

export async function GET() {
  const clientId = process.env.LINKEDIN_CLIENT_ID || "";
  const redirectUri = `${getAppUrl()}/auth/linkedin-callback`;
  const authUrl = clientId
    ? `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(LINKEDIN_SCOPES)}`
    : "";

  return NextResponse.json({
    clientId,
    authUrl,
    configured: Boolean(clientId && process.env.LINKEDIN_CLIENT_SECRET),
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

    const channelGate = await requireChannelAccess(userId, "linkedin");
    if (isNextResponse(channelGate)) return channelGate;

    if (!hasInsforgeAdminKey) {
      return NextResponse.json(
        { error: "Server database key is not configured (INSFORGE_API_KEY)." },
        { status: 500 }
      );
    }

    const clientId = process.env.LINKEDIN_CLIENT_ID;
    const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return NextResponse.json(
        {
          error:
            "LinkedIn OAuth credentials (LINKEDIN_CLIENT_ID / LINKEDIN_CLIENT_SECRET) are not configured.",
        },
        { status: 500 }
      );
    }

    const redirectUri = `${getAppUrl()}/auth/linkedin-callback`;
    const tokenRes = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });

    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || tokenData.error) {
      return NextResponse.json(
        {
          error: `LinkedIn OAuth exchange failed: ${tokenData.error_description || tokenData.error || tokenRes.statusText}`,
        },
        { status: 400 }
      );
    }

    const accessToken = tokenData.access_token as string | undefined;
    if (!accessToken) {
      return NextResponse.json({ error: "LinkedIn did not return an access token." }, { status: 400 });
    }

    const meRes = await fetch("https://api.linkedin.com/v2/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const me = await meRes.json();
    if (!meRes.ok) {
      return NextResponse.json(
        { error: me.error_description || me.message || "Failed to load LinkedIn profile." },
        { status: 400 }
      );
    }

    const result = await updateUserIntegration(insforgeAdmin.database, userId, "linkedin", {
      connected: true,
      accessToken,
      refreshToken: tokenData.refresh_token || null,
      expiresAt: tokenData.expires_in ? Date.now() + tokenData.expires_in * 1000 : null,
      personId: me.sub || null,
      name: me.name || [me.given_name, me.family_name].filter(Boolean).join(" ") || null,
      email: me.email || null,
      picture: me.picture || null,
      isSimulated: false,
      connectedAt: new Date().toISOString(),
    });

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      connected: true,
      name: me.name || null,
      email: me.email || null,
    });
  } catch (err: unknown) {
    console.error("LinkedIn connect exception:", err);
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
