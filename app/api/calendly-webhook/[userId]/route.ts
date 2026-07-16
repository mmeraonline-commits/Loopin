import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { hasInsforgeAdminKey, insforgeAdmin } from "@/lib/insforge-admin";
import { publishAlertRealtimeEvent } from "@/lib/alerts-realtime";
import { appLogo } from "@/lib/alert-auto-generation";
import { sendPushToUser } from "@/lib/push";

type CalendlyWebhookBody = {
  event?: string;
  payload?: {
    uri?: string;
    email?: string;
    name?: string;
    status?: string;
    timezone?: string;
    cancel_url?: string;
    reschedule_url?: string;
    scheduled_event?: {
      uri?: string;
      name?: string;
      start_time?: string;
      end_time?: string;
      status?: string;
      location?: { type?: string; location?: string; join_url?: string };
    };
    cancellation?: { reason?: string; canceled_by?: string };
  };
};

function verifySignature(rawBody: string, signatureHeader: string | null, signingKey: string | null) {
  if (!signingKey || !signatureHeader) return !signingKey; // allow if no key stored yet
  // Header format: t=timestamp,v1=signature
  const parts = Object.fromEntries(
    signatureHeader.split(",").map((p) => {
      const [k, ...rest] = p.trim().split("=");
      return [k, rest.join("=")];
    })
  );
  const t = parts.t;
  const v1 = parts.v1;
  if (!t || !v1) return false;
  const signedPayload = `${t}.${rawBody}`;
  const expected = createHmac("sha256", signingKey).update(signedPayload).digest("hex");
  try {
    const a = Buffer.from(expected, "hex");
    const b = Buffer.from(v1, "hex");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    if (!hasInsforgeAdminKey) {
      return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
    }

    const { userId } = await params;
    if (!userId) return NextResponse.json({ error: "Missing userId" }, { status: 400 });

    const rawBody = await req.text();
    let body: CalendlyWebhookBody;
    try {
      body = JSON.parse(rawBody) as CalendlyWebhookBody;
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const { data: dbUser } = await insforgeAdmin.database
      .from("users")
      .select("integrations")
      .eq("id", userId)
      .maybeSingle();

    const calendly = dbUser?.integrations?.calendly as
      | { connected?: boolean; webhookSigningKey?: string | null }
      | undefined;
    if (!calendly?.connected) {
      return NextResponse.json({ error: "Calendly not connected for user" }, { status: 404 });
    }

    const signature = req.headers.get("Calendly-Webhook-Signature");
    if (!verifySignature(rawBody, signature, calendly.webhookSigningKey || null)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const eventName = body.event || "";
    if (eventName !== "invitee.created" && eventName !== "invitee.canceled") {
      return NextResponse.json({ ok: true, ignored: true });
    }

    const payload = body.payload || {};
    const scheduled = payload.scheduled_event || {};
    const inviteeUri = payload.uri || "unknown";
    const isCancel = eventName === "invitee.canceled";
    const meetingName = scheduled.name || "Calendly meeting";
    const when = scheduled.start_time
      ? new Date(scheduled.start_time).toLocaleString()
      : "unknown time";
    const who = payload.name || payload.email || "Someone";
    const location =
      scheduled.location?.join_url || scheduled.location?.location || scheduled.location?.type || null;

    const dedupeKey = `calendly-webhook:${userId}:${eventName}:${inviteeUri}`;
    const { data: existing } = await insforgeAdmin.database
      .from("alerts")
      .select("id")
      .eq("dedupe_key", dedupeKey)
      .maybeSingle();
    if (existing) {
      return NextResponse.json({ ok: true, duplicate: true });
    }

    const title = isCancel
      ? `${who} canceled: ${meetingName}`
      : `${who} booked: ${meetingName}`;
    const description = isCancel
      ? `${who} canceled ${meetingName} scheduled for ${when}.`
      : `${who} just booked ${meetingName} for ${when}.`;
    const fullDetails = [
      description,
      payload.email ? `Email: ${payload.email}` : null,
      location ? `Location: ${location}` : null,
      payload.cancellation?.reason ? `Reason: ${payload.cancellation.reason}` : null,
      payload.cancel_url ? `Cancel: ${payload.cancel_url}` : null,
      payload.reschedule_url ? `Reschedule: ${payload.reschedule_url}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    const { data: alert, error } = await insforgeAdmin.database
      .from("alerts")
      .insert({
        user_id: userId,
        rule_id: null,
        dedupe_key: dedupeKey,
        title,
        description,
        full_details: fullDetails,
        source_app: "calendly",
        app_logo: appLogo("calendly"),
        priority: isCancel ? "medium" : "high",
        status: "triggered",
        condition: isCancel ? "Calendly invitee canceled" : "Calendly invitee created",
        requires_response: false,
        suggested_action: isCancel ? "Review your availability" : "Prepare for the meeting",
      })
      .select()
      .single();

    if (error) {
      console.error("[calendly-webhook] Alert insert failed:", error);
      return NextResponse.json({ error: "Failed to create alert" }, { status: 500 });
    }

    if (alert) {
      await publishAlertRealtimeEvent(userId, "alert_created", { alert });
      await sendPushToUser(userId, {
        title,
        body: description,
        url: "/dashboard?tab=alerts",
        icon: appLogo("calendly"),
        tag: dedupeKey,
      }).catch((err) => console.error("[calendly-webhook] push failed:", err));
    }

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    console.error("[calendly-webhook] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal Server Error" },
      { status: 500 }
    );
  }
}
