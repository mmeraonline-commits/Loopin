import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { hasInsforgeAdminKey, insforgeAdmin } from "@/lib/insforge-admin";
import { getPlan, planRank } from "@/lib/plans";
import {
  buildTonePrompt,
  sanitizeToneInstructions,
  sanitizeToneKnowledgeSummary,
  sanitizeToneSamples,
  sanitizeToneSignOff,
} from "@/lib/tone-profile";

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Internal Server Error";
}

const DEFAULT_SCENARIO = `Hey - just checking in on the project timeline. Any update on when we can expect the next milestone? Would love a quick status when you get a chance.

Thanks!`;

/**
 * POST /api/tone/preview — Normal + Advanced tone profile -> sample draft.
 * Stateless: uses whatever tone fields are passed in (not necessarily saved
 * yet) so the Settings UI can preview edits before hitting Save.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const userId = body?.userId as string | undefined;

    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) {
      return NextResponse.json(
        { error: "AI service is not configured (GEMINI_API_KEY missing)" },
        { status: 503 }
      );
    }

    let toneKnowledgeSummary = sanitizeToneKnowledgeSummary(body?.toneKnowledgeSummary);

    // Defense in depth beyond client-side gating — Advanced knowledge only
    // ever applies for Business+ plans, even if a caller passes it directly.
    if (toneKnowledgeSummary && userId && hasInsforgeAdminKey) {
      const { data } = await insforgeAdmin.database
        .from("users")
        .select("plan")
        .eq("id", userId)
        .maybeSingle();
      const planId = getPlan(data?.plan).id;
      if (planRank(planId) < planRank("business")) {
        toneKnowledgeSummary = "";
      }
    }

    const toneBlock = buildTonePrompt({
      responseTone: typeof body?.responseTone === "string" ? body.responseTone : "friendly",
      toneInstructions: sanitizeToneInstructions(body?.toneInstructions),
      toneSignOff: sanitizeToneSignOff(body?.toneSignOff),
      toneSamples: sanitizeToneSamples(body?.toneSamples),
      toneKnowledgeSummary,
    });

    const scenario =
      typeof body?.scenario === "string" && body.scenario.trim()
        ? body.scenario.trim().slice(0, 2000)
        : DEFAULT_SCENARIO;

    const prompt = `You are Loopin, an AI personal assistant. Draft a sample reply so the user can preview their configured writing voice.

Incoming message to reply to:
${scenario}

${toneBlock}

Instructions:
- Write only the reply body, ready to send.
- Keep it realistic (2-3 short paragraphs max).
- This is a preview — make the voice/style clearly recognizable.`;

    const ai = new GoogleGenAI({ apiKey: geminiApiKey });
    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-lite",
      contents: prompt,
    });

    const preview = (response.text || "").trim();
    if (!preview) {
      return NextResponse.json({ error: "Failed to generate a preview" }, { status: 500 });
    }

    return NextResponse.json({ preview, scenario });
  } catch (err: unknown) {
    console.error("[tone/preview]", err);
    return NextResponse.json({ error: getErrorMessage(err) }, { status: 500 });
  }
}
