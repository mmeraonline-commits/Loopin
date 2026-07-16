import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Internal Server Error";
}

type AiFeature = "summary" | "next_action" | "reply" | "suggestions";

export async function POST(req: NextRequest) {
  try {
    const { feature, app, title, preview, body, replyContext, tone } = await req.json();

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

    const ai = new GoogleGenAI({ apiKey: geminiApiKey });
    const isEmail = app === "gmail" || app === "outlook";
    const contextBlock = `Platform: ${app}
Title: ${title || "Untitled"}
Preview: ${preview || ""}
Full message:
${body || preview || "No content"}`;

    let prompt = "";

    if (feature === "summary") {
      prompt = `You are Loopin, an advanced AI personal assistant. Summarize this inbox item.

${contextBlock}

Instructions:
- Provide 2-3 short bullet points with the critical information.
- Focus on what the user needs to know or do.
- Keep under 60 words total.
- Plain bullets only, no markdown titles.`;
    } else if (feature === "next_action") {
      prompt = `You are Loopin, an advanced AI personal assistant. Suggest the single best next action for this inbox item.

${contextBlock}

Instructions:
- Suggest 1 clear, direct, actionable step.
- Keep under 25 words.
- Be practical.`;
    } else if (feature === "reply") {
      const toneGuide =
        tone === "friendly"
          ? "Warm and friendly."
          : tone === "short"
            ? "Extremely concise (1-2 sentences)."
            : tone === "assertive"
              ? "Confident and direct, still polite."
              : "Professional and polished.";

      prompt = isEmail
        ? `You are Loopin, an AI personal assistant. Draft an email reply.

${contextBlock}
${replyContext ? `User instruction: ${replyContext}` : ""}
Tone: ${toneGuide}

Instructions:
- Write only the email body.
- Keep it short (2-3 paragraphs max).
- Address the sender's points.
- No subject line or headers.`
        : `You are Loopin, an AI personal assistant. Draft a chat reply.

${contextBlock}
${replyContext ? `User instruction: ${replyContext}` : ""}
Tone: ${toneGuide}

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
