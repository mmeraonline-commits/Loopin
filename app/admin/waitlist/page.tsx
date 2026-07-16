"use client";

import { useCallback, useEffect, useState } from "react";
import { useAdminFetch } from "@/lib/admin-client";

type Signup = {
  id: string;
  email: string;
  source: string;
  created_at: string;
};

export default function AdminWaitlistPage() {
  const adminFetch = useAdminFetch();
  const [signups, setSignups] = useState<Signup[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminFetch("/api/admin/waitlist");
      setSignups(res.signups || []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [adminFetch]);

  useEffect(() => {
    void load();
  }, [load]);

  const remove = async (id: string) => {
    setBusyId(id);
    try {
      await adminFetch(`/api/admin/waitlist?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Waitlist</h1>
        <p className="text-sm text-slate-500 mt-1">Landing page signups.</p>
      </div>

      {error ? <p className="text-rose-500 text-sm">{error}</p> : null}

      <div className="rounded-2xl border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-[#0d111e] overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-100 dark:border-white/[0.06]">
            <tr>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Source</th>
              <th className="px-4 py-3 font-medium">Joined</th>
              <th className="px-4 py-3 font-medium" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-slate-500">
                  Loading…
                </td>
              </tr>
            ) : signups.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-slate-500">
                  No signups yet.
                </td>
              </tr>
            ) : (
              signups.map((s) => (
                <tr
                  key={s.id}
                  className="border-t border-slate-100 dark:border-white/[0.04]"
                >
                  <td className="px-4 py-3">{s.email}</td>
                  <td className="px-4 py-3 text-slate-500">{s.source}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {String(s.created_at).slice(0, 16)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      disabled={busyId === s.id}
                      onClick={() => remove(s.id)}
                      className="text-xs text-rose-600 hover:underline disabled:opacity-50"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
