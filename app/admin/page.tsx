"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAdminFetch } from "@/lib/admin-client";
import { Users, Bell, Newspaper, Mail, Activity } from "lucide-react";

type Overview = {
  users: { total: number; disabled: number };
  alerts: { rules: number; activeRules: number; total: number; open: number };
  briefings: number;
  waitlist: number;
  connectionRates: Record<string, { connected: number; total: number; rate: number }>;
  topFeatures: {
    last7d: Array<{ feature: string; count: number }>;
    last30d: Array<{ feature: string; count: number }>;
  };
};

function StatCard({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-[#0d111e] p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
          <p className="mt-2 text-3xl font-bold tabular-nums">{value}</p>
          {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
        </div>
        <span className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-white/[0.06] flex items-center justify-center">
          <Icon className="w-5 h-5 text-slate-600 dark:text-slate-300" />
        </span>
      </div>
    </div>
  );
}

export default function AdminOverviewPage() {
  const adminFetch = useAdminFetch();
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await adminFetch("/api/admin/overview");
        if (!cancelled) setData(res);
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [adminFetch]);

  if (loading) return <p className="text-slate-500">Loading overview…</p>;
  if (error) return <p className="text-rose-500">{error}</p>;
  if (!data) return null;

  const maxTop = Math.max(1, ...(data.topFeatures.last30d.map((f) => f.count) || [1]));

  return (
    <div className="space-y-8 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Overview</h1>
        <p className="text-sm text-slate-500 mt-1">App health, users, and feature traction.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          label="Users"
          value={data.users.total}
          hint={`${data.users.disabled} disabled`}
          icon={Users}
        />
        <StatCard
          label="Open alerts"
          value={data.alerts.open}
          hint={`${data.alerts.activeRules} active rules`}
          icon={Bell}
        />
        <StatCard label="Briefings" value={data.briefings} icon={Newspaper} />
        <StatCard label="Waitlist" value={data.waitlist} icon={Mail} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="rounded-2xl border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-[#0d111e] p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Integration connections</h2>
            <Link href="/admin/users" className="text-xs text-indigo-500 hover:underline">
              View users
            </Link>
          </div>
          <ul className="space-y-3">
            {Object.entries(data.connectionRates).map(([key, v]) => (
              <li key={key}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="capitalize">{key}</span>
                  <span className="text-slate-500 tabular-nums">
                    {v.connected}/{v.total} ({v.rate}%)
                  </span>
                </div>
                <div className="h-2 rounded-full bg-slate-100 dark:bg-white/[0.06] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-indigo-500"
                    style={{ width: `${v.rate}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-2xl border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-[#0d111e] p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold flex items-center gap-2">
              <Activity className="w-4 h-4" />
              Top features (30d)
            </h2>
            <Link href="/admin/usage" className="text-xs text-indigo-500 hover:underline">
              Full usage
            </Link>
          </div>
          {data.topFeatures.last30d.length === 0 ? (
            <p className="text-sm text-slate-500">No usage events yet.</p>
          ) : (
            <ul className="space-y-3">
              {data.topFeatures.last30d.map((f) => (
                <li key={f.feature}>
                  <div className="flex justify-between text-sm mb-1">
                    <span>{f.feature}</span>
                    <span className="tabular-nums text-slate-500">{f.count}</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100 dark:bg-white/[0.06] overflow-hidden">
                    <div
                      className="h-full rounded-full bg-emerald-500"
                      style={{ width: `${Math.round((f.count / maxTop) * 100)}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
