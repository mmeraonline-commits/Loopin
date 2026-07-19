import { BellRing, Inbox, ShieldCheck, Sparkles } from "lucide-react";
import { SectionHeading } from "./section-heading";
import { Reveal } from "./reveal";
import { GmailIcon, SlackIcon, WhatsAppIcon } from "./channel-icons";

export function FeatureShowcase() {
  return (
    <section id="features" className="relative z-10 bg-white py-24">
      <div className="mx-auto max-w-7xl px-6">
        <SectionHeading
          eyebrow="What Loopin does"
          title="Everything you need to stay ahead, nothing to babysit."
          description="Loopin quietly reads your channels in the background so you only see what needs your attention."
          className="mb-16"
        />

        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          <Reveal className="md:col-span-2">
            <div className="group relative flex h-full flex-col justify-between overflow-hidden rounded-3xl border border-emerald-900/10 bg-brand-mint-soft/40 p-8">
              <div className="max-w-md space-y-3">
                <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-900/10 bg-white px-2.5 py-1 text-[10px] font-bold tracking-wider text-brand-primary uppercase">
                  <Inbox className="h-3 w-3" /> Daily brief
                </span>
                <h3 className="font-display text-xl font-bold text-brand-ink sm:text-2xl">One brief, every morning</h3>
                <p className="text-sm leading-relaxed text-slate-600">
                  Loopin reads your overnight Gmail, WhatsApp, and Slack activity and hands you one clear summary — what happened, what
                  needs a reply, and what can wait.
                </p>
              </div>

              <div className="mt-8 space-y-2 rounded-xl border border-emerald-900/10 bg-white p-4">
                <span className="mb-1 block text-[10px] font-bold tracking-wider text-slate-400 uppercase">This morning</span>
                <div className="flex items-center gap-2.5 rounded-lg bg-brand-mint/60 p-2.5">
                  <GmailIcon className="h-4 w-4 text-rose-500" />
                  <p className="text-xs text-slate-700">Finance needs budget sign-off by Friday</p>
                </div>
                <div className="flex items-center gap-2.5 rounded-lg bg-brand-mint/60 p-2.5">
                  <WhatsAppIcon className="h-4 w-4 text-emerald-500" />
                  <p className="text-xs text-slate-700">Alex confirmed the 4:30 sync</p>
                </div>
                <div className="flex items-center gap-2.5 rounded-lg bg-brand-mint/60 p-2.5">
                  <SlackIcon className="h-4 w-4 text-[#4A154B]" />
                  <p className="text-xs text-slate-700">#eng-updates: API change ships Thursday</p>
                </div>
              </div>
            </div>
          </Reveal>

          <Reveal delay={0.08}>
            <div className="flex h-full flex-col justify-between rounded-3xl border border-emerald-900/10 bg-brand-mint-soft/40 p-8 transition-colors hover:border-emerald-900/20">
              <div className="space-y-3">
                <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-900/10 bg-white px-2.5 py-1 text-[10px] font-bold tracking-wider text-brand-primary uppercase">
                  <BellRing className="h-3 w-3" /> Smart alerts
                </span>
                <h3 className="font-display text-xl font-bold text-brand-ink">Never drop a commitment</h3>
                <p className="text-sm leading-relaxed text-slate-600">
                  Casual lines like &quot;I&apos;ll call you at 4&quot; become a tracked reminder automatically — no manual entry.
                </p>
              </div>

              <div className="mt-8 flex items-center justify-between rounded-xl border border-emerald-900/10 bg-white p-3.5 text-xs">
                <div>
                  <p className="text-[9px] font-bold text-slate-400 uppercase">Extracted</p>
                  <h5 className="mt-0.5 font-semibold text-brand-ink">Call Sarah re: deliverables</h5>
                  <p className="mt-0.5 text-[10px] text-brand-accent">Tomorrow, 3:00 PM</p>
                </div>
                <span className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-700">
                  Set
                </span>
              </div>
            </div>
          </Reveal>

          <Reveal delay={0.04}>
            <div className="flex h-full flex-col justify-between rounded-3xl border border-emerald-900/10 bg-brand-mint-soft/40 p-8 transition-colors hover:border-emerald-900/20">
              <div className="space-y-3">
                <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-900/10 bg-white px-2.5 py-1 text-[10px] font-bold tracking-wider text-brand-primary uppercase">
                  <Sparkles className="h-3 w-3" /> Context-aware drafts
                </span>
                <h3 className="font-display text-xl font-bold text-brand-ink">Replies that sound like you</h3>
                <p className="text-sm leading-relaxed text-slate-600">
                  Loopin reads the thread and drafts a reply in your tone. You review, edit if needed, and approve every send.
                </p>
              </div>

              <div className="mt-8 space-y-2 rounded-xl border border-emerald-900/10 bg-white p-3.5 text-xs">
                <p className="leading-relaxed text-slate-600 italic">
                  &quot;Got it — I&apos;ll review the contract and get back to you by Monday.&quot;
                </p>
                <div className="flex justify-end">
                  <span className="rounded bg-brand-primary px-2.5 py-1 text-[10px] font-semibold text-white">Review &amp; send</span>
                </div>
              </div>
            </div>
          </Reveal>

          <Reveal delay={0.12} className="md:col-span-2">
            <div className="flex h-full flex-col justify-between overflow-hidden rounded-3xl border border-emerald-900/10 bg-brand-mint-soft/40 p-8">
              <div className="max-w-md space-y-3">
                <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-900/10 bg-white px-2.5 py-1 text-[10px] font-bold tracking-wider text-brand-primary uppercase">
                  <ShieldCheck className="h-3 w-3" /> Privacy &amp; control
                </span>
                <h3 className="font-display text-xl font-bold text-brand-ink sm:text-2xl">Your accounts, your rules</h3>
                <p className="text-sm leading-relaxed text-slate-600">
                  Loopin connects over official OAuth — never your password. Confirm-before-send is on by default, and you can
                  disconnect any channel at any time.
                </p>
              </div>

              <div className="mt-8 space-y-2 rounded-xl border border-emerald-900/10 bg-white p-4">
                {[
                  ["Confirm-before-send", true],
                  ["OAuth-only connections", true],
                  ["Used to train public AI models", false],
                ].map(([label, on]) => (
                  <div key={label as string} className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-600">{label}</span>
                    <span
                      className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                        on ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-500"
                      }`}
                    >
                      {on ? "Always on" : "Never"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
