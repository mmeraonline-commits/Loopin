/** Shared alert quality filters — delegates Gmail logic to gmail-email-classifier. */

import {
  classifyGmailMessage,
  isLoopinOwnEmail,
  isNotificationEmail,
  isPromotionalEmail,
  type GmailMessageInput,
} from "./gmail-email-classifier";

export type FilterableMessage = {
  app?: string;
  title?: string;
  description?: string;
  body?: string;
  from?: string;
  labels?: string[];
};

function toGmailInput(item: FilterableMessage): GmailMessageInput {
  return {
    from: item.from || item.body?.match(/^From:\s*(.+)$/im)?.[1],
    subject: item.title,
    snippet: item.description,
    body: item.body,
    labels: item.labels,
  };
}

/** Promotions, newsletters, and automated/system notices — never auto-draft these. */
export function isAutomatedOrPromotional(item: FilterableMessage): boolean {
  const app = (item.app || "gmail").toLowerCase();
  if (app === "gmail") {
    const msg = toGmailInput(item);
    return isLoopinOwnEmail(msg) || isPromotionalEmail(msg) || isNotificationEmail(msg);
  }
  if (app !== "outlook") return false;

  const text = `${item.from || ""} ${item.title || ""} ${item.description || ""} ${item.body || ""}`.toLowerCase();
  const from = (item.from || "").toLowerCase();

  if (/no[-_.]?reply|donotreply|mailer-daemon|notifications?@|newsletter@|noreply@|marketing@|promo@/i.test(from)) {
    return true;
  }
  if (/unsubscribe|% off|flash sale|newsletter|security alert|storage (almost )?full/i.test(text)) {
    return true;
  }
  return false;
}

export function looksUrgent(text: string): boolean {
  if (/urgent.*(sale|offer|deal|discount)|limited time only|flash sale/i.test(text)) return false;
  return /urgent|asap|deadline|blocked on|need (this|it|you) (today|now|asap)|by eod|immediately|time.?sensitive/.test(
    text
  );
}

/** Strict: only human messages that clearly expect a reply enter Confirm queue. */
export function looksNeedsReplyDraft(item: FilterableMessage): boolean {
  const app = (item.app || "gmail").toLowerCase();
  if (app === "gmail" || app === "outlook") {
    const c = classifyGmailMessage(toGmailInput(item));
    return c.shouldDraft;
  }

  if (isAutomatedOrPromotional(item)) return false;

  const text = `${item.from || ""} ${item.title || ""} ${item.description || ""} ${item.body || ""}`.toLowerCase();
  const urgent = looksUrgent(text);
  const directAsk =
    /(can|could|would) you|please (reply|respond|send|confirm|review|approve|get back)|let me know|looking forward to (your|hearing)|awaiting your|need your (feedback|input|approval|help)|get back to me|when (can|will) you|\?/.test(
      text
    );

  return urgent || directAsk;
}
