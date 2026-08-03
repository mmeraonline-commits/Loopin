"use client";

import type { ReactNode } from "react";
import { Check, ShieldCheck, Upload } from "lucide-react";
import {
  GmailIcon,
  NotionIcon,
  SlackIcon,
  TeamsIcon,
  TelegramIcon,
  WhatsAppIcon,
} from "./channel-icons";
import { Reveal } from "./reveal";
import { SectionHeading } from "./section-heading";

type Step = {
  n: string;
  label: string;
  title: string;
  body: ReactNode;
  flip: boolean;
  mock: ReactNode;
};

const STEPS: Step[] = [
  {
    n: "01",
    label: "Connect",
    title: "Link the apps you already live in",
    body: (
      <>
        Secure OAuth for Gmail, Slack, Teams, Telegram, WhatsApp, Discord, Notion, and more.
        No forwarding rules, no rip-and-replace — just connect and Loopin starts reading context.
      </>
    ),
    flip: false,
    mock: <ConnectMock />,
  },
  {
    n: "02",
    label: "Train",
    title: "Teach Loopin how you sound",
    body: (
      <>
        Drop in sample replies, a sign-off, and reference docs. Drafts pick up your tone and your facts —
        not a generic assistant voice.
      </>
    ),
    flip: true,
    mock: <TrainMock />,
  },
  {
    n: "03",
    label: "Approve",
    title: "Review every send yourself",
    body: (
      <>
        Confirm-before-send stays on. Loopin drafts the reply and surfaces the ask — you edit, approve,
        or skip. Nothing leaves without you.
      </>
    ),
    flip: false,
    mock: <ReviewMock />,
  },
  {
    n: "04",
    label: "Brief",
    title: "Open one calm morning brief",
    body: (
      <>
        Overnight email, chats, calendar, and docs collapse into a single summary: what happened,
        what needs you, and what can wait.
      </>
    ),
    flip: true,
    mock: <BriefMock />,
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="relative z-10 overflow-hidden bg-white py-24 md:py-28">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 hidden w-1/2 bg-gradient-to-l from-brand-mint-soft/80 to-transparent lg:block"
      />

      <div className="relative mx-auto max-w-6xl px-6">
        <SectionHeading
          eyebrow="How it works"
          title={
            <>
              Four steps from chaos to{" "}
              <span className="relative inline-block">
                <span className="relative z-10">a clear morning.</span>
                <span
                  aria-hidden
                  className="absolute inset-x-0 bottom-1 -z-0 h-[0.28em] bg-brand-lime/70 sm:bottom-1.5"
                />
              </span>
            </>
          }
          description="Connect your stack, train your voice, approve drafts, and wake up already briefed — without giving up control."
          className="mb-16 md:mb-20"
        />

        <div className="relative space-y-14 md:space-y-20">
          {/* Timeline rail */}
          <div
            aria-hidden
            className="absolute top-4 bottom-4 left-[1.15rem] hidden w-px bg-gradient-to-b from-brand-primary/25 via-brand-primary/15 to-transparent md:left-[1.4rem] lg:block"
          />

          {STEPS.map((step, i) => (
            <Reveal key={step.n} delay={i * 0.05}>
              <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-12 lg:gap-12">
                <div
                  className={`relative lg:col-span-5 ${step.flip ? "lg:order-2 lg:col-start-8" : ""}`}
                >
                  <div className="flex items-start gap-4">
                    <span className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-emerald-900/10 bg-brand-mint font-mono text-xs font-bold text-brand-primary shadow-sm">
                      {step.n}
                    </span>
                    <div>
                      <p className="text-[11px] font-bold tracking-[0.14em] text-brand-accent uppercase">
                        {step.label}
                      </p>
                      <h3 className="font-display mt-2 text-2xl leading-snug font-bold text-brand-ink sm:text-[1.7rem]">
                        {step.title}
                      </h3>
                      <p className="mt-3 text-sm leading-relaxed text-slate-600 sm:text-base">
                        {step.body}
                      </p>
                    </div>
                  </div>
                </div>

                <div
                  className={`lg:col-span-6 ${
                    step.flip ? "lg:order-1 lg:col-start-1" : "lg:col-start-7"
                  }`}
                >
                  {step.mock}
                </div>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal delay={0.1} className="mt-16 md:mt-20">
          <div className="flex flex-col gap-4 rounded-3xl border border-emerald-900/10 bg-brand-primary p-6 text-white sm:flex-row sm:items-center sm:justify-between sm:gap-8 sm:p-7">
            <div className="flex items-start gap-3 sm:items-center">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-brand-lime">
                <ShieldCheck className="h-5 w-5" />
              </span>
              <div>
                <p className="font-display text-base font-bold sm:text-lg">Control stays with you</p>
                <p className="mt-1 text-sm text-white/70">
                  Confirm-before-send on every channel. Disconnect anytime from Settings.
                </p>
              </div>
            </div>
            <a
              href="#pricing"
              className="inline-flex shrink-0 items-center justify-center rounded-xl bg-brand-lime px-5 py-2.5 text-sm font-bold text-brand-ink transition hover:bg-white"
            >
              See plans
            </a>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function MockShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-3xl border border-emerald-900/10 bg-white shadow-[0_16px_40px_rgba(26,67,53,0.08)]">
      <div className="flex items-center gap-2 border-b border-emerald-900/8 bg-brand-mint px-4 py-3">
        <span className="h-2.5 w-2.5 rounded-full bg-rose-400/80" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber-400/80" />
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/80" />
        <div className="ml-2 min-w-0 flex-1">
          <p className="truncate text-xs font-semibold text-brand-ink">{title}</p>
          {subtitle ? <p className="truncate text-[10px] text-slate-500">{subtitle}</p> : null}
        </div>
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </div>
  );
}

function ConnectMock() {
  const rows = [
    { name: "Gmail", detail: "work@company.com", icon: GmailIcon, color: "text-rose-500", live: true },
    { name: "WhatsApp", detail: "Personal", icon: WhatsAppIcon, color: "text-emerald-500", live: true },
    { name: "Slack", detail: "Loopin HQ", icon: SlackIcon, color: "text-[#4A154B]", live: false },
    { name: "Teams", detail: "Work account", icon: TeamsIcon, color: "text-indigo-500", live: false },
    { name: "Telegram", detail: "Bot linked", icon: TelegramIcon, color: "text-sky-500", live: false },
    { name: "Notion", detail: "Workspace", icon: NotionIcon, color: "text-slate-800", live: false },
  ];

  return (
    <MockShell title="Integrations" subtitle="loopin.ai/dashboard">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {rows.map((row, i) => (
          <div
            key={row.name}
            className="animate-landing-reveal flex items-center justify-between gap-2 rounded-2xl border border-emerald-900/8 bg-brand-mint-soft/50 px-3 py-2.5"
            style={{ animationDelay: `${0.04 * i}s` }}
          >
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white">
                <row.icon className={`h-3.5 w-3.5 ${row.color}`} />
              </span>
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-brand-ink">{row.name}</p>
                <p className="truncate text-[10px] text-slate-500">{row.detail}</p>
              </div>
            </div>
            {row.live ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700">
                <Check className="h-3 w-3" /> Live
              </span>
            ) : (
              <span className="rounded-lg border border-emerald-900/10 bg-white px-2 py-1 text-[10px] font-bold text-brand-primary">
                Add
              </span>
            )}
          </div>
        ))}
      </div>
    </MockShell>
  );
}

function TrainMock() {
  return (
    <MockShell title="Tone training" subtitle="Settings · Voice">
      <div className="rounded-2xl border border-dashed border-brand-primary/25 bg-gradient-to-br from-brand-mint to-white px-5 py-8 text-center">
        <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-primary text-brand-lime shadow-md shadow-brand-primary/20">
          <Upload className="h-5 w-5" />
        </span>
        <p className="mt-4 text-sm font-semibold text-brand-ink">Add samples, docs, or a sign-off</p>
        <p className="mt-1.5 text-xs text-slate-500">FAQs · past replies · policies · website notes</p>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {[
          ["Tone", "Concise"],
          ["Sign-off", "Best,"],
          ["Sources", "3 docs"],
        ].map(([k, v]) => (
          <div key={k} className="rounded-xl border border-emerald-900/8 bg-brand-mint-soft/60 px-2.5 py-2 text-center">
            <p className="text-[9px] font-bold tracking-wider text-slate-400 uppercase">{k}</p>
            <p className="mt-0.5 text-xs font-semibold text-brand-ink">{v}</p>
          </div>
        ))}
      </div>
    </MockShell>
  );
}

function ReviewMock() {
  return (
    <MockShell title="AI Agent" subtitle="Confirm before send">
      <div className="space-y-3">
        <div className="rounded-2xl border border-emerald-900/10 bg-brand-mint-soft/60 p-3.5">
          <div className="mb-1.5 flex items-center gap-2">
            <GmailIcon className="h-3.5 w-3.5 text-rose-500" />
            <p className="text-[11px] font-semibold text-brand-ink">Maria Lopez · Gmail</p>
            <span className="ml-auto text-[10px] text-slate-400">2m ago</span>
          </div>
          <p className="text-xs leading-relaxed text-slate-600">
            Can you confirm Friday delivery and send the revised quote?
          </p>
        </div>
        <div className="rounded-2xl border border-brand-primary/20 bg-white p-3.5 shadow-sm">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[10px] font-bold tracking-wider text-brand-accent uppercase">Draft ready</p>
            <span className="rounded-md bg-amber-50 px-1.5 py-0.5 text-[9px] font-bold text-amber-700">
              Needs you
            </span>
          </div>
          <p className="text-xs leading-relaxed text-slate-700">
            Hi Maria — confirming Friday delivery. I&apos;ll send the revised quote this afternoon.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              className="flex-1 rounded-xl border border-emerald-900/10 bg-brand-mint-soft py-2 text-[11px] font-semibold text-slate-600"
            >
              Edit
            </button>
            <button
              type="button"
              className="flex-1 rounded-xl bg-brand-primary py-2 text-[11px] font-semibold text-white"
            >
              Confirm &amp; send
            </button>
          </div>
        </div>
      </div>
    </MockShell>
  );
}

function BriefMock() {
  return (
    <MockShell title="Today's brief" subtitle="Email · chat · calendar · docs">
      <div className="mb-3 flex items-center justify-between rounded-2xl bg-brand-primary px-3.5 py-2.5 text-white">
        <p className="text-xs font-semibold">3 need your attention</p>
        <span className="rounded-md bg-brand-lime/90 px-2 py-0.5 text-[10px] font-bold text-brand-ink">
          Fresh
        </span>
      </div>
      <div className="space-y-2">
        {[
          { icon: GmailIcon, color: "text-rose-500", text: "Finance needs budget sign-off by Friday" },
          { icon: WhatsAppIcon, color: "text-emerald-500", text: "Alex confirmed the 4:30 sync" },
          { icon: SlackIcon, color: "text-[#4A154B]", text: "#eng-updates: API change ships Thursday" },
          { icon: NotionIcon, color: "text-slate-800", text: "Roadmap page: 2 open questions" },
        ].map((row) => (
          <div
            key={row.text}
            className="flex items-center gap-2.5 rounded-2xl border border-emerald-900/8 bg-brand-mint-soft/50 px-3 py-2.5"
          >
            <row.icon className={`h-4 w-4 shrink-0 ${row.color}`} />
            <p className="text-xs text-slate-700">{row.text}</p>
          </div>
        ))}
      </div>
    </MockShell>
  );
}
