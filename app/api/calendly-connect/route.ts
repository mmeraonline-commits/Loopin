import { NextRequest, NextResponse } from "next/server";
import { hasInsforgeAdminKey, insforgeAdmin } from "@/lib/insforge-admin";
import { getAppUrl, updateUserIntegration } from "@/lib/integrations";
import { isNextResponse, requireChannelAccess } from "@/lib/plan-gate";

const CALENDLY_SCOPES = [
  "users:read",
  "event_types:read",
  "event_types:write",
  "scheduled_events:read",
  "scheduled_events:write",
  "webhooks:read",
  "webhooks:write",
].join(" ");

export async function GET() {
  const clientId = process.env.CALENDLY_CLIENT_ID || "";
  const redirectUri = `${getAppUrl()}/auth/calendly-callback`;
  const authUrl = clientId
    ? `https://auth.calendly.com/oauth/authorize?client_id=${encodeURIComponent(clientId)}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(CALENDLY_SCOPES)}`
    : "";

  return NextResponse.json({
    clientId,
    authUrl,
    configured: Boolean(clientId && process.env.CALENDLY_CLIENT_SECRET),
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

    const channelGate = await requireChannelAccess(userId, "calendly");
    if (isNextResponse(channelGate)) return channelGate;

    if (!hasInsforgeAdminKey) {
      return NextResponse.json(
        { error: "Server database key is not configured (INSFORGE_API_KEY)." },
        { status: 500 }
      );
    }

    const clientId = process.env.CALENDLY_CLIENT_ID;
    const clientSecret = process.env.CALENDLY_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return NextResponse.json(
        { error: "Calendly OAuth credentials are not configured." },
        { status: 500 }
      );
    }

    const redirectUri = `${getAppUrl()}/auth/calendly-callback`;
    const tokenRes = await fetch("https://auth.calendly.com/oauth/token", {
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
          error: `Calendly OAuth failed: ${tokenData.error_description || tokenData.error || tokenRes.statusText}`,
        },
        { status: 400 }
      );
    }

    const accessToken = tokenData.access_token as string | undefined;
    if (!accessToken) {
      return NextResponse.json({ error: "Calendly did not return an access token." }, { status: 400 });
    }

    const meRes = await fetch("https://api.calendly.com/users/me", {
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    });
    const meJson = await meRes.json();
    if (!meRes.ok) {
      return NextResponse.json(
        { error: meJson.title || meJson.message || "Failed to load Calendly user." },
        { status: 400 }
      );
    }

    const resource = meJson.resource || {};
    const result = await updateUserIntegration(insforgeAdmin.database, userId, "calendly", {
      connected: true,
      accessToken,
      refreshToken: tokenData.refresh_token || null,
      expiresAt: tokenData.expires_in ? Date.now() + tokenData.expires_in * 1000 : null,
      userUri: resource.uri || null,
      organizationUri: resource.current_organization || null,
      email: resource.email || null,
      name: resource.name || null,
      schedulingUrl: resource.scheduling_url || null,
      isSimulated: false,
      connectedAt: new Date().toISOString(),
    });

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      connected: true,
      name: resource.name || null,
      email: resource.email || null,
    });
  } catch (err: unknown) {
    console.error("Calendly connect exception:", err);
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
