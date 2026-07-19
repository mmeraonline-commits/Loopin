import { GmailIcon, SlackIcon, WhatsAppIcon } from "./channel-icons";

const CHANNELS = [
  { name: "Gmail", icon: GmailIcon },
  { name: "WhatsApp", icon: WhatsAppIcon },
  { name: "Slack", icon: SlackIcon },
];

export function ChannelStrip() {
  return (
    <section className="relative z-10 border-y border-emerald-900/8 bg-white py-8">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-5 px-6 sm:flex-row sm:justify-between">
        <p className="text-xs font-semibold tracking-[0.14em] text-slate-500 uppercase">Works where you already are</p>
        <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-3">
          {CHANNELS.map((ch) => (
            <span key={ch.name} className="flex items-center gap-2 text-slate-400 transition-colors hover:text-slate-600">
              <ch.icon className="h-5 w-5" />
              <span className="text-sm font-semibold">{ch.name}</span>
            </span>
          ))}
          <span className="text-xs text-slate-400">+ Discord, Outlook &amp; Calendly on higher plans</span>
        </div>
      </div>
    </section>
  );
}
