import { KeyRound, ShieldCheck, UserCheck } from "lucide-react";
import { SectionHeading } from "./section-heading";
import { RevealGroup, RevealItem } from "./reveal";

const TRUST_POINTS = [
  {
    icon: KeyRound,
    title: "OAuth-secured connections",
    description: "Loopin connects to Gmail, WhatsApp, and Slack through official, revocable OAuth. Disconnect any channel anytime.",
  },
  {
    icon: UserCheck,
    title: "Confirm-before-send by default",
    description: "Every AI draft waits for your tap. Nothing sends on your behalf unless you approve it.",
  },
  {
    icon: ShieldCheck,
    title: "Not used to train public models",
    description: "Your messages run your brief and drafts — they're never used to train public AI models.",
  },
];

export function TrustSection() {
  return (
    <section className="relative z-10 overflow-hidden bg-brand-primary py-24">
      <div aria-hidden className="absolute right-[-10%] bottom-[-30%] h-96 w-96 rounded-full bg-brand-lime/10 blur-[110px]" />

      <div className="relative mx-auto max-w-6xl px-6">
        <SectionHeading
          eyebrow="Trust & control"
          title="Your accounts. Your rules. Always."
          tone="dark"
          className="mb-16"
        />

        <RevealGroup className="grid grid-cols-1 gap-8 md:grid-cols-3">
          {TRUST_POINTS.map((point) => (
            <RevealItem key={point.title}>
              <div className="flex h-full flex-col gap-3 rounded-2xl border border-white/10 bg-white/5 p-6">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-brand-lime">
                  <point.icon className="h-5 w-5" />
                </span>
                <h4 className="text-base font-bold text-white">{point.title}</h4>
                <p className="text-sm leading-relaxed text-white/70">{point.description}</p>
              </div>
            </RevealItem>
          ))}
        </RevealGroup>
      </div>
    </section>
  );
}
