import { NextRequest, NextResponse } from "next/server";
import { hasInsforgeAdminKey, insforgeAdmin } from "@/lib/insforge-admin";
import { publishAlertRealtimeEvent } from "@/lib/alerts-realtime";
import { runMonitorAlertRule } from "@/lib/monitor-alert-rule";
import { assertAlertRuleQuota, isNextResponse } from "@/lib/plan-usage";

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Internal Server Error";
}

function getNextCheckAt(frequency: string): string {
  const next = new Date();
  if (frequency === "hourly") next.setHours(next.getHours() + 1);
  else if (frequency === "daily") next.setDate(next.getDate() + 1);
  else if (frequency === "15_minutes") next.setMinutes(next.getMinutes() + 15);
  else next.setMinutes(next.getMinutes() + 5);
  return next.toISOString();
}

export async function GET(req: NextRequest) {
  try {
    if (!hasInsforgeAdminKey) {
      return NextResponse.json(
        { error: "INSFORGE_API_KEY is required to read alert rules with RLS enabled." },
        { status: 503 }
      );
    }

    const userId = req.nextUrl.searchParams.get("userId");
    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    const { data, error } = await insforgeAdmin.database
      .from("alert_rules")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data || []);
  } catch (err: unknown) {
    console.error("Error in GET /api/alerts/rules:", err);
    return NextResponse.json({ error: getErrorMessage(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!hasInsforgeAdminKey) {
      return NextResponse.json(
        { error: "INSFORGE_API_KEY is required to create alert rules with RLS enabled." },
        { status: 503 }
      );
    }

    const {
      userId,
      name,
      description,
      apps,
      condition,
      priority,
      notificationMethod,
      frequency,
      action,
      runNow = true,
    } = await req.json();

    if (!userId || !name || !condition || !Array.isArray(apps) || apps.length === 0) {
      return NextResponse.json(
        { error: "Required fields: userId, name, apps, condition" },
        { status: 400 }
      );
    }

    const ruleGate = await assertAlertRuleQuota(userId);
    if (isNextResponse(ruleGate)) return ruleGate;

    const allowedApps = new Set(["gmail", "whatsapp", "slack", "discord", "telegram", "calendly", "outlook"]);
    const cleanApps = apps.filter((app: string) => allowedApps.has(app));
    if (cleanApps.length === 0) {
      return NextResponse.json({ error: "Select at least one supported app." }, { status: 400 });
    }

    const method = notificationMethod || "in_app";
    const normalizedMethod = ["in_app", "email", "push", "whatsapp"].includes(method)
      ? method
      : "in_app";

    const { data, error } = await insforgeAdmin.database
      .from("alert_rules")
      .insert({
        user_id: userId,
        name: String(name).trim(),
        description: description || "",
        apps: cleanApps,
        condition: String(condition).trim(),
        priority: priority || "medium",
        notification_method: normalizedMethod,
        frequency: frequency || "real_time",
        action: action || "notify",
        status: "active",
        next_check_at: getNextCheckAt(frequency || "real_time"),
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await publishAlertRealtimeEvent(userId, "alert_rule_created", { rule: data });

    let scan = { success: true, matches: 0, created: 0 as number };
    if (runNow && data?.id) {
      try {
        scan = await runMonitorAlertRule(data.id);
      } catch (err) {
        console.error("[alerts/rules] Immediate scan failed:", err);
      }

      // Also queue Trigger.dev for background continuity when available
      try {
        const { monitorAlertRuleTask } = await import("@/trigger/alerts");
        await monitorAlertRuleTask.trigger({ ruleId: data.id });
      } catch (err) {
        // Local/dev without Trigger worker is fine — immediate scan already ran.
        console.warn("[alerts/rules] Trigger queue skipped:", err);
      }
    }

    return NextResponse.json({
      ...data,
      scan,
      note:
        normalizedMethod === "push"
          ? "Rule saved. Enable browser push in Settings if you have not already."
          : normalizedMethod === "whatsapp"
            ? "Rule saved. Alerts will message your connected WhatsApp number. Keep WhatsApp connected."
            : normalizedMethod === "email"
              ? "Rule saved. Email delivery comes next — matches still alert in-app (and push if enabled)."
              : undefined,
    });
  } catch (err: unknown) {
    console.error("Error in POST /api/alerts/rules:", err);
    return NextResponse.json({ error: getErrorMessage(err) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    if (!hasInsforgeAdminKey) {
      return NextResponse.json(
        { error: "INSFORGE_API_KEY is required to update alert rules with RLS enabled." },
        { status: 503 }
      );
    }

    const { userId, ruleId, status, runNow } = await req.json();
    if (!userId || !ruleId) {
      return NextResponse.json({ error: "userId and ruleId are required" }, { status: 400 });
    }

    if (runNow) {
      const scan = await runMonitorAlertRule(ruleId);
      return NextResponse.json({ ok: true, scan });
    }

    if (!status || !["active", "paused", "archived"].includes(status)) {
      return NextResponse.json({ error: "status must be active, paused, or archived" }, { status: 400 });
    }

    const { data, error } = await insforgeAdmin.database
      .from("alert_rules")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", ruleId)
      .eq("user_id", userId)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (err: unknown) {
    console.error("Error in PATCH /api/alerts/rules:", err);
    return NextResponse.json({ error: getErrorMessage(err) }, { status: 500 });
  }
}
