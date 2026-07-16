import { NextRequest, NextResponse } from "next/server";
import { hasInsforgeAdminKey, insforgeAdmin } from "@/lib/insforge-admin";
import { updateUserIntegration } from "@/lib/integrations";
import { trackFeatureUsage } from "@/lib/track-feature-usage";

type CalendlyIntegration = {
  connected?: boolean;
  accessToken?: string;
  refreshToken?: string | null;
  expiresAt?: number | null;
  userUri?: string | null;
  organizationUri?: string | null;
  email?: string | null;
  name?: string | null;
  schedulingUrl?: string | null;
  isSimulated?: boolean;
  webhookUri?: string | null;
  webhookUrl?: string | null;
  webhookSigningKey?: string | null;
};

async function getCalendly(userId: string) {
  const { data: dbUser, error } = await insforgeAdmin.database
    .from("users")
    .select("integrations")
    .eq("id", userId)
    .maybeSingle();
  if (error || !dbUser) return { integrations: null, calendly: null as CalendlyIntegration | null };
  return {
    integrations: dbUser.integrations || {},
    calendly: (dbUser.integrations?.calendly as CalendlyIntegration) || null,
  };
}

async function refreshTokenIfNeeded(
  userId: string,
  calendly: CalendlyIntegration,
  integrations: Record<string, unknown>
) {
  if (!calendly.refreshToken) return calendly.accessToken || null;
  const needsRefresh = !calendly.expiresAt || calendly.expiresAt < Date.now() + 60_000;
  if (!needsRefresh && calendly.accessToken) return calendly.accessToken;

  const clientId = process.env.CALENDLY_CLIENT_ID;
  const clientSecret = process.env.CALENDLY_CLIENT_SECRET;
  if (!clientId || !clientSecret) return calendly.accessToken || null;

  const tokenRes = await fetch("https://auth.calendly.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: calendly.refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  const tokenData = await tokenRes.json();
  if (!tokenRes.ok || tokenData.error) {
    throw new Error(tokenData.error_description || tokenData.error || "Calendly token refresh failed");
  }

  const updated = {
    ...calendly,
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token || calendly.refreshToken,
    expiresAt: Date.now() + (tokenData.expires_in || 7200) * 1000,
  };
  await updateUserIntegration(insforgeAdmin.database, userId, "calendly", {
    ...(typeof integrations.calendly === "object" && integrations.calendly
      ? (integrations.calendly as Record<string, unknown>)
      : {}),
    ...updated,
  });
  return updated.accessToken as string;
}

async function calendlyFetch(token: string, path: string, init?: RequestInit) {
  const res = await fetch(`https://api.calendly.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) {
    throw new Error(data.title || data.message || `Calendly API error (${res.status})`);
  }
  return data;
}

function mcpText(payload: unknown) {
  return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
}

export async function POST(req: NextRequest) {
  try {
    const { method, params, userId, id = 1 } = await req.json();
    if (!method || !userId) {
      return NextResponse.json(
        { jsonrpc: "2.0", error: { code: -32600, message: "method and userId required" }, id },
        { status: 400 }
      );
    }
    if (!hasInsforgeAdminKey) {
      return NextResponse.json(
        { jsonrpc: "2.0", error: { code: -32003, message: "INSFORGE_API_KEY missing" }, id },
        { status: 500 }
      );
    }

    const { integrations, calendly } = await getCalendly(userId);
    if (!calendly?.connected || !calendly.accessToken || calendly.isSimulated) {
      return NextResponse.json(
        { jsonrpc: "2.0", error: { code: -32001, message: "Calendly is not connected" }, id },
        { status: 400 }
      );
    }

    const token = await refreshTokenIfNeeded(userId, calendly, integrations || {});
    if (!token) {
      return NextResponse.json(
        { jsonrpc: "2.0", error: { code: -32001, message: "Calendly access token unavailable" }, id },
        { status: 400 }
      );
    }

    let userUri = calendly.userUri;
    if (!userUri) {
      const me = await calendlyFetch(token, "/users/me");
      userUri = me.resource?.uri;
    }

    let result = null;
    let error = null;

    switch (method) {
      case "calendly_get_user": {
        const me = await calendlyFetch(token, "/users/me");
        const r = me.resource || {};
        result = mcpText({
          uri: r.uri,
          name: r.name,
          email: r.email,
          schedulingUrl: r.scheduling_url,
          timezone: r.timezone,
          organization: r.current_organization,
        });
        break;
      }

      case "calendly_list_event_types": {
        const data = await calendlyFetch(
          token,
          `/event_types?user=${encodeURIComponent(userUri || "")}&count=${params?.limit || 20}`
        );
        result = mcpText({
          eventTypes: (data.collection || []).map((e: {
            uri: string;
            name: string;
            duration?: number;
            scheduling_url?: string;
            active?: boolean;
            kind?: string;
          }) => ({
            uri: e.uri,
            name: e.name,
            duration: e.duration,
            schedulingUrl: e.scheduling_url,
            active: e.active,
            kind: e.kind,
          })),
        });
        break;
      }

      case "calendly_list_scheduled_events": {
        const status = params?.status || "active";
        const minStart = params?.minStart || new Date().toISOString();
        const data = await calendlyFetch(
          token,
          `/scheduled_events?user=${encodeURIComponent(userUri || "")}&status=${encodeURIComponent(status)}&min_start_time=${encodeURIComponent(minStart)}&count=${params?.limit || 20}&sort=start_time:asc`
        );
        result = mcpText({
          events: (data.collection || []).map((e: {
            uri: string;
            name: string;
            status?: string;
            start_time?: string;
            end_time?: string;
            event_type?: string;
            location?: { type?: string; location?: string; join_url?: string };
            meeting_notes_plain?: string;
          }) => ({
            uri: e.uri,
            name: e.name,
            status: e.status,
            start: e.start_time,
            end: e.end_time,
            eventType: e.event_type,
            location: e.location?.join_url || e.location?.location || e.location?.type || null,
            notes: e.meeting_notes_plain || null,
          })),
        });
        break;
      }

      case "calendly_list_available_times": {
        const eventTypeUri = params?.eventTypeUri;
        if (!eventTypeUri) {
          error = { code: -32602, message: "Argument 'eventTypeUri' is required" };
          break;
        }
        const start = params?.start || new Date().toISOString();
        const end =
          params?.end ||
          new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
        const data = await calendlyFetch(
          token,
          `/event_type_available_times?event_type=${encodeURIComponent(eventTypeUri)}&start_time=${encodeURIComponent(start)}&end_time=${encodeURIComponent(end)}`
        );
        result = mcpText({
          availableTimes: (data.collection || []).map((s: { start_time?: string; status?: string; invitees_remaining?: number }) => ({
            start: s.start_time,
            status: s.status,
            inviteesRemaining: s.invitees_remaining,
          })),
        });
        break;
      }

      case "calendly_cancel_event": {
        const eventUuid = params?.eventUuid || params?.uuid;
        const reason = params?.reason || "Canceled via Loopin";
        if (!eventUuid) {
          error = { code: -32602, message: "Argument 'eventUuid' is required" };
          break;
        }
        // Accept full URI or uuid
        const uuid = String(eventUuid).includes("/")
          ? String(eventUuid).split("/").pop()
          : String(eventUuid);
        const data = await calendlyFetch(token, `/scheduled_events/${uuid}/cancellation`, {
          method: "POST",
          body: JSON.stringify({ reason }),
        });
        result = mcpText({ ok: true, cancellation: data.resource || data });
        break;
      }

      case "calendly_get_invitees": {
        const eventUuid = params?.eventUuid || params?.uuid;
        if (!eventUuid) {
          error = { code: -32602, message: "Argument 'eventUuid' is required" };
          break;
        }
        const uuid = String(eventUuid).includes("/")
          ? String(eventUuid).split("/").pop()
          : String(eventUuid);
        const data = await calendlyFetch(
          token,
          `/scheduled_events/${uuid}/invitees?count=${params?.limit || 20}`
        );
        result = mcpText({
          invitees: (data.collection || []).map((i: {
            uri: string;
            name?: string;
            email?: string;
            status?: string;
            timezone?: string;
          }) => ({
            uri: i.uri,
            name: i.name,
            email: i.email,
            status: i.status,
            timezone: i.timezone,
          })),
        });
        break;
      }

      case "calendly_create_booking": {
        const eventTypeUri = params?.eventTypeUri || params?.event_type;
        const startTime = params?.startTime || params?.start_time;
        const inviteeEmail = params?.email || params?.invitee?.email;
        const inviteeName = params?.name || params?.invitee?.name || inviteeEmail;
        if (!eventTypeUri || !startTime || !inviteeEmail) {
          error = {
            code: -32602,
            message: "Arguments 'eventTypeUri', 'startTime', and 'email' are required",
          };
          break;
        }
        const body: Record<string, unknown> = {
          event_type: eventTypeUri,
          start_time: startTime,
          invitee: {
            name: inviteeName,
            email: inviteeEmail,
            timezone: params?.timezone || "UTC",
            ...(params?.firstName ? { first_name: params.firstName } : {}),
            ...(params?.lastName ? { last_name: params.lastName } : {}),
          },
        };
        if (params?.locationKind || params?.location) {
          body.location = {
            kind: params.locationKind || params.location?.kind || "ask_invitee",
            ...(params.location?.location ? { location: params.location.location } : {}),
          };
        }
        if (Array.isArray(params?.eventGuests)) {
          body.event_guests = params.eventGuests;
        }
        const data = await calendlyFetch(token, "/invitees", {
          method: "POST",
          body: JSON.stringify(body),
        });
        const resource = data.resource || data;
        result = mcpText({
          ok: true,
          uri: resource.uri || null,
          email: resource.email || inviteeEmail,
          name: resource.name || inviteeName,
          status: resource.status || "active",
          event: resource.event || null,
          cancelUrl: resource.cancel_url || null,
          rescheduleUrl: resource.reschedule_url || null,
        });
        break;
      }

      case "calendly_update_event_type": {
        const eventTypeUri = params?.eventTypeUri || params?.uri;
        if (!eventTypeUri) {
          error = { code: -32602, message: "Argument 'eventTypeUri' is required" };
          break;
        }
        const uuid = String(eventTypeUri).includes("/")
          ? String(eventTypeUri).split("/").pop()
          : String(eventTypeUri);
        const patch: Record<string, unknown> = {};
        if (typeof params?.name === "string") patch.name = params.name;
        if (typeof params?.description === "string") patch.description_plain = params.description;
        if (typeof params?.duration === "number") patch.duration = params.duration;
        if (typeof params?.active === "boolean") patch.active = params.active;
        if (Object.keys(patch).length === 0) {
          error = {
            code: -32602,
            message: "Provide at least one of: name, description, duration, active",
          };
          break;
        }
        const data = await calendlyFetch(token, `/event_types/${uuid}`, {
          method: "PATCH",
          body: JSON.stringify(patch),
        });
        const r = data.resource || data;
        result = mcpText({
          ok: true,
          uri: r.uri,
          name: r.name,
          duration: r.duration,
          active: r.active,
          schedulingUrl: r.scheduling_url,
        });
        break;
      }

      case "calendly_list_webhooks": {
        const org = calendly.organizationUri;
        const scope = params?.scope === "organization" && org ? "organization" : "user";
        const qs =
          scope === "organization"
            ? `organization=${encodeURIComponent(org || "")}&scope=organization`
            : `user=${encodeURIComponent(userUri || "")}&scope=user&organization=${encodeURIComponent(org || "")}`;
        const data = await calendlyFetch(token, `/webhook_subscriptions?${qs}`);
        result = mcpText({
          webhooks: (data.collection || []).map((w: {
            uri: string;
            callback_url?: string;
            state?: string;
            events?: string[];
            scope?: string;
          }) => ({
            uri: w.uri,
            url: w.callback_url,
            state: w.state,
            events: w.events || [],
            scope: w.scope,
          })),
        });
        break;
      }

      case "calendly_enable_webhooks": {
        const appUrl = (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
        if (!appUrl || appUrl.includes("localhost") || appUrl.includes("127.0.0.1")) {
          error = {
            code: -32005,
            message:
              "Calendly webhooks need a public APP_URL (not localhost). Use ngrok or your deployed URL, then retry.",
          };
          break;
        }
        const callbackUrl = `${appUrl}/api/calendly-webhook/${userId}`;
        const org = calendly.organizationUri;
        if (!org || !userUri) {
          error = { code: -32002, message: "Missing Calendly organization/user URI. Reconnect Calendly." };
          break;
        }
        const data = await calendlyFetch(token, "/webhook_subscriptions", {
          method: "POST",
          body: JSON.stringify({
            url: callbackUrl,
            events: ["invitee.created", "invitee.canceled"],
            organization: org,
            user: userUri,
            scope: "user",
          }),
        });
        const resource = data.resource || data;
        await updateUserIntegration(insforgeAdmin.database, userId, "calendly", {
          ...calendly,
          webhookUri: resource.uri || null,
          webhookUrl: callbackUrl,
          webhookSigningKey: resource.signing_key || null,
        });
        result = mcpText({
          ok: true,
          uri: resource.uri || null,
          url: callbackUrl,
          events: resource.events || ["invitee.created", "invitee.canceled"],
          state: resource.state || "active",
          note: "New bookings/cancellations will create Loopin alerts.",
        });
        break;
      }

      case "calendly_disable_webhooks": {
        const webhookUri = params?.webhookUri || calendly.webhookUri;
        if (!webhookUri) {
          error = { code: -32602, message: "No webhookUri found. Pass webhookUri or enable webhooks first." };
          break;
        }
        const uuid = String(webhookUri).includes("/")
          ? String(webhookUri).split("/").pop()
          : String(webhookUri);
        await calendlyFetch(token, `/webhook_subscriptions/${uuid}`, { method: "DELETE" });
        await updateUserIntegration(insforgeAdmin.database, userId, "calendly", {
          ...calendly,
          webhookUri: null,
          webhookUrl: null,
          webhookSigningKey: null,
        });
        result = mcpText({ ok: true, deleted: true });
        break;
      }

      default:
        error = { code: -32601, message: `Method not found: ${method}` };
    }

    if (error) {
      return NextResponse.json({ jsonrpc: "2.0", error, id }, { status: 400 });
    }
    void trackFeatureUsage({ userId, feature: "calendly", action: method || "use" });
    return NextResponse.json({ jsonrpc: "2.0", result, id });
  } catch (err: unknown) {
    console.error("Calendly MCP error:", err);
    return NextResponse.json(
      {
        jsonrpc: "2.0",
        error: { code: -32000, message: err instanceof Error ? err.message : "Internal Server Error" },
        id: 1,
      },
      { status: 500 }
    );
  }
}
