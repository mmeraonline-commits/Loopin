import { NextRequest, NextResponse } from "next/server";
import { hasInsforgeAdminKey, insforgeAdmin } from "@/lib/insforge-admin";
import { fetchInboxItems } from "@/lib/inbox";
import { generateAlertReplyDraft, loadAssistantSettings } from "@/lib/auto-draft-reply";
import { denySurface, loadUserPlan } from "@/lib/plan-usage";

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Internal Server Error";
}

type InboxDraftsMap = Record<string, string>;

/**
 * GET  /api/inbox/needs-reply?userId= — list needs-reply items + saved drafts
 * POST /api/inbox/needs-reply — prepare drafts, save/update/dismiss draft text
 *
 * Keeps Alerts untouched. Drafts live on users.assistant_settings.inboxDrafts.
 */
export async function GET(req: NextRequest) {
  try {
    if (!hasInsforgeAdminKey) {
      return NextResponse.json({ error: "INSFORGE_API_KEY is required" }, { status: 503 });
    }

    const userId = req.nextUrl.searchParams.get("userId");
    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    const user = await loadUserPlan(userId);
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
    const locked = denySurface(user.plan, "inbox", "Unified inbox");
    if (locked) return locked;

    const { items, connectedApps } = await fetchInboxItems(userId);
    const needsReply = items.filter((i) => i.needsReply && i.canReply);
    const draftReady = needsReply.filter((i) => !!i.draftReply);

    return NextResponse.json({
      items: needsReply,
      draftReady,
      counts: {
        needsReply: needsReply.length,
        draftReady: draftReady.length,
      },
      connectedApps,
    });
  } catch (err: unknown) {
    console.error("[inbox/needs-reply GET]", err);
    return NextResponse.json({ error: getErrorMessage(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!hasInsforgeAdminKey) {
      return NextResponse.json({ error: "INSFORGE_API_KEY is required" }, { status: 503 });
    }

    const body = await req.json();
    const userId = body?.userId as string | undefined;
    const action = (body?.action as string) || "prepare";

    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    const user = await loadUserPlan(userId);
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
    const locked = denySurface(user.plan, "inbox", "Unified inbox");
    if (locked) return locked;

    const { data: userRow } = await insforgeAdmin.database
      .from("users")
      .select("assistant_settings")
      .eq("id", userId)
      .maybeSingle();

    const settings = (userRow?.assistant_settings || {}) as Record<string, unknown>;
    const inboxDrafts: InboxDraftsMap = {
      ...((settings.inboxDrafts as InboxDraftsMap) || {}),
    };

    if (action === "save") {
      const itemId = body?.itemId as string | undefined;
      const draft = (body?.draft as string) || "";
      if (!itemId) {
        return NextResponse.json({ error: "itemId is required" }, { status: 400 });
      }
      if (draft.trim()) inboxDrafts[itemId] = draft.trim();
      else delete inboxDrafts[itemId];

      await insforgeAdmin.database
        .from("users")
        .update({
          assistant_settings: { ...settings, inboxDrafts },
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId);

      return NextResponse.json({ success: true, drafts: inboxDrafts });
    }

    if (action === "dismiss") {
      const itemId = body?.itemId as string | undefined;
      if (!itemId) {
        return NextResponse.json({ error: "itemId is required" }, { status: 400 });
      }
      delete inboxDrafts[itemId];
      await insforgeAdmin.database
        .from("users")
        .update({
          assistant_settings: { ...settings, inboxDrafts },
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId);
      return NextResponse.json({ success: true, drafts: inboxDrafts });
    }

    // prepare — auto-draft all (or one) needs-reply items missing drafts
    const assistant = await loadAssistantSettings(userId);
    if (!assistant.autoDraftReplies && action === "prepare") {
      return NextResponse.json({
        success: true,
        drafted: 0,
        message: "Auto-draft is disabled in settings",
        drafts: inboxDrafts,
      });
    }

    const { items } = await fetchInboxItems(userId);
    const targetId = body?.itemId as string | undefined;
    const force = body?.force === true || !!targetId;
    const candidates = items.filter(
      (i) =>
        i.needsReply &&
        i.canReply &&
        (!targetId || i.id === targetId) &&
        (force || !inboxDrafts[i.id])
    );

    let drafted = 0;
    const budget = targetId ? 1 : 5;

    for (const item of candidates.slice(0, budget)) {
      const draft = await generateAlertReplyDraft({
        title: item.title,
        description: item.preview,
        fullDetails: item.body,
        sourceApp: item.app,
        tone: assistant.responseTone,
        toneInstructions: assistant.toneInstructions,
        toneSignOff: assistant.toneSignOff,
        toneSamples: assistant.toneSamples,
        toneKnowledgeSummary: assistant.toneKnowledgeSummary,
        replyContext: body?.replyContext,
      });
      if (!draft) continue;
      inboxDrafts[item.id] = draft;
      drafted += 1;
    }

    await insforgeAdmin.database
      .from("users")
      .update({
        assistant_settings: { ...settings, inboxDrafts },
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId);

    return NextResponse.json({
      success: true,
      drafted,
      drafts: inboxDrafts,
      candidates: candidates.length,
    });
  } catch (err: unknown) {
    console.error("[inbox/needs-reply POST]", err);
    return NextResponse.json({ error: getErrorMessage(err) }, { status: 500 });
  }
}
