import type { Metadata } from "next";
import Link from "next/link";
import { LegalShell } from "@/components/legal/legal-shell";

export const metadata: Metadata = {
  title: "Privacy Policy | Loopin",
  description:
    "How Loopin collects, uses, stores, and protects your data — including Gmail OAuth access required for inbox triage and draft replies.",
};

const SITE = "https://omnisync.mamutech-online.workers.dev";
const SUPPORT = "loopin@spendify.com.ng";

export default function PrivacyPage() {
  return (
    <LegalShell
      title="Privacy Policy"
      subtitle="This Privacy Policy explains how Loopin (“we”, “us”, or “our”) collects, uses, stores, shares, and protects information when you use our website, dashboard, and connected integrations — including Google Gmail."
      updated="July 19, 2026"
    >
      <section>
        <h2>1. Who we are</h2>
        <p>
          Loopin is an AI personal assistant that helps you triage email and chat, generate briefings, draft replies, and
          surface alerts across connected tools. The service is operated by Mamutech Online and is available at{" "}
          <a href={SITE}>{SITE}</a>.
        </p>
        <p>
          For privacy questions or data requests, contact us at{" "}
          <a href={`mailto:${SUPPORT}`}>{SUPPORT}</a>. See also our{" "}
          <Link href="/contact">Contact</Link> page.
        </p>
      </section>

      <section>
        <h2>2. Scope of this policy</h2>
        <p>This policy applies to:</p>
        <ul>
          <li>Visitors to our marketing site and account pages</li>
          <li>Registered users of the Loopin dashboard</li>
          <li>Users who connect third-party accounts (including Gmail via Google OAuth)</li>
          <li>Recipients of transactional emails we send when you enable email notifications</li>
        </ul>
        <p>
          By creating an account or connecting an integration, you agree to this Privacy Policy and our{" "}
          <Link href="/terms">Terms of Service</Link>.
        </p>
      </section>

      <section>
        <h2>3. Information we collect</h2>

        <h3>3.1 Account information</h3>
        <p>When you sign up or sign in, we may collect:</p>
        <ul>
          <li>Name and email address</li>
          <li>Authentication identifiers from our auth provider</li>
          <li>Plan, billing-related redemption codes, and usage quotas</li>
          <li>Assistant preferences (timezone, display name, notification channels, tone settings, briefing cadence)</li>
        </ul>

        <h3>3.2 Google / Gmail information (OAuth)</h3>
        <p>
          If you choose to connect Gmail, Loopin requests access through Google’s OAuth consent screen. We currently request
          the Google scope:
        </p>
        <ul>
          <li>
            <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[13px]">https://www.googleapis.com/auth/gmail.modify</code>{" "}
            — read, compose, and modify Gmail messages and labels (used to triage mail, apply Loopin labels, and create draft
            replies in your Gmail Drafts folder)
          </li>
        </ul>
        <p>Depending on your use of the product, Gmail data we process may include:</p>
        <ul>
          <li>Message metadata (sender, recipients, subject, timestamps, labels, thread IDs)</li>
          <li>Message content (body/snippet) needed to classify urgency, generate summaries, and draft replies</li>
          <li>Drafts we create on your behalf (never sent unless you send them yourself in Gmail or explicitly confirm a send action)</li>
          <li>OAuth tokens (access and refresh tokens) stored securely to keep your connection working</li>
        </ul>
        <p>
          <strong>We do not sell Gmail content.</strong> We do not use Gmail data for advertising. We do not use Gmail data to
          train generalized public AI models.
        </p>

        <h3>3.3 Other integrations</h3>
        <p>
          If you connect WhatsApp, Slack, Outlook, Discord, LinkedIn, Calendly, or similar channels, we collect only the
          credentials and content needed to provide the features you enable (briefs, alerts, drafts, schedules). Each
          connection is optional and revocable.
        </p>

        <h3>3.4 Product usage and device data</h3>
        <ul>
          <li>Feature usage events needed for quotas, reliability, and abuse prevention</li>
          <li>Basic technical logs (IP address, user agent, error traces) for security and debugging</li>
          <li>Optional browser push subscription endpoints if you enable push notifications</li>
        </ul>

        <h3>3.5 Communications</h3>
        <p>
          If you email us or enable email/WhatsApp/push alert delivery, we process the content of those communications and
          delivery metadata.
        </p>
      </section>

      <section>
        <h2>4. How we use information</h2>
        <p>We use personal data to:</p>
        <ul>
          <li>Provide, operate, and improve Loopin (triage, labeling, briefings, alerts, drafts)</li>
          <li>Authenticate you and secure your account and connected integrations</li>
          <li>Apply your settings (tone, notification channels, briefing schedules, auto-draft preferences)</li>
          <li>Send service emails you enable (alerts, digests, delivery checks)</li>
          <li>Enforce plan limits, prevent fraud/abuse, and comply with law</li>
          <li>Respond to support requests</li>
        </ul>
        <p>
          AI processing is used to classify messages, summarize activity, and draft suggested replies. Outputs are assistive;
          you remain responsible for reviewing content before sending.
        </p>
      </section>

      <section>
        <h2>5. Google API Services User Data Policy (Limited Use)</h2>
        <p>
          Loopin’s use and transfer of information received from Google APIs adheres to the{" "}
          <a
            href="https://developers.google.com/terms/api-services-user-data-policy"
            target="_blank"
            rel="noopener noreferrer"
          >
            Google API Services User Data Policy
          </a>
          , including the Limited Use requirements.
        </p>
        <ul>
          <li>
            Gmail data is used only to provide and improve user-facing features that are prominent in Loopin (inbox triage,
            labels, drafts, alerts, and briefings).
          </li>
          <li>We do not transfer Gmail data to third parties except as necessary to provide the service (e.g., infrastructure and AI model providers acting as processors) or as required by law.</li>
          <li>We do not use Gmail data for serving advertisements.</li>
          <li>We do not allow humans to read Gmail content unless you give us explicit permission for support, it is needed for security/abuse investigation, or we are required by law — and then only under appropriate controls.</li>
          <li>We do not use Gmail data to train foundation models that are unrelated to providing your Loopin experience.</li>
        </ul>
      </section>

      <section>
        <h2>6. How we share information</h2>
        <p>We may share data with:</p>
        <ul>
          <li>
            <strong>Service providers / processors</strong> that host our app, database, auth, email delivery, background jobs,
            and AI inference — under contractual obligations to protect data and use it only to serve Loopin
          </li>
          <li>
            <strong>Integration providers</strong> (e.g., Google) when you authorize a connection — according to their terms
          </li>
          <li>
            <strong>Legal and safety</strong> recipients when required to comply with law, enforce our Terms, or protect users
          </li>
        </ul>
        <p>We do not sell personal information.</p>
      </section>

      <section>
        <h2>7. Storage, retention, and security</h2>
        <ul>
          <li>Account and preference data are stored in our application database.</li>
          <li>OAuth tokens are stored server-side and used only to call APIs on your behalf.</li>
          <li>We retain account data while your account is active. You may request deletion (see Section 9).</li>
          <li>Operational logs are retained for a limited period for security and reliability, then deleted or aggregated.</li>
          <li>We use industry-standard safeguards (encryption in transit, access controls, least-privilege keys). No method of transmission or storage is 100% secure.</li>
        </ul>
      </section>

      <section>
        <h2>8. Your choices and controls</h2>
        <ul>
          <li>
            <strong>Disconnect Gmail:</strong> Remove the Gmail connection in Loopin Integrations, and/or revoke Loopin access
            in your{" "}
            <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer">
              Google Account permissions
            </a>
            .
          </li>
          <li>
            <strong>Notification channels:</strong> Turn email, push, or WhatsApp delivery on/off in Settings.
          </li>
          <li>
            <strong>Drafts:</strong> Loopin creates drafts for review; sending remains under your control unless you explicitly
            confirm a send action in the product.
          </li>
          <li>
            <strong>Export / preferences:</strong> You can update profile and assistant settings in the dashboard.
          </li>
        </ul>
      </section>

      <section>
        <h2>9. Access, correction, and deletion</h2>
        <p>
          To access, correct, or delete your personal data, email <a href={`mailto:${SUPPORT}`}>{SUPPORT}</a> from the
          address on your account. We will respond within a reasonable period. Deleting your account may not immediately remove
          all backups or legally retained records.
        </p>
        <p>
          If you revoke Google access, we will stop using new Gmail data via that connection. You may also ask us to delete
          stored Gmail-related tokens and associated Loopin records tied to that connection.
        </p>
      </section>

      <section>
        <h2>10. International transfers</h2>
        <p>
          We may process data in regions where our infrastructure providers operate. Where required, we use appropriate
          safeguards for cross-border transfers.
        </p>
      </section>

      <section>
        <h2>11. Children’s privacy</h2>
        <p>
          Loopin is not directed to children under 16 (or the minimum age required in your jurisdiction). We do not knowingly
          collect personal information from children. If you believe a child has provided data, contact us and we will take
          appropriate steps.
        </p>
      </section>

      <section>
        <h2>12. Changes to this policy</h2>
        <p>
          We may update this Privacy Policy from time to time. We will post the updated version on this page and revise the
          “Last updated” date. Material changes may also be communicated in-product or by email when appropriate.
        </p>
      </section>

      <section>
        <h2>13. Contact</h2>
        <p>
          Privacy requests: <a href={`mailto:${SUPPORT}`}>{SUPPORT}</a>
          <br />
          Website: <a href={SITE}>{SITE}</a>
          <br />
          More ways to reach us: <Link href="/contact">Contact</Link>
        </p>
      </section>
    </LegalShell>
  );
}
