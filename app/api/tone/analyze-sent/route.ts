import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { hasInsforgeAdminKey, insforgeAdmin } from "@/lib/insforge-admin";
import { TONE_INSTRUCTIONS_MAX_CHARS, TONE_SAMPLE_MAX, TONE_SAMPLE_MAX_CHARS, TONE_SIGNOFF_MAX_CHARS } from "@/lib/tone-profile";

const APP_URL = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Internal Server Error";
}

async function callGmailMcp(userId: string, method: string, params: Record<string, unknown> = {}) {
  const res = await fetch(`${APP_URL}/api/gmail-mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ method, params, userId }),
  });
  const json = await res.json();
  if (json.error) {
    throw new Error(json.error.message || `Gmail MCP error (${method})`);
  }
  const text = json.result?.content?.[0]?.text;
  return text ? JSON.parse(text) : json.result;
}

type SentMessage = { subject?: string; body?: string; snippet?: string };

/**
 * POST /api/tone/analyze-sent — Normal tone bootstrap.
 * Reads a handful of the user's real sent Gmail messages and asks Gemini to
 * describe their voice. Returns a suggestion only — nothing is persisted
 * here, the Settings UI lets the user review/edit then Save.
 */
export async function POST(req: NextRequest) {
  try {
    const { userId } = await req.json();
    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }
    if (!hasInsforgeAdminKey) {
      return NextResponse.json({ error: "Server key missing" }, { status: 503 });
    }

    const { data: userRow } = await insforgeAdmin.database
      .from("users")
      .select("integrations")
      .eq("id", userId)
      .maybeSingle();

    const gmail = (userRow?.integrations as Record<string, { connected?: boolean } | null> | undefined)?.gmail;
    if (!gmail?.connected) {
      return NextResponse.json(
        { error: "Connect Gmail first to analyze your sent mail." },
        { status: 400 }
      );
    }

    let sent: SentMessage[] = [];
    try {
      const list = await callGmailMcp(userId, "gmail_list_messages", {
        q: "in:sent",
        maxResults: 12,
        includeBody: true,
      });
      sent = (list?.messages || []) as SentMessage[];
    } catch (err) {
      return NextResponse.json(
        { error: getErrorMessage(err) || "Failed to read sent mail" },
        { status: 502 }
      );
    }

    const usable = sent
      .map((m) => (m.body || m.snippet || "").trim())
      .filter((text) => text.length > 40)
      .slice(0, 8);

    if (usable.length === 0) {
      return NextResponse.json(
        { error: "No sent mail with enough content was found yet." },
        { status: 404 }
      );
    }

    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) {
      return NextResponse.json(
        { error: "AI service is not configured (GEMINI_API_KEY missing)" },
        { status: 503 }
      );
    }

    const prompt = `You are analyzing someone's real sent emails to describe their writing voice for an AI assistant that will draft replies on their behalf.

Sent emails (most recent first):
${usable.map((text, i) => `--- Email ${i + 1} ---\n${text.slice(0, 1200)}`).join("\n\n")}

Return valid JSON only:
{
  "instructions": "a short (under 250 characters) description of how this person writes: sentence length, formality, punctuation habits, greeting/closing style, common phrases",
  "signOff": "their most common sign-off/closing phrase, or an empty string if none is consistent",
  "samples": ["1-2 short representative excerpts (under 280 characters each) that best show their voice, verbatim or lightly trimmed"]
}`;

    const ai = new GoogleGenAI({ apiKey: geminiApiKey });
    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-lite",
      contents: prompt,
      config: { responseMimeType: "application/json" },
    });

    let parsed: { instructions?: string; signOff?: string; samples?: string[] } = {};
    try {
      parsed = JSON.parse(response.text || "{}");
    } catch {
      parsed = {};
    }

    const instructions =
      typeof parsed.instructions === "string" ? parsed.instructions.trim().slice(0, TONE_INSTRUCTIONS_MAX_CHARS) : "";
    const signOff = typeof parsed.signOff === "string" ? parsed.signOff.trim().slice(0, TONE_SIGNOFF_MAX_CHARS) : "";
    const samples = Array.isArray(parsed.samples)
      ? parsed.samples
          .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
          .slice(0, TONE_SAMPLE_MAX)
          .map((s) => s.trim().slice(0, TONE_SAMPLE_MAX_CHARS))
      : [];

    if (!instructions && !signOff && samples.length === 0) {
      return NextResponse.json({ error: "Could not derive a style suggestion from sent mail." }, { status: 500 });
    }

    return NextResponse.json({
      analyzed: usable.length,
      suggestion: { instructions, signOff, samples },
    });
  } catch (err: unknown) {
    console.error("[tone/analyze-sent]", err);
    return NextResponse.json({ error: getErrorMessage(err) }, { status: 500 });
  }
}
