"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAdminFetch } from "@/lib/admin-client";

type AdminUser = {
  id: string;
  email: string | null;
  phone: string | null;
  name: string | null;
  auth_provider: string | null;
  integrations: Record<string, { connected?: boolean } | null> | null;
  is_disabled: boolean;
  last_login_at: string | null;
  created_at: string | null;
};

export default function AdminUsersPage() {
  const adminFetch = useAdminFetch();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = q ? `?q=${encodeURIComponent(q)}` : "";
      const res = await adminFetch(`/api/admin/users${params}`);
      setUsers(res.users || []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load users");
    } finally {
      setLoading(false);
    }
  }, [adminFetch, q]);

  useEffect(() => {
    const t = setTimeout(() => {
      void load();
    }, 200);
    return () => clearTimeout(t);
  }, [load]);

  const toggleDisabled = async (user: AdminUser) => {
    setBusyId(user.id);
    try {
      await adminFetch("/api/admin/users", {
        method: "PATCH",
        body: JSON.stringify({ id: user.id, is_disabled: !user.is_disabled }),
      });
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusyId(null);
    }
  };

  const connectedCount = (u: AdminUser) =>
    Object.values(u.integrations || {}).filter((v) => v?.connected).length;

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Users</h1>
          <p className="text-sm text-slate-500 mt-1">View, search, and disable accounts.</p>
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search email, name, phone…"
          className="w-full sm:w-72 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0d111e] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500/40"
        />
      </div>

      {error ? <p className="text-rose-500 text-sm">{error}</p> : null}

      <div className="rounded-2xl border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-[#0d111e] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-100 dark:border-white/[0.06]">
              <tr>
                <th className="px-4 py-3 font-medium">User</th>
                <th className="px-4 py-3 font-medium">Provider</th>
                <th className="px-4 py-3 font-medium">Integrations</th>
                <th className="px-4 py-3 font-medium">Status</th>
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
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-slate-500">
                    No users found.
                  </td>
                </tr>
              ) : (
                users.map((u) => (
                  <tr
                    key={u.id}
                    className="border-t border-slate-100 dark:border-white/[0.04] hover:bg-slate-50/80 dark:hover:bg-white/[0.02]"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/users/${u.id}`}
                        className="font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
                      >
                        {u.name || u.email || u.phone || u.id.slice(0, 8)}
                      </Link>
                      <p className="text-xs text-slate-500 mt-0.5">{u.email || u.phone || "—"}</p>
                    </td>
                    <td className="px-4 py-3 capitalize text-slate-600 dark:text-slate-300">
                      {u.auth_provider || "—"}
                    </td>
                    <td className="px-4 py-3 tabular-nums">{connectedCount(u)}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                          u.is_disabled
                            ? "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300"
                            : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                        }`}
                      >
                        {u.is_disabled ? "Disabled" : "Active"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        disabled={busyId === u.id}
                        onClick={() => toggleDisabled(u)}
                        className="text-xs font-medium px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/5 disabled:opacity-50"
                      >
                        {u.is_disabled ? "Enable" : "Disable"}
                      </button>
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
