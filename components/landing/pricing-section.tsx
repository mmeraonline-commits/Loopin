"use client";

import { Check } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { PLAN_ORDER, PLANS } from "@/lib/plans";
import { SectionHeading } from "./section-heading";
import { CtaButton } from "./cta-button";
import { RevealGroup, RevealItem } from "./reveal";

export function PricingSection() {
  const { user } = useAuth();

  return (
    <section id="pricing" className="relative z-10 bg-brand-mint-soft/50 py-24">
      <div className="mx-auto max-w-7xl px-6">
        <SectionHeading
          eyebrow="Pricing"
          title="Simple monthly plans that grow with you."
          description="Billed monthly. Start on Starter and upgrade when you need more channels or higher limits. Confirm-before-send is on every plan."
          className="mb-16"
        />

        <RevealGroup className="grid grid-cols-1 items-stretch gap-6 md:grid-cols-2 xl:grid-cols-4">
          {PLAN_ORDER.map((planId) => {
            const plan = PLANS[planId];
            const isPopular = planId === "pro";
            return (
              <RevealItem key={plan.id}>
                <div
                  className={`flex h-full flex-col justify-between rounded-2xl border bg-white p-7 transition duration-300 ${
                    isPopular ? "border-brand-primary/30 shadow-xl shadow-emerald-900/10 md:-translate-y-2" : "border-emerald-900/10"
                  }`}
                >
                  {isPopular && (
                    <span className="mb-4 w-fit rounded-full bg-brand-primary px-3 py-1 text-[10px] font-extrabold tracking-wider text-white uppercase">
                      Most popular
                    </span>
                  )}
                  <div className="space-y-5">
                    <div>
                      <h4 className="font-display text-lg font-bold text-brand-ink">{plan.name}</h4>
                      <p className="mt-1 text-xs text-slate-500">{plan.description}</p>
                    </div>
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-4xl font-extrabold text-brand-ink">{plan.priceLabel}</span>
                      <span className="text-sm font-medium text-slate-500">/month</span>
                    </div>
                    <p className="text-[11px] font-medium text-slate-400">Billed monthly</p>
                    <div className="h-px bg-emerald-900/8" />
                    <ul className="space-y-2.5 text-xs text-slate-600">
                      {plan.featureBullets.map((f) => (
                        <li key={f} className="flex items-start gap-2">
                          <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-accent" />
                          {f}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <CtaButton
                    href={user ? "/dashboard?tab=pricing" : "/sign-up"}
                    variant={isPopular ? "primary" : "secondary"}
                    className="mt-8 w-full"
                  >
                    {user ? "Manage plan" : "Get started"}
                  </CtaButton>
                </div>
              </RevealItem>
            );
          })}
        </RevealGroup>

        <p className="mt-10 text-center text-xs text-slate-500">
          No hidden autopilot — every plan waits for your approval before anything sends.
        </p>
      </div>
    </section>
  );
}
