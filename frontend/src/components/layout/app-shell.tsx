"use client";

import React, { useState, useEffect, Suspense } from "react";
import { usePathname } from "next/navigation";
import { AlertTriangle, ArrowLeft, Clock } from "lucide-react";
import { Sidebar } from "./sidebar";
import { Header } from "./header";
import { OnboardingWizard } from "./onboarding-wizard";
import { useAuth } from "@/lib/auth-context";

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  return (
    <Suspense fallback={<div className="h-full w-full bg-slate-950 flex items-center justify-center text-xs text-slate-500">Loading...</div>}>
      <AppShellInner>{children}</AppShellInner>
    </Suspense>
  );
}

function AppShellInner({ children }: AppShellProps) {
  const pathname = usePathname();
  const { user, logout, isSuperAdmin } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [supportSession, setSupportSession] = useState<{ org_id: string; name: string } | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem("whoopit_support_session");
        if (stored) {
          setSupportSession(JSON.parse(stored));
        } else {
          setSupportSession(null);
        }
      } catch (e) {
        setSupportSession(null);
      }
    }
  }, [pathname]);

  const exitSupportSession = () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem("whoopit_support_session");
      setSupportSession(null);
      window.location.href = "/admin?tab=clients";
    }
  };

  // 1. Login Page: Full screen fixed (non-scrollable)
  if (pathname === "/login") {
    return <main className="h-full w-full overflow-hidden">{children}</main>;
  }

  // 2. Dashboard 1: Admin Portal (Standalone complete Executive Dashboard with its own sidebar)
  if (pathname.startsWith("/admin")) {
    return <main className="h-screen w-screen overflow-hidden bg-slate-50 text-slate-900">{children}</main>;
  }

  const planName = user?.org_plan?.toLowerCase() || "";
  const trialExpired = !!user?.is_trial_expired;
  const suspended = !!user?.is_suspended || planName === "suspended";
  if (!isSuperAdmin && (trialExpired || suspended)) {
    return (
      <main className="h-screen w-screen overflow-auto bg-slate-50 text-slate-900 flex items-center justify-center p-6">
        <div className="max-w-xl w-full p-8 rounded-3xl bg-white border border-slate-200 shadow-2xl text-center space-y-5">
          <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto border ${suspended ? "bg-rose-50 text-rose-600 border-rose-200" : "bg-amber-50 text-amber-600 border-amber-200"}`}>
            {suspended ? <AlertTriangle className="w-8 h-8" /> : <Clock className="w-8 h-8" />}
          </div>
          <div className="space-y-2">
            <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border ${suspended ? "bg-rose-50 text-rose-700 border-rose-200" : "bg-amber-50 text-amber-700 border-amber-200"}`}>
              {suspended ? "Workspace Suspended" : "30-Day Evaluation Expired"}
            </span>
            <h2 className="text-xl font-extrabold text-slate-900">
              {suspended ? "Commercial Billing Hold Enforced" : "Your 30-Day Evaluation Period Has Ended"}
            </h2>
            <p className="text-xs text-slate-600 leading-relaxed max-w-md mx-auto">
              {suspended
                ? "This workspace is on billing hold. Equipment records stay stored, and sign-in stays closed until the license is reactivated."
                : "Evaluation access has ended. Company assets stay stored. A Standard or Enterprise license is required before anyone in this company can sign in again."}
            </p>
          </div>
          <button
            type="button"
            onClick={logout}
            className="px-4 py-2 rounded-xl bg-[#0c3843] text-white text-xs font-bold cursor-pointer"
          >
            Sign out
          </button>
        </div>
      </main>
    );
  }

  // Company Office IT software shell
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#0c3843] text-slate-800 font-sans selection:bg-[#0c3843] selection:text-white">
      <Sidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed(!collapsed)}
      />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative bg-gradient-to-br from-[#eef5f6] via-[#f4f7f9] to-[#eef2f7]">
        <div className="absolute top-0 right-1/4 w-96 h-96 bg-teal-500/5 rounded-full blur-3xl pointer-events-none -z-0" />
        <div className="absolute bottom-10 right-10 w-96 h-96 bg-[#0c3843]/5 rounded-full blur-3xl pointer-events-none -z-0" />

        {supportSession && (
          <div className="bg-amber-400 text-slate-950 px-4 py-2 text-xs font-bold flex items-center justify-between shrink-0 shadow-sm z-30 border-b border-amber-500">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-slate-950 animate-pulse" />
              <span>
                WHOOPIT SUPPORT SESSION: Currently viewing workspace of <strong className="underline underline-offset-2">{supportSession.name}</strong> (Audit Logged Read-Only Mode)
              </span>
            </div>
            <button
              onClick={exitSupportSession}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-950 text-white hover:bg-slate-800 text-xs font-bold transition-all cursor-pointer shadow-xs"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Exit Support Mode &amp; Return to Admin</span>
            </button>
          </div>
        )}

        <Header
          onToggleSidebar={() => setCollapsed(!collapsed)}
          isSidebarCollapsed={collapsed}
        />

        <main className="flex-1 overflow-y-auto p-5 sm:p-6 md:p-8 relative z-10">
          <div className="max-w-7xl mx-auto space-y-6">{children}</div>
        </main>
        <OnboardingWizard />
      </div>
    </div>
  );
}
