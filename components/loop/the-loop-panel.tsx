"use client";

import React, { useCallback, useEffect, useState } from "react";
import { format, formatDistanceToNow, isValid, parseISO } from "date-fns";
import {
  CheckCircle2,
  Loader2,
  MessageSquarePlus,
  RefreshCw,
  RotateCcw,
  Timer,
} from "lucide-react";

type LoopItem = {
  id: string;
  source: string;
  sender: string;
  promised_text: string;
  promised_at: string;
  status: "pending" | "fulfilled" | "overdue";
  overdue_after_days?: number;
  nudge_draft?: string | null;
};

function sourceIcon(source: string) {
  const s = source.toLowerCase();
  if (s === "gmail") return "/001-gmail.png";
  if (s === "whatsapp") return "/002-whatsapp.png";
  if (s === "outlook") return "/003-email.png";
  if (s === "slack") return "/005-slack.png";
  if (s === "discord") return "/006-discord.png";
  if (s === "teams") return "/010-teams.svg";
  return null;
}

function statusStyles(status: string) {
  if (status === "overdue") {
    return "bg-rose-500/15 text-rose-600 dark:text-rose-300 border-rose-500/25";
  }
  if (status === "fulfilled") {
    return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/25";
  }
  return "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/25";
}

export function TheLoopPanel({ userId }: { userId?: string }) {
  const [items, setItems] = useState<LoopItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"open" | "all" | "fulfilled">("open");
  const [nudgeOpenId, setNudgeOpenId] = useState<string | null>(null);
  const [nudgeDraft, setNudgeDraft] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const fetchItems = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const status = filter === "open" ? "open" : filter;
      const res = await fetch(
        `/api/the-loop?userId=${encodeURIComponent(userId)}&status=${status}`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load");
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load The Loop");
    } finally {
      setLoading(false);
    }
  }, [userId, filter]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const markFulfilled = async (id: string) => {
    if (!userId) return;
    setBusyId(id);
    try {
      const res = await fetch("/api/the-loop", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, id, status: "fulfilled" }),
      });
      if (res.ok) await fetchItems();
    } finally {
      setBusyId(null);
    }
  };

  const openNudge = async (item: LoopItem) => {
    if (!userId) return;
    setNudgeOpenId(item.id);
    if (item.nudge_draft) {
      setNudgeDraft(item.nudge_draft);
      return;
    }
    setBusyId(item.id);
    setNudgeDraft("");
    try {
      const res = await fetch("/api/the-loop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, id: item.id, action: "nudge" }),
      });
      const data = await res.json();
      if (res.ok) setNudgeDraft(data.draft || "");
      else setError(data.error || "Could not draft nudge");
    } finally {
      setBusyId(null);
    }
  };

  const overdueCount = items.filter((i) => i.status === "overdue").length;

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            The Loop
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-xl">
            Commitments others made to you across channels. Overdue items float to the top so you can
            nudge without losing the thread.
          </p>
        </div>
        <button
          type="button"
          onClick={() => fetchItems()}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-primary text-white text-xs font-bold shadow-lg shadow-brand-primary/20"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          [
            { id: "open", label: "Pending" },
            { id: "all", label: "All" },
            { id: "fulfilled", label: "Fulfilled" },
          ] as const
        ).map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={`px-3 py-1.5 rounded-xl text-[11px] font-bold border transition ${
              filter === f.id
                ? "bg-brand-primary text-white border-brand-primary"
                : "border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300"
            }`}
          >
            {f.label}
            {f.id === "open" && overdueCount > 0 ? ` · ${overdueCount} overdue` : ""}
          </button>
        ))}
      </div>

      {error ? <p className="text-xs text-rose-500 font-medium">{error}</p> : null}

      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-500 text-sm gap-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading The Loop…
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 dark:border-white/10 p-10 text-center space-y-2">
          <Timer className="w-8 h-8 mx-auto text-slate-400" />
          <p className="text-sm font-bold text-slate-700 dark:text-slate-200">No open commitments</p>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            When someone says they&apos;ll get back to you, Loopin logs it here during the next
            briefing run. Generate a briefing to scan connected channels.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const icon = sourceIcon(item.source);
            const promised = (() => {
              try {
                const d = parseISO(item.promised_at);
                return isValid(d)
                  ? `${format(d, "MMM d · h:mm a")} · ${formatDistanceToNow(d, { addSuffix: true })}`
                  : item.promised_at;
              } catch {
                return item.promised_at;
              }
            })();

            return (
              <div
                key={item.id}
                className="rounded-2xl border border-slate-200/80 dark:border-white/10 bg-white dark:bg-[#0d111e]/70 p-4 shadow-sm"
              >
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/10 flex items-center justify-center flex-shrink-0">
                    {icon ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={icon} alt="" className="w-5 h-5 object-contain" />
                    ) : (
                      <Timer className="w-4 h-4 text-slate-400" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase tracking-wide border ${statusStyles(item.status)}`}
                      >
                        {item.status}
                      </span>
                      <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                        {item.source}
                      </span>
                    </div>
                    <p className="text-sm font-bold text-slate-900 dark:text-white">
                      {item.sender}{" "}
                      <span className="font-medium text-slate-500 dark:text-slate-400">owes</span>
                    </p>
                    <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                      {item.promised_text}
                    </p>
                    <p className="text-[11px] text-slate-500">{promised}</p>

                    <div className="flex flex-wrap gap-2 pt-1">
                      {item.status !== "fulfilled" && (
                        <button
                          type="button"
                          disabled={busyId === item.id}
                          onClick={() => markFulfilled(item.id)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-white/10 text-[11px] font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Mark fulfilled
                        </button>
                      )}
                      {item.status === "overdue" && (
                        <button
                          type="button"
                          disabled={busyId === item.id}
                          onClick={() => openNudge(item)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-brand-primary/10 border border-brand-primary/25 text-[11px] font-bold text-brand-primary dark:text-brand-lime"
                        >
                          <MessageSquarePlus className="w-3.5 h-3.5" />
                          {busyId === item.id && nudgeOpenId === item.id ? "Drafting…" : "Nudge"}
                        </button>
                      )}
                    </div>

                    {nudgeOpenId === item.id && (
                      <div className="mt-3 rounded-xl border border-emerald-900/10 dark:border-white/10 bg-brand-mint-soft/50 dark:bg-white/[0.03] p-3 space-y-2">
                        <p className="text-[11px] font-bold text-slate-600 dark:text-slate-300">
                          Review &amp; copy your nudge
                        </p>
                        <textarea
                          value={nudgeDraft}
                          onChange={(e) => setNudgeDraft(e.target.value)}
                          rows={4}
                          className="w-full text-sm rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-black/20 px-3 py-2 text-slate-800 dark:text-slate-200"
                        />
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              void navigator.clipboard?.writeText(nudgeDraft);
                            }}
                            className="px-3 py-1.5 rounded-xl bg-brand-primary text-white text-[11px] font-bold"
                          >
                            Copy message
                          </button>
                          <button
                            type="button"
                            onClick={() => openNudge({ ...item, nudge_draft: null })}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-white/10 text-[11px] font-bold text-slate-600 dark:text-slate-300"
                          >
                            <RotateCcw className="w-3 h-3" />
                            Redraft
                          </button>
                          <button
                            type="button"
                            onClick={() => setNudgeOpenId(null)}
                            className="px-3 py-1.5 rounded-xl text-[11px] font-bold text-slate-500"
                          >
                            Close
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
