"use client";

import { useCallback, useEffect, useState } from "react";
import { useAdminFetch } from "@/lib/admin-client";

export default function AdminAlertsPage() {
  const adminFetch = useAdminFetch();
  const [tab, setTab] = useState<"alerts" | "rules">("alerts");
  const [alerts, setAlerts] = useState<any[]>([]);
  const [rules, setRules] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (tab === "rules") {
        const res = await adminFetch("/api/admin/alerts?type=rules");
        setRules(res.rules || []);
      } else {
        const res = await adminFetch("/api/admin/alerts?type=alerts");
        setAlerts(res.alerts || []);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [adminFetch, tab]);

  useEffect(() => {
    void load();
  }, [load]);

  const setStatus = async (id: string, status: string, target: "alerts" | "rules") => {
    setBusyId(id);
    try {
      await adminFetch("/api/admin/alerts", {
        method: "PATCH",
        body: JSON.stringify({ id, status, target }),
      });
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusyId(null);
    }
  };

  const rows = tab === "rules" ? rules : alerts;

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Alerts</h1>
          <p className="text-sm text-slate-500 mt-1">Cross-user alert rules and fired alerts.</p>
        </div>
        <div className="flex gap-1 p-1 rounded-xl bg-slate-100 dark:bg-white/[0.06]">
          {(["alerts", "rules"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 rounded-lg text-sm capitalize ${
                tab === t
                  ? "bg-white dark:bg-[#0d111e] shadow-sm font-semibold"
                  : "text-slate-500"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {error ? <p className="text-rose-500 text-sm">{error}</p> : null}

      <div className="rounded-2xl border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-[#0d111e] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-100 dark:border-white/[0.06]">
              <tr>
                <th className="px-4 py-3 font-medium">Title</th>
                <th className="px-4 py-3 font-medium">User</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Created</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-slate-500">
                    Loading…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-slate-500">
                    No {tab} found.
                  </td>
                </tr>
              ) : (
                rows.map((row: any) => (
                  <tr
                    key={row.id}
                    className="border-t border-slate-100 dark:border-white/[0.04]"
                  >
                    <td className="px-4 py-3 max-w-xs truncate">
                      {row.title || row.name || row.condition || row.id}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">
                      {String(row.user_id || "").slice(0, 8)}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-white/[0.06]">
                        {row.status || "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {row.created_at ? String(row.created_at).slice(0, 16) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        {["open", "resolved", "dismissed", "active", "paused"].map((s) => (
                          <button
                            key={s}
                            disabled={busyId === row.id || row.status === s}
                            onClick={() => setStatus(row.id, s, tab === "rules" ? "rules" : "alerts")}
                            className="text-[10px] px-1.5 py-1 rounded border border-slate-200 dark:border-white/10 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-white/5"
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
