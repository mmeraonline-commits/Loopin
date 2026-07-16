/**
 * Cross-platform "needs reply" classification for Unified Inbox.
 * Gmail/Outlook use smarter email rules; chat apps use direct-ask heuristics.
 */

import {
  classifyGmailMessage,
  type GmailCategory,
  type GmailClassification,
} from "./gmail-email-classifier";
import { looksNeedsReplyDraft, looksUrgent } from "./alert-message-filters";

export type InboxReplyClass = {
  category: GmailCategory | "chat_needs_reply" | "other";
  needsReply: boolean;
  reason: string;
};

export function classifyInboxItem(input: {
  app: string;
  title?: string;
  preview?: string;
  body?: string;
  from?: string;
  labels?: string[];
}): InboxReplyClass {
  const app = (input.app || "").toLowerCase();

  if (app === "gmail" || app === "outlook") {
    const result: GmailClassification = classifyGmailMessage({
      from: input.from,
      subject: input.title,
      snippet: input.preview,
      body: input.body,
      labels: input.labels,
    });
    return {
      category: result.category,
      needsReply: result.shouldDraft,
      reason: result.reason,
    };
  }

  const asFilter = {
    app,
    title: input.title,
    description: input.preview,
    body: input.body,
    from: input.from,
  };

  if (looksNeedsReplyDraft(asFilter)) {
    const urgent = looksUrgent(
      `${input.from || ""} ${input.title || ""} ${input.preview || ""} ${input.body || ""}`.toLowerCase()
    );
    return {
      category: urgent ? "urgent" : "chat_needs_reply",
      needsReply: true,
      reason: urgent
        ? "Urgent message that expects a reply"
        : "Message asks a question or expects a reply",
    };
  }

  return {
    category: "other",
    needsReply: false,
    reason: "No clear reply needed",
  };
}
