"use client";

import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  HelpCircle,
  X,
  BookOpen,
  Package,
  ArrowDownLeft,
  Printer,
  Barcode,
  ShieldCheck,
  SlidersHorizontal,
  Users,
  FileSpreadsheet,
  CheckCircle2,

  Zap,
  Boxes,
  Keyboard,
  Info,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface HelpGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function HelpGuideModal({ isOpen, onClose }: HelpGuideModalProps) {
  const [activeTab, setActiveTab] = useState<"quickstart" | "pages" | "barcode" | "shortcuts">("quickstart");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!isOpen || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
      <div className="w-full max-w-3xl bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/60 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-teal-500/10 text-[#0c3843] dark:text-teal-400 flex items-center justify-center border border-teal-500/20">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                <span>Office IT Inventory User Guide &amp; Walkthrough</span>
                <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  Office IT Manual
                </span>
              </h2>
              <p className="text-[11px] text-slate-400">
                Complete guide for Office IT assets, Employee e-Signature Handovers, Vendor Repairs, and Finance Reports.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-1 px-6 pt-3 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0 text-xs font-semibold overflow-x-auto">
          <button
            onClick={() => setActiveTab("quickstart")}
            className={cn(
              "px-3 py-2 border-b-2 transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap",
              activeTab === "quickstart"
                ? "border-[#0c3843] dark:border-teal-400 text-[#0c3843] dark:text-teal-400 font-bold"
                : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
            )}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Quick Start (4 Steps)</span>
          </button>

          <button
            onClick={() => setActiveTab("pages")}
            className={cn(
              "px-3 py-2 border-b-2 transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap",
              activeTab === "pages"
                ? "border-[#0c3843] dark:border-teal-400 text-[#0c3843] dark:text-teal-400 font-bold"
                : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
            )}
          >
            <Boxes className="w-3.5 h-3.5" />
            <span>Page Directory</span>
          </button>

          <button
            onClick={() => setActiveTab("barcode")}
            className={cn(
              "px-3 py-2 border-b-2 transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap",
              activeTab === "barcode"
                ? "border-[#0c3843] dark:border-teal-400 text-[#0c3843] dark:text-teal-400 font-bold"
                : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
            )}
          >
            <Barcode className="w-3.5 h-3.5" />
            <span>Barcode &amp; Asset Tags</span>
          </button>

          <button
            onClick={() => setActiveTab("shortcuts")}
            className={cn(
              "px-3 py-2 border-b-2 transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap",
              activeTab === "shortcuts"
                ? "border-[#0c3843] dark:border-teal-400 text-[#0c3843] dark:text-teal-400 font-bold"
                : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
            )}
          >
            <Keyboard className="w-3.5 h-3.5" />
            <span>Keyboard Shortcuts</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-4 text-xs text-slate-600 dark:text-slate-300 flex-1">
          {/* TAB 1: QUICK START */}
          {activeTab === "quickstart" && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-2xl bg-teal-50 dark:bg-teal-950/30 border border-teal-200 dark:border-teal-800/50 flex items-start gap-3">
                <Info className="w-4 h-4 text-[#0c3843] dark:text-teal-400 shrink-0 mt-0.5" />
                <p className="text-[11px] leading-relaxed text-slate-700 dark:text-slate-300">
                  This platform is purpose-built for <strong>Office IT Asset &amp; Inventory Lifecycle Management</strong>. Track Total Owned, In Store Available, Assigned to Employees (with Employee ID &amp; Online Signature), Defective Hardware, Sent to Vendor for Repair, and Repaired &amp; Returned:
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {/* Step 1 */}
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-[#0c3843] text-white font-bold flex items-center justify-center text-xs">
                      1
                    </span>
                    <h4 className="font-bold text-slate-900 dark:text-white text-xs">
                      Add Office IT &amp; Custom Products
                    </h4>
                  </div>
                  <p className="text-[11px] text-slate-500 leading-normal">
                    Open <strong>Hardware Asset Catalog</strong> and click <strong>&quot;Add Custom Product&quot;</strong>. Add Laptops, LCD Monitors, Mice, Keyboards, Networking Gear, or any custom office item.
                  </p>
                </div>

                {/* Step 2 */}
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-indigo-600 text-white font-bold flex items-center justify-center text-xs">
                      2
                    </span>
                    <h4 className="font-bold text-slate-900 dark:text-white text-xs">
                      Assign to Employee (ID + Online Signature)
                    </h4>
                  </div>
                  <p className="text-[11px] text-slate-500 leading-normal">
                    Open <strong>Employee Handover &amp; Sign</strong>. Enter Employee Name, <strong>Employee ID</strong> (e.g. EMP-1042), Department, Serial Number, and capture their <strong>Online Digital Signature</strong>.
                  </p>
                </div>

                {/* Step 3 */}
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-amber-600 text-white font-bold flex items-center justify-center text-xs">
                      3
                    </span>
                    <h4 className="font-bold text-slate-900 dark:text-white text-xs">
                      Track Defective &amp; Vendor Repairs
                    </h4>
                  </div>
                  <p className="text-[11px] text-slate-500 leading-normal">
                    Open <strong>Faulty &amp; Vendor Repairs</strong> to log damaged equipment, send items to an external repair vendor, and receive them back into available store stock once repaired.
                  </p>
                </div>

                {/* Step 4 */}
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-emerald-600 text-white font-bold flex items-center justify-center text-xs">
                      4
                    </span>
                    <h4 className="font-bold text-slate-900 dark:text-white text-xs">
                      Download or Email Finance Manager Report
                    </h4>
                  </div>
                  <p className="text-[11px] text-slate-500 leading-normal">
                    Click <strong>&quot;Finance Manager Report (Download / Email)&quot;</strong> on the Dashboard or Catalog to download the complete 4-section Excel CSV report or email it directly to your Finance Manager.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: PAGE DIRECTORY */}
          {activeTab === "pages" && (
            <div className="space-y-3">
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-start gap-3">
                <Package className="w-4 h-4 text-[#0c3843] dark:text-teal-400 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-slate-900 dark:text-white">IT Assets &amp; Custom Items (/products)</h4>
                  <p className="text-[11px] text-slate-500">
                    Master catalog of all Office IT hardware and custom office items showing all 6 lifecycle buckets (Total Owned, In Store, Assigned, Faulty, At Vendor, Repaired).
                  </p>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-start gap-3">
                <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-slate-900 dark:text-white">Employee Handover &amp; Sign (/custody)</h4>
                  <p className="text-[11px] text-slate-500">
                    Issue Laptops, Monitors, Mice, Keyboards, or Custom Items to employees with Employee ID and Online Digital Signature. Print signed handover certificates and process returns.
                  </p>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-start gap-3">
                <SlidersHorizontal className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-slate-900 dark:text-white">Faulty &amp; Vendor Repairs (/adjustments)</h4>
                  <p className="text-[11px] text-slate-500">
                    Complete 3-stage repair tracker: Log Defective item &rarr; Send to Repair Vendor &rarr; Receive Repaired item back into Office IT Store Room.
                  </p>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-start gap-3">
                <ArrowDownLeft className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-slate-900 dark:text-white">Add New Stock / Procurement (/stock-in)</h4>
                  <p className="text-[11px] text-slate-500">
                    Record new hardware purchases and vendor deliveries to increase Office IT Store Room inventory and print Purchase Order receipts.
                  </p>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-start gap-3">
                <Users className="w-4 h-4 text-purple-600 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-slate-900 dark:text-white">Vendors &amp; Staff Directory (/contacts)</h4>
                  <p className="text-[11px] text-slate-500">
                    Maintain contact records for IT Hardware Suppliers, Repair Centers, and Office Employees / Departments.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: BARCODE GUIDE */}
          {activeTab === "barcode" && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800/50 space-y-2">
                <h4 className="font-bold text-indigo-900 dark:text-indigo-200 flex items-center gap-2">
                  <Barcode className="w-4 h-4" />
                  <span>Hardware Barcode Scanners (Gun Integration)</span>
                </h4>
                <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                  The software is fully compatible with USB and Bluetooth handheld optical barcode scanners (Honeywell, Zebra, Datalogic, Generic USB wedge scanners). No specialized drivers are needed—simply plug in the scanner and point it at any sticker. The system detects input, beeps for confirmation, and automatically loads the item.
                </p>
              </div>

              <div className="space-y-2">
                <h4 className="font-bold text-slate-900 dark:text-white text-xs">Supported Printing Formats:</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                    <span className="font-bold text-slate-900 dark:text-white block">1. Thermal Roll Printer (50mm x 30mm)</span>
                    <span className="text-[11px] text-slate-500 block mt-1">
                      Designed for dedicated POS roll label printers (Xprinter, Zebra, TSC). Prints individual labels sequentially.
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                    <span className="font-bold text-slate-900 dark:text-white block">2. Standard A4 Sheets (24 / 30 Labels)</span>
                    <span className="text-[11px] text-slate-500 block mt-1">
                      Designed for standard laser or inkjet printers using pre-cut A4 adhesive label sheets (3x8 or 3x10 grid).
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: SHORTCUTS */}
          {activeTab === "shortcuts" && (
            <div className="space-y-3">
              <p className="text-[11px] text-slate-500">
                Use these keyboard shortcuts for fast, hands-free navigation:
              </p>

              <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                <div className="flex items-center justify-between p-3 bg-white dark:bg-slate-950">
                  <span className="font-medium text-slate-700 dark:text-slate-300">Focus Global Barcode Search</span>
                  <kbd className="px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono text-[11px] font-bold">
                    Ctrl + K or /
                  </kbd>
                </div>

                <div className="flex items-center justify-between p-3 bg-white dark:bg-slate-950">
                  <span className="font-medium text-slate-700 dark:text-slate-300">Submit Barcode Scan in Input</span>
                  <kbd className="px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono text-[11px] font-bold">
                    Enter
                  </kbd>
                </div>

                <div className="flex items-center justify-between p-3 bg-white dark:bg-slate-950">
                  <span className="font-medium text-slate-700 dark:text-slate-300">Close Open Modal or Dialog</span>
                  <kbd className="px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono text-[11px] font-bold">
                    Esc
                  </kbd>
                </div>

                <div className="flex items-center justify-between p-3 bg-white dark:bg-slate-950">
                  <span className="font-medium text-slate-700 dark:text-slate-300">Print Barcode Labels Dialog</span>
                  <kbd className="px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono text-[11px] font-bold">
                    Ctrl + P
                  </kbd>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex items-center justify-between shrink-0">
          <span className="text-[11px] text-slate-400">
            Tip: Always use unique reference codes for inventory movements.
          </span>

          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-[#0c3843] hover:bg-[#082931] text-white font-bold text-xs shadow-md shadow-[#0c3843]/20 transition-all cursor-pointer"
          >
            Got It (Close)
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
