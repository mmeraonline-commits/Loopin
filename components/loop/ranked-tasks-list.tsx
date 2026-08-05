"use client";

import React, { useEffect, useState } from "react";
import { ListOrdered, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";

export type RankedTask = {
  id: string;
  task: string;
  source: string;
  priority: "P0" | "P1" | "P2" | "P3" | string;
  reason: string;
  sender?: string;
};

function priorityStyles(p: string) {
  switch (p) {
    case "P0":
      return "bg-rose-500 text-white";
    case "P1":
      return "bg-amber-500 text-white";
    case "P2":
      return "bg-sky-500/90 text-white";
    default:
      return "bg-slate-400 text-white";
  }
}

function sourceIcon(source: string) {
  const s = (source || "").toLowerCase();
  if (s === "gmail") return "/001-gmail.png";
  if (s === "whatsapp") return "/002-whatsapp.png";
  if (s === "outlook") return "/003-email.png";
  if (s === "slack") return "/005-slack.png";
  if (s === "discord") return "/006-discord.png";
  if (s === "teams") return "/010-teams.svg";
  return null;
}

export function RankedTasksList({
  userId,
  compact = false,
  limit,
}: {
  userId?: string;
  compact?: boolean;
  limit?: number;
}) {
  const router = useRouter();
  const [tasks, setTasks] = useState<RankedTask[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch(`/api/ranked-tasks?userId=${encodeURIComponent(userId)}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setTasks(Array.isArray(data.tasks) ? data.tasks : []);
      })
      .catch(() => {
        if (!cancelled) setTasks([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const shown = typeof limit === "number" ? tasks.slice(0, limit) : tasks;

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-slate-500 py-4">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        Ranking tasks…
      </div>
    );
  }

  if (!shown.length) {
    return (
      <div className="text-xs text-slate-500 py-3 leading-relaxed">
        No ranked tasks yet. Run a briefing to triage messages across your connected apps.
      </div>
    );
  }

  return (
    <div className={compact ? "space-y-3" : "space-y-2.5"}>
      {!compact && (
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <ListOrdered className="w-4 h-4 text-brand-primary dark:text-brand-lime" />
            <h3 className="text-[13px] font-extrabold text-slate-900 dark:text-white uppercase tracking-wider">
              AI-ranked tasks
            </h3>
          </div>
          <button
            type="button"
            onClick={() => router.push("/dashboard?tab=briefing")}
            className="text-[10px] font-bold text-slate-500 hover:text-brand-primary"
          >
            From briefing
          </button>
        </div>
      )}
      {shown.map((t) => {
        const icon = sourceIcon(t.source);
        return (
          <div
            key={t.id}
            className="flex items-start gap-3 group"
            title={t.reason || undefined}
          >
            <span
              className={`flex-shrink-0 text-[10px] font-extrabold px-1.5 py-0.5 rounded-md ${priorityStyles(t.priority)}`}
            >
              {t.priority}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-start gap-2">
                {icon ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={icon} alt="" className="w-4 h-4 mt-0.5 object-contain flex-shrink-0" />
                ) : null}
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-800 dark:text-slate-200 leading-snug">
                    {t.task}
                  </p>
                  {t.reason ? (
                    <p className="text-[10px] text-slate-500 dark:text-slate-500 mt-0.5 line-clamp-2">
                      {t.reason}
                      {t.sender ? ` · ${t.sender}` : ""}
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
