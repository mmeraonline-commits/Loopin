"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { isAdminEmail } from "@/lib/is-admin";
import {
  LayoutDashboard,
  Users,
  Bell,
  ToggleLeft,
  BarChart3,
  Mail,
  ArrowLeft,
  LogOut,
  Menu,
  X,
  Shield,
  Ticket,
} from "lucide-react";

const navItems = [
  { name: "Overview", href: "/admin", icon: LayoutDashboard },
  { name: "Users", href: "/admin/users", icon: Users },
  { name: "Plan Codes", href: "/admin/codes", icon: Ticket },
  { name: "Alerts", href: "/admin/alerts", icon: Bell },
  { name: "Features", href: "/admin/features", icon: ToggleLeft },
  { name: "Usage", href: "/admin/usage", icon: BarChart3 },
  { name: "Waitlist", href: "/admin/waitlist", icon: Mail },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/sign-in");
      return;
    }
    if (!isAdminEmail(user.email)) {
      router.replace("/dashboard");
    }
  }, [user, loading, router]);

  if (loading || !user || !isAdminEmail(user.email)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-[#0a0e17] text-slate-500">
        Checking admin access…
      </div>
    );
  }

  const Nav = (
    <div className="flex flex-col h-full">
      <div className="px-4 py-5 flex items-center gap-2.5 border-b border-slate-200 dark:border-white/[0.06]">
        <div className="w-8 h-8 rounded-xl bg-slate-800 dark:bg-white/10 flex items-center justify-center">
          <Shield className="w-4 h-4 text-white" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold text-slate-900 dark:text-white truncate">Admin</p>
          <p className="text-[11px] text-slate-500 truncate">Loopin console</p>
        </div>
      </div>

      <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => {
          const active =
            item.href === "/admin"
              ? pathname === "/admin"
              : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition ${
                active
                  ? "bg-slate-100 dark:bg-white/[0.06] font-semibold text-slate-900 dark:text-white"
                  : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/[0.03]"
              }`}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              {item.name}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-slate-200 dark:border-white/[0.06] px-3 py-3 space-y-1">
        <Link
          href="/dashboard"
          className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/[0.03]"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to app
        </Link>
        <button
          onClick={() => signOut()}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-slate-600 dark:text-slate-400 hover:bg-rose-50 dark:hover:bg-rose-950/20 hover:text-rose-600"
        >
          <LogOut className="w-4 h-4" />
          Sign out
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0a0e17] text-slate-900 dark:text-slate-100">
      <div className="md:hidden flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-white/[0.06] bg-white dark:bg-[#0d111e]">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4" />
          <span className="font-semibold text-sm">Admin</span>
        </div>
        <button
          onClick={() => setMobileOpen((v) => !v)}
          className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-white/5"
        >
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      <div className="flex">
        <aside className="hidden md:flex w-60 flex-shrink-0 min-h-screen border-r border-slate-200 dark:border-white/[0.06] bg-white dark:bg-[#0d111e]">
          {Nav}
        </aside>

        {mobileOpen && (
          <div className="md:hidden fixed inset-0 z-40">
            <div
              className="absolute inset-0 bg-black/40"
              onClick={() => setMobileOpen(false)}
            />
            <aside className="absolute left-0 top-0 bottom-0 w-64 bg-white dark:bg-[#0d111e] shadow-xl">
              {Nav}
            </aside>
          </div>
        )}

        <main className="flex-1 min-w-0 p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
