"use client";

import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  FileSpreadsheet,
  Mail,
  Printer,
  X,
  Download,
  Send,
  CheckCircle2,
  Loader2,
  Building2,
  Package,
  UserCheck,
  Wrench,
  AlertTriangle,
  DollarSign,
} from "lucide-react";
import { apiClient, FinanceAuditDossier } from "@/lib/api";
import { sanitizeCSVCell, downloadCSV } from "@/lib/export-csv";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/lib/auth-context";

interface FinanceReportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function FinanceReportModal({ isOpen, onClose }: FinanceReportModalProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const planName = (user?.org_plan || "").toLowerCase();
  const isEnterprisePlan = planName === "enterprise";
  const isTrialPlan = planName === "trial";
  const canDownloadCSV = planName === "enterprise" || planName === "standard";
  const canPrintPDF = isEnterprisePlan;
  const [mounted, setMounted] = useState(false);
  const [dossier, setDossier] = useState<FinanceAuditDossier | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Email Form States
  const [recipientEmail, setRecipientEmail] = useState("");
  const [recipientName, setRecipientName] = useState("Finance Manager");
  const [subject, setSubject] = useState("Office IT Inventory, Custody & Repair Audit Report");
  const [notes, setNotes] = useState(
    "Attached is the complete IT Inventory breakdown including Available Store Stock, Employee Handovers (with Employee IDs & Digital Signatures), Faulty items, and Vendor Repair costs."
  );
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [emailSentInfo, setEmailSentInfo] = useState<{
    email: string;
    attachment: string;
  } | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadDossier();
      setEmailSentInfo(null);
    }
  }, [isOpen]);

  const loadDossier = async () => {
    setIsLoading(true);
    try {
      const res = await apiClient.reports.getFinanceDossier();
      if (res.success && res.data) {
        setDossier(res.data);
        setSubject(
          `[Finance Audit] ${res.data.organization_name} - Complete IT Inventory & Asset Lifecycle Report`
        );
      }
    } catch (err: any) {
      toast({
        title: "Report Load Error",
        description: err?.message || "Could not load Finance Audit Dossier.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen || !mounted) return null;

  const handleDownloadFullCSV = () => {
    if (!dossier) return;
    const lines: string[] = [];

    lines.push(
      `OFFICE IT INVENTORY & ASSET LIFECYCLE AUDIT REPORT - ${dossier.organization_name.toUpperCase()}`
    );
    lines.push(`Generated At,${sanitizeCSVCell(new Date(dossier.generated_at).toLocaleString())}`);
    lines.push("");

    // Section 1: KPIs
    lines.push("SECTION 1: EXECUTIVE SUMMARY FOR FINANCE MANAGER");
    lines.push(
      [
        "Total Product SKUs",
        "Total Units Owned",
        "Available in IT Store",
        "Assigned to Employees",
        "Faulty / Damaged",
        "At Vendor for Repair",
        "Repaired & Returned History",
        "Total Asset Valuation ($)",
        "Total Vendor Repair Spend ($)",
      ].join(",")
    );
    lines.push(
      [
        dossier.kpis.total_skus,
        dossier.kpis.total_units_owned,
        dossier.kpis.total_in_store,
        dossier.kpis.total_assigned,
        dossier.kpis.total_faulty,
        dossier.kpis.total_at_vendor,
        dossier.kpis.total_repaired_count,
        dossier.kpis.total_asset_valuation.toFixed(2),
        dossier.kpis.total_repair_spend.toFixed(2),
      ].join(",")
    );
    lines.push("");

    // Section 2: Product Breakdown
    lines.push("SECTION 2: PRODUCT-BY-PRODUCT IT LIFECYCLE BREAKDOWN");
    lines.push(
      [
        "SKU",
        "Item Name",
        "Category",
        "Total Owned",
        "Available in Store",
        "Assigned to Employees",
        "Faulty / Damaged",
        "At Vendor (Under Repair)",
        "Repaired & Returned Count",
        "Unit Cost ($)",
        "Total Asset Value ($)",
        "Vendor Repair Spend ($)",
      ].join(",")
    );
    for (const it of dossier.items) {
      lines.push(
        [
          sanitizeCSVCell(it.sku),
          sanitizeCSVCell(it.name),
          sanitizeCSVCell(it.category),
          it.total_owned,
          it.in_store,
          it.assigned,
          it.faulty,
          it.at_vendor,
          it.repaired_count,
          it.unit_cost.toFixed(2),
          it.total_valuation.toFixed(2),
          it.repair_spend.toFixed(2),
        ].join(",")
      );
    }
    lines.push("");

    // Section 3: Employee Handovers
    lines.push("SECTION 3: EMPLOYEE HANDOVER & DIGITAL SIGNATURE REGISTER");
    lines.push(
      [
        "Employee ID",
        "Employee Name",
        "Department",
        "Item SKU",
        "Item Name",
        "Serial / Tag #",
        "Qty",
        "Condition",
        "Online Signature Status",
        "Handover Date",
        "Current Status",
      ].join(",")
    );
    for (const c of dossier.custody_records) {
      lines.push(
        [
          sanitizeCSVCell(c.employee_code),
          sanitizeCSVCell(c.employee_name),
          sanitizeCSVCell(c.employee_department),
          sanitizeCSVCell(c.item_sku),
          sanitizeCSVCell(c.item_name),
          sanitizeCSVCell(c.serial_number || "N/A"),
          c.quantity,
          sanitizeCSVCell(c.condition_grade),
          sanitizeCSVCell(c.has_signature ? "Signed Online (Verified)" : "System Verified"),
          sanitizeCSVCell(new Date(c.checkout_date).toLocaleDateString()),
          sanitizeCSVCell(c.returned_at ? "Returned to Store" : "Active with Employee"),
        ].join(",")
      );
    }
    lines.push("");

    // Section 4: Faulty & Vendor Repairs
    lines.push("SECTION 4: FAULTY & VENDOR REPAIR TRACK RECORD");
    lines.push(
      [
        "Ticket #",
        "Item SKU",
        "Item Name",
        "Serial #",
        "Qty",
        "Status",
        "Fault / Issue Description",
        "Reported By",
        "Vendor Name",
        "Repair Cost ($)",
        "Resolution Notes",
        "Date Logged",
      ].join(",")
    );
    for (const r of dossier.repair_records) {
      lines.push(
        [
          sanitizeCSVCell(r.ticket_reference),
          sanitizeCSVCell(r.item_sku),
          sanitizeCSVCell(r.item_name),
          sanitizeCSVCell(r.serial_number || "N/A"),
          r.quantity,
          sanitizeCSVCell(r.status),
          sanitizeCSVCell(r.issue_description),
          sanitizeCSVCell(r.reported_by),
          sanitizeCSVCell(r.vendor_name || "Pending Vendor"),
          r.repair_cost.toFixed(2),
          sanitizeCSVCell(r.resolution_notes),
          sanitizeCSVCell(new Date(r.created_at).toLocaleDateString()),
        ].join(",")
      );
    }

    const today = new Date().toISOString().split("T")[0];
    downloadCSV(lines.join("\n"), `Office_IT_Finance_Audit_Report_${today}.csv`);
    toast({
      title: "Finance Report Downloaded",
      description: "Complete 4-section Excel CSV audit pack has been downloaded.",
      variant: "success",
    });
  };

  const handleSendEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recipientEmail.trim() || !recipientEmail.includes("@")) {
      toast({
        title: "Invalid Email Address",
        description: "Please enter a valid Finance Manager email address.",
        variant: "destructive",
      });
      return;
    }

    setIsSendingEmail(true);
    try {
      const res = await apiClient.reports.sendFinanceEmail({
        recipient_email: recipientEmail.trim(),
        recipient_name: recipientName.trim() || "Finance Manager",
        subject: subject.trim(),
        notes: notes.trim(),
      });
      if (res.success && res.data) {
        setEmailSentInfo({
          email: res.data.recipient_email,
          attachment: res.data.attachment_name,
        });
        toast({
          title: "Report Emailed to Finance Manager!",
          description: `Sent ${res.data.attachment_name} to ${res.data.recipient_email}.`,
          variant: "success",
        });
      }
    } catch (err: any) {
      toast({
        title: "Email Dispatch Failed",
        description: err?.message || "Could not send email report.",
        variant: "destructive",
      });
    } finally {
      setIsSendingEmail(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
      <div className="w-full max-w-5xl bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-[#0c3843] text-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-400/20 border border-cyan-300/30 flex items-center justify-center">
              <FileSpreadsheet className="w-5 h-5 text-cyan-300" />
            </div>
            <div>
              <h2 className="text-base font-extrabold tracking-tight">
                Previous inventory record for finance
              </h2>
              <p className="text-xs text-cyan-200/80">
                Bought → given to staff → faulty / vendor spend → still in store — proof before new stock purchase
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {canDownloadCSV && (
              <button
                onClick={handleDownloadFullCSV}
                disabled={!dossier}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white text-xs font-bold shadow-sm transition-all cursor-pointer disabled:opacity-50"
              >
                <Download className="w-4 h-4" />
                <span>Download Full Excel / CSV Report</span>
              </button>
            )}
            {canPrintPDF && (
              <button
                onClick={() => window.print()}
                disabled={!dossier}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs font-semibold transition-all cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>Print / Save PDF</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-xl text-white/70 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {isLoading || !dossier ? (
            <div className="py-16 flex flex-col items-center justify-center text-slate-400 gap-2">
              <Loader2 className="w-7 h-7 animate-spin text-cyan-600" />
              <span className="text-xs font-semibold">Loading previous inventory record…</span>
            </div>
          ) : (
            <>
              {/* Direct Email to Finance Manager Box (Enterprise Only) */}
              {isEnterprisePlan ? (
                <form
                  onSubmit={handleSendEmail}
                  className="p-5 rounded-2xl border-2 border-cyan-500/30 bg-cyan-50/40 dark:bg-cyan-950/20 space-y-4"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Mail className="w-5 h-5 text-[#0c3843] dark:text-cyan-400" />
                      <div>
                        <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                          Send Direct Email with Attached Audit Report to Finance Manager
                        </h3>
                        <p className="text-xs text-slate-500">
                          Automatically attaches the complete 4-section Excel CSV file + Executive Valuation Table.
                        </p>
                      </div>
                    </div>
                    {emailSentInfo && (
                      <span className="px-3 py-1 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 text-xs font-bold flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4" />
                        Sent to {emailSentInfo.email}
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold uppercase text-slate-600 dark:text-slate-400 mb-1">
                        Finance Manager Email *
                      </label>
                      <input
                        type="email"
                        required
                        value={recipientEmail}
                        onChange={(e) => setRecipientEmail(e.target.value)}
                        placeholder="e.g. finance@office.com"
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-medium text-slate-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold uppercase text-slate-600 dark:text-slate-400 mb-1">
                        Recipient Name
                      </label>
                      <input
                        type="text"
                        value={recipientName}
                        onChange={(e) => setRecipientName(e.target.value)}
                        placeholder="Finance Manager"
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-medium text-slate-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold uppercase text-slate-600 dark:text-slate-400 mb-1">
                        Email Subject
                      </label>
                      <input
                        type="text"
                        value={subject}
                        onChange={(e) => setSubject(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-medium text-slate-900 dark:text-white"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-3">
                    <div className="flex-1">
                      <label className="block text-[11px] font-bold uppercase text-slate-600 dark:text-slate-400 mb-1">
                        Covering Note for Finance Manager
                      </label>
                      <input
                        type="text"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-700 dark:text-slate-300"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={isSendingEmail}
                      className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#0c3843] hover:bg-[#082931] text-white text-xs font-bold shadow-md transition-all cursor-pointer shrink-0 disabled:opacity-50"
                    >
                      {isSendingEmail ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Send className="w-4 h-4" />
                      )}
                      <span>Send Report via Email</span>
                    </button>
                  </div>
                </form>
              ) : (
                <div className="p-4 rounded-2xl border border-amber-200 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-950/20 flex items-start gap-3 text-xs text-amber-900 dark:text-amber-200">
                  <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <strong className="block font-bold">
                      {isTrialPlan ? "30-Day Trial — Preview Only" : "Standard Plan — CSV Download"}
                    </strong>
                    <p className="text-slate-600 dark:text-slate-300 leading-relaxed text-[11px]">
                      {isTrialPlan
                        ? "This evaluation license can view the finance dossier on screen. CSV download, PDF, and direct email are not included. Upgrade to Standard for CSV, or Enterprise for PDF and email."
                        : "CSV download is included on Standard. Print / PDF and direct email to the finance manager are Enterprise features."}
                    </p>
                  </div>
                </div>
              )}

              <div className="p-4 rounded-2xl border border-[#0c3843]/15 bg-[#0c3843]/[0.04] text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                <p className="font-bold text-slate-900 dark:text-white mb-1">What finance usually asks</p>
                <p>
                  Bought into store → given to staff → faulty / sent to vendor (spend) → still available in store.
                  Use this pack when you need approval for new stock.
                </p>
                <p className="mt-2 font-mono text-[11px] text-slate-600 dark:text-slate-400">
                  In store {dossier.kpis.total_in_store} · With staff {dossier.kpis.total_assigned} · Faulty{" "}
                  {dossier.kpis.total_faulty} · At vendor {dossier.kpis.total_at_vendor} · Repair spend $
                  {dossier.kpis.total_repair_spend.toLocaleString()}
                </p>
              </div>

              {/* 6-Bucket Executive Summary Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <div className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950">
                  <span className="text-[10px] font-bold uppercase text-slate-500">Total Units Owned</span>
                  <div className="text-xl font-extrabold text-slate-900 dark:text-white mt-1">
                    {dossier.kpis.total_units_owned}
                  </div>
                  <span className="text-[11px] text-slate-500">{dossier.kpis.total_skus} Product Types</span>
                </div>

                <div className="p-3.5 rounded-2xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/50 dark:bg-emerald-950/20">
                  <span className="text-[10px] font-bold uppercase text-emerald-700 dark:text-emerald-400">
                    In IT Store (Available)
                  </span>
                  <div className="text-xl font-extrabold text-emerald-700 dark:text-emerald-400 mt-1">
                    {dossier.kpis.total_in_store}
                  </div>
                  <span className="text-[11px] text-emerald-600/80">
                    ${dossier.kpis.in_store_valuation.toLocaleString()} value
                  </span>
                </div>

                <div className="p-3.5 rounded-2xl border border-blue-200 dark:border-blue-900/50 bg-blue-50/50 dark:bg-blue-950/20">
                  <span className="text-[10px] font-bold uppercase text-blue-700 dark:text-blue-400">
                    Assigned to Staff
                  </span>
                  <div className="text-xl font-extrabold text-blue-700 dark:text-blue-400 mt-1">
                    {dossier.kpis.total_assigned}
                  </div>
                  <span className="text-[11px] text-blue-600/80">
                    ${dossier.kpis.assigned_valuation.toLocaleString()} value
                  </span>
                </div>

                <div className="p-3.5 rounded-2xl border border-rose-200 dark:border-rose-900/50 bg-rose-50/50 dark:bg-rose-950/20">
                  <span className="text-[10px] font-bold uppercase text-rose-700 dark:text-rose-400">
                    Faulty / Damaged
                  </span>
                  <div className="text-xl font-extrabold text-rose-700 dark:text-rose-400 mt-1">
                    {dossier.kpis.total_faulty}
                  </div>
                  <span className="text-[11px] text-rose-600/80">Needs repair action</span>
                </div>

                <div className="p-3.5 rounded-2xl border border-amber-200 dark:border-amber-900/50 bg-amber-50/50 dark:bg-amber-950/20">
                  <span className="text-[10px] font-bold uppercase text-amber-700 dark:text-amber-400">
                    At Vendor Repair
                  </span>
                  <div className="text-xl font-extrabold text-amber-700 dark:text-amber-400 mt-1">
                    {dossier.kpis.total_at_vendor}
                  </div>
                  <span className="text-[11px] text-amber-600/80">With external vendor</span>
                </div>

                <div className="p-3.5 rounded-2xl border border-purple-200 dark:border-purple-900/50 bg-purple-50/50 dark:bg-purple-950/20">
                  <span className="text-[10px] font-bold uppercase text-purple-700 dark:text-purple-400">
                    Repaired & Returned
                  </span>
                  <div className="text-xl font-extrabold text-purple-700 dark:text-purple-400 mt-1">
                    {dossier.kpis.total_repaired_count}
                  </div>
                  <span className="text-[11px] text-purple-600/80">
                    Spend: ${dossier.kpis.total_repair_spend.toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Product-by-Product Table */}
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                <div className="px-4 py-3 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                  <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-200 flex items-center gap-2">
                    <Package className="w-4 h-4 text-[#0c3843] dark:text-cyan-400" />
                    <span>All Office IT Products — Complete Status & Valuation</span>
                  </h4>
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Gross ${dossier.kpis.total_asset_valuation.toLocaleString()}
                    {typeof dossier.kpis.total_net_book_value === "number" && (
                      <> · NBV ${dossier.kpis.total_net_book_value.toLocaleString()}</>
                    )}
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-100/60 dark:bg-slate-900/40 text-[10px] font-bold uppercase text-slate-500">
                        <th className="py-2.5 px-3">Item / SKU</th>
                        <th className="py-2.5 px-3">Category</th>
                        <th className="py-2.5 px-3">Cost Center</th>
                        <th className="py-2.5 px-3 text-center">Total Owned</th>
                        <th className="py-2.5 px-3 text-center text-emerald-700">In Store</th>
                        <th className="py-2.5 px-3 text-center text-blue-700">Assigned</th>
                        <th className="py-2.5 px-3 text-center text-rose-700">Faulty</th>
                        <th className="py-2.5 px-3 text-center text-amber-700">At Vendor</th>
                        <th className="py-2.5 px-3 text-center text-purple-700">Repaired</th>
                        <th className="py-2.5 px-3 text-right">Gross</th>
                        <th className="py-2.5 px-3 text-right">NBV</th>
                        <th className="py-2.5 px-3 text-right">Repair Spend</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {dossier.items.map((it) => (
                        <tr key={it.item_id} className="hover:bg-slate-50/80 dark:hover:bg-slate-900/40">
                          <td className="py-2.5 px-3">
                            <div className="font-bold text-slate-900 dark:text-white">{it.name}</div>
                            <div className="text-[10px] font-mono text-slate-400">{it.sku}</div>
                          </td>
                          <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400">{it.category}</td>
                          <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400">{it.cost_center || "—"}</td>
                          <td className="py-2.5 px-3 text-center font-extrabold">{it.total_owned}</td>
                          <td className="py-2.5 px-3 text-center font-bold text-emerald-600">{it.in_store}</td>
                          <td className="py-2.5 px-3 text-center font-bold text-blue-600">{it.assigned}</td>
                          <td className="py-2.5 px-3 text-center font-bold text-rose-600">{it.faulty}</td>
                          <td className="py-2.5 px-3 text-center font-bold text-amber-600">{it.at_vendor}</td>
                          <td className="py-2.5 px-3 text-center font-bold text-purple-600">{it.repaired_count}</td>
                          <td className="py-2.5 px-3 text-right font-semibold">
                            ${it.total_valuation.toLocaleString()}
                          </td>
                          <td className="py-2.5 px-3 text-right font-semibold text-[#0c3843]">
                            ${(it.net_book_value ?? it.total_valuation).toLocaleString()}
                          </td>
                          <td className="py-2.5 px-3 text-right font-semibold text-rose-600">
                            ${it.repair_spend.toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
