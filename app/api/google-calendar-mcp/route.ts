import { NextRequest, NextResponse } from "next/server";
import { hasInsforgeAdminKey, insforgeAdmin } from "@/lib/insforge-admin";
import { updateUserIntegration } from "@/lib/integrations";
import { trackFeatureUsage } from "@/lib/track-feature-usage";

type GoogleCalendarIntegration = {
  connected?: boolean;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  isSimulated?: boolean;
  email?: string;
};

function mcpText(payload: unknown) {
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
  };
}

const SIMULATED_EVENTS = [
  {
    id: "gcal_sim_1",
    title: "Product sync",
    start: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    end: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
    location: "Meet",
  },
  {
    id: "gcal_sim_2",
    title: "Vendor contract review",
    start: new Date(Date.now() + 26 * 60 * 60 * 1000).toISOString(),
    end: new Date(Date.now() + 27 * 60 * 60 * 1000).toISOString(),
    location: "",
  },
];

async function getIntegration(userId: string): Promise<{
  integrations: Record<string, unknown>;
  gcal: GoogleCalendarIntegration | null;
}> {
  const { data: dbUser, error } = await insforgeAdmin.database
    .from("users")
    .select("integrations")
    .eq("id", userId)
    .maybeSingle();
  if (error || !dbUser) return { integrations: {}, gcal: null };
  return {
    integrations: dbUser.integrations || {},
    gcal: (dbUser.integrations?.google_calendar as GoogleCalendarIntegration) || null,
  };
}

async function getActiveAccessToken(
  userId: string,
  gcal: GoogleCalendarIntegration,
  integrations: Record<string, unknown>
): Promise<string> {
  if (gcal.isSimulated) return "simulated";
  if (!gcal.accessToken) throw new Error("Missing Google Calendar access token");

  const expiresAt = Number(gcal.expiresAt || 0);
  if (expiresAt && Date.now() < expiresAt - 60_000) {
    return gcal.accessToken;
  }

  if (!gcal.refreshToken) {
    throw new Error("Google Calendar token expired and no refresh token is stored. Reconnect.");
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not configured");
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: gcal.refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Failed to refresh Google Calendar token: ${errText}`);
  }

  const data = await res.json();
  const accessToken = data.access_token as string;
  const expiresIn = Number(data.expires_in || 3600);

  await updateUserIntegration(insforgeAdmin.database, userId, "google_calendar", {
    ...(typeof integrations.google_calendar === "object" && integrations.google_calendar
      ? (integrations.google_calendar as Record<string, unknown>)
      : {}),
    connected: true,
    accessToken,
    refreshToken: gcal.refreshToken,
    expiresAt: Date.now() + expiresIn * 1000,
    isSimulated: false,
  });

  return accessToken;
}

async function calendarFetch(
  token: string,
  path: string,
  init?: RequestInit
): Promise<Record<string, unknown>> {
  const res = await fetch(`https://www.googleapis.com/calendar/v3${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      (json as { error?: { message?: string } }).error?.message ||
        `Google Calendar API error (${res.status})`
    );
  }
  return json as Record<string, unknown>;
}

export async function POST(req: NextRequest) {
  try {
    const { method, params, userId, id = 1 } = await req.json();

    if (!method || !userId) {
      return NextResponse.json(
        {
          jsonrpc: "2.0",
          error: { code: -32600, message: "Invalid Request: method and userId are required" },
          id,
        },
        { status: 400 }
      );
    }

    if (!hasInsforgeAdminKey) {
      return NextResponse.json(
        {
          jsonrpc: "2.0",
          error: { code: -32000, message: "INSFORGE_API_KEY is not configured" },
          id,
        },
        { status: 500 }
      );
    }

    const { integrations, gcal } = await getIntegration(userId);
    if (!gcal?.connected) {
      return NextResponse.json(
        {
          jsonrpc: "2.0",
          error: { code: -32001, message: "Google Calendar is not connected." },
          id,
        },
        { status: 400 }
      );
    }

    let result: unknown = null;
    let error: { code: number; message: string } | null = null;

    const isSimulated = !!gcal.isSimulated;
    const token = isSimulated
      ? "simulated"
      : await getActiveAccessToken(userId, gcal, integrations);

    switch (method) {
      case "google_calendar_list_events": {
        if (isSimulated) {
          result = mcpText({ events: SIMULATED_EVENTS });
          break;
        }
        const now = new Date();
        const timeMin = String(params?.timeMin || now.toISOString());
        const timeMax = String(
          params?.timeMax ||
            new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()
        );
        const data = await calendarFetch(
          token,
          `/calendars/primary/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&singleEvents=true&orderBy=startTime&maxResults=20`
        );
        const items = (data.items as Array<Record<string, unknown>>) || [];
        result = mcpText({
          events: items.map((e) => {
            const start = e.start as { dateTime?: string; date?: string } | undefined;
            const end = e.end as { dateTime?: string; date?: string } | undefined;
            return {
              id: e.id,
              title: e.summary || "(no title)",
              start: start?.dateTime || start?.date,
              end: end?.dateTime || end?.date,
              location: e.location || "",
              htmlLink: e.htmlLink || "",
            };
          }),
        });
        break;
      }

      case "google_calendar_create_event": {
        const summary = params?.summary;
        const start = params?.start;
        const end = params?.end;
        const timeZone = String(params?.timeZone || "UTC");
        if (!summary || !start || !end) {
          error = {
            code: -32602,
            message: "Arguments 'summary', 'start', and 'end' are required",
          };
          break;
        }

        if (isSimulated) {
          const simId = `gcal_sim_${Date.now()}`;
          result = mcpText({
            success: true,
            id: simId,
            title: summary,
            start,
            end,
            htmlLink: `https://calendar.google.com/calendar/event?eid=${encodeURIComponent(simId)}`,
            simulated: true,
          });
          break;
        }

        const startDt = String(start);
        const endDt = String(end);
        const created = await calendarFetch(token, "/calendars/primary/events", {
          method: "POST",
          body: JSON.stringify({
            summary,
            description: params?.description || "",
            start: startDt.includes("T")
              ? { dateTime: startDt, timeZone }
              : { date: startDt },
            end: endDt.includes("T")
              ? { dateTime: endDt, timeZone }
              : { date: endDt },
            reminders: {
              useDefault: false,
              overrides: [
                {
                  method: "popup",
                  minutes:
                    typeof params?.reminderMinutesBeforeStart === "number"
                      ? params.reminderMinutesBeforeStart
                      : 30,
                },
              ],
            },
          }),
        });

        result = mcpText({
          success: true,
          id: created.id,
          title: created.summary,
          htmlLink: created.htmlLink,
          start: created.start,
          end: created.end,
        });
        break;
      }

      case "google_calendar_disconnect": {
        await updateUserIntegration(insforgeAdmin.database, userId, "google_calendar", null);
        result = mcpText({ success: true, disconnected: true });
        break;
      }

      default:
        error = { code: -32601, message: `Method not found: ${method}` };
    }

    if (error) {
      return NextResponse.json({ jsonrpc: "2.0", error, id }, { status: 400 });
    }

    void trackFeatureUsage({
      userId,
      feature: "google_calendar",
      action: method || "use",
    });

    return NextResponse.json({ jsonrpc: "2.0", result, id });
  } catch (err: unknown) {
    console.error("Google Calendar MCP exception:", err);
    return NextResponse.json(
      {
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message: err instanceof Error ? err.message : "Internal error",
        },
        id: 1,
      },
      { status: 500 }
    );
  }
}
