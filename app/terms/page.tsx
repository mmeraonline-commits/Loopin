import type { Metadata } from "next";
import Link from "next/link";
import { LegalShell } from "@/components/legal/legal-shell";

export const metadata: Metadata = {
  title: "Terms of Service | Loopin",
  description: "Terms governing your use of Loopin, including accounts, integrations, AI drafts, and acceptable use.",
};

const SITE = "https://omnisync.mamutech-online.workers.dev";
const SUPPORT = "loopin@spendify.com.ng";

export default function TermsPage() {
  return (
    <LegalShell
      title="Terms of Service"
      subtitle="These Terms of Service (“Terms”) govern access to and use of Loopin. By creating an account or using the service, you agree to these Terms."
      updated="July 19, 2026"
    >
      <section>
        <h2>1. Agreement</h2>
        <p>
          Loopin is operated by Mamutech Online (“Loopin”, “we”, “us”). The service is available at{" "}
          <a href={SITE}>{SITE}</a>. If you use Loopin on behalf of an organization, you represent that you have authority to
          bind that organization to these Terms.
        </p>
        <p>
          Related documents: <Link href="/privacy">Privacy Policy</Link>, <Link href="/about">About</Link>,{" "}
          <Link href="/contact">Contact</Link>.
        </p>
      </section>

      <section>
        <h2>2. The service</h2>
        <p>Loopin provides AI-assisted productivity features that may include:</p>
        <ul>
          <li>Connecting third-party channels (such as Gmail) via OAuth</li>
          <li>Inbox triage, labeling, summaries, and briefings</li>
          <li>Suggested reply drafts (including native Gmail drafts)</li>
          <li>Alerts and multi-channel notifications you configure</li>
          <li>An AI agent chat that can call connected tools subject to your plan and confirmations</li>
        </ul>
        <p>
          Features vary by plan. We may change, add, or remove features as we improve the product. Beta or experimental
          features may be less reliable.
        </p>
      </section>

      <section>
        <h2>3. Accounts and eligibility</h2>
        <ul>
          <li>You must provide accurate registration information and keep credentials secure.</li>
          <li>You are responsible for activity under your account.</li>
          <li>You must be at least 16 years old (or the age of digital consent in your country).</li>
          <li>We may suspend or terminate accounts that violate these Terms or pose security/abuse risk.</li>
        </ul>
      </section>

      <section>
        <h2>4. Plans, codes, and fees</h2>
        <p>
          Loopin may offer free and paid tiers, promotional codes, or redeemed plan upgrades. Quotas (AI calls, drafts,
          integrations) may apply. Unused quotas typically do not roll over unless we state otherwise. Fees, if any, are
          described at purchase or redemption time.
        </p>
      </section>

      <section>
        <h2>5. Third-party integrations (including Google)</h2>
        <p>
          Connecting Gmail or other services is optional. By connecting an integration, you authorize Loopin to access and
          process data from that service as described in our Privacy Policy and the provider’s permissions screen.
        </p>
        <ul>
          <li>You must have the right to grant Loopin access to the connected account.</li>
          <li>Third-party services are governed by their own terms; we are not responsible for their availability or policies.</li>
          <li>You can disconnect integrations in Loopin and revoke access in the provider’s security settings (for Google: account permissions).</li>
          <li>
            Google OAuth access is used only to provide Loopin features. Our use of Google user data complies with the Google
            API Services User Data Policy, including Limited Use.
          </li>
        </ul>
      </section>

      <section>
        <h2>6. AI outputs, drafts, and human review</h2>
        <p>
          Loopin generates suggestions, classifications, summaries, and drafts using AI. Outputs may be inaccurate,
          incomplete, or inappropriate. You agree that:
        </p>
        <ul>
          <li>You will review AI content before relying on it or sending it.</li>
          <li>Unless you explicitly confirm a send action in Loopin, we design core flows so drafts wait for your review (especially email).</li>
          <li>You remain solely responsible for messages you send and actions you take.</li>
        </ul>
      </section>

      <section>
        <h2>7. Acceptable use</h2>
        <p>You agree not to:</p>
        <ul>
          <li>Violate law or others’ rights (privacy, IP, publicity)</li>
          <li>Spam, phish, harass, or send malware</li>
          <li>Attempt unauthorized access to Loopin or other users’ data</li>
          <li>Reverse engineer the service except where permitted by law</li>
          <li>Abuse APIs, quotas, or shared infrastructure</li>
          <li>Use Loopin to process data you are not authorized to access</li>
          <li>Misrepresent Loopin’s affiliation with Google or any third party</li>
        </ul>
      </section>

      <section>
        <h2>8. Your content and license</h2>
        <p>
          You retain ownership of content you provide or that we process from your connected accounts (“Customer Content”).
          You grant Loopin a limited license to host, process, transmit, and display Customer Content solely to operate the
          service for you.
        </p>
        <p>
          Feedback you submit may be used to improve Loopin without obligation to you.
        </p>
      </section>

      <section>
        <h2>9. Intellectual property</h2>
        <p>
          Loopin software, branding, and documentation are owned by us or our licensors. These Terms do not grant you rights
          to our trademarks except as needed to identify your use of the product truthfully.
        </p>
      </section>

      <section>
        <h2>10. Privacy</h2>
        <p>
          Our <Link href="/privacy">Privacy Policy</Link> explains how we handle personal data. By using Loopin you
          acknowledge that processing.
        </p>
      </section>

      <section>
        <h2>11. Disclaimers</h2>
        <p>
          THE SERVICE IS PROVIDED “AS IS” AND “AS AVAILABLE.” TO THE MAXIMUM EXTENT PERMITTED BY LAW, WE DISCLAIM WARRANTIES
          OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. WE DO NOT WARRANT THAT THE SERVICE WILL
          BE UNINTERRUPTED, ERROR-FREE, OR THAT AI OUTPUTS WILL BE ACCURATE.
        </p>
      </section>

      <section>
        <h2>12. Limitation of liability</h2>
        <p>
          TO THE MAXIMUM EXTENT PERMITTED BY LAW, LOOPIN AND ITS OPERATORS WILL NOT BE LIABLE FOR INDIRECT, INCIDENTAL,
          SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS, DATA, OR GOODWILL. OUR TOTAL LIABILITY FOR
          CLAIMS ARISING OUT OF THESE TERMS OR THE SERVICE WILL NOT EXCEED THE GREATER OF (A) AMOUNTS YOU PAID TO US FOR
          LOOPIN IN THE 3 MONTHS BEFORE THE CLAIM OR (B) USD $50 IF YOU HAVE NOT PAID.
        </p>
        <p>Some jurisdictions do not allow certain limitations; in those cases, our liability is limited to the fullest extent allowed.</p>
      </section>

      <section>
        <h2>13. Indemnity</h2>
        <p>
          You will defend and indemnify Loopin against claims arising from your misuse of the service, your Customer Content,
          or your violation of these Terms or third-party rights/terms.
        </p>
      </section>

      <section>
        <h2>14. Suspension and termination</h2>
        <p>
          You may stop using Loopin at any time and may request account deletion via{" "}
          <a href={`mailto:${SUPPORT}`}>{SUPPORT}</a>. We may suspend or terminate access for violations, legal risk, or
          prolonged inactivity. Provisions that by nature should survive (IP, disclaimers, liability limits) will survive
          termination.
        </p>
      </section>

      <section>
        <h2>15. Changes</h2>
        <p>
          We may update these Terms by posting a revised version on this page. Continued use after the effective date
          constitutes acceptance, except where applicable law requires additional consent.
        </p>
      </section>

      <section>
        <h2>16. Governing law</h2>
        <p>
          These Terms are governed by the laws applicable in the Federal Republic of Nigeria, without regard to conflict-of-law
          rules, unless mandatory consumer protections in your country require otherwise. Courts in that jurisdiction will
          have exclusive venue, subject to those mandatory protections.
        </p>
      </section>

      <section>
        <h2>17. Contact</h2>
        <p>
          Questions about these Terms: <a href={`mailto:${SUPPORT}`}>{SUPPORT}</a>
          <br />
          <Link href="/contact">Contact page</Link>
        </p>
      </section>
    </LegalShell>
  );
}
