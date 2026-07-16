"use client";

import { useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { Ticket } from "lucide-react";

export function RedeemCodeForm({
  onRedeemed,
  className = "",
}: {
  onRedeemed?: (result: { plan: string; planName: string; seats: number }) => void;
  className?: string;
}) {
  const { user, refreshUser } = useAuth();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id) {
      setError("Sign in to redeem a code");
      return;
    }
    setLoading(true);
    setError("");
    setSuccess("");
    try {
      const res = await fetch("/api/plans/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, code }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Redeem failed");
      setSuccess(data.message || `Upgraded to ${data.planName}`);
      setCode("");
      await refreshUser();
      onRedeemed?.({ plan: data.plan, planName: data.planName, seats: data.seats });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Redeem failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} className={`space-y-3 ${className}`}>
      <div className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-100">
        <Ticket className="w-4 h-4 text-violet-500" />
        Redeem upgrade code
      </div>
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="PRO-XXXX-XXXX"
          className="flex-1 rounded-xl border border-slate-200 dark:border-white/10 bg-white/80 dark:bg-white/[0.04] px-3 py-2.5 text-sm font-mono tracking-wide text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-violet-500/40"
        />
        <button
          type="submit"
          disabled={loading || !code.trim()}
          className="px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-xs font-bold transition"
        >
          {loading ? "Redeeming…" : "Redeem"}
        </button>
      </div>
      {error ? <p className="text-xs text-rose-500">{error}</p> : null}
      {success ? <p className="text-xs text-emerald-500">{success}</p> : null}
    </form>
  );
}
