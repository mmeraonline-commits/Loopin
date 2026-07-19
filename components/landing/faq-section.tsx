"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { SectionHeading } from "./section-heading";
import { Reveal } from "./reveal";

const FAQS = [
  {
    q: "Will Loopin send messages without me approving them?",
    a: "No. Confirm-before-send is on by default across every plan. Loopin drafts the reply — you decide when, or if, it sends.",
  },
  {
    q: "Is my data safe?",
    a: "Loopin connects through official OAuth, so we never see your passwords. You can disconnect any channel at any time, and your conversations are never used to train public AI models.",
  },
  {
    q: "Which channels does Loopin support today?",
    a: "Gmail and WhatsApp on Starter, with Slack and Discord on Pro. Outlook, Calendly, and LinkedIn roll out on Business and Team plans.",
  },
  {
    q: "What's included on each plan?",
    a: "Starter covers draft & send, label & sort, and tone training. Pro adds Slack + Discord, conversation mode, and a unified inbox. Business unlocks out-of-office / after-hours replies plus Advanced tone training. Team adds seats and shared training.",
  },
  {
    q: "What's the difference between tone training and conversation mode?",
    a: "Tone training teaches Loopin how you write. Normal (every plan) covers instructions, sample replies, and a sign-off. Advanced (Business+) adds documents, website URLs, and large volumes of text so drafts match your facts too. Conversation mode (Pro+) is a separate chat surface where you ask Loopin what's pending across your channels.",
  },
  {
    q: "Do I need a credit card to get started?",
    a: "No — create your account and connect your channels first. You only add payment when you choose to upgrade your plan.",
  },
  {
    q: "How is this different from a shared team inbox tool?",
    a: "Loopin is built for one person's day, not a shared support queue. It's your Gmail, WhatsApp, and Slack — briefed and drafted for you, not routed across a team.",
  },
  {
    q: "Can I disconnect a channel or delete my data?",
    a: "Yes. Disconnect any channel or delete your account at any time from Settings.",
  },
];

export function FaqSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section id="faq" className="relative z-10 bg-white py-24">
      <div className="mx-auto max-w-4xl px-6">
        <SectionHeading eyebrow="Questions" title="Frequently asked questions" className="mb-14" />

        <div className="space-y-3">
          {FAQS.map((faq, index) => {
            const isOpen = openIndex === index;
            return (
              <Reveal key={faq.q} delay={index * 0.02} direction="none">
                <div className="overflow-hidden rounded-2xl border border-emerald-900/10 bg-brand-mint-soft/30 transition-all duration-300">
                  <button
                    onClick={() => setOpenIndex(isOpen ? null : index)}
                    className="flex w-full cursor-pointer items-center justify-between px-6 py-5 text-left focus:outline-none"
                  >
                    <span className="text-sm font-bold text-brand-ink sm:text-base">{faq.q}</span>
                    <ChevronDown
                      className={`h-5 w-5 shrink-0 text-brand-accent transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`}
                    />
                  </button>
                  <div
                    className={`overflow-hidden transition-all duration-300 ease-in-out ${
                      isOpen ? "max-h-[250px] border-t border-emerald-900/8 opacity-100" : "max-h-0 opacity-0"
                    }`}
                  >
                    <p className="px-6 py-5 text-sm leading-relaxed text-slate-600">{faq.a}</p>
                  </div>
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
