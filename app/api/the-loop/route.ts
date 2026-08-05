import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { hasInsforgeAdminKey, insforgeAdmin } from "@/lib/insforge-admin";
import { GEMINI_MODEL } from "@/lib/gemini";

function overdueScore(row: {
  status: string;
  promised_at: string;
  overdue_after_days?: number;
}): number {
  if (row.status === "fulfilled") return -1;
  const promised = new Date(row.promised_at).getTime();
  if (Number.isNaN(promised)) return 0;
  const ageDays = (Date.now() - promised) / (24 * 60 * 60 * 1000);
  const threshold = Number(row.overdue_after_days) || 3;
  // Higher score = more overdue
  return ageDays - threshold;
}

export async function GET(req: NextRequest) {
  try {
    const userId = req.nextUrl.searchParams.get("userId");
    const status = req.nextUrl.searchParams.get("status"); // pending|overdue|fulfilled|all
    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }
    if (!hasInsforgeAdminKey) {
      return NextResponse.json({ error: "Server key missing" }, { status: 503 });
    }

    let query = insforgeAdmin.database
      .from("loop_commitments")
      .select("*")
      .eq("user_id", userId);

    if (status && status !== "all") {
      query = query.eq("status", status);
    } else if (!status || status === "open") {
      query = query.in("status", ["pending", "overdue"]);
    }

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const items = [...(data || [])].sort((a, b) => overdueScore(b) - overdueScore(a));
    return NextResponse.json({ items });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal Server Error" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const userId = body.userId as string | undefined;
    const id = body.id as string | undefined;
    const nextStatus = body.status as string | undefined;

    if (!userId || !id) {
      return NextResponse.json({ error: "userId and id are required" }, { status: 400 });
    }
    if (!hasInsforgeAdminKey) {
      return NextResponse.json({ error: "Server key missing" }, { status: 503 });
    }

    const allowed = new Set(["pending", "fulfilled", "overdue"]);
    if (nextStatus && !allowed.has(nextStatus)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const patch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
      last_checked_at: new Date().toISOString(),
    };
    if (nextStatus) {
      patch.status = nextStatus;
      if (nextStatus === "fulfilled") patch.fulfilled_at = new Date().toISOString();
    }
    if (typeof body.nudge_draft === "string") {
      patch.nudge_draft = body.nudge_draft.slice(0, 2000);
    }

    const { data, error } = await insforgeAdmin.database
      .from("loop_commitments")
      .update(patch)
      .eq("id", id)
      .eq("user_id", userId)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ item: data });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal Server Error" },
      { status: 500 }
    );
  }
}

/** Draft a polite nudge follow-up for an overdue Loop item. */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const userId = body.userId as string | undefined;
    const id = body.id as string | undefined;
    const action = (body.action as string) || "nudge";

    if (!userId || !id) {
      return NextResponse.json({ error: "userId and id are required" }, { status: 400 });
    }
    if (!hasInsforgeAdminKey) {
      return NextResponse.json({ error: "Server key missing" }, { status: 503 });
    }
    if (action !== "nudge") {
      return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
    }

    const { data: item, error } = await insforgeAdmin.database
      .from("loop_commitments")
      .select("*")
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "AI service not configured" }, { status: 503 });
    }

    const ai = new GoogleGenAI({ apiKey });
    const prompt = `Draft a short, polite follow-up message the user can send to nudge someone about a promised action.

Who owes it: ${item.sender}
What was promised: ${item.promised_text}
Channel: ${item.source}
Promised at: ${item.promised_at}
Status: ${item.status}

Rules:
- Warm and professional, not accusatory
- 1-3 short sentences
- Do not invent details that weren't promised
- Output only the message body text, no subject line, no markdown`;

    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
    });
    const draft = (response.text || "").trim().slice(0, 2000);

    await insforgeAdmin.database
      .from("loop_commitments")
      .update({
        nudge_draft: draft,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("user_id", userId);

    return NextResponse.json({ draft, item: { ...item, nudge_draft: draft } });
  } catch (err: unknown) {
    const raw = err instanceof Error ? err.message : "Internal Server Error";
    const message = /RESOURCE_EXHAUSTED|quota|rate.?limit/i.test(raw)
      ? "Gemini quota exceeded. Try again shortly."
      : raw;
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
