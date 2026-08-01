import type { Metadata } from "next";
import Link from "next/link";
import { LegalShell } from "@/components/legal/legal-shell";

export const metadata: Metadata = {
  title: "About Loopin | AI personal assistant",
  description:
    "Learn what Loopin is, how it works with Gmail and other channels, and our approach to privacy and human control.",
};

const SITE = "https://omnisync.mamutech-online.workers.dev";

export default function AboutPage() {
  return (
    <LegalShell
      title="About Loopin"
      subtitle="Loopin is your AI personal chief of staff — one place for briefs, triage, and drafts across the channels you already use."
      updated="July 19, 2026"
    >
      <section>
        <h2>Our mission</h2>
        <p>
          Most people don’t need another inbox. They need a clear morning brief, a short list of what actually needs a reply,
          and drafts that sound like them — without an assistant that sends mail on its own.
        </p>
        <p>
          Loopin connects to tools you already rely on (starting with Gmail), classifies what matters, and prepares next steps
          you can approve. Confirm-before-send is a product principle, not a slogan.
        </p>
      </section>

      <section>
        <h2>What Loopin does</h2>
        <ul>
          <li>
            <strong>Gmail triage</strong> — labels urgent mail, needs-reply threads, notifications, and promotions so your
            inbox is easier to scan
          </li>
          <li>
            <strong>Native drafts</strong> — creates reply drafts in your Gmail Drafts folder for review; you send when ready
          </li>
          <li>
            <strong>Briefings & alerts</strong> — digests and priority alerts delivered in-app and (optionally) via email,
            push, or WhatsApp
          </li>
          <li>
            <strong>AI Agent</strong> — a chat that can help summarize, search connected context, and prepare actions with
            confirmation where required
          </li>
          <li>
            <strong>Tone training</strong> — teach Loopin how you write so drafts match your voice
          </li>
        </ul>
      </section>

      <section>
        <h2>Who builds Loopin</h2>
        <p>
          Loopin is built and operated by <strong>Mamutech Online</strong>. We ship a focused assistant for individuals and
          small teams who want leverage without surrendering control of their communications.
        </p>
        <p>
          Product site: <a href={SITE}>{SITE}</a>
        </p>
      </section>

      <section>
        <h2>Google / Gmail access</h2>
        <p>
          When you connect Gmail, Loopin uses Google OAuth with the <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[13px]">gmail.modify</code>{" "}
          scope so we can read messages for triage, apply Loopin labels, and create drafts. We do not use Gmail data for ads,
          and we follow Google’s API Services User Data Policy (including Limited Use). Details are in our{" "}
          <Link href="/privacy">Privacy Policy</Link>.
        </p>
        <p>
          You can disconnect anytime in Loopin Integrations or revoke access from your Google Account permissions.
        </p>
      </section>

      <section>
        <h2>Trust principles</h2>
        <ul>
          <li>OAuth connections you can revoke</li>
          <li>Human review before send for core email draft flows</li>
          <li>Your messages are not used to train public foundation models</li>
          <li>Clear privacy and terms documents for app verification and user trust</li>
        </ul>
      </section>

      <section>
        <h2>Learn more</h2>
        <ul>
          <li>
            <Link href="/privacy">Privacy Policy</Link>
          </li>
          <li>
            <Link href="/terms">Terms of Service</Link>
          </li>
          <li>
            <Link href="/contact">Contact us</Link>
          </li>
          <li>
            <Link href="/sign-up">Create an account</Link>
          </li>
        </ul>
      </section>
    </LegalShell>
  );
}
