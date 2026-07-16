"use client";

import { useCallback, useEffect, useState } from "react";
import { useAdminFetch } from "@/lib/admin-client";

type UsageData = {
  days: number;
  totalEvents: number;
  topFeatures: Array<{ feature: string; count: number }>;
  daily: Array<{ date: string; count: number }>;
};

export default function AdminUsagePage() {
  const adminFetch = useAdminFetch();
  const [days, setDays] = useState(30);
  const [data, setData] = useState<UsageData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminFetch(`/api/admin/usage?days=${days}`);
      setData(res);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [adminFetch, days]);

  useEffect(() => {
    void load();
  }, [load]);

  const maxFeature = Math.max(1, ...(data?.topFeatures.map((f) => f.count) || [1]));
  const maxDaily = Math.max(1, ...(data?.daily.map((d) => d.count) || [1]));

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Usage</h1>
          <p className="text-sm text-slate-500 mt-1">Most-used features and daily activity.</p>
        </div>
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0d111e] px-3 py-2 text-sm"
        >
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </select>
      </div>

      {error ? <p className="text-rose-500 text-sm">{error}</p> : null}
      {loading ? <p className="text-slate-500">Loading…</p> : null}

      {data && !loading ? (
        <>
          <p className="text-sm text-slate-500">
            <span className="font-semibold text-slate-800 dark:text-slate-200 tabular-nums">
              {data.totalEvents}
            </span>{" "}
            events in the last {data.days} days
          </p>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <section className="rounded-2xl border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-[#0d111e] p-5">
              <h2 className="font-semibold mb-4">By feature</h2>
              {data.topFeatures.length === 0 ? (
                <p className="text-sm text-slate-500">No events yet.</p>
              ) : (
                <ul className="space-y-3">
                  {data.topFeatures.map((f) => (
                    <li key={f.feature}>
                      <div className="flex justify-between text-sm mb-1">
                        <span>{f.feature}</span>
                        <span className="tabular-nums text-slate-500">{f.count}</span>
                      </div>
                      <div className="h-2 rounded-full bg-slate-100 dark:bg-white/[0.06] overflow-hidden">
                        <div
                          className="h-full rounded-full bg-indigo-500"
                          style={{ width: `${Math.round((f.count / maxFeature) * 100)}%` }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="rounded-2xl border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-[#0d111e] p-5">
              <h2 className="font-semibold mb-4">Daily volume</h2>
              {data.daily.length === 0 ? (
                <p className="text-sm text-slate-500">No events yet.</p>
              ) : (
                <div className="flex items-end gap-1 h-40">
                  {data.daily.map((d) => (
                    <div key={d.date} className="flex-1 flex flex-col items-center justify-end h-full gap-1 group">
                      <div
                        className="w-full rounded-t bg-emerald-500/80 min-h-[2px] group-hover:bg-emerald-400"
                        style={{ height: `${Math.max(4, Math.round((d.count / maxDaily) * 100))}%` }}
                        title={`${d.date}: ${d.count}`}
                      />
                    </div>
                  ))}
                </div>
              )}
              {data.daily.length > 0 ? (
                <div className="flex justify-between text-[10px] text-slate-500 mt-2">
                  <span>{data.daily[0]?.date}</span>
                  <span>{data.daily[data.daily.length - 1]?.date}</span>
                </div>
              ) : null}
            </section>
          </div>
        </>
      ) : null}
    </div>
  );
}
