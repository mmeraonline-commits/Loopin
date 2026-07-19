import { NextRequest, NextResponse } from "next/server";
import { hasInsforgeAdminKey, insforgeAdmin } from "@/lib/insforge-admin";
import { sanitizeToneInstructions, sanitizeToneSamples, sanitizeToneSignOff } from "@/lib/tone-profile";
import { sanitizeUserPreferences } from "@/lib/assistant-preferences";
import { syncManagedBriefingSchedules } from "@/lib/briefing-schedule-sync";

/** Persist assistant settings used by drafts, briefings, alerts, and UI. */
export async function GET(req: NextRequest) {
  try {
    const userId = req.nextUrl.searchParams.get("userId");
    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }
    if (!hasInsforgeAdminKey) {
      return NextResponse.json({ error: "Server key missing" }, { status: 503 });
    }

    const { data, error } = await insforgeAdmin.database
      .from("users")
      .select("assistant_settings, name, email")
      .eq("id", userId)
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const raw = (data?.assistant_settings || {}) as Record<string, unknown>;
    const prefs = sanitizeUserPreferences(raw, {
      displayName: typeof data?.name === "string" ? data.name : "",
    });

    return NextResponse.json({
      settings: {
        ...raw,
        ...prefs,
        responseTone: raw.responseTone || "friendly",
        autoDraftReplies:
          typeof raw.autoDraftReplies === "boolean" ? raw.autoDraftReplies : true,
        gmailAutoDraftCategories: raw.gmailAutoDraftCategories || {
          urgent: true,
          needs_reply: true,
        },
      },
      emailConfigured: Boolean(process.env.RESEND_API_KEY),
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal Server Error" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const { userId, settings } = await req.json();
    if (!userId || !settings || typeof settings !== "object") {
      return NextResponse.json({ error: "userId and settings are required" }, { status: 400 });
    }
    if (!hasInsforgeAdminKey) {
      return NextResponse.json({ error: "Server key missing" }, { status: 503 });
    }

    const { data: existingRow, error: fetchError } = await insforgeAdmin.database
      .from("users")
      .select("assistant_settings, integrations")
      .eq("id", userId)
      .maybeSingle();

    if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });

    const current = (existingRow?.assistant_settings || {}) as Record<string, unknown>;
    const currentCategories = (current.gmailAutoDraftCategories || {}) as Record<string, boolean>;
    const incomingCategories = settings.gmailAutoDraftCategories;

    const prefs = sanitizeUserPreferences({ ...current, ...settings });

    // Advanced tone fields are never written here — only /api/tone/sources.
    const patch = {
      ...current,
      ...prefs,
      responseTone: settings.responseTone || current.responseTone || "friendly",
      autoDraftReplies:
        typeof settings.autoDraftReplies === "boolean"
          ? settings.autoDraftReplies
          : typeof current.autoDraftReplies === "boolean"
            ? current.autoDraftReplies
            : true,
      toneInstructions:
        settings.toneInstructions !== undefined
          ? sanitizeToneInstructions(settings.toneInstructions)
          : current.toneInstructions ?? "",
      toneSignOff:
        settings.toneSignOff !== undefined
          ? sanitizeToneSignOff(settings.toneSignOff)
          : current.toneSignOff ?? "",
      toneSamples:
        settings.toneSamples !== undefined
          ? sanitizeToneSamples(settings.toneSamples)
          : current.toneSamples ?? [],
      ...(incomingCategories && typeof incomingCategories === "object"
        ? {
            gmailAutoDraftCategories: {
              urgent:
                typeof incomingCategories.urgent === "boolean"
                  ? incomingCategories.urgent
                  : currentCategories.urgent ?? true,
              needs_reply:
                typeof incomingCategories.needs_reply === "boolean"
                  ? incomingCategories.needs_reply
                  : currentCategories.needs_reply ?? true,
            },
          }
        : {}),
    };

    const updatePayload: Record<string, unknown> = {
      assistant_settings: patch,
      updated_at: new Date().toISOString(),
    };
    if (prefs.displayName) {
      updatePayload.name = prefs.displayName;
    }

    const { data, error } = await insforgeAdmin.database
      .from("users")
      .update(updatePayload)
      .eq("id", userId)
      .select("assistant_settings")
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Keep managed briefing_schedules in sync with cadence preference.
    const integrations = (existingRow?.integrations || {}) as Record<
      string,
      { connected?: boolean; isSimulated?: boolean } | null | undefined
    >;
    const connectedApps = ["gmail", "whatsapp", "slack", "outlook", "discord"].filter(
      (id) => integrations[id]?.connected && !integrations[id]?.isSimulated
    );

    let scheduleSync: { ok: boolean; error?: string } = { ok: true };
    try {
      await syncManagedBriefingSchedules({
        userId,
        cadence: prefs.briefingCadence,
        timezone: prefs.timezone,
        apps: connectedApps.length ? connectedApps : ["gmail"],
      });
    } catch (err) {
      scheduleSync = {
        ok: false,
        error: err instanceof Error ? err.message : "Schedule sync failed",
      };
    }

    return NextResponse.json({
      settings: data?.assistant_settings || patch,
      scheduleSync,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal Server Error" },
      { status: 500 }
    );
  }
}
