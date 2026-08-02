import { NextRequest, NextResponse } from "next/server";
import { hasInsforgeAdminKey, insforgeAdmin } from "@/lib/insforge-admin";
import { getAppUrl, updateUserIntegration } from "@/lib/integrations";
import { isNextResponse, requireChannelAccess } from "@/lib/plan-gate";

const CALENDAR_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/calendar.events",
].join(" ");

function defaultRedirectUri() {
  return `${getAppUrl()}/auth/google-calendar-callback`;
}

/** Accept browser origin redirect so local :3000/:3001 matches the authorize step. */
function resolveRedirectUri(requested?: string | null) {
  const fallback = defaultRedirectUri();
  if (!requested || typeof requested !== "string") return fallback;
  try {
    const url = new URL(requested);
    if (url.pathname.replace(/\/$/, "") !== "/auth/google-calendar-callback") {
      return fallback;
    }
    const host = url.hostname;
    const allowed =
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === new URL(getAppUrl()).hostname;
    if (!allowed) return fallback;
    return `${url.origin}/auth/google-calendar-callback`;
  } catch {
    return fallback;
  }
}

export async function GET() {
  const clientId = process.env.GOOGLE_CLIENT_ID || "";
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || "";
  const redirectUri = defaultRedirectUri();
  const authUrl =
    clientId && clientId !== "your_google_client_id_here"
      ? `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(CALENDAR_SCOPES)}&access_type=offline&prompt=consent`
      : "";

  return NextResponse.json({
    clientId,
    authUrl,
    redirectUri,
    scopes: CALENDAR_SCOPES,
    configured: Boolean(
      authUrl && clientSecret && clientSecret !== "your_google_client_secret_here"
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
      const channelGate = await requireChannelAccess(userId, "google_calendar");
      if (isNextResponse(channelGate)) return channelGate;

      if (!hasInsforgeAdminKey) {
        return NextResponse.json(
          { error: "Server database key is not configured (INSFORGE_API_KEY)." },
          { status: 500 }
        );
      }

      const result = await updateUserIntegration(
        insforgeAdmin.database,
        userId,
        "google_calendar",
        {
          connected: true,
          isSimulated: true,
          email: "simulated@calendar.loopin",
          connectedAt: new Date().toISOString(),
        }
      );
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
      const result = await updateUserIntegration(
        insforgeAdmin.database,
        userId,
        "google_calendar",
        null
      );
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

    const channelGate = await requireChannelAccess(userId, "google_calendar");
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
        {
          error:
            "Google OAuth credentials (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET) are not configured.",
        },
        { status: 500 }
      );
    }

    const redirectUri = resolveRedirectUri(requestedRedirect);

    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return NextResponse.json(
        {
          error: `Google OAuth code exchange failed (redirect_uri=${redirectUri}): ${errText}`,
        },
        { status: response.status }
      );
    }

    const data = await response.json();
    const { access_token, refresh_token, expires_in } = data;

    let email = "";
    try {
      const profileRes = await fetch(
        "https://www.googleapis.com/oauth2/v2/userinfo",
        { headers: { Authorization: `Bearer ${access_token}` } }
      );
      if (profileRes.ok) {
        const profile = await profileRes.json();
        email = profile.email || "";
      }
    } catch {
      // optional
    }

    // Preserve prior refresh token if Google omits it on re-consent
    let priorRefresh: string | undefined;
    try {
      const { data: dbUser } = await insforgeAdmin.database
        .from("users")
        .select("integrations")
        .eq("id", userId)
        .maybeSingle();
      priorRefresh = (dbUser?.integrations?.google_calendar as { refreshToken?: string } | undefined)
        ?.refreshToken;
    } catch {
      // continue; updateUserIntegration will load again
    }

    const payload = {
      connected: true,
      accessToken: access_token,
      refreshToken: refresh_token || priorRefresh || null,
      expiresAt: Date.now() + (expires_in || 3600) * 1000,
      isSimulated: false,
      email,
      connectedAt: new Date().toISOString(),
    };

    let result = await updateUserIntegration(
      insforgeAdmin.database,
      userId,
      "google_calendar",
      payload
    );

    // One retry for transient InsForge "fetch failed" blips
    if (result.error && /fetch failed|network request failed/i.test(result.error)) {
      await new Promise((r) => setTimeout(r, 600));
      result = await updateUserIntegration(
        insforgeAdmin.database,
        userId,
        "google_calendar",
        payload
      );
    }

    if (result.error) {
      return NextResponse.json(
        {
          error: `Saved Google tokens but failed to write integration: ${result.error}. Check INSFORGE_API_KEY / network and try again.`,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, email });
  } catch (err: unknown) {
    console.error("Google Calendar connect exception:", err);
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json(
      {
        error: /fetch failed|network request failed|InsForge/i.test(message)
          ? `Database unreachable (${message}). Check INSFORGE_API_KEY and NEXT_PUBLIC_INSFORGE_URL, then retry.`
          : message,
      },
      { status: 500 }
    );
  }
}
