"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Building2, Sliders } from "lucide-react";
import { apiClient, ApiError, WorkspaceSettings } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/components/ui/toast";

const CURRENCIES = ["PKR", "USD", "AED", "SAR", "EUR", "GBP"];
const TIME_ZONES = ["Asia/Karachi", "Asia/Dubai", "Asia/Riyadh", "UTC", "Europe/London", "America/New_York"];

export default function WorkspaceSettingsPage() {
  const { toast } = useToast();
  const { isStaff } = useAuth();
  const [form, setForm] = useState<WorkspaceSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiClient.settings
      .get()
      .then((res) => {
        if (!cancelled && res.data) setForm(res.data);
      })
      .catch((err: unknown) => {
        const message = err instanceof ApiError ? err.message : "Workspace settings could not be loaded.";
        toast({ title: "Settings unavailable", description: message, variant: "destructive" });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [toast]);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form || isStaff) return;
    setSaving(true);
    try {
      const res = await apiClient.settings.update({
        name: form.name.trim(),
        currency: form.currency,
        time_zone: form.time_zone,
        alert_email: form.alert_email.trim(),
        approval_threshold: Number(form.approval_threshold ?? 500),
      });
      if (res.data) setForm(res.data);
      toast({
        title: "Workspace saved",
        description: "Company settings, alert email, and approval threshold updated.",
        variant: "success",
      });
    } catch (err: unknown) {
      const message = err instanceof ApiError ? err.message : "The workspace settings were not saved.";
      toast({ title: "Could not save", description: message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto pb-12">
      <div className="pb-4 border-b border-slate-200/80 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-[#0c3843]/10 text-[#0c3843] dark:text-cyan-300 flex items-center justify-center border border-[#0c3843]/20">
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 dark:text-white">
              Workspace Settings
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Company name, currency, time zone, and the mailbox used for stock alerts.
            </p>
          </div>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Loading workspace settings…</p>
      ) : !form ? (
        <p className="text-sm text-slate-500">Workspace settings could not be loaded.</p>
      ) : (
        <form onSubmit={save} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
          <label className="block space-y-1.5">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Company name</span>
            <input
              required
              disabled={isStaff}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm text-slate-900 dark:text-white outline-none focus:border-[#0c3843]"
            />
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block space-y-1.5">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300">License plan</span>
              <input
                readOnly
                value={form.plan || "unassigned"}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm text-slate-600 dark:text-slate-300 outline-none"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Currency</span>
              <select
                disabled={isStaff}
                value={form.currency}
                onChange={(e) => setForm({ ...form, currency: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm text-slate-900 dark:text-white outline-none"
              >
                {!CURRENCIES.includes(form.currency) && <option value={form.currency}>{form.currency}</option>}
                {CURRENCIES.map((code) => (
                  <option key={code} value={code}>{code}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block space-y-1.5">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Time zone</span>
              <select
                disabled={isStaff}
                value={form.time_zone}
                onChange={(e) => setForm({ ...form, time_zone: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm text-slate-900 dark:text-white outline-none"
              >
                {!TIME_ZONES.includes(form.time_zone) && <option value={form.time_zone}>{form.time_zone}</option>}
                {TIME_ZONES.map((zone) => (
                  <option key={zone} value={zone}>{zone}</option>
                ))}
              </select>
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Alert email</span>
              <input
                type="email"
                disabled={isStaff}
                value={form.alert_email}
                onChange={(e) => setForm({ ...form, alert_email: e.target.value })}
                placeholder="it-alerts@company.com"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm text-slate-900 dark:text-white outline-none focus:border-[#0c3843]"
              />
              <span className="text-[11px] text-slate-500 block">
                Receives warranty/AMC digests, low-stock alerts, high-value approval notices, trial reminders, and (Enterprise) monthly finance NBV digests. Mailpit: http://localhost:8025
              </span>
            </label>
          </div>

          <label className="block space-y-1.5">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Approval threshold (USD)</span>
            <input
              type="number"
              min={0}
              step={50}
              disabled={isStaff}
              value={form.approval_threshold ?? 500}
              onChange={(e) => setForm({ ...form, approval_threshold: Number(e.target.value) || 0 })}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm text-slate-900 dark:text-white outline-none focus:border-[#0c3843]"
            />
            <span className="text-[11px] text-slate-500 block">
              Staff hardware requests always need admin approval. Estimated issue value at or above this amount is flagged in the Custody approvals queue.
            </span>
          </label>

          {isStaff ? (
            <p className="text-xs text-slate-500">Only a company admin can change these settings.</p>
          ) : (
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2.5 rounded-xl bg-[#0c3843] hover:bg-[#082931] text-white text-xs font-bold disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save workspace"}
            </button>
          )}
        </form>
      )}

      <Link
        href="/settings/custom-fields"
        className="flex items-center gap-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 hover:border-[#0c3843]"
      >
        <Sliders className="w-4 h-4 text-[#0c3843] dark:text-cyan-300" />
        <div>
          <div className="text-sm font-bold text-slate-900 dark:text-white">Custom Spec Fields</div>
          <div className="text-xs text-slate-500">Serial, RAM, MAC address, and SSD fields for hardware records.</div>
        </div>
      </Link>
    </div>
  );
}
