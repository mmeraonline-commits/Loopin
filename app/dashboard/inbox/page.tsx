"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { formatDistanceToNow, parseISO } from "date-fns";
import { useAuth } from "@/components/auth-provider";
import { canUseSurface, getPlan } from "@/lib/plans";
import { useRouter } from "next/navigation";
import {
  Inbox,
  RefreshCw,
  Search,
  Sparkles,
  Send,
  Loader2,
  Mail,
  MessageSquare,
  ArrowRight,
  Plug,
  CheckCircle2,
  Wand2,
  Lightbulb,
  Filter,
  ChevronRight,
  X,
  LockKeyhole,
} from "lucide-react";

type InboxItem = {
  id: string;
  app: string;
  title: string;
  preview: string;
  body: string;
  from?: string;
  time?: string;
  unread?: boolean;
  canReply: boolean;
  logo: string;
  fullDetails: string;
  category?: string;
  needsReply?: boolean;
  classifyReason?: string;
  draftReply?: string | null;
};

type AiSuggestions = {
  replies: string[];
  nextAction: string;
  priority: "high" | "medium" | "low";
  reason: string;
};

type Tone = "professional" | "friendly" | "short" | "assertive";
type QueueView = "all" | "needs_reply" | "draft_ready";

const QUEUE_VIEWS: { key: QueueView; label: string }[] = [
  { key: "all", label: "All" },
  { key: "needs_reply", label: "Needs reply" },
  { key: "draft_ready", label: "Draft ready" },
];

const PLATFORM_FILTERS = [
  { key: "all", label: "All apps" },
  { key: "gmail", label: "Gmail" },
  { key: "outlook", label: "Outlook" },
  { key: "whatsapp", label: "WhatsApp" },
  { key: "slack", label: "Slack" },
  { key: "discord", label: "Discord" },
] as const;

const TONES: { key: Tone; label: string }[] = [
  { key: "professional", label: "Professional" },
  { key: "friendly", label: "Friendly" },
  { key: "short", label: "Short" },
  { key: "assertive", label: "Assertive" },
];

function formatItemTime(time?: string) {
  if (!time) return "";
  try {
    const parsed = Number.isNaN(Date.parse(time))
      ? new Date(Number(time) < 1e12 ? Number(time) * 1000 : Number(time))
      : parseISO(time.includes("T") ? time : new Date(time).toISOString());
    if (Number.isNaN(parsed.getTime())) return "";
    return formatDistanceToNow(parsed, { addSuffix: true });
  } catch {
    return "";
  }
}

function priorityStyles(priority?: string) {
  if (priority === "high") return "text-rose-600 dark:text-rose-300 bg-rose-500/10 border-rose-500/20";
  if (priority === "low") return "text-sky-600 dark:text-sky-300 bg-sky-500/10 border-sky-500/20";
  return "text-amber-700 dark:text-amber-300 bg-amber-500/10 border-amber-500/20";
}

export default function InboxPage() {
  const { user } = useAuth();
  const router = useRouter();
  const planId = getPlan(user?.plan).id;
  const inboxLocked = !!user && !canUseSurface(planId, "inbox");
  const [items, setItems] = useState<InboxItem[]>([]);
  const [connectedApps, setConnectedApps] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<string>("all");
  const [queueView, setQueueView] = useState<QueueView>("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [tone, setTone] = useState<Tone>("professional");
  const [replyContext, setReplyContext] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [preparingDrafts, setPreparingDrafts] = useState(false);
  const [aiLoading, setAiLoading] = useState<string | null>(null);
  const [summary, setSummary] = useState("");
  const [nextAction, setNextAction] = useState("");
  const [suggestions, setSuggestions] = useState<AiSuggestions | null>(null);
  const [actionError, setActionError] = useState("");
  const [mobileShowDetail, setMobileShowDetail] = useState(false);
  const preparedForRef = React.useRef<string | null>(null);

  const loadInbox = useCallback(async (mode: "initial" | "refresh" = "initial") => {
    if (!user?.id || inboxLocked) return;
    if (mode === "initial") setLoading(true);
    else setRefreshing(true);
    setError("");
    try {
      const res = await fetch(`/api/inbox?userId=${encodeURIComponent(user.id)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load inbox");
      setItems(data.items || []);
      setConnectedApps(data.connectedApps || []);
      if (!selectedId && data.items?.[0]) {
        setSelectedId(data.items[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load inbox");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id, selectedId, inboxLocked]);

  const prepareNeedsReplyDrafts = useCallback(async (itemId?: string) => {
    if (!user?.id || inboxLocked) return;
    setPreparingDrafts(true);
    setActionError("");
    try {
      const res = await fetch("/api/inbox/needs-reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.id,
          action: "prepare",
          itemId,
          replyContext: replyContext || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to prepare drafts");
      const drafts: Record<string, string> = data.drafts || {};
      setItems((prev) =>
        prev.map((item) =>
          drafts[item.id] ? { ...item, draftReply: drafts[item.id] } : item
        )
      );
      if (itemId && drafts[itemId]) {
        setDraft(drafts[itemId]);
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to prepare drafts");
    } finally {
      setPreparingDrafts(false);
    }
  }, [user?.id, inboxLocked, replyContext]);

  useEffect(() => {
    loadInbox("initial");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      if (queueView === "needs_reply" && !item.needsReply) return false;
      if (queueView === "draft_ready" && !(item.needsReply && item.draftReply)) return false;
      if (filter !== "all" && item.app !== filter) return false;
      if (!q) return true;
      return [item.title, item.preview, item.body, item.from, item.app]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q));
    });
  }, [items, filter, query, queueView]);

  const selected = useMemo(
    () => items.find((item) => item.id === selectedId) || filteredItems[0] || null,
    [items, selectedId, filteredItems]
  );

  useEffect(() => {
    if (!selected) {
      setSummary("");
      setNextAction("");
      setSuggestions(null);
      setDraft("");
      setSent(false);
      setActionError("");
      preparedForRef.current = null;
      return;
    }
    setSent(false);
    setActionError("");
    setSummary("");
    setNextAction("");
    setSuggestions(null);

    if (selected.draftReply) {
      setDraft(selected.draftReply);
      preparedForRef.current = selected.id;
    } else {
      setDraft("");
      if (
        selected.needsReply &&
        selected.canReply &&
        preparedForRef.current !== selected.id
      ) {
        preparedForRef.current = selected.id;
        void prepareNeedsReplyDrafts(selected.id);
      }
    }
    void runAi("suggestions", selected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  const counts = useMemo(() => {
    const byApp: Record<string, number> = {};
    for (const item of items) byApp[item.app] = (byApp[item.app] || 0) + 1;
    return {
      total: items.length,
      unread: items.filter((i) => i.unread).length,
      needsReply: items.filter((i) => i.needsReply).length,
      draftReady: items.filter((i) => i.needsReply && !!i.draftReply).length,
      byApp,
    };
  }, [items]);

  async function runAi(feature: "summary" | "next_action" | "reply" | "suggestions", item = selected) {
    if (!item) return;
    setAiLoading(feature);
    setActionError("");
    try {
      const res = await fetch("/api/inbox/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          feature,
          app: item.app,
          title: item.title,
          preview: item.preview,
          body: item.body,
          replyContext: feature === "reply" ? replyContext : undefined,
          tone: feature === "reply" ? tone : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "AI request failed");

      if (feature === "summary") setSummary(data.result);
      if (feature === "next_action") setNextAction(data.result);
      if (feature === "reply") setDraft(data.result || "");
      if (feature === "suggestions") setSuggestions(data.result);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "AI request failed");
    } finally {
      setAiLoading(null);
    }
  }

  async function sendReply() {
    if (!user?.id || !selected || !draft.trim()) return;
    setSending(true);
    setActionError("");
    try {
      const activityId = selected.id.includes(":")
        ? selected.id.slice(selected.id.indexOf(":") + 1)
        : selected.id;
      const res = await fetch("/api/inbox/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.id,
          app: selected.app,
          text: draft,
          fullDetails: selected.fullDetails,
          activityId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send reply");
      setSent(true);
      setDraft("");
      // Clear saved needs-reply draft after successful send
      if (selected.needsReply) {
        void fetch("/api/inbox/needs-reply", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: user.id, action: "dismiss", itemId: selected.id }),
        }).then(() => {
          setItems((prev) =>
            prev.map((item) =>
              item.id === selected.id ? { ...item, draftReply: null, needsReply: false } : item
            )
          );
        });
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to send reply");
    } finally {
      setSending(false);
    }
  }

  function selectItem(id: string) {
    setSelectedId(id);
    setMobileShowDetail(true);
  }

  if (!user) {
    return (
      <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0d111e] p-10 text-center">
        <p className="text-sm text-slate-500">Sign in to view your unified inbox.</p>
      </div>
    );
  }

  if (inboxLocked) {
    return (
      <div className="max-w-lg mx-auto mt-16 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-8 text-center space-y-3">
        <LockKeyhole className="w-8 h-8 text-amber-500 mx-auto" />
        <p className="text-sm font-bold text-slate-900 dark:text-white">Unified inbox requires Pro or higher</p>
        <p className="text-xs text-slate-500">Redeem an upgrade code to unlock inbox and reply.</p>
        <button
          type="button"
          onClick={() => router.push("/dashboard?tab=pricing")}
          className="px-4 py-2 rounded-xl bg-violet-600 text-white text-xs font-bold"
        >
          Open Pricing
        </button>
      </div>
    );
  }

  return (
    <div className="relative -mx-2 sm:mx-0">
      {/* Ambient backdrop */}
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-x-6 -top-8 h-56 overflow-hidden rounded-[2rem]"
      >
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(59,130,246,0.14),transparent_55%),radial-gradient(ellipse_at_top_right,rgba(16,185,129,0.10),transparent_50%)] dark:bg-[radial-gradient(ellipse_at_top_left,rgba(59,130,246,0.18),transparent_55%),radial-gradient(ellipse_at_top_right,rgba(16,185,129,0.12),transparent_50%)]" />
        <div className="absolute inset-0 opacity-[0.35] dark:opacity-[0.2] [background-image:linear-gradient(to_right,rgba(148,163,184,0.08)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.08)_1px,transparent_1px)] [background-size:28px_28px]" />
      </div>

      <div className="relative space-y-5">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200/80 dark:border-white/10 bg-white/70 dark:bg-white/[0.04] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400 backdrop-blur">
              <Inbox className="h-3.5 w-3.5 text-sky-500" />
              Unified Inbox
            </div>
            <h2 className="mt-3 text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">
              All messages, one calm place
            </h2>
            <p className="mt-1.5 max-w-xl text-sm text-slate-500 dark:text-slate-400">
              Open <span className="font-semibold text-slate-700 dark:text-slate-200">Needs reply</span> for
              messages that expect an answer — drafts prepare here, nothing sends until you confirm.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap justify-end">
            <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-white/80 dark:bg-white/[0.04] px-3 py-2 text-xs text-slate-500 dark:text-slate-400 backdrop-blur">
              <span className="font-semibold text-slate-800 dark:text-slate-200">{counts.total}</span> items
              {counts.needsReply > 0 && (
                <>
                  {" · "}
                  <span className="font-semibold text-violet-600 dark:text-violet-400">{counts.needsReply}</span> need reply
                </>
              )}
              {counts.draftReady > 0 && (
                <>
                  {" · "}
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400">{counts.draftReady}</span> drafts
                </>
              )}
            </div>
            {(queueView === "needs_reply" || queueView === "draft_ready") && (
              <button
                type="button"
                onClick={() => void prepareNeedsReplyDrafts()}
                disabled={preparingDrafts || loading || counts.needsReply === 0}
                className="inline-flex items-center gap-2 rounded-xl border border-violet-500/30 bg-violet-500/10 px-3.5 py-2 text-xs font-semibold text-violet-600 dark:text-violet-300 transition hover:bg-violet-500/15 disabled:opacity-50"
              >
                {preparingDrafts ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
                Prepare drafts
              </button>
            )}
            <button
              onClick={() => loadInbox("refresh")}
              disabled={refreshing || loading}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-900 dark:bg-white px-3.5 py-2 text-xs font-semibold text-white dark:text-slate-900 transition hover:opacity-90 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* Queue mode tabs */}
        <div className="flex flex-wrap gap-2">
          {QUEUE_VIEWS.map((view) => {
            const active = queueView === view.key;
            const count =
              view.key === "all"
                ? counts.total
                : view.key === "needs_reply"
                  ? counts.needsReply
                  : counts.draftReady;
            return (
              <button
                key={view.key}
                type="button"
                onClick={() => setQueueView(view.key)}
                className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold border transition ${
                  active
                    ? view.key === "all"
                      ? "border-slate-900 dark:border-white bg-slate-900 dark:bg-white text-white dark:text-slate-900"
                      : "border-violet-500 bg-violet-500/15 text-violet-600 dark:text-violet-300"
                    : "border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/[0.04]"
                }`}
              >
                {view.label}
                {count > 0 && (
                  <span
                    className={`px-1.5 py-0.5 rounded-md text-[10px] ${
                      active && view.key !== "all"
                        ? "bg-violet-500 text-white"
                        : "bg-slate-200/80 dark:bg-white/10 text-slate-600 dark:text-slate-300"
                    }`}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Empty / error states */}
        {error && (
          <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-600 dark:text-rose-300">
            {error}
          </div>
        )}

        {!loading && connectedApps.length === 0 && (
          <div className="glass-premium rounded-2xl p-10 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-500/10 text-sky-500">
              <Plug className="h-5 w-5" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">No messaging apps connected</h3>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              Connect Gmail, WhatsApp, Slack, Discord, or Outlook to populate your inbox.
            </p>
            <Link
              href="/dashboard?tab=integrations"
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-slate-900 dark:bg-white px-4 py-2.5 text-xs font-bold text-white dark:text-slate-900"
            >
              Open Integrations
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        )}

        {(loading || connectedApps.length > 0) && (
          <div className="grid grid-cols-1 lg:grid-cols-[360px_minmax(0,1fr)] gap-4 min-h-[70vh]">
            {/* List pane */}
            <section
              className={`glass-premium rounded-2xl overflow-hidden flex flex-col ${
                mobileShowDetail ? "hidden lg:flex" : "flex"
              }`}
            >
              <div className="border-b border-slate-200/80 dark:border-white/[0.06] p-4 space-y-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search messages…"
                    className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white/80 dark:bg-[#030712]/70 pl-9 pr-3 py-2.5 text-sm text-slate-900 dark:text-white outline-none focus:border-sky-500/50"
                  />
                </div>
                <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
                  <Filter className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
                  {PLATFORM_FILTERS.filter(
                    (p) => p.key === "all" || connectedApps.includes(p.key) || counts.byApp[p.key]
                  ).map((p) => {
                    const active = filter === p.key;
                    const count = p.key === "all" ? counts.total : counts.byApp[p.key] || 0;
                    return (
                      <button
                        key={p.key}
                        onClick={() => setFilter(p.key)}
                        className={`flex-shrink-0 rounded-lg px-2.5 py-1 text-[11px] font-semibold transition ${
                          active
                            ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                            : "bg-slate-100/80 text-slate-500 hover:bg-slate-200/80 dark:bg-white/[0.04] dark:text-slate-400 dark:hover:bg-white/[0.08]"
                        }`}
                      >
                        {p.label}
                        {count > 0 && <span className="ml-1 opacity-70">{count}</span>}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto">
                {loading ? (
                  <div className="flex flex-col items-center justify-center gap-3 py-20 text-slate-400">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <p className="text-xs">Syncing connected inboxes…</p>
                  </div>
                ) : filteredItems.length === 0 ? (
                  <div className="px-6 py-16 text-center">
                    <MessageSquare className="mx-auto mb-3 h-8 w-8 text-slate-300 dark:text-slate-600" />
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                      {queueView === "needs_reply"
                        ? "Nothing needs a reply right now"
                        : queueView === "draft_ready"
                          ? "No drafts waiting"
                          : "No messages match this view."}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {queueView === "needs_reply"
                        ? "Promo and notification mail are filtered out. Human asks show up here."
                        : queueView === "draft_ready"
                          ? "Open Needs reply and prepare drafts, or select a message to auto-draft."
                          : null}
                    </p>
                  </div>
                ) : (
                  <ul className="divide-y divide-slate-100 dark:divide-white/[0.04]">
                    {filteredItems.map((item, index) => {
                      const active = selected?.id === item.id;
                      return (
                        <li key={item.id}>
                          <button
                            onClick={() => selectItem(item.id)}
                            style={{ animationDelay: `${Math.min(index, 12) * 30}ms` }}
                            className={`inbox-row w-full text-left px-4 py-3.5 transition ${
                              active
                                ? "bg-sky-500/[0.08] dark:bg-sky-400/[0.08]"
                                : "hover:bg-slate-50/80 dark:hover:bg-white/[0.03]"
                            }`}
                          >
                            <div className="flex items-start gap-3">
                              <div className="relative mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-slate-100 dark:bg-white/[0.06] border border-slate-200/70 dark:border-white/10">
                                <img src={item.logo} alt={item.app} className="h-4 w-4 object-contain" />
                                {item.unread && (
                                  <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-sky-500 ring-2 ring-white dark:ring-[#0d111e]" />
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center justify-between gap-2">
                                  <p className={`truncate text-sm ${item.unread ? "font-semibold text-slate-900 dark:text-white" : "font-medium text-slate-700 dark:text-slate-200"}`}>
                                    {item.title}
                                  </p>
                                  <span className="flex-shrink-0 text-[10px] text-slate-400">
                                    {formatItemTime(item.time)}
                                  </span>
                                </div>
                                {item.from && (
                                  <p className="mt-0.5 truncate text-[11px] text-slate-400">{item.from}</p>
                                )}
                                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                                  {item.needsReply && (
                                    <span className="rounded-md border border-violet-500/25 bg-violet-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-violet-600 dark:text-violet-300">
                                      {item.category === "urgent" ? "Urgent" : "Needs reply"}
                                    </span>
                                  )}
                                  {item.draftReply && (
                                    <span className="rounded-md border border-emerald-500/25 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-600 dark:text-emerald-300">
                                      Draft ready
                                    </span>
                                  )}
                                </div>
                                <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                                  {item.preview || item.body}
                                </p>
                              </div>
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </section>

            {/* Detail pane */}
            <section
              className={`glass-premium rounded-2xl overflow-hidden flex flex-col ${
                mobileShowDetail ? "flex" : "hidden lg:flex"
              }`}
            >
              {!selected ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-3 p-10 text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 dark:bg-white/[0.05]">
                    <Mail className="h-6 w-6 text-slate-400" />
                  </div>
                  <p className="text-sm text-slate-500">Select a message to read, draft, and reply.</p>
                </div>
              ) : (
                <>
                  <div className="border-b border-slate-200/80 dark:border-white/[0.06] p-5">
                    <div className="mb-3 flex items-center justify-between gap-3 lg:hidden">
                      <button
                        onClick={() => setMobileShowDetail(false)}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500"
                      >
                        <X className="h-3.5 w-3.5" />
                        Back to list
                      </button>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-slate-100 dark:bg-white/[0.06] border border-slate-200/70 dark:border-white/10">
                        <img src={selected.logo} alt={selected.app} className="h-5 w-5 object-contain" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-lg font-semibold text-slate-900 dark:text-white leading-tight">
                            {selected.title}
                          </h3>
                          <span className="rounded-md border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.04] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                            {selected.app}
                          </span>
                          {suggestions?.priority && (
                            <span className={`rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${priorityStyles(suggestions.priority)}`}>
                              {suggestions.priority} priority
                            </span>
                          )}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                          {selected.from && <span>{selected.from}</span>}
                          {selected.time && <span>{formatItemTime(selected.time)}</span>}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto p-5 space-y-5">
                    {/* Message body */}
                    <article className="rounded-2xl border border-slate-200/80 dark:border-white/[0.06] bg-white/60 dark:bg-[#030712]/40 p-4">
                      <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                        {selected.body || selected.preview || "No message content."}
                      </p>
                    </article>

                    {/* AI actions */}
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-emerald-500" />
                        <h4 className="text-sm font-semibold text-slate-900 dark:text-white">AI Assist</h4>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => runAi("summary")}
                          disabled={!!aiLoading}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-white/10 bg-white/80 dark:bg-white/[0.04] px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-emerald-500/30 disabled:opacity-50"
                        >
                          {aiLoading === "summary" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Lightbulb className="h-3.5 w-3.5 text-emerald-500" />}
                          Summarize
                        </button>
                        <button
                          onClick={() => runAi("next_action")}
                          disabled={!!aiLoading}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-white/10 bg-white/80 dark:bg-white/[0.04] px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-sky-500/30 disabled:opacity-50"
                        >
                          {aiLoading === "next_action" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRight className="h-3.5 w-3.5 text-sky-500" />}
                          Next action
                        </button>
                        <button
                          onClick={() => runAi("suggestions")}
                          disabled={!!aiLoading}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-white/10 bg-white/80 dark:bg-white/[0.04] px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-amber-500/30 disabled:opacity-50"
                        >
                          {aiLoading === "suggestions" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5 text-amber-500" />}
                          Refresh suggestions
                        </button>
                      </div>

                      {(summary || nextAction || suggestions) && (
                        <div className="grid gap-3 sm:grid-cols-2">
                          {summary && (
                            <div className="rounded-xl border border-emerald-500/15 bg-emerald-500/[0.06] p-3 sm:col-span-2">
                              <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Summary</p>
                              <p className="whitespace-pre-wrap text-xs leading-relaxed text-slate-700 dark:text-slate-300">{summary}</p>
                            </div>
                          )}
                          {(nextAction || suggestions?.nextAction) && (
                            <div className="rounded-xl border border-sky-500/15 bg-sky-500/[0.06] p-3">
                              <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-sky-600 dark:text-sky-400">Suggested next action</p>
                              <p className="text-xs leading-relaxed text-slate-700 dark:text-slate-300">
                                {nextAction || suggestions?.nextAction}
                              </p>
                            </div>
                          )}
                          {suggestions?.reason && (
                            <div className="rounded-xl border border-amber-500/15 bg-amber-500/[0.06] p-3">
                              <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">Why it matters</p>
                              <p className="text-xs leading-relaxed text-slate-700 dark:text-slate-300">{suggestions.reason}</p>
                            </div>
                          )}
                        </div>
                      )}

                      {suggestions?.replies?.length ? (
                        <div className="space-y-2">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Quick reply suggestions</p>
                          <div className="flex flex-col gap-2">
                            {suggestions.replies.map((reply) => (
                              <button
                                key={reply}
                                onClick={() => setDraft(reply)}
                                className="rounded-xl border border-slate-200 dark:border-white/10 bg-white/70 dark:bg-white/[0.03] px-3 py-2.5 text-left text-xs text-slate-600 dark:text-slate-300 transition hover:border-sky-500/30 hover:bg-sky-500/[0.04]"
                              >
                                {reply}
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>

                    {/* Compose */}
                    <div className="space-y-3 rounded-2xl border border-slate-200/80 dark:border-white/[0.06] bg-slate-50/70 dark:bg-white/[0.02] p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <h4 className="text-sm font-semibold text-slate-900 dark:text-white">
                            {selected.needsReply ? "Confirm reply" : "Reply"}
                          </h4>
                          {selected.needsReply && selected.classifyReason && (
                            <p className="mt-0.5 text-[11px] text-violet-600 dark:text-violet-300">
                              {selected.classifyReason}
                              {preparingDrafts && !draft ? " · Preparing draft…" : ""}
                            </p>
                          )}
                        </div>
                        {!selected.canReply && (
                          <span className="text-[11px] font-medium text-amber-600 dark:text-amber-400">
                            Read-only for {selected.app}
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-1.5">
                        {TONES.map((t) => (
                          <button
                            key={t.key}
                            onClick={() => setTone(t.key)}
                            className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition ${
                              tone === t.key
                                ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                                : "bg-white text-slate-500 border border-slate-200 dark:bg-white/[0.04] dark:border-white/10 dark:text-slate-400"
                            }`}
                          >
                            {t.label}
                          </button>
                        ))}
                      </div>

                      <input
                        value={replyContext}
                        onChange={(e) => setReplyContext(e.target.value)}
                        placeholder="Optional guidance for AI (e.g. decline politely, ask for timeline)…"
                        className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#030712] px-3 py-2 text-xs text-slate-900 dark:text-white outline-none focus:border-sky-500/50"
                      />

                      <textarea
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        rows={5}
                        placeholder={
                          preparingDrafts && selected.needsReply
                            ? "Preparing auto-draft…"
                            : selected.canReply
                              ? "Write a reply or generate one with AI…"
                              : "Outlook send is not available yet — you can still draft with AI."
                        }
                        className="w-full resize-none rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#030712] px-3 py-2.5 text-sm text-slate-900 dark:text-white outline-none focus:border-sky-500/50"
                      />

                      {actionError && (
                        <p className="text-xs text-rose-500 dark:text-rose-400">{actionError}</p>
                      )}
                      {sent && (
                        <p className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Reply sent
                        </p>
                      )}

                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          onClick={() =>
                            selected.needsReply
                              ? void prepareNeedsReplyDrafts(selected.id)
                              : void runAi("reply")
                          }
                          disabled={!!aiLoading || preparingDrafts}
                          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.04] px-3.5 py-2.5 text-xs font-bold text-slate-800 dark:text-slate-100 disabled:opacity-50"
                        >
                          {aiLoading === "reply" || preparingDrafts ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Sparkles className="h-3.5 w-3.5 text-emerald-500" />
                          )}
                          {selected.needsReply ? "Regenerate draft" : "Draft with AI"}
                        </button>
                        {selected.needsReply && draft.trim() && user?.id && (
                          <button
                            type="button"
                            onClick={async () => {
                              await fetch("/api/inbox/needs-reply", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                  userId: user.id,
                                  action: "save",
                                  itemId: selected.id,
                                  draft,
                                }),
                              });
                              setItems((prev) =>
                                prev.map((item) =>
                                  item.id === selected.id ? { ...item, draftReply: draft } : item
                                )
                              );
                            }}
                            className="inline-flex items-center gap-2 rounded-xl border border-violet-500/30 bg-violet-500/10 px-3.5 py-2.5 text-xs font-bold text-violet-600 dark:text-violet-300"
                          >
                            Save draft
                          </button>
                        )}
                        <button
                          onClick={sendReply}
                          disabled={!selected.canReply || sending || !draft.trim()}
                          className="inline-flex items-center gap-2 rounded-xl bg-violet-600 hover:bg-violet-500 px-4 py-2.5 text-xs font-bold text-white transition disabled:opacity-40 ml-auto"
                        >
                          {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                          {selected.needsReply ? "Confirm & send" : "Send reply"}
                        </button>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </section>
          </div>
        )}
      </div>

      <style jsx>{`
        .inbox-row {
          animation: inboxFadeUp 0.35s ease both;
        }
        @keyframes inboxFadeUp {
          from {
            opacity: 0;
            transform: translateY(6px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
