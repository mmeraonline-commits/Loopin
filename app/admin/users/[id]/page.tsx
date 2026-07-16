"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useAdminFetch } from "@/lib/admin-client";
import { PLAN_ORDER, PLANS, type PlanId } from "@/lib/plans";

export default function AdminUserDetailPage() {
  const params = useParams();
  const id = String(params.id || "");
  const adminFetch = useAdminFetch();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [plan, setPlan] = useState<PlanId>("starter");
  const [seats, setSeats] = useState(1);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await adminFetch(`/api/admin/users/${id}`);
        if (cancelled) return;
        setData(res);
        setName(res.user?.name || "");
        setEmail(res.user?.email || "");
        setPlan((res.user?.plan as PlanId) || "starter");
        setSeats(res.user?.seats || 1);
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [adminFetch, id]);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await adminFetch("/api/admin/users", {
        method: "PATCH",
        body: JSON.stringify({ id, name, email, plan, seats }),
      });
      setData((prev: any) => ({ ...prev, user: res.user }));
      setPlan((res.user?.plan as PlanId) || plan);
      setSeats(res.user?.seats || seats);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (error && !data) return <p className="text-rose-500">{error}</p>;
  if (!data) return <p className="text-slate-500">Loading user…</p>;

  const { user, alerts, alertRules, briefings, usage } = data;

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <Link href="/admin/users" className="text-sm text-indigo-500 hover:underline">
          ← Users
        </Link>
        <h1 className="text-2xl font-bold tracking-tight mt-2">{user.name || user.email || "User"}</h1>
        <p className="text-sm text-slate-500 font-mono mt-1">{user.id}</p>
      </div>

      {error ? <p className="text-rose-500 text-sm">{error}</p> : null}

      <section className="rounded-2xl border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-[#0d111e] p-5 space-y-4">
        <h2 className="font-semibold">Profile</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="block text-sm">
            <span className="text-slate-500 text-xs">Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 dark:border-white/10 bg-transparent px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="text-slate-500 text-xs">Email</span>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 dark:border-white/10 bg-transparent px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="text-slate-500 text-xs">Plan</span>
            <select
              value={plan}
              onChange={(e) => {
                const next = e.target.value as PlanId;
                setPlan(next);
                setSeats(PLANS[next].seats.default);
              }}
              className="mt-1 w-full rounded-xl border border-slate-200 dark:border-white/10 bg-transparent px-3 py-2"
            >
              {PLAN_ORDER.map((pid) => (
                <option key={pid} value={pid}>
                  {PLANS[pid].name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-slate-500 text-xs">Seats</span>
            <input
              type="number"
              min={PLANS[plan].seats.min}
              max={PLANS[plan].seats.max}
              value={seats}
              onChange={(e) => setSeats(Number(e.target.value))}
              className="mt-1 w-full rounded-xl border border-slate-200 dark:border-white/10 bg-transparent px-3 py-2"
            />
          </label>
        </div>
        <button
          onClick={save}
          disabled={saving}
          className="px-4 py-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-sm font-medium disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="rounded-2xl border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-[#0d111e] p-5">
          <h2 className="font-semibold mb-3">Alert rules ({alertRules.length})</h2>
          <ul className="space-y-2 text-sm max-h-64 overflow-y-auto">
            {alertRules.length === 0 ? (
              <li className="text-slate-500">None</li>
            ) : (
              alertRules.map((r: any) => (
                <li key={r.id} className="flex justify-between gap-2 border-b border-slate-100 dark:border-white/[0.04] pb-2">
                  <span className="truncate">{r.name || r.condition || r.id}</span>
                  <span className="text-xs text-slate-500">{r.status}</span>
                </li>
              ))
            )}
          </ul>
        </section>

        <section className="rounded-2xl border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-[#0d111e] p-5">
          <h2 className="font-semibold mb-3">Recent alerts ({alerts.length})</h2>
          <ul className="space-y-2 text-sm max-h-64 overflow-y-auto">
            {alerts.length === 0 ? (
              <li className="text-slate-500">None</li>
            ) : (
              alerts.map((a: any) => (
                <li key={a.id} className="flex justify-between gap-2 border-b border-slate-100 dark:border-white/[0.04] pb-2">
                  <span className="truncate">{a.title || a.message || a.id}</span>
                  <span className="text-xs text-slate-500">{a.status}</span>
                </li>
              ))
            )}
          </ul>
        </section>

        <section className="rounded-2xl border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-[#0d111e] p-5">
          <h2 className="font-semibold mb-3">Briefings ({briefings.length})</h2>
          <ul className="space-y-2 text-sm max-h-64 overflow-y-auto">
            {briefings.length === 0 ? (
              <li className="text-slate-500">None</li>
            ) : (
              briefings.map((b: any) => (
                <li key={b.id} className="truncate">
                  {b.title || "Briefing"} · {String(b.created_at).slice(0, 10)}
                </li>
              ))
            )}
          </ul>
        </section>

        <section className="rounded-2xl border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-[#0d111e] p-5">
          <h2 className="font-semibold mb-3">Recent usage</h2>
          <ul className="space-y-2 text-sm max-h-64 overflow-y-auto">
            {usage.length === 0 ? (
              <li className="text-slate-500">None</li>
            ) : (
              usage.map((e: any) => (
                <li key={e.id} className="flex justify-between gap-2">
                  <span>
                    {e.feature}/{e.action}
                  </span>
                  <span className="text-xs text-slate-500">{String(e.created_at).slice(0, 16)}</span>
                </li>
              ))
            )}
          </ul>
        </section>
      </div>
    </div>
  );
}
