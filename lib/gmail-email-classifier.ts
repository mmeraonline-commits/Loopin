/**
 * Gmail categorization for auto-triage.
 * Priority: promotional & notifications first — never draft those.
 * "Urgent sale" marketing ≠ human urgent.
 */

export type GmailCategory = "promotional" | "notification" | "needs_reply" | "urgent" | "inbox";

export type GmailMessageInput = {
  from?: string;
  subject?: string;
  snippet?: string;
  body?: string;
  /** Gmail labelIds e.g. CATEGORY_PROMOTIONS */
  labels?: string[];
};

export type GmailClassification = {
  category: GmailCategory;
  shouldDraft: boolean;
  shouldLabel: boolean;
  reason: string;
};

const PROMO_LABELS = new Set(["CATEGORY_PROMOTIONS", "CATEGORY_SOCIAL", "CATEGORY_FORUMS"]);

function textOf(msg: GmailMessageInput): string {
  return `${msg.from || ""} ${msg.subject || ""} ${msg.snippet || ""} ${msg.body || ""}`.toLowerCase();
}

function fromAddress(msg: GmailMessageInput): string {
  return (msg.from || "").toLowerCase();
}

function isBulkSender(from: string): boolean {
  return /no[-_.]?reply|donotreply|mailer-daemon|notifications?@|newsletter@|news@|updates?@|billing@|receipts?@|noreply@|marketing@|promo@|deals?@|info@|hello@|team@|support@.*\.(zendesk|freshdesk|intercom)/i.test(
    from
  );
}

/** Marketing / newsletter — checked BEFORE urgency keywords. */
export function isPromotionalEmail(msg: GmailMessageInput): boolean {
  if (msg.labels?.some((l) => PROMO_LABELS.has(l))) return true;

  const text = textOf(msg);
  const from = fromAddress(msg);

  if (isBulkSender(from)) return true;

  if (
    /unsubscribe|manage (your )?preferences|email preferences|view in browser|one.?click unsubscribe|you('re| are) receiving this|opt out|% off|\d+% off|flash sale|limited[- ]time|last chance|don't miss|act now|shop now|free shipping|coupon|promo code|newsletter|exclusive offer|special offer|deal of the day|save \d+|buy now|order now|claim your|your cart|abandoned cart/i.test(
      text
    )
  ) {
    return true;
  }

  // Marketing uses fake urgency — never treat as human urgent.
  if (
    /urgent.*(sale|offer|deal|discount)|limited time only|expires (today|soon|tonight)|hurry|ends (today|soon|midnight)/i.test(
      text
    )
  ) {
    return true;
  }

  return false;
}

/** System / account notices — label only, no draft. */
export function isNotificationEmail(msg: GmailMessageInput): boolean {
  if (msg.labels?.includes("CATEGORY_UPDATES")) {
    const text = textOf(msg);
    if (!/(can|could|would) you|please reply|let me know|\?/.test(text)) {
      return true;
    }
  }

  const text = textOf(msg);
  const from = fromAddress(msg);

  if (
    /security alert|new (sign[- ]?in|device|passkey|security info)|storage (almost )?full|quota|password (was )?changed|two[- ]?factor|verify your (email|account)|account recovery|your google account|microsoft account security|invoice (is )?ready|receipt for|payment (received|confirmed)|order confirmation|shipment (has )?shipped|delivery update|subscription (renewed|expiring)/i.test(
      text
    )
  ) {
    return true;
  }

  if (isBulkSender(from) && !isPromotionalEmail(msg)) {
    return true;
  }

  return false;
}

function isLikelyHumanSender(msg: GmailMessageInput): boolean {
  const from = fromAddress(msg);
  if (!from || isBulkSender(from)) return false;
  if (/^(info|support|hello|team|news|billing|noreply)@/i.test(from)) return false;
  return true;
}

function hasDirectAsk(text: string, subject: string): boolean {
  return (
    /(can|could|would) you|please (reply|respond|send|confirm|review|approve|get back)|let me know|looking forward to (your|hearing)|awaiting your|need your (feedback|input|approval|help)|get back to me|when (can|will) you|waiting (on|for) (your|you)|quick (question|favor|ask)|thoughts\?|available\?/i.test(
      text
    ) || /\?/.test(`${subject}`)
  );
}

function hasRealUrgency(text: string): boolean {
  if (/urgent.*(sale|offer|deal|discount)|limited time only|flash sale/i.test(text)) return false;
  return /urgent|asap|as soon as possible|deadline|blocked on|need (this|it|you) (today|now|asap)|by eod|end of day|immediately|time.?sensitive|today by|before (noon|5|eod)/i.test(
    text
  );
}

export function classifyGmailMessage(msg: GmailMessageInput): GmailClassification {
  const text = textOf(msg);
  const subject = msg.subject || "";

  if (isPromotionalEmail(msg)) {
    return {
      category: "promotional",
      shouldDraft: false,
      shouldLabel: true,
      reason: "Promotional / marketing email",
    };
  }

  if (isNotificationEmail(msg)) {
    return {
      category: "notification",
      shouldDraft: false,
      shouldLabel: true,
      reason: "Automated notification or account update",
    };
  }

  if (!isLikelyHumanSender(msg)) {
    return {
      category: "inbox",
      shouldDraft: false,
      shouldLabel: false,
      reason: "Non-human sender — skipped",
    };
  }

  const directAsk = hasDirectAsk(text, subject);
  const realUrgent = hasRealUrgency(text);

  if (realUrgent && directAsk) {
    return {
      category: "urgent",
      shouldDraft: true,
      shouldLabel: true,
      reason: "Human message with real urgency and a direct ask",
    };
  }

  if (directAsk) {
    return {
      category: "needs_reply",
      shouldDraft: true,
      shouldLabel: true,
      reason: "Human message expecting a reply",
    };
  }

  if (realUrgent) {
    return {
      category: "urgent",
      shouldDraft: false,
      shouldLabel: true,
      reason: "Urgent tone but no clear reply ask — label only",
    };
  }

  return {
    category: "inbox",
    shouldDraft: false,
    shouldLabel: false,
    reason: "No action needed",
  };
}

export const LOOPIN_LABEL_NAMES = {
  promotional: "Loopin/Promotional",
  notification: "Loopin/Notifications",
  needs_reply: "Loopin/NeedsReply",
  urgent: "Loopin/Urgent",
  processed: "Loopin/Processed",
} as const;

export function loopinLabelForCategory(category: GmailCategory): string | null {
  if (category === "promotional") return LOOPIN_LABEL_NAMES.promotional;
  if (category === "notification") return LOOPIN_LABEL_NAMES.notification;
  if (category === "needs_reply") return LOOPIN_LABEL_NAMES.needs_reply;
  if (category === "urgent") return LOOPIN_LABEL_NAMES.urgent;
  return null;
}
