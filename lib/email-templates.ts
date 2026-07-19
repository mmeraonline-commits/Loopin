/**
 * Shared Loopin email templates — clean, professional, table-based for clients.
 */

export function escapeHtml(value: string): string {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const PRODUCTION_APP_URL = "https://omnisync.mamutech-online.workers.dev";

function isLocalUrl(url: string): boolean {
  return /localhost|127\.0\.0\.1|0\.0\.0\.0/i.test(url);
}

/** Public site URL for email CTAs — never localhost. */
function appBaseUrl(): string {
  const candidates = [
    process.env.EMAIL_APP_URL,
    process.env.APP_URL,
    process.env.NEXT_PUBLIC_APP_URL,
    PRODUCTION_APP_URL,
  ];
  for (const raw of candidates) {
    const url = String(raw || "")
      .trim()
      .replace(/\/$/, "");
    if (url && url.startsWith("http") && !isLocalUrl(url)) return url;
  }
  return PRODUCTION_APP_URL;
}

function absoluteUrl(pathOrUrl?: string): string {
  const base = appBaseUrl();
  if (!pathOrUrl) return `${base}/dashboard`;
  if (pathOrUrl.startsWith("http")) return pathOrUrl;
  return `${base}${pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`}`;
}

type LayoutInput = {
  preheader?: string;
  eyebrow?: string;
  title: string;
  bodyHtml: string;
  ctaLabel?: string;
  ctaUrl?: string;
  footerNote?: string;
};

/** Outer shell used by every Loopin transactional email. */
export function renderEmailLayout(input: LayoutInput): { html: string; text: string } {
  const preheader = escapeHtml(input.preheader || input.title);
  const eyebrow = input.eyebrow ? escapeHtml(input.eyebrow) : "";
  const title = escapeHtml(input.title);
  const ctaUrl = input.ctaUrl ? absoluteUrl(input.ctaUrl) : "";
  const ctaLabel = escapeHtml(input.ctaLabel || "Open Loopin");
  const footerNote = escapeHtml(
    input.footerNote || "You’re receiving this because email notifications are enabled in Loopin Settings."
  );
  const year = new Date().getFullYear();

  const ctaBlock = ctaUrl
    ? `
      <tr>
        <td style="padding:28px 40px 8px;">
          <a href="${escapeHtml(ctaUrl)}"
             style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;
                    font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;
                    font-size:14px;font-weight:600;letter-spacing:0.01em;padding:12px 22px;border-radius:8px;">
            ${ctaLabel}
          </a>
        </td>
      </tr>`
    : "";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light" />
  <meta name="supported-color-schemes" content="light" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;-webkit-font-smoothing:antialiased;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
    ${preheader}
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f4f5;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
               style="max-width:560px;background:#ffffff;border:1px solid #e4e4e7;border-radius:12px;overflow:hidden;">
          <tr>
            <td style="padding:28px 40px 20px;border-bottom:1px solid #f4f4f5;">
              <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;
                         font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#0f172a;">
                Loopin
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 40px 0;">
              ${
                eyebrow
                  ? `<p style="margin:0 0 8px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;
                               font-size:12px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:#71717a;">
                       ${eyebrow}
                     </p>`
                  : ""
              }
              <h1 style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;
                         font-size:22px;line-height:1.3;font-weight:700;color:#0f172a;">
                ${title}
              </h1>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 40px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;
                       font-size:15px;line-height:1.6;color:#3f3f46;">
              ${input.bodyHtml}
            </td>
          </tr>
          ${ctaBlock}
          <tr>
            <td style="padding:28px 40px 32px;">
              <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;
                         font-size:12px;line-height:1.5;color:#a1a1aa;">
                ${footerNote}
              </p>
            </td>
          </tr>
        </table>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
          <tr>
            <td style="padding:20px 8px 0;text-align:center;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;
                       font-size:11px;color:#a1a1aa;">
              © ${year} Loopin · Your AI personal assistant
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const textParts = [
    "Loopin",
    input.eyebrow ? input.eyebrow.toUpperCase() : "",
    input.title,
    "",
    input.bodyHtml.replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n\n").replace(/<[^>]+>/g, "").replace(/\n{3,}/g, "\n\n").trim(),
    "",
    ctaUrl ? `${input.ctaLabel || "Open Loopin"}: ${ctaUrl}` : "",
    "",
    input.footerNote || "You’re receiving this because email notifications are enabled in Loopin Settings.",
  ].filter(Boolean);

  return { html, text: textParts.join("\n") };
}

/** Settings → Send test email */
export function buildTestEmailTemplate(opts?: { recipientName?: string }) {
  const name = opts?.recipientName?.trim();
  const greeting = name ? `Hi ${escapeHtml(name)},` : "Hi,";
  return renderEmailLayout({
    preheader: "Email delivery is working for your Loopin account.",
    eyebrow: "Delivery check",
    title: "Your email channel is ready",
    bodyHtml: `
      <p style="margin:0 0 12px;">${greeting}</p>
      <p style="margin:0 0 12px;">This is a quick confirmation from Loopin Settings. Alerts and briefing digests can now reach this inbox when you enable email as a delivery channel.</p>
      <p style="margin:0;">No action needed — you can close this message.</p>
    `,
    ctaLabel: "Open Settings",
    ctaUrl: "/dashboard?tab=settings",
    footerNote: "Sent from Loopin Settings → Email alert delivery.",
  });
}

/** Alert fired (rule match or auto-alert) */
export function buildAlertEmailTemplate(input: {
  title: string;
  body: string;
  url?: string;
  priority?: string;
}) {
  const priority = (input.priority || "").toLowerCase();
  const priorityLabel =
    priority === "high" || priority === "urgent"
      ? "High priority"
      : priority === "low"
        ? "Low priority"
        : priority
          ? "Medium priority"
          : "Alert";

  return renderEmailLayout({
    preheader: input.body.slice(0, 120),
    eyebrow: priorityLabel,
    title: input.title,
    bodyHtml: `
      <p style="margin:0 0 16px;white-space:pre-wrap;">${escapeHtml(input.body)}</p>
      <p style="margin:0;color:#71717a;font-size:13px;">Review this in Loopin — nothing is sent on your behalf until you confirm.</p>
    `,
    ctaLabel: "Review alert",
    ctaUrl: input.url || "/dashboard?tab=alerts",
    footerNote: "Sent because email is enabled for alerts in your Loopin Settings.",
  });
}

/** Daily / scheduled briefing digest */
export function buildBriefingEmailTemplate(input: {
  title: string;
  summary: string;
  briefingId?: string;
  statsLine?: string;
}) {
  const stats = input.statsLine
    ? `<p style="margin:0 0 16px;padding:12px 14px;background:#fafafa;border:1px solid #f4f4f5;border-radius:8px;
                font-size:13px;color:#52525b;">${escapeHtml(input.statsLine)}</p>`
    : "";

  return renderEmailLayout({
    preheader: input.summary.slice(0, 120),
    eyebrow: "Briefing",
    title: input.title,
    bodyHtml: `
      ${stats}
      <p style="margin:0 0 12px;white-space:pre-wrap;">${escapeHtml(input.summary)}</p>
      <p style="margin:0;color:#71717a;font-size:13px;">Open Loopin for the full digest across your connected channels.</p>
    `,
    ctaLabel: "Read full briefing",
    ctaUrl: input.briefingId
      ? `/dashboard/briefing/${input.briefingId}`
      : "/dashboard?tab=briefings",
    footerNote: "Sent because email is enabled for briefings in your Loopin Settings.",
  });
}

/** Sample catalog for preview sends */
export const EMAIL_TEMPLATE_SAMPLES = [
  {
    id: "test",
    label: "Settings test email",
    subject: "Loopin · Email delivery check",
    build: () =>
      buildTestEmailTemplate({ recipientName: "Macci" }),
  },
  {
    id: "alert-high",
    label: "High-priority alert",
    subject: "Loopin Alert · Invoice needs approval today",
    build: () =>
      buildAlertEmailTemplate({
        title: "Invoice needs approval today",
        body: "Acme Finance sent an invoice for $4,280 marked urgent. Payment is due by 5:00 PM. A draft reply is ready in your Confirm queue.",
        url: "/dashboard?tab=alerts&queue=confirm",
        priority: "high",
      }),
  },
  {
    id: "alert-medium",
    label: "Standard alert",
    subject: "Loopin Alert · Follow-up on partnership thread",
    build: () =>
      buildAlertEmailTemplate({
        title: "Follow-up on partnership thread",
        body: "Sarah (Slack) asked if you’re free Thursday for a 20-minute sync on the partnership deck. No draft was prepared — this is FYI only.",
        url: "/dashboard?tab=alerts",
        priority: "medium",
      }),
  },
  {
    id: "briefing",
    label: "Morning briefing digest",
    subject: "Loopin · Morning digest is ready",
    build: () =>
      buildBriefingEmailTemplate({
        title: "Morning digest — Monday overview",
        summary:
          "You have 3 emails that likely need a reply, 1 Slack mention in #ops, and a Calendly booking request for tomorrow at 10:00 AM. The highest priority item is the vendor contract from Northwind.",
        briefingId: "sample",
        statsLine: "3 emails · 5 messages · 2 follow-ups",
      }),
  },
] as const;
