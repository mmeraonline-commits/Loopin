import Link from "next/link";
import { Zap } from "lucide-react";
import { GmailIcon, SlackIcon, WhatsAppIcon } from "./channel-icons";

const PRODUCT_LINKS = [
  { href: "#features", label: "Features" },
  { href: "#capabilities", label: "Capabilities" },
  { href: "#how-it-works", label: "How it works" },
  { href: "#demo", label: "Live demo" },
  { href: "#integrations", label: "Integrations" },
  { href: "#pricing", label: "Pricing" },
  { href: "#faq", label: "FAQ" },
];

const CHANNELS = [
  { icon: GmailIcon, label: "Gmail" },
  { icon: WhatsAppIcon, label: "WhatsApp" },
  { icon: SlackIcon, label: "Slack" },
];

export function LandingFooter() {
  return (
    <footer className="relative z-10 bg-brand-ink px-6 pt-16 pb-8">
      <div className="mx-auto max-w-7xl">
        <div className="grid grid-cols-1 gap-10 pb-14 sm:grid-cols-3">
          <div className="space-y-4 sm:col-span-1">
            <Link href="/" className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-primary">
                <Zap className="h-4 w-4 text-white" fill="currentColor" />
              </span>
              <span className="font-display text-lg font-bold tracking-tight text-white">Loopin</span>
            </Link>
            <p className="max-w-sm text-xs leading-relaxed text-white/50">
              Your personal AI chief of staff — one brief, drafted replies, and nothing sent without your OK.
            </p>
          </div>

          <div className="space-y-4">
            <h5 className="text-xs font-bold tracking-wider text-white uppercase">Product</h5>
            <ul className="space-y-2 text-xs text-white/50">
              {PRODUCT_LINKS.map((link) => (
                <li key={link.href}>
                  <a href={link.href} className="transition hover:text-white">
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-4">
            <h5 className="text-xs font-bold tracking-wider text-white uppercase">Account</h5>
            <ul className="space-y-2 text-xs text-white/50">
              <li>
                <Link href="/sign-up" className="transition hover:text-white">
                  Get started
                </Link>
              </li>
              <li>
                <Link href="/sign-in" className="transition hover:text-white">
                  Sign in
                </Link>
              </li>
            </ul>
            <div className="flex items-center gap-3 pt-1">
              {CHANNELS.map((ch) => (
                <span key={ch.label} className="text-white/30" title={ch.label}>
                  <ch.icon className="h-4 w-4" />
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-col items-center justify-between gap-4 border-t border-white/10 pt-8 text-xs text-white/40 md:flex-row">
          <span>&copy; {new Date().getFullYear()} Loopin. All rights reserved.</span>
          <span>Built for one person&apos;s day, not a support queue.</span>
        </div>
      </div>
    </footer>
  );
}
