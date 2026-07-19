import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { hasInsforgeAdminKey, insforgeAdmin } from "@/lib/insforge-admin";
import { getPlan, planRank } from "@/lib/plans";
import {
  TONE_KNOWLEDGE_SUMMARY_MAX_CHARS,
  TONE_SOURCE_MAX_COUNT,
  TONE_SOURCE_SINGLE_MAX_CHARS,
  TONE_URL_FETCH_TIMEOUT_MS,
  sanitizeToneSources,
  type ToneSource,
  type ToneSourceType,
} from "@/lib/tone-profile";

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Internal Server Error";
}

/** Regex-based readable-text extraction — good enough for v1 (no vector RAG, no new deps). */
function htmlToReadableText(html: string): string {
  const withoutNoise = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
  const withoutTags = withoutNoise.replace(/<[^>]+>/g, " ");
  const decoded = withoutTags
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/gi, "'");
  return decoded.replace(/\s+/g, " ").trim();
}

async function fetchUrlAsText(url: string): Promise<{ title: string; content: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TONE_URL_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; LoopinBot/1.0; +https://loopin.ai)" },
    });
    if (!res.ok) throw new Error(`Fetch failed (HTTP ${res.status})`);

    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("text") && !contentType.includes("html")) {
      throw new Error("That URL did not return readable text content");
    }

    const html = await res.text();
    const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    const title = titleMatch?.[1]?.trim() || url;
    const content = htmlToReadableText(html).slice(0, TONE_SOURCE_SINGLE_MAX_CHARS);
    if (!content) throw new Error("No readable text found at that URL");

    return { title, content };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`Timed out after ${TONE_URL_FETCH_TIMEOUT_MS / 1000}s`);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

/** Compresses Advanced sources into a compact digest so draft prompts stay within token limits. */
async function summarizeToneSources(sources: ToneSource[]): Promise<string> {
  if (sources.length === 0) return "";

  const combined = sources
    .map((s, i) => `--- Source ${i + 1}: ${s.title} (${s.type}) ---\n${s.content.slice(0, 6000)}`)
    .join("\n\n");

  const geminiApiKey = process.env.GEMINI_API_KEY;
  if (!geminiApiKey) {
    return combined.slice(0, TONE_KNOWLEDGE_SUMMARY_MAX_CHARS);
  }

  try {
    const ai = new GoogleGenAI({ apiKey: geminiApiKey });
    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-lite",
      contents: `Summarize the following documents/sources into a compact knowledge digest an AI assistant can use as background context when drafting replies for this person. Preserve facts, terminology, and any voice cues. Be dense, no filler, no headers.

${combined}

Return plain text only, under ${TONE_KNOWLEDGE_SUMMARY_MAX_CHARS} characters.`,
    });
    const text = (response.text || "").trim();
    return (text || combined).slice(0, TONE_KNOWLEDGE_SUMMARY_MAX_CHARS);
  } catch (err) {
    console.error("[tone/sources] summary generation failed:", err);
    return combined.slice(0, TONE_KNOWLEDGE_SUMMARY_MAX_CHARS);
  }
}

async function loadUserForTone(userId: string) {
  const { data, error } = await insforgeAdmin.database
    .from("users")
    .select("plan, assistant_settings")
    .eq("id", userId)
    .maybeSingle();
  if (error || !data) return null;
  return data as { plan?: string; assistant_settings?: Record<string, unknown> | null };
}

/**
 * POST /api/tone/sources — add/remove Advanced (Business+) training sources
 * (document text, URL fetch, or pasted large text) and re-run the
 * toneKnowledgeSummary digest used by buildTonePrompt.
 */
export async function POST(req: NextRequest) {
  try {
    if (!hasInsforgeAdminKey) {
      return NextResponse.json({ error: "Server key missing" }, { status: 503 });
    }

    const body = await req.json();
    const userId = body?.userId as string | undefined;
    const action = (body?.action as string) || "add";
    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    const userRow = await loadUserForTone(userId);
    if (!userRow) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const planId = getPlan(userRow.plan).id;
    if (planRank(planId) < planRank("business")) {
      return NextResponse.json(
        {
          error: "Advanced tone training (documents, URLs, large text) requires the Business plan or higher.",
          code: "PLAN_LOCKED",
        },
        { status: 403 }
      );
    }

    const current = (userRow.assistant_settings || {}) as Record<string, unknown>;
    let sources = sanitizeToneSources(current.toneSources);

    if (action === "remove") {
      const sourceId = body?.sourceId as string | undefined;
      if (!sourceId) {
        return NextResponse.json({ error: "sourceId is required" }, { status: 400 });
      }
      sources = sources.filter((s) => s.id !== sourceId);
    } else if (action === "add") {
      const raw = (body?.source || {}) as { type?: string; title?: string; content?: string; url?: string };
      const type = raw.type as ToneSourceType | undefined;
      if (type !== "document" && type !== "url" && type !== "text") {
        return NextResponse.json({ error: "source.type must be document, url, or text" }, { status: 400 });
      }
      if (sources.length >= TONE_SOURCE_MAX_COUNT) {
        return NextResponse.json(
          { error: `You've reached the ${TONE_SOURCE_MAX_COUNT}-source limit. Remove one before adding another.` },
          { status: 400 }
        );
      }

      let title = (raw.title || "").trim();
      let content = "";
      let url: string | undefined;

      if (type === "url") {
        url = (raw.url || "").trim();
        if (!url) {
          return NextResponse.json({ error: "url is required for a url source" }, { status: 400 });
        }
        try {
          const fetched = await fetchUrlAsText(url);
          content = fetched.content;
          title = title || fetched.title;
        } catch (err) {
          return NextResponse.json(
            { error: `Could not read that URL: ${getErrorMessage(err)}` },
            { status: 400 }
          );
        }
      } else {
        content = (raw.content || "").trim().slice(0, TONE_SOURCE_SINGLE_MAX_CHARS);
        title = title || (type === "document" ? "Uploaded document" : "Pasted notes");
      }

      if (!content) {
        return NextResponse.json({ error: "No readable text content found for that source" }, { status: 400 });
      }

      sources = sanitizeToneSources([
        ...sources,
        {
          id: `src_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          type,
          title: title.slice(0, 160),
          content,
          url,
          createdAt: new Date().toISOString(),
        },
      ]);
    } else if (action !== "regenerate") {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    const toneKnowledgeSummary = await summarizeToneSources(sources);

    const { data: updated, error: updateError } = await insforgeAdmin.database
      .from("users")
      .update({
        assistant_settings: { ...current, toneSources: sources, toneKnowledgeSummary },
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId)
      .select("assistant_settings")
      .maybeSingle();

    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

    const savedSettings = (updated?.assistant_settings || {}) as Record<string, unknown>;
    return NextResponse.json({
      toneSources: Array.isArray(savedSettings.toneSources) ? savedSettings.toneSources : sources,
      toneKnowledgeSummary:
        typeof savedSettings.toneKnowledgeSummary === "string" ? savedSettings.toneKnowledgeSummary : toneKnowledgeSummary,
    });
  } catch (err: unknown) {
    console.error("[tone/sources]", err);
    return NextResponse.json({ error: getErrorMessage(err) }, { status: 500 });
  }
}
