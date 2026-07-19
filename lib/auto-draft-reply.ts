import { GoogleGenAI } from "@google/genai";
import { hasInsforgeAdminKey, insforgeAdmin } from "@/lib/insforge-admin";
import { isAutomatedOrPromotional } from "@/lib/alert-message-filters";
import {
  buildTonePrompt,
  sanitizeToneInstructions,
  sanitizeToneKnowledgeSummary,
  sanitizeToneSamples,
  sanitizeToneSignOff,
  type ToneSource,
} from "@/lib/tone-profile";

export type DraftTone = "direct" | "friendly" | "executive" | "professional" | "short" | "assertive";

/** Per-category opt-out for native Gmail auto-draft (labeling itself is always on). */
export type GmailAutoDraftCategoryToggles = {
  urgent: boolean;
  needs_reply: boolean;
};

export type AssistantSettingsSnapshot = {
  responseTone?: DraftTone | string;
  autoDraftReplies?: boolean;
  /** ISO timestamp — only Gmail received after this is labeled/drafted (set on first native sync). */
  gmailInboxSyncStartedAt?: string;
  gmailLabelIds?: Record<string, string>;
  gmailAutoDraftCategories?: Partial<GmailAutoDraftCategoryToggles>;
  /** Normal tone training (every plan). */
  toneInstructions?: string;
  toneSignOff?: string;
  toneSamples?: string[];
  /** Advanced tone training (Business+) — sources feed toneKnowledgeSummary. */
  toneSources?: ToneSource[];
  toneKnowledgeSummary?: string;
};

/** Required<AssistantSettingsSnapshot> is shallow — gmailAutoDraftCategories still needs its own keys spelled out. */
export type ResolvedAssistantSettings = Required<Omit<AssistantSettingsSnapshot, "gmailAutoDraftCategories">> & {
  gmailAutoDraftCategories: GmailAutoDraftCategoryToggles;
};

const DEFAULT_SETTINGS: ResolvedAssistantSettings = {
  responseTone: "friendly",
  autoDraftReplies: true,
  gmailInboxSyncStartedAt: "",
  gmailLabelIds: {},
  gmailAutoDraftCategories: { urgent: true, needs_reply: true },
  toneInstructions: "",
  toneSignOff: "",
  toneSamples: [],
  toneSources: [],
  toneKnowledgeSummary: "",
};

export async function loadAssistantSettings(userId: string): Promise<ResolvedAssistantSettings> {
  if (!hasInsforgeAdminKey) return DEFAULT_SETTINGS;
  try {
    const { data } = await insforgeAdmin.database
      .from("users")
      .select("assistant_settings")
      .eq("id", userId)
      .maybeSingle();
    const raw = (data?.assistant_settings || {}) as AssistantSettingsSnapshot;
    return {
      responseTone: (raw.responseTone as DraftTone) || DEFAULT_SETTINGS.responseTone,
      autoDraftReplies:
        typeof raw.autoDraftReplies === "boolean"
          ? raw.autoDraftReplies
          : DEFAULT_SETTINGS.autoDraftReplies,
      gmailInboxSyncStartedAt:
        raw.gmailInboxSyncStartedAt || DEFAULT_SETTINGS.gmailInboxSyncStartedAt,
      gmailLabelIds: raw.gmailLabelIds || DEFAULT_SETTINGS.gmailLabelIds,
      gmailAutoDraftCategories: {
        urgent:
          typeof raw.gmailAutoDraftCategories?.urgent === "boolean"
            ? raw.gmailAutoDraftCategories.urgent
            : DEFAULT_SETTINGS.gmailAutoDraftCategories.urgent,
        needs_reply:
          typeof raw.gmailAutoDraftCategories?.needs_reply === "boolean"
            ? raw.gmailAutoDraftCategories.needs_reply
            : DEFAULT_SETTINGS.gmailAutoDraftCategories.needs_reply,
      },
      toneInstructions: sanitizeToneInstructions(raw.toneInstructions) || DEFAULT_SETTINGS.toneInstructions,
      toneSignOff: sanitizeToneSignOff(raw.toneSignOff) || DEFAULT_SETTINGS.toneSignOff,
      toneSamples: sanitizeToneSamples(raw.toneSamples),
      toneSources: Array.isArray(raw.toneSources) ? raw.toneSources : DEFAULT_SETTINGS.toneSources,
      toneKnowledgeSummary:
        sanitizeToneKnowledgeSummary(raw.toneKnowledgeSummary) || DEFAULT_SETTINGS.toneKnowledgeSummary,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function generateAlertReplyDraft(input: {
  title: string;
  description: string;
  fullDetails?: string;
  sourceApp: string;
  tone?: string;
  toneInstructions?: string;
  toneSignOff?: string;
  toneSamples?: string[];
  toneKnowledgeSummary?: string;
  replyContext?: string;
}): Promise<string | null> {
  const geminiApiKey = process.env.GEMINI_API_KEY;
  if (!geminiApiKey) return null;

  const toneBlock = buildTonePrompt({
    responseTone: input.tone,
    toneInstructions: input.toneInstructions,
    toneSignOff: input.toneSignOff,
    toneSamples: input.toneSamples,
    toneKnowledgeSummary: input.toneKnowledgeSummary,
  });
  const isEmail = input.sourceApp === "gmail" || input.sourceApp === "outlook";
  const prompt = isEmail
    ? `You are OmniSync, an AI personal assistant. Draft a reply email in the user's tone.

Alert Title: ${input.title}
Description: ${input.description}
Full Text / details:
${input.fullDetails || "None"}
${input.replyContext ? `User instruction: ${input.replyContext}` : ""}
${toneBlock}

Instructions:
- Write only the email body.
- Keep it short (2-3 paragraphs max).
- Address the sender's points clearly.
- No subject line or headers.`
    : `You are OmniSync, an AI personal assistant. Draft a chat reply in the user's tone.

Title/Sender: ${input.title}
Message: ${input.description}
Details: ${input.fullDetails || "None"}
${input.replyContext ? `User instruction: ${input.replyContext}` : ""}
${toneBlock}

Instructions:
- Write only the message text.
- Keep it brief (1-3 sentences).
- Natural and ready to send.`;

  try {
    const ai = new GoogleGenAI({ apiKey: geminiApiKey });
    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-lite",
      contents: prompt,
    });
    const text = (response.text || "").trim();
    return text || null;
  } catch (err) {
    console.error("[auto-draft-reply] generate failed:", err);
    return null;
  }
}

/**
 * When an alert needs a response, auto-prepare a draft into the confirm queue.
 * Never sends. Safe to call fire-and-forget after insert.
 */
export async function maybeAutoDraftAlertReply(alert: {
  id: string;
  user_id: string;
  title: string;
  description?: string;
  full_details?: string;
  source_app?: string;
  requires_response?: boolean;
}): Promise<{ drafted: boolean; draft?: string }> {
  if (!alert?.id || !alert.requires_response) return { drafted: false };
  if (!hasInsforgeAdminKey) return { drafted: false };

  if (
    isAutomatedOrPromotional({
      app: alert.source_app || "gmail",
      title: alert.title,
      description: alert.description || "",
      body: alert.full_details || "",
    })
  ) {
    return { drafted: false };
  }

  const settings = await loadAssistantSettings(alert.user_id);
  if (!settings.autoDraftReplies) return { drafted: false };

  const draft = await generateAlertReplyDraft({
    title: alert.title,
    description: alert.description || "",
    fullDetails: alert.full_details,
    sourceApp: alert.source_app || "gmail",
    tone: settings.responseTone,
    toneInstructions: settings.toneInstructions,
    toneSignOff: settings.toneSignOff,
    toneSamples: settings.toneSamples,
    toneKnowledgeSummary: settings.toneKnowledgeSummary,
  });

  if (!draft) return { drafted: false };

  const { error } = await insforgeAdmin.database
    .from("alerts")
    .update({
      draft_reply: draft,
      draft_status: "pending_confirm",
      drafted_at: new Date().toISOString(),
      draft_tone: settings.responseTone,
      suggested_action: "Review the auto-draft and Confirm & send when ready.",
      updated_at: new Date().toISOString(),
    })
    .eq("id", alert.id);

  if (error) {
    console.error("[auto-draft-reply] save failed:", error);
    return { drafted: false };
  }

  return { drafted: true, draft };
}
