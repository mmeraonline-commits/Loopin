"use client";

import { useAuth } from "@/components/auth-provider";
import { CheckCircle2, Loader2, Sparkles } from "lucide-react";
import { Reveal } from "./reveal";
import { CtaButton } from "./cta-button";
import { GmailIcon, SlackIcon, WhatsAppIcon } from "./channel-icons";

const TRUST_ITEMS = ["OAuth-secured connections", "Confirm-before-send, always", "No credit card required"];

const CONNECTED_CHANNELS = [
  { name: "Gmail", icon: GmailIcon, color: "text-rose-500" },
  { name: "WhatsApp", icon: WhatsAppIcon, color: "text-emerald-500" },
  { name: "Slack", icon: SlackIcon, color: "text-[#4A154B]" },
];

export function Hero() {
  const { user } = useAuth();
  const firstName = user?.profile?.name || user?.email?.split("@")[0];

  return (
    <section className="relative overflow-hidden pt-32 pb-20 md:pt-40 md:pb-28">
      <div aria-hidden className="absolute inset-0 -z-10">
        <div className="absolute inset-x-0 top-0 h-[70vh] bg-gradient-to-b from-brand-mint via-brand-mint-soft/60 to-white" />
        <div className="absolute -top-10 left-1/2 h-[420px] w-[70%] -translate-x-1/2 rounded-full bg-emerald-200/30 blur-3xl" />
        <div className="absolute top-52 right-[6%] h-64 w-64 rounded-full bg-brand-lime/40 blur-[90px]" />
      </div>

      <div className="mx-auto max-w-7xl px-6">
        <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
          <Reveal>
            <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-emerald-900/10 bg-brand-mint-soft px-3.5 py-1.5 text-[11px] font-semibold tracking-[0.12em] text-slate-600 uppercase sm:text-xs">
              <Sparkles className="h-3.5 w-3.5 text-brand-accent" />
              Personal AI chief of staff
            </span>
          </Reveal>

          <Reveal delay={0.06}>
            <h1 className="font-display max-w-4xl text-4xl leading-[1.1] font-bold tracking-tight text-brand-ink sm:text-5xl md:text-6xl lg:text-[4.25rem]">
              <span className="text-brand-primary">Loopin</span> briefs you, drafts your replies, and{" "}
              <span className="relative inline-block whitespace-nowrap">
                <span className="relative z-10">flags what matters</span>
                <span aria-hidden className="absolute inset-x-0 bottom-1.5 -z-0 h-[0.28em] bg-brand-lime/70 sm:bottom-2" />
              </span>
              .
            </h1>
          </Reveal>

          <Reveal delay={0.12}>
            <p className="mt-6 max-w-2xl text-base leading-relaxed text-slate-600 sm:text-lg">
              One calm daily brief across Gmail, WhatsApp, and Slack — with drafts that sound like you and nothing sent without your OK.
            </p>
          </Reveal>

          <Reveal delay={0.18}>
            <div className="mt-9 flex w-full max-w-md flex-col items-center justify-center gap-4 sm:flex-row">
              <CtaButton href={user ? "/dashboard" : "/sign-up"} variant="primary" showArrow className="w-full sm:w-auto">
                {user ? `Go to dashboard` : "Get started"}
              </CtaButton>
              <CtaButton href="#how-it-works" variant="secondary" className="w-full sm:w-auto">
                See how it works
              </CtaButton>
            </div>
          </Reveal>

          <Reveal delay={0.24}>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
              {TRUST_ITEMS.map((item) => (
                <span key={item} className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
                  <CheckCircle2 className="h-3.5 w-3.5 text-brand-accent" />
                  {item}
                </span>
              ))}
            </div>
          </Reveal>
        </div>

        <Reveal delay={0.3} className="mt-16 md:mt-20">
          <ProductStage firstName={firstName} />
        </Reveal>
      </div>
    </section>
  );
}

function ProductStage({ firstName }: { firstName?: string }) {
  return (
    <div className="group relative mx-auto w-full max-w-5xl overflow-hidden rounded-3xl border border-emerald-900/10 bg-white shadow-2xl shadow-emerald-900/10">
      <div className="flex h-10 items-center space-x-2 border-b border-emerald-900/10 bg-brand-mint px-4">
        <div className="h-3 w-3 rounded-full bg-rose-400" />
        <div className="h-3 w-3 rounded-full bg-amber-400" />
        <div className="h-3 w-3 rounded-full bg-emerald-500" />
        <div className="flex flex-1 justify-center">
          <div className="flex h-5 w-64 items-center justify-center rounded border border-emerald-900/10 bg-white">
            <span className="text-[10px] text-slate-500">loopin.ai/dashboard/brief</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 px-4 pt-8 pb-4 text-left md:grid-cols-4 md:p-8">
        <div className="col-span-1 hidden space-y-6 border-r border-slate-100 pr-6 md:block">
          <div className="space-y-2">
            <span className="text-[10px] font-bold tracking-wider text-slate-500 uppercase">Connected</span>
            <div className="space-y-1.5">
              {CONNECTED_CHANNELS.map((ch) => (
                <div key={ch.name} className="flex items-center justify-between rounded-lg border border-emerald-900/10 bg-brand-mint p-2">
                  <span className="flex items-center gap-2 text-xs text-brand-ink">
                    <ch.icon className={`h-3.5 w-3.5 ${ch.color}`} />
                    {ch.name}
                  </span>
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                </div>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <span className="text-[10px] font-bold tracking-wider text-slate-500 uppercase">Loopin is working</span>
            <div className="space-y-1.5">
              <div className="flex items-center p-1.5 text-xs text-slate-500">
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin text-brand-accent" />
                Reviewing Slack thread
              </div>
              <div className="flex items-center p-1.5 text-xs text-slate-500">
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin text-brand-accent" />
                Drafting reply to finance
              </div>
            </div>
          </div>
        </div>

        <div className="col-span-1 space-y-5 md:col-span-3">
          <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-lg font-bold text-brand-ink">
                {firstName ? `Today's brief for ${firstName}` : "Today's brief"}
              </h3>
              <p className="text-xs text-slate-500">Across Gmail, WhatsApp, and Slack</p>
            </div>
            <span className="w-fit rounded-md border border-emerald-900/10 bg-brand-mint-soft px-2.5 py-1 text-[10px] font-semibold text-brand-primary">
              2 need your review
            </span>
          </div>

          <div className="space-y-3">
            <div className="rounded-xl border border-emerald-900/10 bg-brand-mint/50 p-4 transition-colors hover:border-emerald-900/20">
              <div className="mb-2 flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                  <WhatsAppIcon className="h-3.5 w-3.5" />
                  WhatsApp · Alex
                </span>
                <span className="text-[10px] text-slate-500">2m ago</span>
              </div>
              <p className="text-xs text-slate-600">&quot;Can you review the roadmap doc before we sync at 4:30?&quot;</p>
              <div className="mt-2.5 flex items-center justify-between rounded-lg border border-emerald-900/10 bg-white p-2.5">
                <div>
                  <p className="text-[11px] font-semibold text-brand-ink">Review roadmap doc</p>
                  <p className="text-[9px] text-brand-accent">Reminder set · Today, 4:00 PM</p>
                </div>
                <span className="rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[9px] text-emerald-700">Tracked</span>
              </div>
            </div>

            <div className="rounded-xl border border-emerald-900/10 bg-brand-mint/50 p-4 transition-colors hover:border-emerald-900/20">
              <div className="mb-2 flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-rose-600">
                  <GmailIcon className="h-3.5 w-3.5" />
                  Gmail · Finance
                </span>
                <span className="text-[10px] text-slate-500">14m ago</span>
              </div>
              <p className="text-xs text-slate-600">&quot;Need your sign-off on the Q3 budget before Friday.&quot;</p>
              <div className="mt-2.5 flex gap-2">
                <button className="flex-1 rounded-lg bg-brand-primary py-1.5 text-[10px] font-semibold text-white transition hover:bg-brand-secondary">
                  Review drafted reply
                </button>
                <button className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] text-slate-600 transition hover:bg-slate-50">
                  Snooze
                </button>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs text-slate-500">
            <span className="flex items-center gap-2">
              <span className="h-2 w-2 animate-pulse rounded-full bg-brand-primary" />
              Loopin reviewed 18 messages and drafted 2 replies this morning.
            </span>
            <a href="#demo" className="font-semibold text-brand-primary hover:underline">
              Try the live demo →
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
