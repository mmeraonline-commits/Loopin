import { CheckCheck, Link2, Sparkles } from "lucide-react";
import { SectionHeading } from "./section-heading";
import { RevealGroup, RevealItem } from "./reveal";

const STEPS = [
  {
    icon: Link2,
    title: "Connect",
    description: "Link Gmail, WhatsApp, and Slack with secure OAuth. Nothing to migrate, nothing to forward.",
  },
  {
    icon: Sparkles,
    title: "Loopin briefs & flags",
    description: "Every morning, get one brief. Casual commitments like \u201Ccall me at 4\u201D become tracked reminders automatically.",
  },
  {
    icon: CheckCheck,
    title: "You approve, Loopin sends",
    description: "Review AI-drafted replies written in your voice. Nothing goes out until you tap approve.",
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="relative z-10 overflow-hidden bg-brand-primary py-24">
      <div aria-hidden className="grid-bg absolute inset-0 opacity-[0.06]" />
      <div aria-hidden className="absolute top-0 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-brand-lime/20 blur-[100px]" />

      <div className="relative mx-auto max-w-6xl px-6">
        <SectionHeading
          eyebrow="How it works"
          title="Up and running before your coffee's done."
          description="No developer setup, no forwarding rules — just secure sign-in and you're live."
          tone="dark"
          className="mb-20"
        />

        <RevealGroup className="relative grid grid-cols-1 gap-12 md:grid-cols-3">
          <div className="absolute top-8 right-[15%] left-[15%] hidden h-px bg-gradient-to-r from-white/0 via-white/20 to-white/0 md:block" />
          {STEPS.map((step, i) => (
            <RevealItem key={step.title} className="relative z-10 flex flex-col items-center gap-4 text-center">
              <span className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-white shadow-lg">
                <step.icon className="h-6 w-6 text-brand-lime" />
              </span>
              <span className="text-xs font-bold tracking-wider text-white/40">STEP {i + 1}</span>
              <h4 className="text-lg font-bold text-white">{step.title}</h4>
              <p className="max-w-xs text-sm leading-relaxed text-white/70">{step.description}</p>
            </RevealItem>
          ))}
        </RevealGroup>
      </div>
    </section>
  );
}
