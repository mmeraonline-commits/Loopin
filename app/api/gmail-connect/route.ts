import { NextRequest, NextResponse } from "next/server";
import { hasInsforgeAdminKey, insforgeAdmin } from "@/lib/insforge-admin";
import { getAppUrl } from "@/lib/integrations";
import { isNextResponse, requireChannelAccess } from "@/lib/plan-gate";

const GMAIL_SCOPES = "https://www.googleapis.com/auth/gmail.modify";

export async function GET() {
  const clientId = process.env.GOOGLE_CLIENT_ID || "";
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || "";
  const redirectUri = `${getAppUrl()}/auth/gmail-callback`;
  const authUrl =
    clientId && clientId !== "your_google_client_id_here"
      ? `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(GMAIL_SCOPES)}&access_type=offline&prompt=consent`
      : "";

  return NextResponse.json({
    clientId,
    authUrl,
    redirectUri,
    configured: Boolean(authUrl && clientSecret && clientSecret !== "your_google_client_secret_here"),
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

    const channelGate = await requireChannelAccess(userId, "gmail");
    if (isNextResponse(channelGate)) return channelGate;

    if (!hasInsforgeAdminKey) {
      return NextResponse.json(
        { error: "Server database key is not configured (INSFORGE_API_KEY)." },
        { status: 500 }
      );
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    if (!clientId || !clientSecret || clientId === "your_google_client_id_here") {
      return NextResponse.json(
        { error: "Google OAuth credentials (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET) are not configured in the server's .env file." },
        { status: 500 }
      );
    }

    const redirectUri = `${getAppUrl()}/auth/gmail-callback`;

    // Exchange code for tokens
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code"
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      return NextResponse.json(
        { error: `Google OAuth code exchange failed: ${errText}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    const { access_token, refresh_token, expires_in } = data;

    // Fetch existing user record to preserve other integrations
    const { data: dbUser, error: dbError } = await insforgeAdmin.database
      .from("users")
      .select("integrations")
      .eq("id", userId)
      .maybeSingle();

    if (dbError) {
      return NextResponse.json(
        { error: `Failed to fetch user integrations from database: ${dbError.message}` },
        { status: 500 }
      );
    }

    if (!dbUser) {
      return NextResponse.json(
        { error: "User not found in database. Sign in again, then reconnect Gmail." },
        { status: 404 }
      );
    }

    const currentIntegrations = dbUser.integrations || {};
    const updatedIntegrations = {
      ...currentIntegrations,
      gmail: {
        connected: true,
        accessToken: access_token,
        refreshToken: refresh_token || currentIntegrations.gmail?.refreshToken, // refresh_token is only returned on first authorization prompt
        expiresAt: Date.now() + (expires_in || 3600) * 1000,
        isSimulated: false,
        email: "" // Optional metadata to store user's gmail address
      }
    };

    // Update user integrations
    const { data: updatedRows, error: updateError } = await insforgeAdmin.database
      .from("users")
      .update({ integrations: updatedIntegrations })
      .eq("id", userId)
      .select("id, integrations");

    if (updateError) {
      return NextResponse.json(
        { error: `Failed to save Gmail integration to database: ${updateError.message}` },
        { status: 500 }
      );
    }

    if (!updatedRows || updatedRows.length === 0) {
      return NextResponse.json(
        { error: "Gmail tokens were received but no user row was updated." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      connected: !!updatedRows[0]?.integrations?.gmail?.connected
    });

  } catch (err: any) {
    console.error("Gmail connect exception:", err);
    return NextResponse.json(
      { error: err.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}
