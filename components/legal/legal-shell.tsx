import type { ReactNode } from "react";
import Link from "next/link";
import { Zap } from "lucide-react";
import { LandingFooter } from "@/components/landing/landing-footer";

const LEGAL_NAV = [
  { href: "/about", label: "About" },
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
  { href: "/contact", label: "Contact" },
];

export function LegalShell({
  title,
  subtitle,
  updated,
  children,
}: {
  title: string;
  subtitle?: string;
  updated?: string;
  children: ReactNode;
}) {
  return (
    <div className="font-landing min-h-screen bg-white text-brand-ink">
      <header className="sticky top-0 z-40 border-b border-emerald-900/8 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-4">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-primary">
              <Zap className="h-4 w-4 text-white" fill="currentColor" />
            </span>
            <span className="font-display text-lg font-bold tracking-tight text-brand-ink">Loopin</span>
          </Link>
          <nav className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1 text-xs font-semibold text-slate-600 sm:text-sm">
            {LEGAL_NAV.map((item) => (
              <Link key={item.href} href={item.href} className="transition hover:text-brand-primary">
                {item.label}
              </Link>
            ))}
            <Link href="/" className="text-brand-primary transition hover:opacity-80">
              Home
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-14 sm:py-20">
        <p className="mb-3 text-xs font-bold tracking-wider text-brand-primary uppercase">Loopin</p>
        <h1 className="font-display text-3xl font-bold tracking-tight text-brand-ink sm:text-4xl">{title}</h1>
        {subtitle ? (
          <p className="mt-3 text-base leading-relaxed text-slate-600">{subtitle}</p>
        ) : null}
        {updated ? (
          <p className="mt-4 text-xs font-medium text-slate-400">Last updated: {updated}</p>
        ) : null}

        <div className="prose-legal mt-10 space-y-8 text-[15px] leading-relaxed text-slate-700 [&_a]:font-semibold [&_a]:text-brand-primary [&_a]:underline-offset-2 hover:[&_a]:underline [&_h2]:mt-10 [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-bold [&_h2]:tracking-tight [&_h2]:text-brand-ink [&_h3]:mt-6 [&_h3]:text-base [&_h3]:font-bold [&_h3]:text-brand-ink [&_li]:mt-1.5 [&_ol]:list-decimal [&_ol]:space-y-1.5 [&_ol]:pl-5 [&_p]:mt-3 [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5">
          {children}
        </div>
      </main>

      <LandingFooter />
    </div>
  );
}
