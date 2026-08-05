"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Crown, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { FieldLabel, SettingsSection } from "@/components/settings/settings-ui";

type VipContact = {
  id: string;
  name: string;
  email?: string | null;
  identifiers?: string[] | null;
  notes?: string | null;
};

const emptyForm = { name: "", email: "", identifiers: "", notes: "" };

export function VipContactsSection({ userId }: { userId?: string }) {
  const [contacts, setContacts] = useState<VipContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [overdueDays, setOverdueDays] = useState(3);
  const [daysSaveState, setDaysSaveState] = useState<"idle" | "saving" | "saved">("idle");

  const load = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [vipRes, settingsRes] = await Promise.all([
        fetch(`/api/vip-contacts?userId=${encodeURIComponent(userId)}`),
        fetch(`/api/assistant-settings?userId=${encodeURIComponent(userId)}`),
      ]);
      const vipData = await vipRes.json();
      const settingsData = await settingsRes.json();
      if (vipRes.ok) setContacts(Array.isArray(vipData.contacts) ? vipData.contacts : []);
      const days = Number(settingsData?.settings?.loop_overdue_days);
      if (Number.isFinite(days) && days >= 1) setOverdueDays(Math.floor(days));
    } catch {
      setError("Failed to load VIP contacts");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
  };

  const startEdit = (c: VipContact) => {
    setEditingId(c.id);
    setForm({
      name: c.name || "",
      email: c.email || "",
      identifiers: (c.identifiers || []).join(", "),
      notes: c.notes || "",
    });
  };

  const saveContact = async () => {
    if (!userId || !form.name.trim()) return;
    setBusy(true);
    setError("");
    const payload = {
      userId,
      name: form.name.trim(),
      email: form.email.trim() || null,
      identifiers: form.identifiers
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      notes: form.notes.trim(),
    };
    try {
      const res = await fetch("/api/vip-contacts", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingId ? { ...payload, id: editingId } : payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      resetForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const removeContact = async (id: string) => {
    if (!userId) return;
    setBusy(true);
    try {
      await fetch(
        `/api/vip-contacts?userId=${encodeURIComponent(userId)}&id=${encodeURIComponent(id)}`,
        { method: "DELETE" }
      );
      await load();
    } finally {
      setBusy(false);
    }
  };

  const saveOverdueDays = async () => {
    if (!userId) return;
    setDaysSaveState("saving");
    try {
      const currentRes = await fetch(`/api/assistant-settings?userId=${encodeURIComponent(userId)}`);
      const currentData = await currentRes.json();
      const existing = currentData.settings || {};
      await fetch("/api/assistant-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          settings: { ...existing, loop_overdue_days: overdueDays },
        }),
      });
      setDaysSaveState("saved");
      window.setTimeout(() => setDaysSaveState("idle"), 2000);
    } catch {
      setDaysSaveState("idle");
      setError("Could not save overdue threshold");
    }
  };

  return (
    <SettingsSection
      icon={Crown}
      title="VIP contacts & The Loop"
      description="VIP senders get priority boosts in AI task ranking. The Loop flags when someone promised you something and goes quiet."
    >
      <div className="space-y-2">
        <FieldLabel
          label="Overdue after (days)"
          hint="Commitments without a follow-up reply are marked overdue after this many days (default 3)."
        />
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="number"
            min={1}
            max={30}
            value={overdueDays}
            onChange={(e) => setOverdueDays(Math.min(30, Math.max(1, Number(e.target.value) || 3)))}
            className="w-20 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-black/20 px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={saveOverdueDays}
            className="px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 text-xs font-bold text-slate-700 dark:text-slate-200"
          >
            {daysSaveState === "saving" ? "Saving…" : daysSaveState === "saved" ? "Saved" : "Save threshold"}
          </button>
        </div>
      </div>

      <div className="border-t border-slate-100 dark:border-white/10 pt-4 space-y-3">
        <FieldLabel label={editingId ? "Edit VIP contact" : "Add VIP contact"} />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <input
            placeholder="Name *"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-black/20 px-3 py-2 text-sm"
          />
          <input
            placeholder="Email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-black/20 px-3 py-2 text-sm"
          />
          <input
            placeholder="Aliases (comma-separated)"
            value={form.identifiers}
            onChange={(e) => setForm((f) => ({ ...f, identifiers: e.target.value }))}
            className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-black/20 px-3 py-2 text-sm md:col-span-2"
          />
          <input
            placeholder="Notes (optional)"
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-black/20 px-3 py-2 text-sm md:col-span-2"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy || !form.name.trim()}
            onClick={saveContact}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-brand-primary text-white text-xs font-bold disabled:opacity-50"
          >
            {editingId ? <Pencil className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
            {editingId ? "Update" : "Add"}
          </button>
          {editingId ? (
            <button
              type="button"
              onClick={resetForm}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 text-xs font-bold"
            >
              <X className="w-3.5 h-3.5" />
              Cancel
            </button>
          ) : null}
        </div>
      </div>

      {error ? <p className="text-xs text-rose-500">{error}</p> : null}

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Loading…
        </div>
      ) : contacts.length === 0 ? (
        <p className="text-xs text-slate-500">No VIP contacts yet. Add people whose messages should rise to the top.</p>
      ) : (
        <ul className="space-y-2">
          {contacts.map((c) => (
            <li
              key={c.id}
              className="flex items-start justify-between gap-3 rounded-xl border border-slate-100 dark:border-white/10 px-3 py-2.5"
            >
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{c.name}</p>
                <p className="text-[11px] text-slate-500 truncate">
                  {[c.email, ...(c.identifiers || [])].filter(Boolean).join(" · ") || "No aliases"}
                </p>
                {c.notes ? <p className="text-[11px] text-slate-400 mt-0.5">{c.notes}</p> : null}
              </div>
              <div className="flex gap-1 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => startEdit(c)}
                  className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5"
                  title="Edit"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => removeContact(c.id)}
                  className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-500/10"
                  title="Remove"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </SettingsSection>
  );
}
