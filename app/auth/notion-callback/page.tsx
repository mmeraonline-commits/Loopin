"use client";

import React, { useEffect, useState, Suspense, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/auth-provider";

function NotionCallbackContent() {
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
      setErrorMessage(errorParam || "Access denied by Notion.");
      return;
    }

    if (!code) {
      setStatus("error");
      setErrorMessage("No authorization code received from Notion.");
      return;
    }

    if (!user) return;
    if (exchangeStarted.current) return;

    const exchangeCode = async () => {
      exchangeStarted.current = true;
      try {
        const redirectUri = `${window.location.origin}/auth/notion-callback`;
        const response = await fetch("/api/notion-connect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code, userId: user.id, redirectUri }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || data.error) {
          throw new Error(data.error || "Failed to exchange Notion OAuth code.");
        }
        setStatus("success");
        try {
          await refreshUser();
        } catch (refreshErr) {
          console.warn("Notion connected but refreshUser failed:", refreshErr);
        }
        setTimeout(() => router.push("/dashboard?tab=integrations"), 1500);
      } catch (err: unknown) {
        console.error("Notion callback exception:", err);
        setStatus("error");
        setErrorMessage(err instanceof Error ? err.message : "An error occurred during Notion sync.");
      }
    };

    exchangeCode();
  }, [searchParams, user, router, refreshUser]);

  return (
    <div className="w-full max-w-sm glass-premium rounded-3xl p-8 relative z-10 text-center space-y-6 border border-white/5 shadow-2xl">
      {status === "loading" && (
        <div className="py-6 space-y-4">
          <div className="w-14 h-14 rounded-full border-2 border-dashed border-slate-400 animate-spin flex items-center justify-center mx-auto">
            <div className="w-8 h-8 rounded-full bg-slate-500/20 flex items-center justify-center">
              <span className="w-2 h-2 rounded-full bg-slate-300" />
            </div>
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">Connecting Notion</h3>
            <p className="text-[11px] text-slate-500 mt-1">Exchanging authorization code...</p>
          </div>
        </div>
      )}
      {status === "success" && (
        <div className="py-6 space-y-4">
          <div className="w-14 h-14 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto text-2xl">
            ✓
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">Notion connected</h3>
            <p className="text-[11px] text-slate-500 mt-1">
              Share pages or databases with Loopin in Notion, then return to Integrations.
            </p>
          </div>
        </div>
      )}
      {status === "error" && (
        <div className="py-6 space-y-4">
          <div className="w-14 h-14 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center mx-auto text-2xl">
            !
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">Connection failed</h3>
            <p className="text-[11px] text-slate-400 mt-1">{errorMessage}</p>
          </div>
          <button
            type="button"
            onClick={() => router.push("/dashboard?tab=integrations")}
            className="text-sm text-sky-400 hover:underline"
          >
            Back to Integrations
          </button>
        </div>
      )}
    </div>
  );
}

export default function NotionCallbackPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#070b14] p-6 relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-800/30 via-transparent to-transparent pointer-events-none" />
      <Suspense fallback={<div className="text-slate-400 text-sm">Loading...</div>}>
        <NotionCallbackContent />
      </Suspense>
    </div>
  );
}
