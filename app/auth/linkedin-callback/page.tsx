"use client";

import React, { useEffect, useState, Suspense, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/auth-provider";

function LinkedInCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, refreshUser } = useAuth();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const exchangeStarted = useRef(false);

  useEffect(() => {
    const code = searchParams.get("code");
    const errorParam = searchParams.get("error");

    if (errorParam) {
      setStatus("error");
      setErrorMessage(errorParam || "Access denied by LinkedIn.");
      return;
    }
    if (!code) {
      setStatus("error");
      setErrorMessage("No authorization code received from LinkedIn.");
      return;
    }
    if (!user || exchangeStarted.current) return;

    const exchangeCode = async () => {
      exchangeStarted.current = true;
      try {
        const response = await fetch("/api/linkedin-connect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code, userId: user.id }),
        });
        const data = await response.json();
        if (!response.ok || data.error) throw new Error(data.error || "LinkedIn OAuth failed.");
        setStatus("success");
        await refreshUser();
        setTimeout(() => router.push("/dashboard?tab=integrations"), 1500);
      } catch (err: unknown) {
        setStatus("error");
        setErrorMessage(err instanceof Error ? err.message : "LinkedIn sync failed.");
      }
    };
    exchangeCode();
  }, [searchParams, user, router, refreshUser]);

  return (
    <div className="w-full max-w-sm glass-premium rounded-3xl p-8 relative z-10 text-center space-y-6 border border-white/5 shadow-2xl">
      {status === "loading" && (
        <div className="py-6 space-y-4">
          <div className="w-14 h-14 rounded-full border-2 border-dashed border-sky-500 animate-spin mx-auto" />
          <h3 className="text-sm font-bold text-white">Connecting LinkedIn</h3>
          <p className="text-[11px] text-slate-500">Exchanging OAuth credentials...</p>
        </div>
      )}
      {status === "success" && (
        <div className="py-6 space-y-4">
          <div className="w-14 h-14 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto">✓</div>
          <h3 className="text-sm font-bold text-white">LinkedIn Connected</h3>
          <p className="text-[11px] text-slate-500">Returning to integrations...</p>
        </div>
      )}
      {status === "error" && (
        <div className="space-y-4">
          <h3 className="text-base font-bold text-white">Connection Failed</h3>
          <p className="text-xs text-slate-400">{errorMessage}</p>
          <button onClick={() => router.push("/dashboard?tab=integrations")} className="w-full py-2.5 bg-white/5 rounded-xl text-xs font-semibold border border-white/5">
            Back to Integrations
          </button>
        </div>
      )}
    </div>
  );
}

export default function LinkedInCallbackPage() {
  return (
    <div className="min-h-screen text-slate-200 bg-[#030712] flex items-center justify-center px-6">
      <Suspense fallback={<div className="text-xs text-slate-500">Loading...</div>}>
        <LinkedInCallbackContent />
      </Suspense>
    </div>
  );
}
