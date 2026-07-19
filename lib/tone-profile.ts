/**
 * Shared "Train AI on your tone" model — Normal (every plan) + Advanced (Business+).
 *
 * Normal: preset + short instructions + sign-off + up to 3 sample replies.
 * Advanced: documents / URLs / large text, compressed into toneKnowledgeSummary
 * so every draft prompt stays within token limits (no vector RAG in v1).
 *
 * buildTonePrompt() is the single place that turns a tone profile into prompt
 * text — every draft generator (auto-draft-reply, inbox AI, Gmail triage,
 * pending-drafts, needs-reply) should call it instead of building its own
 * tone string.
 */

export type ToneSourceType = "document" | "url" | "text";

export type ToneSource = {
  id: string;
  type: ToneSourceType;
  title: string;
  /** Extracted / pasted text, already capped to TONE_SOURCE_SINGLE_MAX_CHARS. */
  content: string;
  url?: string;
  createdAt: string;
};

export type ToneVoiceInput = {
  responseTone?: string;
  toneInstructions?: string;
  toneSignOff?: string;
  toneSamples?: string[];
  /** Gemini-compressed digest of Advanced sources — not raw source text. */
  toneKnowledgeSummary?: string;
};

export const TONE_SAMPLE_MAX = 3;
export const TONE_SAMPLE_MAX_CHARS = 1500;
export const TONE_INSTRUCTIONS_MAX_CHARS = 800;
export const TONE_SIGNOFF_MAX_CHARS = 120;

/** Advanced (Business+) caps. */
export const TONE_SOURCE_MAX_COUNT = 10;
export const TONE_SOURCE_TOTAL_MAX_CHARS = 50_000;
export const TONE_SOURCE_SINGLE_MAX_CHARS = 20_000;
export const TONE_KNOWLEDGE_SUMMARY_MAX_CHARS = 4_000;
export const TONE_URL_FETCH_TIMEOUT_MS = 10_000;

/** Preset → style guide. Shared so every draft path describes tone the same way. */
export function toneGuide(tone: string | undefined): string {
  switch (tone) {
    case "direct":
    case "assertive":
      return "Confident and direct, still polite.";
    case "executive":
    case "professional":
      return "Professional, polished, and concise.";
    case "short":
      return "Extremely concise (1-2 sentences).";
    case "friendly":
    default:
      return "Warm and friendly.";
  }
}

/**
 * Builds the tone/voice block injected into every draft-generation prompt.
 * Order: preset guide -> user instructions -> sample replies -> Advanced
 * knowledge summary -> sign-off. Keep this the only place that assembles it.
 */
export function buildTonePrompt(input: ToneVoiceInput): string {
  const lines: string[] = [`Tone: ${toneGuide(input.responseTone)}`];

  const instructions = (input.toneInstructions || "").trim();
  if (instructions) {
    lines.push(`How this person writes (from them directly): ${instructions}`);
  }

  const samples = (input.toneSamples || []).filter((s) => typeof s === "string" && s.trim());
  if (samples.length) {
    const formatted = samples
      .slice(0, TONE_SAMPLE_MAX)
      .map((s, i) => `Sample ${i + 1}: ${s.trim()}`)
      .join("\n");
    lines.push(`Match the voice of these real past replies:\n${formatted}`);
  }

  const knowledge = (input.toneKnowledgeSummary || "").trim();
  if (knowledge) {
    lines.push(
      `Background knowledge from the user's documents/sources (use for facts, not just style):\n${knowledge}`
    );
  }

  const signOff = (input.toneSignOff || "").trim();
  if (signOff) {
    lines.push(`When a closing is appropriate, sign off with: "${signOff}"`);
  }

  return lines.join("\n\n");
}

export function sanitizeToneInstructions(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, TONE_INSTRUCTIONS_MAX_CHARS);
}

export function sanitizeToneSignOff(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, TONE_SIGNOFF_MAX_CHARS);
}

export function sanitizeToneSamples(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
    .slice(0, TONE_SAMPLE_MAX)
    .map((s) => s.trim().slice(0, TONE_SAMPLE_MAX_CHARS));
}

/** Normalizes + re-caps stored sources (count, per-source, and total-char budget). */
export function sanitizeToneSources(value: unknown): ToneSource[] {
  if (!Array.isArray(value)) return [];
  const out: ToneSource[] = [];
  let totalChars = 0;

  for (const raw of value) {
    if (out.length >= TONE_SOURCE_MAX_COUNT) break;
    if (!raw || typeof raw !== "object") continue;

    const item = raw as Record<string, unknown>;
    const type = item.type;
    if (type !== "document" && type !== "url" && type !== "text") continue;

    const rawContent = typeof item.content === "string" ? item.content : "";
    const content = rawContent.slice(0, TONE_SOURCE_SINGLE_MAX_CHARS);
    if (!content.trim()) continue;

    const remaining = TONE_SOURCE_TOTAL_MAX_CHARS - totalChars;
    if (remaining <= 0) break;
    const clipped = content.slice(0, remaining);
    totalChars += clipped.length;

    out.push({
      id: typeof item.id === "string" && item.id ? item.id : `src_${Date.now()}_${out.length}`,
      type,
      title:
        typeof item.title === "string" && item.title.trim()
          ? item.title.trim().slice(0, 160)
          : "Untitled source",
      content: clipped,
      url: typeof item.url === "string" ? item.url.slice(0, 500) : undefined,
      createdAt: typeof item.createdAt === "string" ? item.createdAt : new Date().toISOString(),
    });
  }

  return out;
}

export function sanitizeToneKnowledgeSummary(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, TONE_KNOWLEDGE_SUMMARY_MAX_CHARS);
}
