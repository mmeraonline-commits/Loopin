"use client";

import { CheckCircle2 } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { Reveal } from "./reveal";
import { CtaButton } from "./cta-button";

export function FinalCta() {
  const { user } = useAuth();

  return (
    <section className="relative z-10 overflow-hidden bg-brand-primary py-24">
      <div aria-hidden className="absolute top-[-30%] left-[-10%] h-96 w-96 rounded-full bg-white/5 blur-[110px]" />
      <div aria-hidden className="absolute right-[-10%] bottom-[-30%] h-96 w-96 rounded-full bg-brand-lime/15 blur-[110px]" />

      <div className="relative mx-auto max-w-3xl px-6 text-center">
        <Reveal>
          <h2 className="font-display text-3xl font-bold tracking-tight text-white sm:text-4xl md:text-5xl">
            Give yourself back your mornings.
          </h2>
        </Reveal>
        <Reveal delay={0.08}>
          <p className="mx-auto mt-5 max-w-lg text-base text-white/70 sm:text-lg">
            Connect Gmail, WhatsApp, and Slack in minutes, and get your first daily brief right after.
          </p>
        </Reveal>
        <Reveal delay={0.16}>
          <div className="mt-9 flex justify-center">
            <CtaButton href={user ? "/dashboard" : "/sign-up"} variant="inverse" showArrow>
              {user ? "Go to dashboard" : "Get started"}
            </CtaButton>
          </div>
        </Reveal>
        <Reveal delay={0.22}>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-white/60">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-brand-lime" /> No credit card required
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-brand-lime" /> Confirm-before-send, always
            </span>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
