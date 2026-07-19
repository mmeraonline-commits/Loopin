import { AlertTriangle, Sparkles } from "lucide-react";
import { Reveal } from "./reveal";

export function ProblemSolution() {
  return (
    <section className="relative z-10 bg-brand-mint-soft/60 py-24">
      <div className="mx-auto max-w-6xl px-6">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <Reveal>
            <div className="flex h-full flex-col gap-4 rounded-3xl border border-emerald-900/10 bg-white p-8 md:p-10">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
                <AlertTriangle className="h-5 w-5" />
              </span>
              <span className="text-xs font-bold tracking-[0.14em] text-slate-400 uppercase">The problem</span>
              <h3 className="font-display text-2xl font-bold text-brand-ink sm:text-3xl">Your day is scattered across apps.</h3>
              <p className="text-base leading-relaxed text-slate-600">
                Client emails, WhatsApp check-ins, Slack pings — important things slip through while you&apos;re context-switching between
                them all. Every app wants your full attention, all day.
              </p>
            </div>
          </Reveal>

          <Reveal delay={0.1}>
            <div className="flex h-full flex-col gap-4 rounded-3xl border border-emerald-900/15 bg-brand-primary p-8 text-white md:p-10">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-brand-lime">
                <Sparkles className="h-5 w-5" />
              </span>
              <span className="text-xs font-bold tracking-[0.14em] text-brand-lime uppercase">With Loopin</span>
              <h3 className="font-display text-2xl font-bold text-white sm:text-3xl">One brief. One inbox. One you.</h3>
              <p className="text-base leading-relaxed text-white/75">
                Loopin reads every channel, briefs you every morning, drafts replies in your voice, and only pings you when something
                truly needs a decision.
              </p>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
