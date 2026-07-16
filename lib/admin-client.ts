"use client";

import { useCallback } from "react";
import { useAuth } from "@/components/auth-provider";

export function adminHeaders(user: { id?: string; email?: string | null } | null): HeadersInit {
  return {
    "Content-Type": "application/json",
    "x-user-id": user?.id || "",
    "x-admin-email": user?.email || "",
  };
}

export function useAdminFetch() {
  const { user } = useAuth();
  const userId = user?.id || "";
  const email = user?.email || "";

  return useCallback(
    async function adminFetch(path: string, init?: RequestInit) {
      const headers = {
        ...adminHeaders({ id: userId, email }),
        ...(init?.headers || {}),
      };
      const res = await fetch(path, { ...init, headers });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `Request failed (${res.status})`);
      }
      return data;
    },
    [userId, email]
  );
}
