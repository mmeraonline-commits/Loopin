import {
  BookOpen,
  Clock,
  FileText,
  MessageSquareText,
  Send,
  Tags,
} from "lucide-react";
import { SectionHeading } from "./section-heading";
import { RevealGroup, RevealItem } from "./reveal";

const CAPABILITIES = [
  {
    icon: Send,
    title: "Draft and send replies",
    description: "Loopin drafts in your voice. You approve — nothing sends without you.",
    plan: "Starter+",
  },
  {
    icon: Tags,
    title: "Label and sort emails",
    description: "Auto-triage Gmail so promos stay out of the way and real asks rise to the top.",
    plan: "Starter+",
  },
  {
    icon: BookOpen,
    title: "Train AI on your tone",
    description: "Add instructions, sample replies, and a sign-off — every draft matches how you actually write.",
    plan: "Starter+",
  },
  {
    icon: MessageSquareText,
    title: "Conversation mode",
    description: "Chat with Loopin over your synced channels — ask what's pending, get a draft, move on.",
    plan: "Pro+",
  },
  {
    icon: Clock,
    title: "Out-of-office & after-hours",
    description: "Keep coverage when you're offline. Loopin handles the quiet hours with replies you control.",
    plan: "Business+",
  },
  {
    icon: FileText,
    title: "Tone training — Advanced",
    description: "Add documents, website URLs, and large volumes of text so drafts match your facts, not just your style.",
    plan: "Business+",
  },
];

export function CapabilitiesSection() {
  return (
    <section id="capabilities" className="relative z-10 bg-white py-24">
      <div className="mx-auto max-w-7xl px-6">
        <SectionHeading
          eyebrow="Capabilities"
          title={
            <>
              Everything you need to{" "}
              <span className="text-brand-primary">run your inbox.</span>
            </>
          }
          description="Core capabilities across plans — from draft-and-send and tone training on Starter to after-hours coverage and Advanced tone training on Business."
          className="mb-16"
        />

        <RevealGroup className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {CAPABILITIES.map((cap) => (
            <RevealItem key={cap.title}>
              <div className="flex h-full flex-col gap-3 rounded-2xl border border-emerald-900/10 bg-brand-mint-soft/40 p-6 transition-colors hover:border-emerald-900/20">
                <div className="flex items-start justify-between gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-brand-primary shadow-sm">
                    <cap.icon className="h-5 w-5" />
                  </span>
                  <span className="rounded-full border border-emerald-900/10 bg-white px-2.5 py-1 text-[10px] font-bold tracking-wide text-brand-accent uppercase">
                    {cap.plan}
                  </span>
                </div>
                <h4 className="font-display text-base font-bold text-brand-ink">{cap.title}</h4>
                <p className="text-sm leading-relaxed text-slate-600">{cap.description}</p>
              </div>
            </RevealItem>
          ))}
        </RevealGroup>
      </div>
    </section>
  );
}
