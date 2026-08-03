import {
  CalendlyIcon,
  DiscordIcon,
  GmailIcon,
  GoogleCalendarIcon,
  LinkedInIcon,
  NotionIcon,
  OutlookIcon,
  SlackIcon,
  TeamsIcon,
  TelegramIcon,
  WhatsAppIcon,
} from "./channel-icons";

const CHANNELS = [
  { name: "Gmail", icon: GmailIcon },
  { name: "WhatsApp", icon: WhatsAppIcon },
  { name: "Slack", icon: SlackIcon },
  { name: "Telegram", icon: TelegramIcon },
  { name: "Microsoft Teams", icon: TeamsIcon },
  { name: "Discord", icon: DiscordIcon },
  { name: "Outlook", icon: OutlookIcon },
  { name: "Google Calendar", icon: GoogleCalendarIcon },
  { name: "Notion", icon: NotionIcon },
  { name: "Calendly", icon: CalendlyIcon },
  { name: "LinkedIn", icon: LinkedInIcon },
];

export function ChannelStrip() {
  return (
    <section className="relative z-10 border-y border-emerald-900/8 bg-white py-8">
      <p className="mb-6 text-center text-xs font-semibold tracking-[0.14em] text-slate-500 uppercase">
        11 channels connected today
      </p>
      <div className="landing-marquee-track relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-white to-transparent sm:w-28"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-white to-transparent sm:w-28"
        />
        <div className="animate-landing-marquee flex w-max items-center gap-10 pr-10">
          {[...CHANNELS, ...CHANNELS].map((ch, i) => (
            <span
              key={`${ch.name}-${i}`}
              className="flex shrink-0 items-center gap-2 text-slate-400 transition-colors hover:text-slate-600"
            >
              <ch.icon className="h-5 w-5" />
              <span className="text-sm font-semibold whitespace-nowrap">{ch.name}</span>
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
