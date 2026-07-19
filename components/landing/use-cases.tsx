import { CalendarClock, Coffee, ListChecks, MessageCircleHeart } from "lucide-react";
import { SectionHeading } from "./section-heading";
import { RevealGroup, RevealItem } from "./reveal";

const USE_CASES = [
  {
    icon: Coffee,
    eyebrow: "Mornings",
    title: "Start with one clear brief.",
    description: "Wake up to one summary instead of three apps full of unread badges.",
  },
  {
    icon: ListChecks,
    eyebrow: "Commitments",
    title: "Never drop a promise again.",
    description: "\u201CI'll send it tonight\u201D becomes a tracked reminder, automatically.",
  },
  {
    icon: MessageCircleHeart,
    eyebrow: "Replies",
    title: "Draft fast, send in your voice.",
    description: "Approve AI-drafted replies that actually sound like you wrote them.",
  },
  {
    icon: CalendarClock,
    eyebrow: "Meetings",
    title: "Walk in prepared, not scrambling.",
    description: "Ask Loopin what's pending before a call — it pulls context from every channel.",
  },
];

export function UseCases() {
  return (
    <section id="use-cases" className="relative z-10 bg-white py-24">
      <div className="mx-auto max-w-7xl px-6">
        <SectionHeading
          eyebrow="Use cases"
          title={
            <>
              Built for the day{" "}
              <span className="text-brand-primary">you actually have.</span>
            </>
          }
          description="Loopin is your personal chief of staff — not a shared support queue."
          className="mb-16"
        />

        <RevealGroup className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {USE_CASES.map((useCase) => (
            <RevealItem key={useCase.title}>
              <div className="flex h-full flex-col gap-4 rounded-3xl border border-emerald-900/10 bg-brand-mint-soft/40 p-7 shadow-[0_8px_30px_rgba(26,67,53,0.04)] transition-all duration-300 hover:-translate-y-0.5 hover:border-emerald-900/20 hover:shadow-[0_12px_40px_rgba(26,67,53,0.08)]">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-brand-primary shadow-sm">
                  <useCase.icon className="h-5 w-5" />
                </span>
                <span className="text-[10px] font-bold tracking-[0.14em] text-brand-accent uppercase">
                  {useCase.eyebrow}
                </span>
                <h4 className="font-display text-lg leading-snug font-bold text-brand-ink">{useCase.title}</h4>
                <p className="text-sm leading-relaxed text-slate-600">{useCase.description}</p>
              </div>
            </RevealItem>
          ))}
        </RevealGroup>
      </div>
    </section>
  );
}
