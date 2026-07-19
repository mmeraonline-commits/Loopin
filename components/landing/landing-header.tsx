"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Menu, X, Zap } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { CtaButton } from "./cta-button";

const NAV_LINKS = [
  { href: "#features", label: "Features" },
  { href: "#capabilities", label: "Capabilities" },
  { href: "#how-it-works", label: "How it works" },
  { href: "#demo", label: "Demo" },
  { href: "#integrations", label: "Integrations" },
  { href: "#pricing", label: "Pricing" },
  { href: "#faq", label: "FAQ" },
];

export function LandingHeader() {
  const { user, signOut } = useAuth();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    handleScroll();
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? "border-b border-emerald-900/8 bg-white/90 py-3 shadow-sm backdrop-blur-md"
          : "border-b border-transparent py-5"
      }`}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6">
        <Link href="/" className="group flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-primary shadow-md shadow-brand-primary/20 transition-transform duration-300 group-hover:scale-105">
            <Zap className="h-5 w-5 text-white" strokeWidth={2.5} fill="currentColor" />
          </span>
          <span className="font-display text-2xl font-bold tracking-tight text-brand-ink transition-colors duration-300 group-hover:text-brand-primary">
            Loopin
          </span>
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-slate-600 transition duration-200 hover:text-brand-primary"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-4 md:flex">
          {user ? (
            <div className="flex items-center gap-4">
              <div className="flex flex-col text-right">
                <span className="text-xs font-bold text-brand-ink">{user.profile?.name || user.email?.split("@")[0]}</span>
                <span className="text-[10px] text-slate-500">{user.email}</span>
              </div>
              <CtaButton href="/dashboard" variant="primary">
                Dashboard
              </CtaButton>
              <button
                onClick={signOut}
                className="cursor-pointer rounded-xl border border-brand-primary/25 px-4 py-2 text-xs font-semibold text-brand-primary transition duration-200 hover:bg-brand-mint"
              >
                Sign out
              </button>
            </div>
          ) : (
            <>
              <Link href="/sign-in" className="px-3 py-2 text-sm font-semibold text-slate-600 transition duration-200 hover:text-brand-primary">
                Sign in
              </Link>
              <CtaButton href="/sign-up" variant="primary">
                Get started
              </CtaButton>
            </>
          )}
        </div>

        <button
          onClick={() => setIsMobileMenuOpen((v) => !v)}
          className="p-2 text-slate-600 hover:text-brand-primary focus:outline-none md:hidden"
          aria-label="Toggle menu"
        >
          {isMobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {isMobileMenuOpen && (
        <div className="animate-fade-in flex flex-col gap-4 border-t border-emerald-900/8 bg-white px-6 py-6 shadow-xl md:hidden">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={() => setIsMobileMenuOpen(false)}
              className="py-1 text-base font-medium text-slate-700 transition hover:text-brand-primary"
            >
              {link.label}
            </a>
          ))}
          <div className="my-2 h-px bg-slate-200" />
          {user ? (
            <div className="flex flex-col gap-2">
              <div className="flex flex-col rounded-xl border border-emerald-900/10 bg-brand-mint p-2.5">
                <span className="text-sm font-bold text-brand-ink">{user.profile?.name || user.email?.split("@")[0]}</span>
                <span className="mt-0.5 text-xs text-slate-500">{user.email}</span>
              </div>
              <Link
                href="/dashboard"
                onClick={() => setIsMobileMenuOpen(false)}
                className="w-full rounded-xl bg-brand-primary py-2.5 text-center text-sm font-semibold text-white"
              >
                Go to dashboard
              </Link>
              <button
                onClick={() => {
                  signOut();
                  setIsMobileMenuOpen(false);
                }}
                className="w-full cursor-pointer rounded-xl border border-brand-primary/25 py-2.5 text-center text-sm font-semibold text-brand-primary"
              >
                Sign out
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <Link
                href="/sign-in"
                onClick={() => setIsMobileMenuOpen(false)}
                className="w-full py-2.5 text-center text-sm font-semibold text-slate-600 transition hover:text-brand-primary"
              >
                Sign in
              </Link>
              <Link
                href="/sign-up"
                onClick={() => setIsMobileMenuOpen(false)}
                className="w-full rounded-xl bg-brand-primary py-3 text-center text-sm font-semibold text-white"
              >
                Get started
              </Link>
            </div>
          )}
        </div>
      )}
    </header>
  );
}
