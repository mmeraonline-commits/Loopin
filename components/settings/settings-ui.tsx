"use client";

import React from "react";

/**
 * Shared Settings page primitives — extracted from app/dashboard/page.tsx so
 * they can be reused by standalone settings sections (e.g. tone-training-section)
 * without creating a circular import back into the dashboard page.
 */

export function SettingsSection({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white dark:bg-[#0d111e]/70 border border-emerald-900/10 dark:border-white/10 rounded-2xl p-5 shadow-sm">
      <div className="flex items-start gap-3 mb-5">
        <div className="w-10 h-10 rounded-xl bg-brand-mint dark:bg-brand-primary/25 border border-emerald-900/10 dark:border-brand-accent/30 text-brand-primary dark:text-brand-lime flex items-center justify-center flex-shrink-0">
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <h3 className="text-sm font-extrabold text-brand-ink dark:text-white">{title}</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">{description}</p>
        </div>
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

export function FieldLabel({ label, hint }: { label: string; hint?: string }) {
  return (
    <div>
      <span className="block text-xs font-bold text-slate-700 dark:text-slate-300">{label}</span>
      {hint && <span className="block text-[11px] text-slate-500 dark:text-slate-500 mt-0.5">{hint}</span>}
    </div>
  );
}

export function ToggleSetting({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  hint: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-emerald-900/10 dark:border-white/10 bg-brand-mint-soft/70 dark:bg-white/[0.03] px-3 py-3">
      <FieldLabel label={label} hint={hint} />
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full border p-0.5 transition ${
          checked
            ? "bg-brand-primary border-brand-accent"
            : "bg-slate-200 dark:bg-slate-800 border-slate-300 dark:border-white/10"
        }`}
        aria-pressed={checked}
        title={checked ? "Enabled" : "Disabled"}
      >
        <span
          className={`h-5 w-5 rounded-full bg-white shadow transition ${
            checked ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}

export function MultiChoiceSetting({
  options,
  selected,
  onChange,
}: {
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const toggle = (value: string) => {
    onChange(selected.includes(value) ? selected.filter(item => item !== value) : [...selected, value]);
  };

  return (
    <div className="flex flex-wrap gap-2">
      {options.map(option => {
        const active = selected.includes(option.value);
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => toggle(option.value)}
            className={`px-3 py-2 rounded-xl border text-xs font-bold transition ${
              active
                ? "border-brand-primary bg-brand-mint dark:bg-brand-primary/25 text-brand-primary dark:text-brand-lime"
                : "border-emerald-900/10 dark:border-white/10 text-slate-600 dark:text-slate-400 hover:bg-brand-mint-soft dark:hover:bg-white/5"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
