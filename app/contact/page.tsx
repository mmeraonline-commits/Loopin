import type { Metadata } from "next";
import Link from "next/link";
import { Mail, Shield, FileText, ExternalLink } from "lucide-react";
import { LegalShell } from "@/components/legal/legal-shell";

export const metadata: Metadata = {
  title: "Contact | Loopin",
  description: "Contact Loopin for support, privacy requests, security reports, and Google OAuth / Gmail verification questions.",
};

const SITE = "https://omnisync.mamutech-online.workers.dev";
const SUPPORT = "loopin@spendify.com.ng";

export default function ContactPage() {
  return (
    <LegalShell
      title="Contact"
      subtitle="We’re happy to help with product support, privacy requests, and questions related to Google / Gmail access."
      updated="July 19, 2026"
    >
      <section>
        <h2>Primary contact</h2>
        <div className="mt-4 rounded-2xl border border-black/[0.06] bg-slate-50/80 p-5 not-prose">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-primary/10 text-brand-primary">
              <Mail className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-bold text-brand-ink">Email</p>
              <a
                href={`mailto:${SUPPORT}?subject=Loopin%20support`}
                className="mt-1 inline-block text-base font-semibold text-brand-primary hover:underline"
              >
                {SUPPORT}
              </a>
              <p className="mt-2 text-xs leading-relaxed text-slate-500">
                We typically respond within 1–2 business days. For privacy or deletion requests, include the email address on
                your Loopin account.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section>
        <h2>What to include</h2>
        <ul>
          <li>Your Loopin account email</li>
          <li>A short description of the issue or request</li>
          <li>Screenshots or error messages when relevant</li>
          <li>For Gmail/OAuth issues: whether access was granted or revoked in Google Account settings</li>
        </ul>
      </section>

      <section>
        <h2>Common request types</h2>
        <div className="mt-4 grid gap-3 not-prose sm:grid-cols-2">
          {[
            {
              icon: Shield,
              title: "Privacy & data",
              body: "Access, correction, deletion, or questions about Gmail data handling.",
              href: `mailto:${SUPPORT}?subject=Privacy%20request`,
            },
            {
              icon: FileText,
              title: "Legal / verification",
              body: "Questions about our Privacy Policy, Terms, or Google app verification materials.",
              href: `mailto:${SUPPORT}?subject=Legal%20%2F%20verification`,
            },
            {
              icon: Mail,
              title: "Product support",
              body: "Integrations, drafts, triage labels, alerts, billing codes, and dashboard issues.",
              href: `mailto:${SUPPORT}?subject=Product%20support`,
            },
            {
              icon: ExternalLink,
              title: "Security",
              body: "Responsible disclosure of suspected vulnerabilities. Please do not include sensitive tokens.",
              href: `mailto:${SUPPORT}?subject=Security%20report`,
            },
          ].map((card) => (
            <a
              key={card.title}
              href={card.href}
              className="rounded-2xl border border-black/[0.06] bg-white p-4 transition hover:border-brand-primary/30 hover:shadow-sm"
            >
              <card.icon className="h-5 w-5 text-brand-primary" />
              <p className="mt-3 text-sm font-bold text-brand-ink">{card.title}</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">{card.body}</p>
            </a>
          ))}
        </div>
      </section>

      <section>
        <h2>Operator details</h2>
        <ul>
          <li>
            <strong>Product:</strong> Loopin
          </li>
          <li>
            <strong>Operator:</strong> Mamutech Online
          </li>
          <li>
            <strong>Website:</strong> <a href={SITE}>{SITE}</a>
          </li>
          <li>
            <strong>Support email:</strong> <a href={`mailto:${SUPPORT}`}>{SUPPORT}</a>
          </li>
        </ul>
      </section>

      <section>
        <h2>Policies</h2>
        <ul>
          <li>
            <Link href="/privacy">Privacy Policy</Link>
          </li>
          <li>
            <Link href="/terms">Terms of Service</Link>
          </li>
          <li>
            <Link href="/about">About Loopin</Link>
          </li>
        </ul>
      </section>

      <section>
        <h2>Revoking Google access</h2>
        <p>
          To disconnect Loopin from Gmail: remove the integration in your Loopin dashboard, then revoke access at{" "}
          <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer">
            Google Account → Third-party access
          </a>
          .
        </p>
      </section>
    </LegalShell>
  );
}
