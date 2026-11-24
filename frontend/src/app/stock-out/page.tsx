"use client";

import React, { useState, useEffect, useMemo, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  AlertCircle,
  CheckCircle2,
  Users,
  Minus,
  Loader2,
  Barcode,
  Search,
  RotateCw,
  HelpCircle,
  X,
  ChevronLeft,
  ChevronRight,
  Download,
  RotateCcw,
  Building2,
  Calendar,
  Send,
  FileText,
  PackageMinus,
} from "lucide-react";
import { useInventory, Product } from "@/lib/inventory-store";
import { useToast } from "@/components/ui/toast";
import { BarcodeScannerInput } from "@/components/barcode/barcode-scanner-input";
import { SalesInvoiceModal, InvoiceData } from "@/components/documents/sales-invoice-modal";
import { sanitizeCSVCell, downloadCSV } from "@/lib/export-csv";
import { cn } from "@/lib/utils";
import { useRequireCompanyAdmin } from "@/lib/use-require-company-admin";
import { ModalPortal } from "@/components/ui/modal-portal";

/** Cables / chargers / toner / adapters — not returnable assets (those use Assigned to staff). */
function isConsumableForStaffIssue(p: { category?: string; name?: string; sku?: string }) {
  const hay = `${p.category || ""} ${p.name || ""} ${p.sku || ""}`.toLowerCase();
  const asset =
    /laptop|macbook|notebook|chromebook|monitor|display|ultrasharp|desktop|workstation|imac|phone|iphone|ipad|tablet|dock/.test(
      hay
    );
  if (asset) return false;
  return /cable|charger|adapter|toner|cartridge|ink|consumable|hdmi|usb-c|usb c|power brick|mouse|keyboard|headset|webcam/.test(
    hay
  ) || /cables|consumables|peripherals/.test((p.category || "").toLowerCase());
}

export default function StockOutSalesPage() {
  return (
    <Suspense fallback={<div className="p-8 text-xs text-slate-400">Loading issue ledger…</div>}>
      <StockOutContent />
    </Suspense>
  );
}

function StockOutContent() {
  useRequireCompanyAdmin();
  const searchParams = useSearchParams();
  const { products, movements, contacts, stockOut, isBackendConnected, refetch } = useInventory();
  const { toast } = useToast();

  // Dialog & Modal State
  const [isDispatchModalOpen, setIsDispatchModalOpen] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [activeInvoice, setActiveInvoice] = useState<InvoiceData | null>(null);
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [lastCompletedSale, setLastCompletedSale] = useState<InvoiceData | null>(null);

  // Form State inside Modal
  const [selectedProductId, setSelectedProductId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [recipientName, setRecipientName] = useState("");
  const [reference, setReference] = useState(`DSP-${Date.now().toString().slice(-4)}`);
  const [unitPrice, setUnitPrice] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Search & Filter State
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedRecipientFilter, setSelectedRecipientFilter] = useState("ALL");

  // Pagination State (15 items default)
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);

  // Give-to-staff is for consumables only (cables/chargers/toner/adapters) — not returnable assets.
  const consumableProducts = useMemo(
    () => products.filter((p) => isConsumableForStaffIssue(p)),
    [products]
  );

  // If redirected with ?productId=... or ?action=new, auto-open the modal
  useEffect(() => {
    const pId = searchParams.get("productId");
    const action = searchParams.get("action");
    if (pId) {
      const allowed = products.find((p) => p.id === pId && isConsumableForStaffIssue(p));
      if (allowed) {
        setSelectedProductId(allowed.id);
        setIsDispatchModalOpen(true);
      } else if (action === "new" || pId) {
        setIsDispatchModalOpen(true);
        if (pId && !allowed) {
          toast({
            title: "Use Assigned to staff",
            description: "Laptops/monitors need e-sign custody. Give to staff is for cables, chargers, toner, and adapters.",
            variant: "destructive",
          });
        }
      }
    } else if (action === "new") {
      setIsDispatchModalOpen(true);
    }
  }, [searchParams, products, toast]);

  // Set default consumable when products load
  useEffect(() => {
    if (consumableProducts.length === 0) {
      if (selectedProductId) setSelectedProductId("");
      return;
    }
    const stillValid = consumableProducts.some((p) => p.id === selectedProductId);
    if (!selectedProductId || !stillValid) {
      setSelectedProductId(consumableProducts[0].id);
    }
  }, [consumableProducts, selectedProductId]);

  // Set default recipient from contacts if available
  const recipients = contacts.filter((c) => c.type === "CUSTOMER");
  useEffect(() => {
    if (recipients.length > 0 && !recipientName) {
      setRecipientName(recipients[0].name);
    }
  }, [recipients, recipientName]);

  // Reset pagination to page 1 on search or filter change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedRecipientFilter]);

  const selectedProduct = products.find((p) => p.id === selectedProductId);

  const handleBarcodeScan = (scannedProduct: Product) => {
    if (!isConsumableForStaffIssue(scannedProduct)) {
      toast({
        title: "Not a consumable",
        description: "Use Assigned to staff for laptops, monitors, and docks (e-sign + return).",
        variant: "destructive",
      });
      return;
    }
    if (scannedProduct.id === selectedProductId) {
      const currentQty = parseInt(quantity, 10) || 0;
      setQuantity((currentQty + 1).toString());
    } else {
      setSelectedProductId(scannedProduct.id);
      setQuantity("1");
    }
    toast({
      title: "Barcode Scanned",
      description: `Selected ${scannedProduct.name} (${scannedProduct.sku})`,
      variant: "default",
    });
  };

  const qtyNum = parseInt(quantity, 10) || 0;
  const currentOnHand = selectedProduct?.currentStock || 0;
  const isOverStock = Boolean(selectedProduct && qtyNum > currentOnHand);
  const effectivePrice = unitPrice ? parseFloat(unitPrice) || 0 : selectedProduct?.price || 0;
  const remainingStock = Math.max(0, currentOnHand - qtyNum);
  const totalDispatchValue = qtyNum * effectivePrice;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProductId || qtyNum <= 0) {
      toast({
        title: "Invalid Input",
        description: "Please select an item and enter a valid quantity greater than 0.",
        variant: "destructive",
      });
      return;
    }
    if (!selectedProduct || !isConsumableForStaffIssue(selectedProduct)) {
      toast({
        title: "Consumables only",
        description: "Give to staff is for cables, chargers, toner, and adapters. Use Assigned to staff for assets.",
        variant: "destructive",
      });
      return;
    }

    if (isOverStock) {
      toast({
        title: "Insufficient Stock",
        description: `Cannot dispatch ${qtyNum} units. You only have ${currentOnHand} units in store.`,
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const refCode = reference.trim() || `DSP-${Date.now().toString().slice(-4)}`;
      const departmentOrStaff = recipientName.trim() || "General Office Department";

      const res = await stockOut({
        productId: selectedProductId,
        quantity: qtyNum,
        customerName: departmentOrStaff,
        reference: refCode,
        unitPrice: unitPrice ? parseFloat(unitPrice) : undefined,
      });

      if (res.success) {
        const uPrice = unitPrice ? parseFloat(unitPrice) : selectedProduct?.price || 0;
        const totalVal = qtyNum * uPrice;

        const invoiceObj: InvoiceData = {
          invoiceNumber: `DSP-${refCode.replace(/^DSP-?|^INV-?|^SO-?/, "") || Date.now().toString().slice(-4)}`,
          customerName: departmentOrStaff,
          date: new Date().toISOString(),
          items: [
            {
              sku: selectedProduct?.sku || "SKU-PROD",
              name: selectedProduct?.name || "Office IT Item",
              quantity: qtyNum,
              unitPrice: uPrice,
              total: totalVal,
            },
          ],
          grandTotal: totalVal,
          paymentStatus: "PAID",
          paymentMethod: "Departmental Requisition / Dispatched",
        };

        setLastCompletedSale(invoiceObj);
        setIsDispatchModalOpen(false);
        setShowSuccessDialog(true);

        toast({
          title: "Consumables issued",
          description: `Issued ${qtyNum} ${selectedProduct?.unit || "units"} of "${selectedProduct?.name}" to ${departmentOrStaff}.`,
          variant: "success",
        });

        setQuantity("1");
        setReference(`DSP-${Date.now().toString().slice(-4)}`);
        setUnitPrice("");
      } else {
        toast({
          title: "Issue failed",
          description: res.error || "Could not record outward dispatch.",
          variant: "destructive",
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Outward Movements
  const outMovements = movements.filter((m) => m.type === "OUT");
  const totalUnitsDispatched = outMovements.reduce((acc, m) => acc + (m.quantity || 0), 0);

  // Extract unique recipient names
  const uniqueRecipients = Array.from(
    new Set(
      outMovements
        .map((m) => m.partyName?.trim())
        .filter((name): name is string => Boolean(name && name.length > 0))
    )
  );

  // Filtered History
  const filteredHistory = outMovements.filter((m) => {
    const q = searchTerm.toLowerCase().trim();
    const matchesSearch =
      !q ||
      m.reference.toLowerCase().includes(q) ||
      m.productName.toLowerCase().includes(q) ||
      m.sku.toLowerCase().includes(q) ||
      (m.partyName && m.partyName.toLowerCase().includes(q));

    const matchesRecipient =
      selectedRecipientFilter === "ALL" ||
      (m.partyName || "Office Operations").toLowerCase() === selectedRecipientFilter.toLowerCase();

    return matchesSearch && matchesRecipient;
  });

  // Pagination Calculations (15 items default)
  const totalPages = Math.ceil(filteredHistory.length / pageSize) || 1;
  const validCurrentPage = Math.min(Math.max(currentPage, 1), totalPages);
  const startIndex = (validCurrentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, filteredHistory.length);
  const paginatedHistory = filteredHistory.slice(startIndex, endIndex);

  const isFiltered = searchTerm !== "" || selectedRecipientFilter !== "ALL";

  // Export Outward Dispatches to CSV
  const handleExportCSV = () => {
    const headers = [
      "Issue / Ref #",
      "Date",
      "Time",
      "Item Description",
      "SKU",
      "Category",
      "Recipient Dept / Staff",
      "Quantity Issued",
      "Unit",
      "Unit Cost ($)",
      "Total Value ($)",
    ];

    const rows = filteredHistory.map((m) => {
      const p = products.find((x) => x.sku === m.sku || x.name === m.productName);
      const date = new Date(m.timestamp);
      const dateStr = date.toLocaleDateString();
      const timeStr = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      const unitP = p?.price || 0;
      const totalVal = ((m.quantity || 0) * unitP).toFixed(2);

      return [
        sanitizeCSVCell(m.reference),
        sanitizeCSVCell(dateStr),
        sanitizeCSVCell(timeStr),
        sanitizeCSVCell(m.productName),
        sanitizeCSVCell(m.sku),
        sanitizeCSVCell(p?.category || "General Consumables"),
        sanitizeCSVCell(m.partyName || "Office Staff"),
        sanitizeCSVCell(m.quantity),
        sanitizeCSVCell(p?.unit || "units"),
        sanitizeCSVCell(unitP.toFixed(2)),
        sanitizeCSVCell(totalVal),
      ].join(",");
    });

    const csv = [headers.map(sanitizeCSVCell).join(","), ...rows].join("\r\n");
    const today = new Date().toISOString().split("T")[0];
    downloadCSV(csv, `office_consumables_dispatch_ledger_${today}.csv`);

    toast({
      title: "Issue ledger exported",
      description: `Exported ${filteredHistory.length} issue records to CSV.`,
      variant: "success",
    });
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12 page-enter">
      <div className="page-hero space-y-2.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-[#0c3843]/10 text-[#0c3843] dark:text-cyan-300 flex items-center justify-center shrink-0 border border-[#0c3843]/20">
              <PackageMinus className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 dark:text-white">
                Give to staff
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 max-w-2xl">
                Issue cables, chargers, toner, or adapters to staff and deduct them from store stock. For laptops and
                monitors, use{" "}
                <Link href="/custody" className="font-semibold text-[#0c3843] dark:text-cyan-300 hover:underline">
                  Assigned to staff
                </Link>{" "}
                (e-sign + return).
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <Link
              href="/contacts?tab=CUSTOMER"
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 text-xs font-semibold"
            >
              <Users className="w-3.5 h-3.5" />
              Staff directory
            </Link>
            <button
              type="button"
              onClick={handleExportCSV}
              disabled={filteredHistory.length === 0}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 text-xs font-semibold disabled:opacity-40"
            >
              <Download className="w-3.5 h-3.5" />
              Export
            </button>
            <button
              type="button"
              onClick={() => setShowGuide((prev) => !prev)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold",
                showGuide
                  ? "border-[#0c3843]/30 bg-[#0c3843]/10 text-[#0c3843] dark:text-cyan-300"
                  : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700"
              )}
            >
              <HelpCircle className="w-3.5 h-3.5" />
              Help
            </button>
            <button
              type="button"
              onClick={() => {
                refetch();
                toast({
                  title: "Ledger synced",
                  description: "Latest consumable issues loaded from the company database.",
                  variant: "success",
                });
              }}
              className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600"
              title="Refresh"
            >
              <RotateCw className="w-4 h-4 text-[#0c3843]" />
            </button>
            <button
              type="button"
              onClick={() => setIsDispatchModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#0c3843] hover:bg-[#082931] text-white text-xs font-bold"
            >
              <Minus className="w-4 h-4 text-cyan-300" />
              Give items
            </button>
          </div>
        </div>
      </div>

      {showGuide && (
        <div className="rounded-2xl border border-[#0c3843]/15 bg-[#0c3843]/[0.04] p-4 text-xs text-slate-600 dark:text-slate-300 flex items-start justify-between gap-3">
          <p>
            Scan or pick a consumable, enter quantity, choose staff/department, then confirm.
            Stock drops immediately and you can print an issue slip. This page is not for sales invoices.
          </p>
          <button type="button" onClick={() => setShowGuide(false)} className="p-1 text-slate-400 hover:text-slate-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 font-semibold">
          <Send className="w-3 h-3 text-[#0c3843]" />
          {outMovements.length} issues
        </span>
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 font-semibold">
          <PackageMinus className="w-3 h-3 text-teal-600" />
          {totalUnitsDispatched.toLocaleString()} units
        </span>
        <Link
          href="/contacts?tab=CUSTOMER"
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 font-semibold hover:border-[#0c3843]/30"
        >
          <Users className="w-3 h-3" />
          {recipients.length} staff
        </Link>
        {!isBackendConnected && (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-amber-200 bg-amber-50 text-amber-700 font-semibold">
            <AlertCircle className="w-3 h-3" />
            Offline mode
          </span>
        )}
      </div>

      <div className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 space-y-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search issue #, item, SKU, or staff…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-9 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 focus:outline-none focus:ring-2 focus:ring-[#0c3843]/20 text-slate-900 dark:text-white"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 p-0.5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs font-semibold text-slate-500 shrink-0">Staff:</span>
            <select
              value={selectedRecipientFilter}
              onChange={(e) => setSelectedRecipientFilter(e.target.value)}
              className="px-3 py-2 text-xs font-semibold rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 focus:outline-none focus:ring-2 focus:ring-[#0c3843]/20 text-slate-900 dark:text-white"
            >
              <option value="ALL">All staff ({outMovements.length})</option>
              {uniqueRecipients.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>

            {isFiltered && (
              <button
                type="button"
                onClick={() => {
                  setSearchTerm("");
                  setSelectedRecipientFilter("ALL");
                }}
                className="flex items-center gap-1 px-2.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 text-xs font-semibold"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between text-xs text-slate-500 pt-1 border-t border-slate-100 dark:border-slate-800">
          <span>
            Showing <strong className="text-slate-900 dark:text-white">{filteredHistory.length}</strong> of {outMovements.length} issues
          </span>
          <span className="text-[11px] text-slate-400 hidden sm:inline">
            Open Issue slip on a row to print the voucher
          </span>
        </div>
      </div>

      <div className="surface-panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs min-w-[980px]">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 uppercase font-extrabold text-[10px] tracking-wider">
                <th className="py-3 px-3 text-center w-12 whitespace-nowrap">#</th>
                <th className="py-3 px-4 min-w-[170px] whitespace-nowrap">Issue # / Date</th>
                <th className="py-3 px-4 min-w-[220px] whitespace-nowrap">Item &amp; SKU</th>
                <th className="py-3 px-4 min-w-[180px] whitespace-nowrap">Issued to</th>
                <th className="py-3 px-3 text-center w-28 whitespace-nowrap">Qty</th>
                <th className="py-3 px-4 text-right min-w-[150px] whitespace-nowrap">Book value</th>
                <th className="py-3 px-4 text-right min-w-[130px] whitespace-nowrap">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
              {filteredHistory.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-14 text-center">
                    <div className="flex flex-col items-center justify-center text-slate-400">
                      <div className="w-12 h-12 rounded-2xl bg-[#0c3843]/10 text-[#0c3843] flex items-center justify-center mb-2.5 border border-[#0c3843]/20">
                        <PackageMinus className="w-6 h-6" />
                      </div>
                      <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                        {outMovements.length === 0 ? "No consumables issued yet" : "No matching issues"}
                      </h4>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        {outMovements.length === 0
                          ? "Issue cables, toners, or adapters to staff — this is not a sales screen."
                          : "Clear filters to see the full issue ledger."}
                      </p>
                      <button
                        type="button"
                        onClick={() => setIsDispatchModalOpen(true)}
                        className="mt-3 px-4 py-2 rounded-xl bg-[#0c3843] hover:bg-[#082931] text-white text-xs font-bold inline-flex items-center gap-1.5"
                      >
                        <Minus className="w-4 h-4 text-cyan-300" />
                        <span>Give items</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedHistory.map((m, idx) => {
                  const matchedProd = products.find((p) => p.sku === m.sku || p.name === m.productName);
                  const unitP = matchedProd?.price || 0;
                  const totalLineVal = (m.quantity || 0) * unitP;
                  const continuousSerial = (validCurrentPage - 1) * pageSize + idx + 1;
                  const formattedSerial = continuousSerial < 10 ? `#0${continuousSerial}` : `#${continuousSerial}`;

                  return (
                    <tr
                      key={m.id}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-900/40 transition-colors group"
                    >
                      {/* S.No */}
                      <td className="py-3.5 px-3 text-center font-mono font-bold text-slate-400 text-[11px] whitespace-nowrap">
                        {formattedSerial}
                      </td>

                      {/* Dispatch # + Date */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="font-mono font-bold text-xs text-slate-900 dark:text-white">
                          {m.reference}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono flex items-center gap-1 mt-0.5">
                          <Calendar className="w-3 h-3 text-slate-400 shrink-0" />
                          <span>
                            {new Date(m.timestamp).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })},{" "}
                            {new Date(m.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </div>
                      </td>

                      {/* Item Name + SKU + Category */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="font-bold text-xs text-slate-900 dark:text-white group-hover:text-[#0c3843] dark:group-hover:text-cyan-400 transition-colors">
                          {m.productName}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-500 dark:text-slate-400 font-mono">
                          <span className="text-[#0c3843] dark:text-cyan-400 font-bold">{m.sku}</span>
                          {matchedProd?.category && (
                            <>
                              <span>&bull;</span>
                              <span className="px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 font-sans font-medium text-[10px] text-slate-600 dark:text-slate-300">
                                {matchedProd.category}
                              </span>
                            </>
                          )}
                        </div>
                      </td>

                      {/* Recipient Dept / Staff */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-xs border border-slate-200/60 dark:border-slate-700/60">
                          <Building2 className="w-3 h-3 text-slate-400" />
                          <span>{m.partyName || "Office Operations"}</span>
                        </span>
                      </td>

                      {/* Quantity Issued */}
                      <td className="py-3.5 px-3 text-center whitespace-nowrap">
                        <span className="px-3 py-1 rounded-full text-xs font-black bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/50 dark:text-blue-400 dark:border-blue-800 shadow-2xs inline-flex items-center gap-1">
                          <span>-{m.quantity}</span>
                          <span className="text-[10px] font-medium text-blue-600/80">{matchedProd?.unit || "units"}</span>
                        </span>
                      </td>

                      {/* Book Value */}
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <div className="font-mono font-bold text-xs text-slate-900 dark:text-white">
                          ${totalLineVal.toFixed(2)}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                          @ ${unitP.toFixed(2)} / unit
                        </div>
                      </td>

                      {/* Action: Print Dispatch Slip */}
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => {
                            setActiveInvoice({
                              invoiceNumber: `DSP-${m.reference.replace(/^DSP-?|^INV-?|^SO-?/, "") || m.id.slice(0, 6)}`,
                              customerName: m.partyName || "Office Operations",
                              date: m.timestamp,
                              items: [
                                {
                                  sku: m.sku,
                                  name: m.productName,
                                  quantity: m.quantity,
                                  unitPrice: unitP,
                                  total: totalLineVal,
                                },
                              ],
                              grandTotal: totalLineVal,
                              paymentStatus: "PAID",
                              paymentMethod: "Departmental Requisition / Dispatched",
                            });
                          }}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-[#0c3843] hover:text-white hover:border-[#0c3843] text-slate-700 dark:text-slate-300 font-bold text-xs shadow-xs transition-all cursor-pointer"
                          title="Print issue slip"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          <span>Issue slip</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Clean Pagination Bar */}
        {filteredHistory.length > 0 && (
          <div className="px-5 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/60 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-3 text-slate-500 dark:text-slate-400">
              <span>
                Showing{" "}
                <strong className="text-slate-900 dark:text-white font-bold">
                  {startIndex + 1}
                </strong>{" "}
                to{" "}
                <strong className="text-slate-900 dark:text-white font-bold">
                  {endIndex}
                </strong>{" "}
                of{" "}
                <strong className="text-slate-900 dark:text-white font-bold">
                  {filteredHistory.length}
                </strong>{" "}
                consumable dispatches
              </span>

              <div className="flex items-center gap-1.5 ml-2 pl-3 border-l border-slate-200 dark:border-slate-800">
                <span className="text-slate-400">Per page:</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-[#0c3843]"
                >
                  <option value={15}>15</option>
                  <option value={30}>30</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                  disabled={validCurrentPage === 1}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Previous</span>
                </button>

                <span className="px-3 py-1 text-slate-600 dark:text-slate-400 font-bold font-mono text-[11px]">
                  {validCurrentPage} / {totalPages}
                </span>

                <button
                  type="button"
                  onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                  disabled={validCurrentPage === totalPages}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                >
                  <span>Next</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ========================================================
          6. MODAL: Dispatch Consumables Dialog
         ======================================================== */}
      {isDispatchModalOpen && (
        <ModalPortal>
        <div className="fixed inset-0 z-[100] overflow-y-auto">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
            onClick={() => setIsDispatchModalOpen(false)}
          />

          <div className="flex min-h-full items-center justify-center p-4">
            <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden animate-in zoom-in-95 duration-200">
              {/* Modal Top Header */}
              <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-[#0c3843] text-white">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-cyan-400/20 text-cyan-300 flex items-center justify-center border border-cyan-300/30">
                    <Minus className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-extrabold text-white">
                      Give to staff
                    </h2>
                    <p className="text-xs text-cyan-200/80">
                      Write off store stock to staff — not a sales invoice
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setIsDispatchModalOpen(false)}
                  className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6 space-y-5">
                {/* Section A: Optical Barcode Scanner Input */}
                <div className="space-y-1.5 p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                      <Barcode className="w-4 h-4 text-[#0c3843]" />
                      <span>Barcode scan</span>
                    </label>
                    <span className="text-[10px] font-semibold text-[#0c3843] dark:text-cyan-300 bg-[#0c3843]/10 px-2 py-0.5 rounded-full border border-[#0c3843]/20">
                      Ready
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Scan packaging barcode sticker with scanner gun or type SKU and press Enter:
                  </p>
                  <BarcodeScannerInput
                    products={consumableProducts}
                    onProductScan={handleBarcodeScan}
                    placeholder="Scan consumable barcode (cable / toner / adapter)..."
                  />
                </div>

                <form onSubmit={handleSubmit} className="space-y-4 text-xs">
                  {/* Section B: Product Selection */}
                  <div className="space-y-1.5">
                    <label className="font-bold text-slate-700 dark:text-slate-300">
                      Select Consumable IT Product *
                    </label>

                    <select
                      disabled={isSubmitting || consumableProducts.length === 0}
                      value={selectedProductId}
                      onChange={(e) => setSelectedProductId(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:outline-none focus:ring-2 focus:ring-[#0c3843]/20 text-slate-900 dark:text-white font-medium"
                    >
                      {consumableProducts.length === 0 ? (
                        <option value="">No consumables in catalog (cables, toner, adapters…).</option>
                      ) : (
                        consumableProducts.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} ({p.sku}) &mdash; Available: {p.currentStock} {p.unit}
                          </option>
                        ))
                      )}
                    </select>
                    <p className="text-[10px] text-slate-400">
                      Laptops and monitors are hidden here — issue those from Assigned to staff with e-sign.
                    </p>
                  </div>

                  {/* Section C: Quantity to Issue & Unit Book Value */}
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <label className="font-bold text-slate-700 dark:text-slate-300">
                          Quantity to Issue *
                        </label>
                        <input
                          type="number"
                          min="1"
                          required
                          disabled={isSubmitting}
                          value={quantity}
                          onChange={(e) => setQuantity(e.target.value)}
                          className={cn(
                            "w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border font-mono text-base font-bold outline-none",
                            isOverStock
                              ? "border-rose-500 text-rose-600 focus:ring-2 focus:ring-rose-500/20"
                              : "border-slate-200 dark:border-slate-800 text-blue-600 focus:outline-none focus:ring-2 focus:ring-[#0c3843]/20"
                          )}
                          placeholder="1"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="font-bold text-slate-700 dark:text-slate-300">
                          Book Cost / Unit ($)
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          disabled={isSubmitting}
                          value={unitPrice}
                          onChange={(e) => setUnitPrice(e.target.value)}
                          className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-[#0c3843]/20"
                          placeholder={selectedProduct ? selectedProduct.price.toFixed(2) : "0.00"}
                        />
                      </div>
                    </div>

                    {/* Quick Preset Buttons */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[10px] text-slate-400 font-medium">Quick Presets:</span>
                      {[1, 2, 5, 10, 25].map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setQuantity(preset.toString())}
                          className={cn(
                            "px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all cursor-pointer",
                            quantity === preset.toString()
                              ? "bg-blue-600 text-white border-blue-600 shadow-xs"
                              : "bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
                          )}
                        >
                          {preset} {preset === 1 ? "unit" : "units"}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Overstock Warning Alert (Negative Stock Protection) */}
                  {isOverStock && (
                    <div className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/30 border border-rose-300 dark:border-rose-800 flex items-start gap-2.5 animate-in fade-in duration-200">
                      <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                      <div className="text-xs text-rose-700 dark:text-rose-300 space-y-0.5">
                        <strong className="font-bold">Insufficient Store Room Stock:</strong>
                        <p className="text-[11px] leading-relaxed">
                          You requested to dispatch <strong>{qtyNum} units</strong>, but you only have <strong>{currentOnHand} {selectedProduct?.unit || "units"}</strong> available. Please reduce quantity or receive restock first.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Section D: Recipient Department & Slip Code */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="font-bold text-slate-700 dark:text-slate-300">
                        Recipient Department / Staff *
                      </label>
                      <input
                        type="text"
                        disabled={isSubmitting}
                        value={recipientName}
                        onChange={(e) => setRecipientName(e.target.value)}
                        className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:outline-none focus:ring-2 focus:ring-[#0c3843]/20 text-slate-900 dark:text-white"
                        placeholder="e.g. IT Engineering / Sarah Khan"
                        list="recipients-list"
                      />
                      <datalist id="recipients-list">
                        {recipients.map((c) => (
                          <option key={c.id} value={c.name} />
                        ))}
                      </datalist>
                    </div>

                    <div className="space-y-1.5">
                      <label className="font-bold text-slate-700 dark:text-slate-300">
                        Issue / requisition #
                      </label>
                      <input
                        type="text"
                        disabled={isSubmitting}
                        value={reference}
                        onChange={(e) => setReference(e.target.value)}
                        className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono focus:outline-none focus:ring-2 focus:ring-[#0c3843]/20"
                        placeholder="DSP-1001"
                      />
                    </div>
                  </div>

                  {/* Section E: Live Stock Deduction Preview Card */}
                  {selectedProduct && (
                    <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
                          Store Room Balance &amp; Requisition:
                        </span>
                        <span className="text-[11px] text-slate-500 font-mono">
                          {selectedProduct.sku} &bull; {selectedProduct.name}
                        </span>
                      </div>

                      <div className="grid grid-cols-3 gap-2.5 text-center">
                        <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800">
                          <span className="text-[10px] text-slate-400 block">Available Now</span>
                          <strong className="text-xs text-slate-700 dark:text-slate-300">
                            {currentOnHand} {selectedProduct.unit}
                          </strong>
                        </div>
                        <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20">
                          <span className="text-[10px] text-blue-600 block">- Deducting</span>
                          <strong className="text-xs text-blue-600 font-bold">
                            -{qtyNum} {selectedProduct.unit}
                          </strong>
                        </div>
                        <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                          <span className="text-[10px] text-slate-500 block font-semibold">Remaining</span>
                          <strong className={cn(
                            "text-sm font-extrabold",
                            remainingStock === 0 ? "text-amber-600 dark:text-amber-400" : "text-slate-900 dark:text-white"
                          )}>
                            {remainingStock} {selectedProduct.unit}
                          </strong>
                        </div>
                      </div>

                      {totalDispatchValue > 0 && (
                        <div className="text-xs flex items-center justify-between pt-1 border-t border-slate-200/60 dark:border-slate-800 font-mono">
                          <span className="text-slate-500">Inventory Value Deducted:</span>
                          <strong className="text-sm text-blue-600 dark:text-blue-400 font-extrabold">
                            ${totalDispatchValue.toFixed(2)}
                          </strong>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Modal Footer Controls */}
                  <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                    <button
                      type="button"
                      onClick={() => setIsDispatchModalOpen(false)}
                      disabled={isSubmitting}
                      className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold cursor-pointer"
                    >
                      Cancel
                    </button>

                    <button
                      type="submit"
                      disabled={isSubmitting || consumableProducts.length === 0 || qtyNum <= 0 || isOverStock || !selectedProductId}
                      className="px-5 py-2.5 rounded-xl bg-[#0c3843] hover:bg-[#082931] text-white font-bold shadow-md transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50 text-xs"
                    >
                      {isSubmitting ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="w-4 h-4 text-cyan-300" />
                      )}
                      <span>
                        {isSubmitting
                          ? "Issuing…"
                          : `Confirm issue · ${qtyNum} ${selectedProduct?.unit || "units"}`}
                      </span>
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
        </ModalPortal>
      )}

      {/* Dispatch Slip Modal */}
      {activeInvoice && (
        <SalesInvoiceModal
          invoice={activeInvoice}
          isOpen={!!activeInvoice}
          onClose={() => setActiveInvoice(null)}
        />
      )}

      {/* Completion Modal */}
      {showSuccessDialog && lastCompletedSale && (
        <SalesInvoiceModal
          invoice={lastCompletedSale}
          isOpen={showSuccessDialog}
          onClose={() => setShowSuccessDialog(false)}
        />
      )}
    </div>
  );
}
