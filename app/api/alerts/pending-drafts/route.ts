import { NextRequest, NextResponse } from "next/server";
import { hasInsforgeAdminKey, insforgeAdmin } from "@/lib/insforge-admin";
import { sendPlatformReply } from "@/lib/send-reply";
import { generateAlertReplyDraft, loadAssistantSettings } from "@/lib/auto-draft-reply";
import { publishAlertRealtimeEvent } from "@/lib/alerts-realtime";

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Internal Server Error";
}

/** GET /api/alerts/pending-drafts?userId= — confirm queue list */
export async function GET(req: NextRequest) {
  try {
    if (!hasInsforgeAdminKey) {
      return NextResponse.json({ error: "INSFORGE_API_KEY is required" }, { status: 503 });
    }

    const userId = req.nextUrl.searchParams.get("userId");
    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    const { data, error } = await insforgeAdmin.database
      .from("alerts")
      .select("*")
      .eq("user_id", userId)
      .eq("draft_status", "pending_confirm")
      .order("drafted_at", { ascending: false })
      .limit(50);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ drafts: data || [], count: (data || []).length });
  } catch (err: unknown) {
    return NextResponse.json({ error: getErrorMessage(err) }, { status: 500 });
  }
}

/**
 * POST /api/alerts/pending-drafts
 * body: { userId, alertId, action: 'confirm' | 'dismiss' | 'regenerate' | 'save', draftText? }
 */
export async function POST(req: NextRequest) {
  try {
    if (!hasInsforgeAdminKey) {
      return NextResponse.json({ error: "INSFORGE_API_KEY is required" }, { status: 503 });
    }

    const { userId, alertId, action, draftText } = await req.json();
    if (!userId || !alertId || !action) {
      return NextResponse.json(
        { error: "Required fields: userId, alertId, action" },
        { status: 400 }
      );
    }

    const { data: alert, error: loadError } = await insforgeAdmin.database
      .from("alerts")
      .select("*")
      .eq("id", alertId)
      .eq("user_id", userId)
      .maybeSingle();

    if (loadError || !alert) {
      return NextResponse.json({ error: loadError?.message || "Alert not found" }, { status: 404 });
    }

    if (action === "save") {
      const text = String(draftText || "").trim();
      if (!text) {
        return NextResponse.json({ error: "draftText is required" }, { status: 400 });
      }
      const { data, error } = await insforgeAdmin.database
        .from("alerts")
        .update({
          draft_reply: text,
          draft_status: "pending_confirm",
          drafted_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", alertId)
        .eq("user_id", userId)
        .select()
        .maybeSingle();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ alert: data });
    }

    if (action === "dismiss") {
      const { data, error } = await insforgeAdmin.database
        .from("alerts")
        .update({
          draft_status: "dismissed",
          updated_at: new Date().toISOString(),
        })
        .eq("id", alertId)
        .eq("user_id", userId)
        .select()
        .maybeSingle();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      await publishAlertRealtimeEvent(userId, "alert_updated", { alertId, draft_status: "dismissed" });
      return NextResponse.json({ alert: data });
    }

    if (action === "regenerate") {
      const settings = await loadAssistantSettings(userId);
      const draft = await generateAlertReplyDraft({
        title: alert.title,
        description: alert.description || "",
        fullDetails: alert.full_details,
        sourceApp: alert.source_app || "gmail",
        tone: settings.responseTone,
        toneInstructions: settings.toneInstructions,
        toneSignOff: settings.toneSignOff,
        toneSamples: settings.toneSamples,
        toneKnowledgeSummary: settings.toneKnowledgeSummary,
      });
      if (!draft) {
        return NextResponse.json({ error: "Failed to generate draft" }, { status: 500 });
      }
      const { data, error } = await insforgeAdmin.database
        .from("alerts")
        .update({
          draft_reply: draft,
          draft_status: "pending_confirm",
          drafted_at: new Date().toISOString(),
          draft_tone: settings.responseTone,
          updated_at: new Date().toISOString(),
        })
        .eq("id", alertId)
        .eq("user_id", userId)
        .select()
        .maybeSingle();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ alert: data });
    }

    if (action === "confirm") {
      const text = String(draftText || alert.draft_reply || "").trim();
      if (!text) {
        return NextResponse.json({ error: "No draft to send" }, { status: 400 });
      }

      try {
        await sendPlatformReply({
          userId,
          sourceApp: alert.source_app,
          text,
          fullDetails: alert.full_details,
          activityId: alert.dedupe_key?.split(":").pop() || null,
        });
      } catch (sendErr: unknown) {
        return NextResponse.json({ error: getErrorMessage(sendErr) }, { status: 400 });
      }

      const { data, error } = await insforgeAdmin.database
        .from("alerts")
        .update({
          draft_reply: text,
          draft_status: "sent",
          status: "resolved",
          last_action: "send_reply",
          updated_at: new Date().toISOString(),
        })
        .eq("id", alertId)
        .eq("user_id", userId)
        .select()
        .maybeSingle();

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      await publishAlertRealtimeEvent(userId, "alert_updated", {
        alertId,
        draft_status: "sent",
        status: "resolved",
      });

      return NextResponse.json({ alert: data, ok: true });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err: unknown) {
    console.error("[pending-drafts]", err);
    return NextResponse.json({ error: getErrorMessage(err) }, { status: 500 });
  }
}
