import { assertSendQuota, isNextResponse } from "@/lib/plan-usage";
import { trackFeatureUsage } from "@/lib/track-feature-usage";

const APP_URL = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

const SEND_TOOLS = new Set([
  "discord_reply_message",
  "discord_post_message",
  "slack_post_message",
  "gmail_send_message",
  "whatsapp_send_message",
  "telegram_send_message",
  "telegram_reply_message",
  "teams_send_message",
  "teams_reply_message",
  "linkedin_post_share",
]);

export type AgentAction = {
  tool: string;
  params: Record<string, unknown>;
};

const ALLOWED_TOOLS = new Set([
  "discord_reply_message",
  "discord_post_message",
  "slack_post_message",
  "gmail_send_message",
  "whatsapp_send_message",
  "telegram_send_message",
  "telegram_reply_message",
  "teams_send_message",
  "teams_reply_message",
  "linkedin_post_share",
  "calendly_cancel_event",
  "calendly_create_booking",
  "calendly_update_event_type",
  "calendly_enable_webhooks",
  "outlook_create_event",
  "outlook_list_events",
  "google_calendar_list_events",
  "google_calendar_create_event",
]);

const TOOL_ROUTES: Record<string, string> = {
  discord_reply_message: "/api/discord-mcp",
  discord_post_message: "/api/discord-mcp",
  slack_post_message: "/api/slack-mcp",
  gmail_send_message: "/api/gmail-mcp",
  whatsapp_send_message: "/api/whatsapp-mcp",
  telegram_send_message: "/api/telegram-mcp",
  telegram_reply_message: "/api/telegram-mcp",
  teams_send_message: "/api/teams-mcp",
  teams_reply_message: "/api/teams-mcp",
  linkedin_post_share: "/api/linkedin-mcp",
  calendly_cancel_event: "/api/calendly-mcp",
  calendly_create_booking: "/api/calendly-mcp",
  calendly_update_event_type: "/api/calendly-mcp",
  calendly_enable_webhooks: "/api/calendly-mcp",
  outlook_create_event: "/api/outlook-mcp",
  outlook_list_events: "/api/outlook-mcp",
  google_calendar_list_events: "/api/google-calendar-mcp",
  google_calendar_create_event: "/api/google-calendar-mcp",
};

export function isConfirmPrompt(text: string) {
  const t = text.trim().toLowerCase();
  return /^(yes|yep|yeah|yup|confirm|confirmed|send it|send|approve|approved|go ahead|do it|ok|okay|sure|please send|add it|create it|schedule it|book it)([!.\s]|$)/i.test(
    t
  );
}

export async function executeAgentAction(
  action: AgentAction,
  userId: string,
  origin = APP_URL
): Promise<{ ok: boolean; result?: unknown; error?: string }> {
  if (!action?.tool || !ALLOWED_TOOLS.has(action.tool)) {
    return { ok: false, error: `Tool not allowed: ${action?.tool || "missing"}` };
  }

  const route = TOOL_ROUTES[action.tool];
  if (!route) return { ok: false, error: `No route for tool ${action.tool}` };

  if (SEND_TOOLS.has(action.tool)) {
    const quota = await assertSendQuota(userId);
    if (isNextResponse(quota)) {
      const payload = await quota.json().catch(() => ({}));
      return { ok: false, error: payload.error || "Send quota exceeded" };
    }
  }

  const params = { ...(action.params || {}) };

  // Normalize common aliases
  if (action.tool.startsWith("discord_")) {
    if (!params.content && params.text) params.content = params.text;
    if (!params.replyToMessageId && params.messageId) params.replyToMessageId = params.messageId;
  }
  if (action.tool === "whatsapp_send_message") {
    if (!params.to && params.chatId) params.to = params.chatId;
  }
  if (action.tool === "telegram_send_message" || action.tool === "telegram_reply_message") {
    if (!params.chatId && params.to) params.chatId = params.to;
    if (!params.text && params.body) params.text = params.body;
    if (!params.text && params.content) params.text = params.content;
  }
  if (action.tool === "teams_send_message" || action.tool === "teams_reply_message") {
    if (!params.chatId && params.to) params.chatId = params.to;
    if (!params.chatId && params.channelId) params.chatId = params.channelId;
    if (!params.text && params.body) params.text = params.body;
    if (!params.text && params.content) params.text = params.content;
  }
  if (action.tool === "google_calendar_create_event") {
    if (!params.summary && params.title) params.summary = params.title;
    if (!params.summary && params.subject) params.summary = params.subject;
    if (!params.description && params.body) params.description = params.body;
  }
  if (action.tool === "outlook_create_event") {
    if (!params.summary && params.title) params.summary = params.title;
    if (!params.summary && params.subject) params.summary = params.subject;
    if (!params.description && params.body) params.description = params.body;
  }

  try {
    const res = await fetch(`${origin}${route}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        method: action.tool,
        params,
        userId,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.error) {
      return {
        ok: false,
        error: json.error?.message || json.error || `Failed to execute ${action.tool}`,
      };
    }

    const text = json.result?.content?.[0]?.text;
    let parsed: unknown = json.result;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
    }
    if (SEND_TOOLS.has(action.tool)) {
      void trackFeatureUsage({
        userId,
        feature: "send",
        action: "confirmed",
        metadata: { tool: action.tool },
      });
    }
    return { ok: true, result: parsed };
  } catch (err: unknown) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Action execution failed",
    };
  }
}
