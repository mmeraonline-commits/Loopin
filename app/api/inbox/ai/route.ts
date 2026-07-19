import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { loadAssistantSettings } from "@/lib/auto-draft-reply";
import { buildTonePrompt } from "@/lib/tone-profile";
import { loadUserPreferences } from "@/lib/briefing-delivery";
import { detailLevelGuide } from "@/lib/assistant-preferences";

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Internal Server Error";
}

type AiFeature = "summary" | "next_action" | "reply" | "suggestions";

export async function POST(req: NextRequest) {
  try {
    const { feature, app, title, preview, body, replyContext, tone, userId } = await req.json();

    if (!feature || !app) {
      return NextResponse.json(
        { error: "Required fields: feature, app" },
        { status: 400 }
      );
    }

    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) {
      return NextResponse.json(
        { error: "AI service is not configured (GEMINI_API_KEY missing)" },
        { status: 503 }
      );
    }

    const prefs = userId ? await loadUserPreferences(userId) : null;
    if (feature === "suggestions" && prefs && !prefs.proactiveSuggestions) {
      return NextResponse.json({
        result: { replies: [], nextAction: "", priority: "medium", reason: "Proactive suggestions disabled in Settings." },
        disabled: true,
      });
    }

    const ai = new GoogleGenAI({ apiKey: geminiApiKey });
    const isEmail = app === "gmail" || app === "outlook";
    const contextBlock = `Platform: ${app}
Title: ${title || "Untitled"}
Preview: ${preview || ""}
Full message:
${body || preview || "No content"}`;
    const detailGuide = detailLevelGuide(prefs?.detailLevel);
    const profileLine = [
      prefs?.displayName ? `User: ${prefs.displayName}` : "",
      prefs?.roleContext ? `Context: ${prefs.roleContext}` : "",
    ]
      .filter(Boolean)
      .join(". ");

    let prompt = "";

    if (feature === "summary") {
      prompt = `You are Loopin, an advanced AI personal assistant. Summarize this inbox item.
${profileLine ? `\n${profileLine}\n` : ""}
${contextBlock}

Instructions:
- ${detailGuide}
- Focus on what the user needs to know or do.
- Plain bullets only, no markdown titles.`;
    } else if (feature === "next_action") {
      prompt = `You are Loopin, an advanced AI personal assistant. Suggest the single best next action for this inbox item.
${profileLine ? `\n${profileLine}\n` : ""}
${contextBlock}

Instructions:
- Suggest 1 clear, direct, actionable step.
- Keep under 25 words.
- Be practical.`;
    } else if (feature === "reply") {
      const savedTone = userId ? await loadAssistantSettings(userId) : null;
      const toneBlock = buildTonePrompt({
        responseTone: tone || savedTone?.responseTone,
        toneInstructions: savedTone?.toneInstructions,
        toneSignOff: savedTone?.toneSignOff,
        toneSamples: savedTone?.toneSamples,
        toneKnowledgeSummary: savedTone?.toneKnowledgeSummary,
      });

      prompt = isEmail
        ? `You are Loopin, an AI personal assistant. Draft an email reply.
${profileLine ? `\n${profileLine}\n` : ""}
${contextBlock}
${replyContext ? `User instruction: ${replyContext}` : ""}
${toneBlock}

Instructions:
- Write only the email body.
- Keep it short (2-3 paragraphs max).
- Address the sender's points.
- No subject line or headers.`
        : `You are Loopin, an AI personal assistant. Draft a chat reply.
${profileLine ? `\n${profileLine}\n` : ""}
${contextBlock}
${replyContext ? `User instruction: ${replyContext}` : ""}
${toneBlock}

Instructions:
- Write a natural message reply only.
- Keep it brief (1-3 sentences).
- No formatting or labels.`;
    } else if (feature === "suggestions") {
      prompt = `You are Loopin, an AI personal assistant. Given this inbox item, return 3 short suggested reply openers and 1 recommended next action.

${contextBlock}

Return valid JSON only:
{
  "replies": ["short reply suggestion 1", "short reply suggestion 2", "short reply suggestion 3"],
  "nextAction": "one recommended next action under 20 words",
  "priority": "high" | "medium" | "low",
  "reason": "one sentence why this matters"
}`;
    } else {
      return NextResponse.json({ error: "Invalid feature requested" }, { status: 400 });
    }

    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-lite",
      contents: prompt,
    });

    const resultText = (response.text || "").trim();

    if ((feature as AiFeature) === "suggestions") {
      try {
        const cleaned = resultText.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
        const parsed = JSON.parse(cleaned);
        return NextResponse.json({ result: parsed });
      } catch {
        return NextResponse.json({
          result: {
            replies: [],
            nextAction: resultText.slice(0, 120),
            priority: "medium",
            reason: "AI returned unstructured suggestions.",
          },
        });
      }
    }

    return NextResponse.json({ result: resultText });
  } catch (err: unknown) {
    console.error("Error in POST /api/inbox/ai:", err);
    return NextResponse.json({ error: getErrorMessage(err) }, { status: 500 });
  }
}
