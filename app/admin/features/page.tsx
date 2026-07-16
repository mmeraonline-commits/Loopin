"use client";

import { useEffect, useState } from "react";
import { useAdminFetch } from "@/lib/admin-client";
import type { FeatureFlags } from "@/lib/feature-flags";
import { DEFAULT_FEATURE_FLAGS } from "@/lib/feature-flags";

export default function AdminFeaturesPage() {
  const adminFetch = useAdminFetch();
  const [flags, setFlags] = useState<FeatureFlags>(DEFAULT_FEATURE_FLAGS);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await adminFetch("/api/admin/features");
        if (!cancelled) setFlags(res.flags);
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

  const toggleIntegration = (key: keyof FeatureFlags["integrations"]) => {
    setFlags((prev) => ({
      ...prev,
      integrations: { ...prev.integrations, [key]: !prev.integrations[key] },
    }));
  };

  const toggleSurface = (key: keyof FeatureFlags["surfaces"]) => {
    setFlags((prev) => ({
      ...prev,
      surfaces: { ...prev.surfaces, [key]: !prev.surfaces[key] },
    }));
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await adminFetch("/api/admin/features", {
        method: "PUT",
        body: JSON.stringify({ flags }),
      });
      setFlags(res.flags);
      setSavedAt(new Date().toLocaleTimeString());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="text-slate-500">Loading feature flags…</p>;

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Features</h1>
          <p className="text-sm text-slate-500 mt-1">
            Globally enable or disable integrations and product surfaces.
          </p>
        </div>
        <button
          onClick={save}
          disabled={saving}
          className="px-4 py-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-sm font-medium disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>

      {error ? <p className="text-rose-500 text-sm">{error}</p> : null}
      {savedAt ? <p className="text-emerald-600 text-sm">Saved at {savedAt}</p> : null}

      <section className="rounded-2xl border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-[#0d111e] p-5">
        <h2 className="font-semibold mb-4">Integrations</h2>
        <ul className="space-y-3">
          {(Object.keys(flags.integrations) as Array<keyof FeatureFlags["integrations"]>).map(
            (key) => (
              <li key={key} className="flex items-center justify-between">
                <span className="capitalize text-sm">{key}</span>
                <button
                  type="button"
                  onClick={() => toggleIntegration(key)}
                  className={`relative w-11 h-6 rounded-full transition ${
                    flags.integrations[key] ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-600"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition ${
                      flags.integrations[key] ? "translate-x-5" : ""
                    }`}
                  />
                </button>
              </li>
            )
          )}
        </ul>
      </section>

      <section className="rounded-2xl border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-[#0d111e] p-5">
        <h2 className="font-semibold mb-4">Surfaces</h2>
        <ul className="space-y-3">
          {(Object.keys(flags.surfaces) as Array<keyof FeatureFlags["surfaces"]>).map((key) => (
            <li key={key} className="flex items-center justify-between">
              <span className="text-sm">{key}</span>
              <button
                type="button"
                onClick={() => toggleSurface(key)}
                className={`relative w-11 h-6 rounded-full transition ${
                  flags.surfaces[key] ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-600"
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition ${
                    flags.surfaces[key] ? "translate-x-5" : ""
                  }`}
                />
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
