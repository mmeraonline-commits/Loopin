"use client";

import { Zap } from "lucide-react";
import {
  CalendlyIcon,
  DiscordIcon,
  GmailIcon,
  LinkedInIcon,
  OutlookIcon,
  SlackIcon,
  WhatsAppIcon,
} from "./channel-icons";
import { Reveal } from "./reveal";
import { SectionHeading } from "./section-heading";

const HUB_CHANNELS = [
  { name: "Gmail", icon: GmailIcon, color: "text-rose-500", x: 50, y: 8 },
  { name: "WhatsApp", icon: WhatsAppIcon, color: "text-emerald-500", x: 88, y: 32 },
  { name: "Slack", icon: SlackIcon, color: "text-[#4A154B]", x: 82, y: 78 },
  { name: "Discord", icon: DiscordIcon, color: "text-indigo-500", x: 18, y: 78 },
  { name: "Calendly", icon: CalendlyIcon, color: "text-brand-accent", x: 12, y: 32 },
];

const STACK_ROWS = [
  {
    label: "Email",
    blurb: "Inbox & threads",
    items: [
      { name: "Gmail", icon: GmailIcon, color: "text-rose-500" },
      { name: "Outlook", icon: OutlookIcon, color: "text-sky-600" },
    ],
  },
  {
    label: "Messaging",
    blurb: "Chats & DMs",
    items: [
      { name: "WhatsApp", icon: WhatsAppIcon, color: "text-emerald-500" },
      { name: "Slack", icon: SlackIcon, color: "text-[#4A154B]" },
      { name: "Discord", icon: DiscordIcon, color: "text-indigo-500" },
    ],
  },
  {
    label: "Calendar",
    blurb: "Scheduling",
    items: [{ name: "Calendly", icon: CalendlyIcon, color: "text-brand-accent" }],
  },
  {
    label: "Network",
    blurb: "Professional",
    items: [{ name: "LinkedIn", icon: LinkedInIcon, color: "text-sky-700" }],
  },
];

export function IntegrationsSection() {
  return (
    <section id="integrations" className="relative z-10 overflow-hidden bg-brand-mint-soft/40 py-24">
      <div aria-hidden className="absolute top-20 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-brand-lime/20 blur-[100px]" />

      {/* Radial hub */}
      <div className="relative mx-auto max-w-6xl px-6">
        <SectionHeading
          eyebrow="Integrations"
          title={
            <>
              Works with the channels{" "}
              <span className="text-brand-primary">you already live in.</span>
            </>
          }
          description="Connect Gmail, WhatsApp, and Slack in minutes — then add Discord, Outlook, Calendly, and LinkedIn as you grow."
          className="mb-16"
        />

        <Reveal>
          <div className="relative mx-auto aspect-square w-full max-w-xl sm:aspect-[5/4]">
            {/* Connection arcs */}
            <svg
              className="pointer-events-none absolute inset-0 h-full w-full"
              viewBox="0 0 100 100"
              fill="none"
              aria-hidden
            >
              {HUB_CHANNELS.map((ch) => (
                <path
                  key={ch.name}
                  d={`M 50 50 Q ${(ch.x + 50) / 2} ${(ch.y + 50) / 2 - 8} ${ch.x} ${ch.y}`}
                  stroke="#2D6A54"
                  strokeWidth="0.35"
                  strokeOpacity="0.35"
                  strokeDasharray="1.2 1.2"
                />
              ))}
            </svg>

            {/* Center Loopin hub */}
            <div className="absolute top-1/2 left-1/2 z-10 flex h-24 w-24 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-2xl border border-emerald-900/10 bg-white shadow-[0_0_40px_rgba(45,106,84,0.22)] sm:h-28 sm:w-28">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-primary sm:h-11 sm:w-11">
                <Zap className="h-5 w-5 text-white" fill="currentColor" />
              </span>
              <span className="font-display mt-1.5 text-sm font-bold text-brand-ink">Loopin</span>
            </div>

            {/* Orbit nodes */}
            {HUB_CHANNELS.map((ch) => (
              <div
                key={ch.name}
                className="absolute z-10 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1.5"
                style={{ left: `${ch.x}%`, top: `${ch.y}%` }}
              >
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-900/10 bg-white shadow-[0_8px_30px_rgba(26,67,53,0.08)] transition-transform duration-300 hover:-translate-y-0.5 sm:h-16 sm:w-16">
                  <ch.icon className={`h-6 w-6 ${ch.color}`} />
                </div>
                <span className="text-[10px] font-semibold text-slate-500 sm:text-xs">{ch.name}</span>
              </div>
            ))}
          </div>
        </Reveal>

        <p className="mx-auto mt-6 max-w-lg text-center text-sm text-slate-600">
          One assistant across all of them. Connect a channel and Loopin starts briefing you the same day.
        </p>
      </div>

      {/* Stack convergence */}
      <div className="relative mx-auto mt-28 max-w-6xl px-6">
        <SectionHeading
          eyebrow="Your stack"
          title={
            <>
              Everything feeds{" "}
              <span className="text-brand-primary">one calm workspace.</span>
            </>
          }
          description="Email, chats, calendar, and network — Loopin reads them together so your brief and drafts have full context."
          className="mb-14"
        />

        <Reveal>
          <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-[1fr_auto_minmax(280px,340px)] lg:gap-4">
            {/* Category capsules */}
            <div className="space-y-3">
              {STACK_ROWS.map((row) => (
                <div
                  key={row.label}
                  className="flex flex-wrap items-center gap-3 rounded-2xl border border-emerald-900/10 bg-white px-4 py-3.5 shadow-[0_8px_30px_rgba(26,67,53,0.05)]"
                >
                  <div className="min-w-[88px]">
                    <p className="text-xs font-bold text-brand-ink">{row.label}</p>
                    <p className="text-[10px] text-slate-400">{row.blurb}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {row.items.map((item) => (
                      <span
                        key={item.name}
                        className="inline-flex items-center gap-1.5 rounded-full border border-emerald-900/8 bg-brand-mint-soft/80 px-2.5 py-1 text-[11px] font-semibold text-slate-600"
                      >
                        <item.icon className={`h-3.5 w-3.5 ${item.color}`} />
                        {item.name}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Converging lines (desktop) */}
            <svg
              className="hidden h-64 w-16 shrink-0 lg:block"
              viewBox="0 0 64 256"
              fill="none"
              aria-hidden
            >
              {[32, 96, 160, 224].map((y) => (
                <path
                  key={y}
                  d={`M 0 ${y} C 28 ${y} 36 128 64 128`}
                  stroke="#2D6A54"
                  strokeWidth="1.5"
                  strokeOpacity="0.35"
                />
              ))}
            </svg>

            {/* Hub card */}
            <div className="relative overflow-hidden rounded-3xl border border-emerald-900/10 bg-white p-8 shadow-[0_0_50px_rgba(45,106,84,0.12)]">
              <div aria-hidden className="absolute -top-10 -right-10 h-32 w-32 rounded-full bg-brand-lime/30 blur-2xl" />
              <div className="relative">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-primary shadow-md shadow-brand-primary/25">
                  <Zap className="h-6 w-6 text-white" fill="currentColor" />
                </span>
                <h3 className="font-display mt-5 text-xl font-bold text-brand-ink">
                  Your whole day, one assistant.
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-slate-600">
                  Every connected tool feeds Loopin — so briefs are accurate, drafts sound like you, and alerts catch what matters.
                </p>
                <a
                  href="#pricing"
                  className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-primary transition hover:gap-2.5"
                >
                  See plans by channel
                  <span aria-hidden>→</span>
                </a>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
