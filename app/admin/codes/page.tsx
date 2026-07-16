"use client";

import { useEffect, useState } from "react";
import { useAdminFetch } from "@/lib/admin-client";
import { PLAN_ORDER, PLANS, type PlanId } from "@/lib/plans";
import { Ticket } from "lucide-react";

type PlanCode = {
  id: string;
  code: string;
  plan: PlanId;
  seats: number;
  max_redemptions: number;
  redemption_count: number;
  expires_at: string | null;
  is_active: boolean;
  note: string | null;
  created_at: string;
};

export default function AdminPlanCodesPage() {
  const adminFetch = useAdminFetch();
  const [codes, setCodes] = useState<PlanCode[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    plan: "pro" as PlanId,
    seats: 1,
    max_redemptions: 1,
    note: "",
    expires_at: "",
    code: "",
  });

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminFetch("/api/admin/plan-codes");
      setCodes(res.codes || []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load codes");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      await adminFetch("/api/admin/plan-codes", {
        method: "POST",
        body: JSON.stringify({
          plan: form.plan,
          seats: form.seats,
          max_redemptions: form.max_redemptions,
          note: form.note || null,
          expires_at: form.expires_at || null,
          code: form.code || null,
        }),
      });
      setForm((f) => ({ ...f, code: "", note: "" }));
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Create failed");
    } finally {
      setCreating(false);
    }
  };

  const deactivate = async (id: string) => {
    try {
      await adminFetch(`/api/admin/plan-codes/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ is_active: false }),
      });
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Update failed");
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this code?")) return;
    try {
      await adminFetch(`/api/admin/plan-codes/${id}`, { method: "DELETE" });
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Ticket className="w-6 h-6 text-violet-500" />
          Plan Codes
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Create redeem codes so users can upgrade without Stripe.
        </p>
      </div>

      {error ? <p className="text-rose-500 text-sm">{error}</p> : null}

      <form
        onSubmit={create}
        className="rounded-2xl border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-[#0d111e] p-5 grid grid-cols-1 sm:grid-cols-2 gap-4"
      >
        <label className="block text-sm">
          <span className="text-slate-500 text-xs">Plan</span>
          <select
            value={form.plan}
            onChange={(e) => {
              const plan = e.target.value as PlanId;
              setForm((f) => ({
                ...f,
                plan,
                seats: PLANS[plan].seats.default,
              }));
            }}
            className="mt-1 w-full rounded-xl border border-slate-200 dark:border-white/10 bg-transparent px-3 py-2"
          >
            {PLAN_ORDER.map((id) => (
              <option key={id} value={id}>
                {PLANS[id].name} ({PLANS[id].priceLabel})
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-slate-500 text-xs">Seats</span>
          <input
            type="number"
            min={PLANS[form.plan].seats.min}
            max={PLANS[form.plan].seats.max}
            value={form.seats}
            onChange={(e) => setForm((f) => ({ ...f, seats: Number(e.target.value) }))}
            className="mt-1 w-full rounded-xl border border-slate-200 dark:border-white/10 bg-transparent px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="text-slate-500 text-xs">Max redemptions</span>
          <input
            type="number"
            min={1}
            value={form.max_redemptions}
            onChange={(e) => setForm((f) => ({ ...f, max_redemptions: Number(e.target.value) }))}
            className="mt-1 w-full rounded-xl border border-slate-200 dark:border-white/10 bg-transparent px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="text-slate-500 text-xs">Expires at (optional)</span>
          <input
            type="datetime-local"
            value={form.expires_at}
            onChange={(e) => setForm((f) => ({ ...f, expires_at: e.target.value }))}
            className="mt-1 w-full rounded-xl border border-slate-200 dark:border-white/10 bg-transparent px-3 py-2"
          />
        </label>
        <label className="block text-sm sm:col-span-2">
          <span className="text-slate-500 text-xs">Custom code (optional — auto-generated if blank)</span>
          <input
            value={form.code}
            onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
            placeholder="PRO-XXXX-XXXX"
            className="mt-1 w-full rounded-xl border border-slate-200 dark:border-white/10 bg-transparent px-3 py-2 font-mono"
          />
        </label>
        <label className="block text-sm sm:col-span-2">
          <span className="text-slate-500 text-xs">Note</span>
          <input
            value={form.note}
            onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
            placeholder="beta cohort"
            className="mt-1 w-full rounded-xl border border-slate-200 dark:border-white/10 bg-transparent px-3 py-2"
          />
        </label>
        <button
          type="submit"
          disabled={creating}
          className="sm:col-span-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-bold py-2.5 disabled:opacity-50"
        >
          {creating ? "Creating…" : "Create code"}
        </button>
      </form>

      <div className="rounded-2xl border border-slate-200 dark:border-white/[0.06] overflow-hidden">
        {loading ? (
          <p className="p-5 text-slate-500">Loading…</p>
        ) : codes.length === 0 ? (
          <p className="p-5 text-slate-500">No codes yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-white/[0.03] text-left text-xs text-slate-500">
              <tr>
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Plan</th>
                <th className="px-4 py-3">Uses</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {codes.map((c) => (
                <tr key={c.id} className="border-t border-slate-100 dark:border-white/[0.04]">
                  <td className="px-4 py-3 font-mono text-xs">{c.code}</td>
                  <td className="px-4 py-3">
                    {PLANS[c.plan]?.name || c.plan}
                    {c.plan === "team" ? ` · ${c.seats} seats` : ""}
                    {c.note ? <span className="block text-[11px] text-slate-500">{c.note}</span> : null}
                  </td>
                  <td className="px-4 py-3">
                    {c.redemption_count}/{c.max_redemptions}
                  </td>
                  <td className="px-4 py-3">
                    {c.is_active ? (
                      <span className="text-emerald-500 text-xs font-bold">Active</span>
                    ) : (
                      <span className="text-slate-400 text-xs font-bold">Inactive</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right space-x-2">
                    {c.is_active ? (
                      <button
                        type="button"
                        onClick={() => deactivate(c.id)}
                        className="text-xs text-amber-600 hover:underline"
                      >
                        Deactivate
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => remove(c.id)}
                      className="text-xs text-rose-500 hover:underline"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
