"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Check, ChevronRight, Plug, BrainCircuit, Bell, Newspaper, X, Sparkles } from "lucide-react";

type IntegrationValue = {
  connected?: boolean;
  isSimulated?: boolean;
} | null;

type UserLike = {
  id?: string;
  integrations?: Record<string, IntegrationValue>;
} | null;

type OnboardingStep = {
  id: string;
  title: string;
  description: string;
  href: string;
  cta: string;
  done: boolean;
  icon: React.ComponentType<{ className?: string }>;
};

function storageKey(userId: string, kind: "dismissed" | "progress") {
  return `omnisync-onboarding-${kind}:${userId}`;
}

function isLive(integrations: Record<string, IntegrationValue> | undefined, id: string) {
  const value = integrations?.[id];
  return !!value?.connected && !value?.isSimulated;
}

function readProgress(userId: string): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(storageKey(userId, "progress"));
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeProgress(userId: string, progress: Record<string, boolean>) {
  localStorage.setItem(storageKey(userId, "progress"), JSON.stringify(progress));
}

export function markOnboardingStep(userId: string | undefined, stepId: string) {
  if (!userId || typeof window === "undefined") return;
  const progress = readProgress(userId);
  if (progress[stepId]) return;
  writeProgress(userId, { ...progress, [stepId]: true });
  window.dispatchEvent(new Event("omnisync-onboarding-updated"));
}

export function resetOnboarding(userId: string | undefined) {
  if (!userId || typeof window === "undefined") return;
  localStorage.removeItem(storageKey(userId, "dismissed"));
  localStorage.removeItem(storageKey(userId, "progress"));
  window.dispatchEvent(new Event("omnisync-onboarding-updated"));
}

export function OnboardingGuideBanner({ user }: { user: UserLike }) {
  const searchParams = useSearchParams();
  const userId = user?.id;
  const [mounted, setMounted] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [progress, setProgress] = useState<Record<string, boolean>>({});
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!userId || !mounted) return;

    const sync = () => {
      setDismissed(localStorage.getItem(storageKey(userId, "dismissed")) === "1");
      setProgress(readProgress(userId));
    };
    sync();

    window.addEventListener("omnisync-onboarding-updated", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("omnisync-onboarding-updated", sync);
      window.removeEventListener("storage", sync);
    };
  }, [userId, mounted]);

  // Auto-mark steps when the user visits related tabs
  useEffect(() => {
    if (!userId || !mounted) return;
    const tab = searchParams.get("tab") || "dashboard";
    if (tab === "ai-agent") markOnboardingStep(userId, "ai-agent");
    if (tab === "alerts") markOnboardingStep(userId, "alerts");
    if (tab === "briefing") markOnboardingStep(userId, "briefing");
    if (tab === "integrations") markOnboardingStep(userId, "visited-integrations");
  }, [searchParams, userId, mounted]);

  const steps: OnboardingStep[] = useMemo(() => {
    const integrations = user?.integrations || {};
    const connectedCount = ["gmail", "whatsapp", "slack", "discord", "linkedin", "calendly", "outlook"].filter(
      (id) => isLive(integrations, id)
    ).length;
    const hasMessaging = ["whatsapp", "slack", "discord"].some((id) => isLive(integrations, id));

    return [
      {
        id: "connect",
        title: "Connect your first app",
        description: "Link Gmail, WhatsApp, Slack, Discord, or Calendly so Loopin can sync real data.",
        href: "/dashboard?tab=integrations",
        cta: "Open Integrations",
        done: connectedCount >= 1,
        icon: Plug,
      },
      {
        id: "messaging",
        title: "Add a chat channel",
        description: "Connect WhatsApp, Slack, or Discord so the AI can draft and send replies.",
        href: "/dashboard?tab=integrations",
        cta: "Connect chat",
        done: hasMessaging,
        icon: Plug,
      },
      {
        id: "ai-agent",
        title: "Try the AI Agent",
        description: "Ask about unread messages, drafts, or schedule — confirm before anything is sent.",
        href: "/dashboard?tab=ai-agent",
        cta: "Open AI Agent",
        done: !!progress["ai-agent"],
        icon: BrainCircuit,
      },
      {
        id: "alerts",
        title: "Check Alerts",
        description: "Review priority items and reply from one place.",
        href: "/dashboard?tab=alerts",
        cta: "Open Alerts",
        done: !!progress["alerts"],
        icon: Bell,
      },
      {
        id: "briefing",
        title: "Open your Briefing",
        description: "See a daily summary across connected platforms.",
        href: "/dashboard?tab=briefing",
        cta: "Open Briefing",
        done: !!progress["briefing"],
        icon: Newspaper,
      },
    ];
  }, [user?.integrations, progress]);

  const doneCount = steps.filter((s) => s.done).length;
  const allDone = doneCount === steps.length;
  const nextStep = steps.find((s) => !s.done) || steps[steps.length - 1];
  const percent = Math.round((doneCount / steps.length) * 100);

  if (!mounted || !userId || dismissed) return null;

  const handleDismiss = () => {
    localStorage.setItem(storageKey(userId, "dismissed"), "1");
    setDismissed(true);
  };

  return (
    <div className="mb-6 rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/[0.08] via-slate-900/40 to-cyan-500/[0.06] light:from-emerald-50 light:via-white light:to-cyan-50 light:border-emerald-200 overflow-hidden shadow-lg shadow-emerald-950/10">
      <div className="px-4 sm:px-5 py-4 flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2 text-emerald-400 light:text-emerald-700">
              <Sparkles className="w-4 h-4" />
              <span className="text-[11px] font-bold uppercase tracking-[0.14em]">
                {allDone ? "Setup complete" : "Setup guide"}
              </span>
            </div>
            <h2 className="text-base sm:text-lg font-bold text-white light:text-slate-900 tracking-tight">
              {allDone
                ? "You're ready — Loopin is wired up"
                : `Finish setup · ${doneCount}/${steps.length} done`}
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 light:text-slate-600 max-w-2xl">
              {allDone
                ? "You can reopen this guide anytime from Settings."
                : nextStep.description}
            </p>
          </div>

          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button
              type="button"
              onClick={() => setCollapsed((v) => !v)}
              className="hidden sm:inline-flex px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-slate-300 light:text-slate-600 hover:bg-white/5 light:hover:bg-slate-100 border border-transparent hover:border-white/10 light:hover:border-slate-200 transition"
            >
              {collapsed ? "Expand" : "Collapse"}
            </button>
            <button
              type="button"
              onClick={handleDismiss}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white light:hover:text-slate-900 hover:bg-white/5 light:hover:bg-slate-100 transition"
              title="Dismiss setup guide"
              aria-label="Dismiss setup guide"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="h-1.5 rounded-full bg-white/10 light:bg-slate-200 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-cyan-400 transition-all duration-500"
            style={{ width: `${percent}%` }}
          />
        </div>

        {!collapsed && (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-2.5">
            {steps.map((step, index) => {
              const Icon = step.icon;
              const isNext = !allDone && step.id === nextStep.id;
              return (
                <Link
                  key={step.id}
                  href={step.href}
                  className={`group relative rounded-xl border p-3 transition ${
                    step.done
                      ? "border-emerald-500/30 bg-emerald-500/10 light:bg-emerald-50 light:border-emerald-200"
                      : isNext
                        ? "border-cyan-400/40 bg-cyan-500/10 light:bg-cyan-50 light:border-cyan-300 ring-1 ring-cyan-400/20"
                        : "border-white/10 bg-white/[0.02] light:bg-white light:border-slate-200 hover:border-white/20 light:hover:border-slate-300"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span
                      className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold ${
                        step.done
                          ? "bg-emerald-500 text-white"
                          : isNext
                            ? "bg-cyan-500 text-white"
                            : "bg-white/10 light:bg-slate-100 text-slate-300 light:text-slate-500"
                      }`}
                    >
                      {step.done ? <Check className="w-3.5 h-3.5" /> : index + 1}
                    </span>
                    <Icon
                      className={`w-3.5 h-3.5 ${
                        step.done
                          ? "text-emerald-400"
                          : isNext
                            ? "text-cyan-300"
                            : "text-slate-500"
                      }`}
                    />
                  </div>
                  <p className="text-xs font-bold text-white light:text-slate-900 leading-snug mb-1">
                    {step.title}
                  </p>
                  <p className="text-[10px] text-slate-400 light:text-slate-500 leading-relaxed line-clamp-2">
                    {step.description}
                  </p>
                  {isNext && (
                    <span className="mt-2 inline-flex items-center gap-1 text-[10px] font-bold text-cyan-300 light:text-cyan-700">
                      {step.cta}
                      <ChevronRight className="w-3 h-3 group-hover:translate-x-0.5 transition" />
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        )}

        {!allDone && (
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={nextStep.href}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold transition"
            >
              {nextStep.cta}
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
            <button
              type="button"
              onClick={handleDismiss}
              className="px-3 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-slate-200 light:hover:text-slate-700 transition"
            >
              Skip for now
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
