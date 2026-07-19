"use client";

import { useEffect, useState, type ReactNode } from "react";
import { CalendarPlus, CheckCircle2, Loader2, Sparkles, Zap } from "lucide-react";
import { SectionHeading } from "./section-heading";
import { Reveal } from "./reveal";
import { GmailIcon, SlackIcon, WhatsAppIcon } from "./channel-icons";

type DemoChannel = {
  id: string;
  name: string;
  icon: typeof GmailIcon;
  accent: string;
  sender: string;
  time: string;
  message: string;
  actionLabel: string;
  outputTitle: string;
  output: ReactNode;
};

const CHANNELS: DemoChannel[] = [
  {
    id: "gmail",
    name: "Gmail",
    icon: GmailIcon,
    accent: "text-rose-500",
    sender: "sarah@financeteam.co",
    time: "10:42 AM",
    message:
      "Hi, please review the final Q2 budget draft before tomorrow's meeting. Let me know if we should adjust the marketing allocation by 10%.",
    actionLabel: "Summarizing & drafting reply",
    outputTitle: "Gmail · AI summary",
    output: (
      <div className="space-y-3">
        <div className="rounded-lg border border-emerald-900/10 bg-brand-mint/60 p-3">
          <span className="mb-1 block text-[10px] font-bold tracking-wider text-brand-primary uppercase">Summary</span>
          <p className="text-xs leading-relaxed text-slate-700">
            Review the Q2 budget draft and decide on the 10% marketing allocation shift before tomorrow&apos;s sync.
          </p>
        </div>
        <div className="rounded-lg border border-emerald-900/15 bg-white p-3">
          <span className="mb-1 flex items-center justify-between text-[10px] font-bold tracking-wider text-brand-accent uppercase">
            Suggested reply
            <span className="text-[9px] font-medium text-slate-400">awaiting your approval</span>
          </span>
          <p className="text-xs leading-relaxed text-slate-700 italic">
            &quot;Hi Sarah, thanks — I&apos;ve reviewed the draft. The 10% marketing shift looks reasonable given Q3 targets. Let&apos;s
            lock it in tomorrow.&quot;
          </p>
          <button className="mt-2.5 rounded-lg bg-brand-primary px-3 py-1.5 text-[10px] font-semibold text-white transition hover:bg-brand-secondary">
            Review &amp; send
          </button>
        </div>
      </div>
    ),
  },
  {
    id: "whatsapp",
    name: "WhatsApp",
    icon: WhatsAppIcon,
    accent: "text-emerald-500",
    sender: "Alex (Co-founder)",
    time: "2:15 PM",
    message: "Let's grab coffee tomorrow at 4:30 near downtown to talk roadmap. Works for you?",
    actionLabel: "Extracting commitment",
    outputTitle: "WhatsApp · Reminder extracted",
    output: (
      <div className="space-y-3">
        <div className="rounded-xl border border-emerald-900/15 bg-brand-mint/60 p-3.5">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[10px] font-bold tracking-wider text-brand-primary uppercase">Commitment tracked</span>
            <span className="rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[9px] font-medium text-amber-700">
              Action needed
            </span>
          </div>
          <h5 className="text-xs font-semibold text-brand-ink">Roadmap coffee with Alex</h5>
          <p className="mt-1 text-[11px] text-slate-500">Tomorrow · 4:30–5:00 PM · Near downtown</p>
        </div>
        <button className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-primary py-2 text-[11px] font-semibold text-white transition hover:bg-brand-secondary">
          <CalendarPlus className="h-3.5 w-3.5" /> Add to calendar
        </button>
      </div>
    ),
  },
  {
    id: "slack",
    name: "Slack",
    icon: SlackIcon,
    accent: "text-[#4A154B]",
    sender: "#eng-updates",
    time: "3:55 PM",
    message: "Heads up — the API rate-limit change ships Thursday. Can you review the migration doc before EOD Wednesday?",
    actionLabel: "Extracting deadline & drafting reply",
    outputTitle: "Slack · Task & reply",
    output: (
      <div className="space-y-3">
        <div className="rounded-lg border border-emerald-900/10 bg-brand-mint/60 p-3">
          <span className="mb-1 block text-[10px] font-bold tracking-wider text-brand-primary uppercase">Task tracked</span>
          <h5 className="text-xs font-semibold text-brand-ink">Review API migration doc</h5>
          <p className="mt-1 text-[11px] text-brand-accent">Due Wednesday, EOD</p>
        </div>
        <div className="rounded-lg border border-emerald-900/15 bg-white p-3">
          <span className="mb-1 flex items-center justify-between text-[10px] font-bold tracking-wider text-brand-accent uppercase">
            Suggested reply
            <span className="text-[9px] font-medium text-slate-400">awaiting your approval</span>
          </span>
          <p className="text-xs leading-relaxed text-slate-700 italic">
            &quot;On it — I&apos;ll review by end of day Wednesday and flag anything that needs discussion.&quot;
          </p>
          <button className="mt-2.5 rounded-lg bg-brand-primary px-3 py-1.5 text-[10px] font-semibold text-white transition hover:bg-brand-secondary">
            Review &amp; send
          </button>
        </div>
      </div>
    ),
  },
];

export function ChannelDemo() {
  const [activeId, setActiveId] = useState<string>("gmail");
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [showResult, setShowResult] = useState(false);

  const active = CHANNELS.find((c) => c.id === activeId) ?? CHANNELS[0];

  useEffect(() => {
    if (!isPlaying) return;
    setShowResult(false);
    setProgress(0);
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          setIsPlaying(false);
          setShowResult(true);
          return 100;
        }
        return prev + 4;
      });
    }, 30);
    return () => clearInterval(interval);
  }, [isPlaying]);

  const selectChannel = (id: string) => {
    setActiveId(id);
    setIsPlaying(false);
    setProgress(0);
    setShowResult(false);
  };

  return (
    <section id="demo" className="relative z-10 bg-brand-mint-soft/50 py-24">
      <div className="mx-auto max-w-7xl px-6">
        <SectionHeading
          eyebrow="Live demo"
          title="See Loopin think, right here."
          description="Pick a channel, run the sample message through Loopin, and watch it draft, track, or reply — for real."
          className="mb-14"
        />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="flex flex-row gap-3 overflow-x-auto pb-2 lg:col-span-3 lg:flex-col lg:overflow-visible lg:pb-0">
            {CHANNELS.map((ch) => {
              const isActive = ch.id === activeId;
              return (
                <button
                  key={ch.id}
                  onClick={() => selectChannel(ch.id)}
                  className={`flex min-w-[140px] flex-1 cursor-pointer items-center gap-3 rounded-xl border p-3.5 text-left transition duration-200 lg:w-full ${
                    isActive
                      ? "border-brand-primary/40 bg-white shadow-md shadow-emerald-900/5"
                      : "border-emerald-900/8 bg-white/50 hover:border-emerald-900/15 hover:bg-white"
                  }`}
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-mint">
                    <ch.icon className={`h-4.5 w-4.5 ${ch.accent}`} />
                  </span>
                  <div>
                    <h4 className="text-sm font-bold text-brand-ink">{ch.name}</h4>
                    <span className="text-[10px] text-slate-500">Sample message</span>
                  </div>
                </button>
              );
            })}
          </div>

          <Reveal className="lg:col-span-9" direction="none">
            <div className="grid grid-cols-1 gap-6 rounded-3xl border border-emerald-900/10 bg-white p-6 shadow-sm md:grid-cols-2 md:p-8">
              <div className="flex flex-col justify-between space-y-4">
                <div>
                  <div className="mb-3.5 flex items-center justify-between">
                    <span className="flex items-center text-xs font-bold text-slate-500">
                      <active.icon className={`mr-2 h-3.5 w-3.5 ${active.accent}`} />
                      Incoming · {active.name}
                    </span>
                    <span className="text-[11px] text-slate-400">{active.time}</span>
                  </div>
                  <div className="space-y-3 rounded-2xl border border-emerald-900/8 bg-brand-mint/40 p-4">
                    <p className="text-xs font-semibold text-brand-ink">{active.sender}</p>
                    <p className="rounded-xl border border-emerald-900/5 bg-white p-3 text-xs leading-relaxed text-slate-600 italic">
                      &quot;{active.message}&quot;
                    </p>
                  </div>
                </div>

                <div className="space-y-3 pt-2">
                  <button
                    onClick={() => setIsPlaying(true)}
                    disabled={isPlaying}
                    className={`flex w-full cursor-pointer items-center justify-center gap-2.5 rounded-xl px-6 py-3 text-sm font-semibold transition duration-200 ${
                      isPlaying
                        ? "border border-brand-primary/25 bg-brand-mint text-brand-primary"
                        : "bg-brand-primary text-white shadow-lg shadow-brand-primary/20 hover:bg-brand-secondary"
                    }`}
                  >
                    {isPlaying ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {active.actionLabel}...
                      </>
                    ) : (
                      <>
                        <Zap className="h-4 w-4" />
                        Analyze with Loopin
                      </>
                    )}
                  </button>
                  <p className="text-center text-[10px] text-slate-400">Sample data — no message is sent to anyone.</p>
                </div>
              </div>

              <div className="flex min-h-[280px] flex-col justify-between border-t border-emerald-900/8 pt-6 md:border-t-0 md:border-l md:pt-0 md:pl-6">
                <div className="flex h-full flex-col justify-between">
                  <div>
                    <div className="mb-4 flex items-center justify-between">
                      <span className="flex items-center text-xs font-bold text-slate-500">
                        <Sparkles className="mr-1.5 h-3.5 w-3.5 text-brand-accent" />
                        Loopin output
                      </span>
                      {showResult && (
                        <span className="animate-fade-in flex items-center gap-1 rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[9px] font-medium text-emerald-700">
                          <CheckCircle2 className="h-2.5 w-2.5" /> Done
                        </span>
                      )}
                    </div>

                    {isPlaying && (
                      <div className="flex flex-col items-center justify-center gap-4 py-14">
                        <div className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-dashed border-brand-primary/40">
                          <span className="h-2 w-2 rounded-full bg-brand-primary" />
                        </div>
                        <div className="h-1.5 w-full max-w-[180px] overflow-hidden rounded-full bg-brand-mint">
                          <div className="h-full rounded-full bg-brand-primary transition-all duration-100" style={{ width: `${progress}%` }} />
                        </div>
                        <span className="text-xs font-medium text-slate-500">Analyzing message...</span>
                      </div>
                    )}

                    {!isPlaying && !showResult && (
                      <div className="flex flex-col items-center justify-center gap-3 py-14 text-center">
                        <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-emerald-900/8 bg-brand-mint/50 text-slate-400">
                          <Sparkles className="h-5 w-5" />
                        </div>
                        <p className="max-w-[200px] text-xs text-slate-500">Click &quot;Analyze with Loopin&quot; to run the sample.</p>
                      </div>
                    )}

                    {showResult && <div className="animate-fade-in">{active.output}</div>}
                  </div>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
