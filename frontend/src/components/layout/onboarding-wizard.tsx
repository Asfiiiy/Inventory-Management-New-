"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Rocket, X } from "lucide-react";
import { apiClient } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { ModalPortal } from "@/components/ui/modal-portal";

export function OnboardingWizard() {
  const { user, isSuperAdmin, isStaff } = useAuth();
  const [open, setOpen] = useState(false);
  const [steps, setSteps] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user?.id || isSuperAdmin || isStaff) return;
    let cancelled = false;
    apiClient.onboarding
      .status()
      .then((res) => {
        if (cancelled || res.data?.completed) return;
        setSteps(res.data?.steps || []);
        setOpen(true);
      })
      .catch(() => {
        /* wizard is optional */
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id, isSuperAdmin, isStaff]);

  if (!open) return null;

  const finish = async (skip = false) => {
    setBusy(true);
    try {
      await apiClient.onboarding.complete();
      setOpen(false);
    } catch {
      if (skip) setOpen(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalPortal>
    <div className="fixed inset-0 z-[100] bg-slate-950/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-6">
      <div className="w-full sm:max-w-lg bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
        <div className="bg-[#0c3843] text-white px-5 py-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center">
              <Rocket className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black">Welcome to Whoopit Office IT</h2>
              <p className="text-[11px] text-cyan-100/90">Finish these setup steps once for {user?.org_name || "your company"}.</p>
            </div>
          </div>
          <button type="button" onClick={() => finish(true)} className="p-1.5 rounded-lg hover:bg-white/10" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        <ol className="p-5 space-y-3">
          {(steps.length
            ? steps
            : [
                "Confirm company settings & alert email",
                "Add IT store location (if missing)",
                "Create first hardware SKU",
                "Add a staff member",
                "Issue first device with e-signature",
              ]
          ).map((step, idx) => (
            <li key={step} className="flex items-start gap-3 text-sm text-slate-700 dark:text-slate-200">
              <span className="mt-0.5 w-6 h-6 rounded-full bg-[#0c3843]/10 text-[#0c3843] text-xs font-black flex items-center justify-center shrink-0">
                {idx + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>

        <div className="px-5 pb-5 flex flex-col sm:flex-row gap-2">
          <Link
            href="/settings"
            className="flex-1 text-center px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200"
          >
            Open settings
          </Link>
          <Link
            href="/custody"
            className="flex-1 text-center px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200"
          >
            Issue hardware
          </Link>
          <button
            type="button"
            disabled={busy}
            onClick={() => finish(false)}
            className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#0c3843] text-white text-xs font-bold disabled:opacity-60"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            Mark setup done
          </button>
        </div>
      </div>
    </div>
    </ModalPortal>
  );
}
