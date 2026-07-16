import { assertSendQuota, isNextResponse } from "@/lib/plan-usage";
import { trackFeatureUsage } from "@/lib/track-feature-usage";

const APP_URL = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export type ReplyRef = {
  app: string;
  messageId?: string;
  channelId?: string;
  threadId?: string;
  chatId?: string;
  emailId?: string;
};

const REF_MARKER = "omnisync_ref:";

export function encodeReplyRef(ref: ReplyRef, body: string) {
  return `${body}\n\n---\n${REF_MARKER}${JSON.stringify(ref)}`;
}

export function parseReplyRef(fullDetails?: string | null): ReplyRef | null {
  if (!fullDetails) return null;
  const idx = fullDetails.lastIndexOf(REF_MARKER);
  if (idx === -1) return null;
  try {
    return JSON.parse(fullDetails.slice(idx + REF_MARKER.length).trim()) as ReplyRef;
  } catch {
    return null;
  }
}

async function callMcp(path: string, method: string, userId: string, params: Record<string, unknown>) {
  const res = await fetch(`${APP_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ method, params, userId }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) {
    throw new Error(json.error?.message || json.error || `Failed to call ${method}`);
  }
  return json;
}

/** Send a reply through the connected platform MCP for an alert (or explicit ref). */
export async function sendPlatformReply(options: {
  userId: string;
  sourceApp: string;
  text: string;
  fullDetails?: string | null;
  activityId?: string | null;
}) {
  const { userId, sourceApp, text, fullDetails, activityId } = options;
  const ref = parseReplyRef(fullDetails) || { app: sourceApp, messageId: activityId || undefined };
  const body = text.trim();
  if (!body) throw new Error("Reply text is empty");

  const quota = await assertSendQuota(userId);
  if (isNextResponse(quota)) {
    const payload = await quota.json().catch(() => ({}));
    throw new Error(payload.error || "Send quota exceeded");
  }

  switch (sourceApp) {
    case "discord": {
      if (!ref.channelId || !ref.messageId) {
        throw new Error("Discord reply needs channelId and messageId. Re-run AI scan after updating Discord.");
      }
      await callMcp("/api/discord-mcp", "discord_reply_message", userId, {
        channelId: ref.channelId,
        replyToMessageId: ref.messageId,
        content: body,
      });
      void trackFeatureUsage({ userId, feature: "send", action: "confirmed", metadata: { app: "discord" } });
      return { ok: true, app: "discord" };
    }
    case "slack": {
      if (!ref.channelId) {
        throw new Error("Slack reply needs channelId. Re-run AI scan after updating Slack.");
      }
      await callMcp("/api/slack-mcp", "slack_post_message", userId, {
        channelId: ref.channelId,
        text: body,
        thread_ts: ref.messageId,
      });
      void trackFeatureUsage({ userId, feature: "send", action: "confirmed", metadata: { app: "slack" } });
      return { ok: true, app: "slack" };
    }
    case "gmail": {
      const toMatch = fullDetails?.match(/From:\s*(.+)/i);
      const subjectMatch = fullDetails?.match(/Subject:\s*(.+)/i);
      const to = toMatch?.[1]?.trim();
      if (!to) throw new Error("Could not find Gmail recipient on this alert.");
      await callMcp("/api/gmail-mcp", "gmail_send_message", userId, {
        to,
        subject: subjectMatch?.[1]?.trim()?.startsWith("Re:")
          ? subjectMatch[1].trim()
          : `Re: ${subjectMatch?.[1]?.trim() || "Your message"}`,
        body,
        threadId: ref.threadId,
        inReplyTo: ref.messageId || activityId,
      });
      void trackFeatureUsage({ userId, feature: "send", action: "confirmed", metadata: { app: "gmail" } });
      return { ok: true, app: "gmail" };
    }
    case "whatsapp": {
      const chatId = ref.chatId || activityId;
      if (!chatId) throw new Error("WhatsApp reply needs a chat id.");
      await callMcp("/api/whatsapp-mcp", "whatsapp_send_message", userId, {
        to: chatId,
        body,
      });
      void trackFeatureUsage({ userId, feature: "send", action: "confirmed", metadata: { app: "whatsapp" } });
      return { ok: true, app: "whatsapp" };
    }
    default:
      throw new Error(`Sending replies for ${sourceApp} is not supported yet.`);
  }
}
