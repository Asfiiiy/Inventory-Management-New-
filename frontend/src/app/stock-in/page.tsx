"use client";

import React, { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowDownLeft,
  Package,
  Truck,
  CheckCircle2,
  Calendar,
  Layers,
  ArrowRight,
  Plus,
  Loader2,
  Barcode,
  Printer,
  Building2,
  Info,
  DollarSign,
  TrendingUp,
  Search,
  RotateCw,
  HelpCircle,
  X,
  ChevronLeft,
  ChevronRight,
  Filter,
  Download,
  RotateCcw,
  ScanLine,
} from "lucide-react";
import { useInventory, Product, StockMovement } from "@/lib/inventory-store";
import { useToast } from "@/components/ui/toast";
import { BarcodeScannerInput } from "@/components/barcode/barcode-scanner-input";
import { PurchaseOrderModal, PurchaseOrderData } from "@/components/documents/purchase-order-modal";
import { sanitizeCSVCell, downloadCSV } from "@/lib/export-csv";
import { cn } from "@/lib/utils";
import { useRequireCompanyAdmin } from "@/lib/use-require-company-admin";
import { ModalPortal } from "@/components/ui/modal-portal";

export default function StockInPurchasesPage() {
  return (
    <Suspense fallback={<div className="p-8 text-xs text-slate-400">Loading Stock In...</div>}>
      <StockInContent />
    </Suspense>
  );
}

function StockInContent() {
  useRequireCompanyAdmin();
  const searchParams = useSearchParams();
  const { products, movements, contacts, stockIn, isBackendConnected, refetch } = useInventory();
  const { toast } = useToast();

  // Dialog & Modal State
  const [isRestockModalOpen, setIsRestockModalOpen] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [activePO, setActivePO] = useState<PurchaseOrderData | null>(null);
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [lastCompletedPO, setLastCompletedPO] = useState<PurchaseOrderData | null>(null);

  // Form State inside Modal
  const [selectedProductId, setSelectedProductId] = useState(products[0]?.id || "");
  const [quantity, setQuantity] = useState("10");
  const [supplierName, setSupplierName] = useState("");
  const [reference, setReference] = useState(`PO-${Date.now().toString().slice(-4)}`);
  const [unitCost, setUnitCost] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Search & Filter State
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedSupplierFilter, setSelectedSupplierFilter] = useState("ALL");

  // Pagination State (15 items default)
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);

  // If redirected with ?productId=... or ?action=new, auto-open the modal
  useEffect(() => {
    const pId = searchParams.get("productId");
    const action = searchParams.get("action");
    if (pId) {
      setSelectedProductId(pId);
      setIsRestockModalOpen(true);
    } else if (action === "new") {
      setIsRestockModalOpen(true);
    }
  }, [searchParams]);

  // Set default product when products load
  useEffect(() => {
    if (!selectedProductId && products.length > 0) {
      setSelectedProductId(products[0].id);
    }
  }, [products, selectedProductId]);

  // Set default supplier if available
  const suppliers = contacts.filter((c) => c.type === "SUPPLIER");
  useEffect(() => {
    if (suppliers.length > 0 && !supplierName) {
      setSupplierName(suppliers[0].name);
    }
  }, [suppliers, supplierName]);

  // Reset pagination to page 1 on search or filter change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedSupplierFilter]);

  const selectedProduct = products.find((p) => p.id === selectedProductId);

  const handleBarcodeScan = (scannedProduct: Product) => {
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

  const qtyNumber = parseInt(quantity, 10) || 0;
  const effectiveCost = unitCost ? parseFloat(unitCost) || 0 : selectedProduct?.cost || 0;
  const currentOnHand = selectedProduct?.currentStock || 0;
  const projectedStock = currentOnHand + qtyNumber;
  const totalPurchaseValue = qtyNumber * effectiveCost;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProductId || qtyNumber <= 0) {
      toast({
        title: "Invalid Input",
        description: "Please select a product and enter a valid quantity greater than 0.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const refCode = reference.trim() || `PO-${Date.now().toString().slice(-4)}`;
      const suppName = supplierName.trim() || "General Supplier";

      const res = await stockIn({
        productId: selectedProductId,
        quantity: qtyNumber,
        supplierName: suppName,
        reference: refCode,
        unitCost: unitCost ? parseFloat(unitCost) : undefined,
      });

      if (res.success) {
        const uCost = unitCost ? parseFloat(unitCost) : selectedProduct?.cost || 0;
        const totalVal = qtyNumber * uCost;

        const poObj: PurchaseOrderData = {
          poNumber: `PO-${refCode.replace(/^PO-?/, "") || Date.now().toString().slice(-4)}`,
          supplierName: suppName,
          date: new Date().toISOString(),
          warehouseName: "Central Storage Warehouse",
          items: [
            {
              sku: selectedProduct?.sku || "SKU-PROD",
              name: selectedProduct?.name || "Inventory Product",
              quantity: qtyNumber,
              unitCost: uCost,
              totalCost: totalVal,
            },
          ],
          grandTotal: totalVal,
          status: "RECEIVED & STORED",
        };

        setLastCompletedPO(poObj);
        setIsRestockModalOpen(false);
        setShowSuccessDialog(true);

        toast({
          title: "Inward Stock Received!",
          description: `Added ${qtyNumber} ${selectedProduct?.unit || "units"} of "${selectedProduct?.name}" to warehouse stock.`,
          variant: "success",
        });

        setQuantity("10");
        setReference(`PO-${Date.now().toString().slice(-4)}`);
        setUnitCost("");
      } else {
        toast({
          title: "Stock In Failed",
          description: res.error || "Could not record inward stock.",
          variant: "destructive",
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Inward Movements
  const inMovements = movements.filter((m) => m.type === "IN");
  const totalUnitsReceived = inMovements.reduce((acc, m) => acc + (m.quantity || 0), 0);

  // Extract unique supplier names
  const uniqueSuppliers = Array.from(
    new Set(
      inMovements
        .map((m) => m.partyName?.trim())
        .filter((name): name is string => Boolean(name && name.length > 0))
    )
  );

  // Filtered History
  const filteredHistory = inMovements.filter((m) => {
    const q = searchTerm.toLowerCase().trim();
    const matchesSearch =
      !q ||
      m.reference.toLowerCase().includes(q) ||
      m.productName.toLowerCase().includes(q) ||
      m.sku.toLowerCase().includes(q) ||
      (m.partyName && m.partyName.toLowerCase().includes(q));

    const matchesSupplier =
      selectedSupplierFilter === "ALL" ||
      (m.partyName || "General Supplier").toLowerCase() === selectedSupplierFilter.toLowerCase();

    return matchesSearch && matchesSupplier;
  });

  // Pagination Calculations (15 items default)
  const totalPages = Math.ceil(filteredHistory.length / pageSize) || 1;
  const validCurrentPage = Math.min(Math.max(currentPage, 1), totalPages);
  const startIndex = (validCurrentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, filteredHistory.length);
  const paginatedHistory = filteredHistory.slice(startIndex, endIndex);

  const isFiltered = searchTerm !== "" || selectedSupplierFilter !== "ALL";

  // Export Inward Records to CSV
  const handleExportCSV = () => {
    const headers = [
      "PO Reference",
      "Date",
      "Time",
      "Product Name",
      "SKU",
      "Category",
      "Supplier / Vendor",
      "Quantity Received",
      "Unit",
      "Unit Cost ($)",
      "Total Value ($)",
    ];

    const rows = filteredHistory.map((m) => {
      const p = products.find((x) => x.sku === m.sku || x.name === m.productName);
      const date = new Date(m.timestamp);
      const dateStr = date.toLocaleDateString();
      const timeStr = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      const unitC = p?.cost || 0;
      const totalVal = ((m.quantity || 0) * unitC).toFixed(2);

      return [
        sanitizeCSVCell(m.reference),
        sanitizeCSVCell(dateStr),
        sanitizeCSVCell(timeStr),
        sanitizeCSVCell(m.productName),
        sanitizeCSVCell(m.sku),
        sanitizeCSVCell(p?.category || "General"),
        sanitizeCSVCell(m.partyName || "General Supplier"),
        sanitizeCSVCell(m.quantity),
        sanitizeCSVCell(p?.unit || "units"),
        sanitizeCSVCell(unitC.toFixed(2)),
        sanitizeCSVCell(totalVal),
      ].join(",");
    });

    const csv = [headers.map(sanitizeCSVCell).join(","), ...rows].join("\r\n");
    const today = new Date().toISOString().split("T")[0];
    downloadCSV(csv, `inward_stock_ledger_${today}.csv`);

    toast({
      title: "Inward Ledger Exported",
      description: `Exported ${filteredHistory.length} delivery receipts to CSV spreadsheet.`,
      variant: "success",
    });
  };

  return (
    <div className="space-y-6 page-enter">
      {/* 1. Page Header & Actions Toolbar (2-Tier Spacious Architecture) */}
      <div className="page-hero space-y-2.5">
        {/* Tier 1: Title & Primary CTA */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-500/20 shadow-2xs">
              <ArrowDownLeft className="w-5 h-5" />
            </div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <div>
                <h1 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 dark:text-white">
                  New stock received
                </h1>
                <p className="text-xs text-slate-500 mt-0.5">
                  Receive new stock from a vendor — it is added to the store.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <Link
              href="/contacts?tab=SUPPLIER"
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 text-xs font-semibold"
            >
              <Building2 className="w-3.5 h-3.5 text-[#0c3843]" />
              Vendors
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
                  ? "border-[#0c3843]/30 bg-[#0c3843]/10 text-[#0c3843]"
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
                  title: "Receipts synced",
                  description: "Latest purchase receipts loaded.",
                  variant: "success",
                });
              }}
              className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
            >
              <RotateCw className="w-4 h-4 text-[#0c3843]" />
            </button>
            <button
              type="button"
              onClick={() => setIsRestockModalOpen(true)}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#0c3843] hover:bg-[#082931] text-white text-xs font-bold"
            >
              <Plus className="w-4 h-4 text-cyan-300" />
              Receive stock
            </button>
          </div>
        </div>
      </div>

      {showGuide && (
        <div className="rounded-2xl border border-[#0c3843]/15 bg-[#0c3843]/[0.04] p-4 text-xs text-slate-600 dark:text-slate-300 flex items-start justify-between gap-3">
          <p>
            Scan or pick an item, enter quantity and unit cost, choose the vendor, then confirm.
            Stock increases immediately and you can print a receipt.
          </p>
          <button type="button" onClick={() => setShowGuide(false)} className="p-1 text-slate-400">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-slate-200 bg-white dark:bg-slate-900 text-slate-600 font-semibold">
          <Truck className="w-3 h-3 text-[#0c3843]" />
          {inMovements.length} receipts
        </span>
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-slate-200 bg-white dark:bg-slate-900 text-slate-600 font-semibold">
          <Package className="w-3 h-3 text-teal-600" />
          +{totalUnitsReceived.toLocaleString()} units
        </span>
        <Link
          href="/contacts?tab=SUPPLIER"
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-slate-200 bg-white dark:bg-slate-900 text-slate-600 font-semibold"
        >
          <Building2 className="w-3 h-3" />
          {suppliers.length} vendors
        </Link>
      </div>

      <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          {/* Search Box */}
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search by PO reference, product name, SKU, or supplier..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-9 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-[#0c3843] focus:ring-2 focus:ring-[#0c3843]/15 outline-none text-slate-900 dark:text-white placeholder:text-slate-400"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 rounded cursor-pointer"
                title="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Supplier Filter Dropdown */}
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <span className="text-xs text-slate-500 shrink-0">Supplier:</span>
            <select
              value={selectedSupplierFilter}
              onChange={(e) => setSelectedSupplierFilter(e.target.value)}
              className="px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-[#0c3843] focus:ring-2 focus:ring-[#0c3843]/15 outline-none text-slate-900 dark:text-white"
            >
              <option value="ALL">All Suppliers ({inMovements.length})</option>
              {uniqueSuppliers.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>

            {isFiltered && (
              <button
                onClick={() => {
                  setSearchTerm("");
                  setSelectedSupplierFilter("ALL");
                }}
                className="flex items-center gap-1 px-2.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-semibold cursor-pointer transition-colors shrink-0"
                title="Reset filters"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset</span>
              </button>
            )}
          </div>
        </div>

        {/* Status Counter Sub-Bar */}
        <div className="flex items-center justify-between text-xs text-slate-500 pt-1 border-t border-slate-100 dark:border-slate-800">
          <span>
            Showing <strong className="text-slate-900 dark:text-white font-bold">{filteredHistory.length}</strong> of {inMovements.length} inward delivery receipts
          </span>
          <span className="text-[11px] text-slate-400 hidden sm:inline">
            Click &apos;Receipt&apos; on any row to preview and print purchase invoice voucher
          </span>
        </div>
      </div>

      {/* 5. Master Inward Restock Ledger Table (Full Width, Spacious, 100% Collision-Free) */}
      <div className="surface-panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-900/80 border-b border-slate-200 dark:border-slate-800 text-slate-500 uppercase font-semibold text-[11px] tracking-wider">
              <tr>
                <th className="px-5 py-3.5 whitespace-nowrap">PO Reference</th>
                <th className="px-5 py-3.5">Product & SKU</th>
                <th className="px-5 py-3.5 whitespace-nowrap">Supplier / Vendor</th>
                <th className="px-4 py-3.5 text-center whitespace-nowrap">Quantity Added</th>
                <th className="px-5 py-3.5 text-right whitespace-nowrap">Unit Cost & Value</th>
                <th className="px-5 py-3.5 text-right whitespace-nowrap w-32">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {filteredHistory.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-slate-400">
                    <div className="max-w-md mx-auto space-y-3">
                      <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center mx-auto border border-emerald-500/20">
                        <Truck className="w-6 h-6" />
                      </div>
                      <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                        {inMovements.length === 0 ? "No Inward Deliveries Recorded Yet" : "No matching delivery receipts"}
                      </h4>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {inMovements.length === 0
                          ? "This list is receipt history. Catalog stock can exist before a receipt is logged. Use Receive New IT Stock for the next delivery."
                          : "Try clearing search filters to see all inward delivery receipts."}
                      </p>
                      <button
                        onClick={() => setIsRestockModalOpen(true)}
                        className="px-4 py-2 rounded-xl bg-[#0c3843] hover:bg-[#082931] text-white text-xs font-semibold shadow-md shadow-[#0c3843]/20 transition-all cursor-pointer inline-flex items-center gap-1.5"
                      >
                        <Plus className="w-4 h-4" />
                        <span>Receive New IT Stock</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedHistory.map((m) => {
                  const matchedProd = products.find((p) => p.sku === m.sku || p.name === m.productName);
                  const unitC = matchedProd?.cost || 0;
                  const totalLineVal = (m.quantity || 0) * unitC;

                  return (
                    <tr
                      key={m.id}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors group"
                    >
                      {/* Column 1: PO Reference + Date */}
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <div className="font-mono font-bold text-xs text-slate-900 dark:text-white">
                          {m.reference}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono flex items-center gap-1 mt-0.5">
                          <Calendar className="w-3 h-3 text-slate-400 shrink-0" />
                          <span>
                            {new Date(m.timestamp).toLocaleDateString([], { month: "short", day: "numeric" })},{" "}
                            {new Date(m.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </div>
                      </td>

                      {/* Column 2: Product Name + SKU + Category */}
                      <td className="px-5 py-3.5">
                        <div className="font-bold text-xs text-slate-900 dark:text-white group-hover:text-[#0c3843] dark:group-hover:text-teal-400 transition-colors">
                          {m.productName}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-500 dark:text-slate-400 font-mono">
                          <span className="text-[#0c3843] dark:text-teal-400 font-bold">{m.sku}</span>
                          {matchedProd?.category && (
                            <>
                              <span>&bull;</span>
                              <span className="px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 font-sans font-medium text-[11px] text-slate-600 dark:text-slate-300">
                                {matchedProd.category}
                              </span>
                            </>
                          )}
                        </div>
                      </td>

                      {/* Column 3: Supplier / Vendor */}
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <span className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium text-xs border border-slate-200/60 dark:border-slate-700/60">
                          {m.partyName || "General Supplier"}
                        </span>
                      </td>

                      {/* Column 4: Quantity Added */}
                      <td className="px-4 py-3.5 text-center whitespace-nowrap">
                        <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-400 dark:border-emerald-800 shadow-2xs inline-flex items-center gap-1">
                          <span>+{m.quantity}</span>
                          <span className="text-[10px] font-medium text-emerald-600/80">{matchedProd?.unit || "units"}</span>
                        </span>
                      </td>

                      {/* Column 5: Unit Cost & Total Value */}
                      <td className="px-5 py-3.5 text-right whitespace-nowrap">
                        <div className="font-mono font-bold text-xs text-slate-900 dark:text-white">
                          ${totalLineVal.toFixed(2)}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                          @ ${unitC.toFixed(2)} / unit
                        </div>
                      </td>

                      {/* Column 6: Print Receipt Action */}
                      <td className="px-5 py-3.5 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => {
                            setActivePO({
                              poNumber: `PO-${m.reference.replace(/^PO-?/, "") || m.id.slice(0, 6)}`,
                              supplierName: m.partyName || "Supplier Delivery",
                              date: m.timestamp,
                              warehouseName: "Central Storage Warehouse",
                              items: [
                                {
                                  sku: m.sku,
                                  name: m.productName,
                                  quantity: m.quantity,
                                  unitCost: unitC,
                                  totalCost: totalLineVal,
                                },
                              ],
                              grandTotal: totalLineVal,
                              status: "RECEIVED & STORED",
                            });
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-[#0c3843] hover:text-white hover:border-[#0c3843] text-slate-700 dark:text-slate-300 font-bold text-xs shadow-2xs transition-all cursor-pointer"
                          title="Print Purchase Receipt"
                        >
                          <Printer className="w-3.5 h-3.5" />
                          <span>Receipt</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar (15 items default) */}
        <div className="px-5 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/60 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-3 text-slate-500 dark:text-slate-400">
            <span>
              Showing{" "}
              <strong className="text-slate-900 dark:text-white font-bold">
                {filteredHistory.length === 0 ? 0 : startIndex + 1}
              </strong>{" "}
              to{" "}
              <strong className="text-slate-900 dark:text-white font-bold">
                {endIndex}
              </strong>{" "}
              of{" "}
              <strong className="text-slate-900 dark:text-white font-bold">
                {filteredHistory.length}
              </strong>{" "}
              receipts
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

              <div className="flex items-center gap-1">
                {Array.from({ length: totalPages }, (_, idx) => idx + 1).map((pageNum) => {
                  if (
                    totalPages > 7 &&
                    pageNum !== 1 &&
                    pageNum !== totalPages &&
                    Math.abs(pageNum - validCurrentPage) > 1
                  ) {
                    if (
                      pageNum === validCurrentPage - 2 ||
                      pageNum === validCurrentPage + 2
                    ) {
                      return (
                        <span key={pageNum} className="px-1 text-slate-400">
                          ...
                        </span>
                      );
                    }
                    return null;
                  }

                  const isActive = pageNum === validCurrentPage;
                  return (
                    <button
                      key={pageNum}
                      type="button"
                      onClick={() => setCurrentPage(pageNum)}
                      className={cn(
                        "w-8 h-8 rounded-xl text-xs font-bold transition-all cursor-pointer",
                        isActive
                          ? "bg-[#0c3843] text-white shadow-xs"
                          : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                      )}
                    >
                      {pageNum}
                    </button>
                  );
                })}
              </div>

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
      </div>

      {/* ========================================================
          6. MODAL: Receive Inward Stock (Restock Dialog)
         ======================================================== */}
      {isRestockModalOpen && (
        <ModalPortal>
        <div className="fixed inset-0 z-[100] overflow-y-auto">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
            onClick={() => setIsRestockModalOpen(false)}
          />

          <div className="flex min-h-full items-center justify-center p-4">
            <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden animate-in zoom-in-95 duration-200">
              {/* Modal Top Header */}
              <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/70 dark:bg-slate-950/60">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center border border-emerald-500/20">
                    <ArrowDownLeft className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-slate-900 dark:text-white">
                      Receive Inward Stock (Restock)
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Record incoming supplier delivery to increase warehouse inventory
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setIsRestockModalOpen(false)}
                  className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
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
                      <Barcode className="w-4 h-4 text-emerald-600" />
                      <span>Optical Barcode Scanner Auto-Fill</span>
                    </label>
                    <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                      Scanner Gun Ready
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Scan carton barcode with scanner gun or type SKU and press Enter:
                  </p>
                  <BarcodeScannerInput
                    products={products}
                    onProductScan={handleBarcodeScan}
                    placeholder="Scan product barcode sticker or type SKU..."
                  />
                </div>

                <form onSubmit={handleSubmit} className="space-y-4 text-xs">
                  {/* Section B: Product Selection */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="font-bold text-slate-700 dark:text-slate-300">
                        Select Catalog Product *
                      </label>
                      <Link
                        href="/products?action=new"
                        className="text-[11px] font-semibold text-[#0c3843] dark:text-teal-400 hover:underline inline-flex items-center gap-1"
                      >
                        <Plus className="w-3 h-3" />
                        <span>Create New SKU?</span>
                      </Link>
                    </div>

                    <select
                      disabled={isSubmitting || products.length === 0}
                      value={selectedProductId}
                      onChange={(e) => setSelectedProductId(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-[#0c3843] focus:ring-2 focus:ring-[#0c3843]/15 outline-none text-slate-900 dark:text-white font-medium"
                    >
                      {products.length === 0 ? (
                        <option value="">No products available. Please create a product first.</option>
                      ) : (
                        products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} ({p.sku}) &mdash; On Hand: {p.currentStock} {p.unit}
                          </option>
                        ))
                      )}
                    </select>
                  </div>

                  {/* Section C: Quantity Received & Quick Presets */}
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <label className="font-bold text-slate-700 dark:text-slate-300">
                          Quantity Received *
                        </label>
                        <input
                          type="number"
                          min="1"
                          required
                          disabled={isSubmitting}
                          value={quantity}
                          onChange={(e) => setQuantity(e.target.value)}
                          className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono text-base font-bold text-emerald-600 focus:border-[#0c3843] outline-none"
                          placeholder="10"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="font-bold text-slate-700 dark:text-slate-300">
                          Unit Buying Cost ($)
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          disabled={isSubmitting}
                          value={unitCost}
                          onChange={(e) => setUnitCost(e.target.value)}
                          className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono text-sm focus:border-[#0c3843] outline-none"
                          placeholder={selectedProduct ? selectedProduct.cost.toFixed(2) : "0.00"}
                        />
                      </div>
                    </div>

                    {/* Quick Preset Buttons */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[10px] text-slate-400 font-medium">Quick Presets:</span>
                      {[5, 10, 25, 50, 100].map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setQuantity(preset.toString())}
                          className={cn(
                            "px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all cursor-pointer",
                            quantity === preset.toString()
                              ? "bg-emerald-600 text-white border-emerald-600 shadow-xs"
                              : "bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
                          )}
                        >
                          +{preset}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Section D: Supplier & PO Reference */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="font-bold text-slate-700 dark:text-slate-300">
                        Supplier / Vendor Name
                      </label>
                      <input
                        type="text"
                        disabled={isSubmitting}
                        value={supplierName}
                        onChange={(e) => setSupplierName(e.target.value)}
                        className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-[#0c3843] outline-none text-slate-900 dark:text-white"
                        placeholder="e.g. Dell Logistics"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="font-bold text-slate-700 dark:text-slate-300">
                        PO / Delivery Reference
                      </label>
                      <input
                        type="text"
                        disabled={isSubmitting}
                        value={reference}
                        onChange={(e) => setReference(e.target.value)}
                        className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono focus:border-[#0c3843] outline-none"
                        placeholder="PO-1001"
                      />
                    </div>
                  </div>

                  {/* Section E: Live Inventory Impact Preview Box */}
                  {selectedProduct && (
                    <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
                          Inventory Impact Preview:
                        </span>
                        <span className="text-[11px] text-slate-500 font-mono">
                          {selectedProduct.sku} &bull; {selectedProduct.name}
                        </span>
                      </div>

                      <div className="grid grid-cols-3 gap-2.5 text-center">
                        <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800">
                          <span className="text-[10px] text-slate-400 block">Current On Hand</span>
                          <strong className="text-xs text-slate-700 dark:text-slate-300">
                            {currentOnHand} {selectedProduct.unit}
                          </strong>
                        </div>
                        <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                          <span className="text-[10px] text-emerald-600 block">Inward Delivery</span>
                          <strong className="text-xs text-emerald-600 font-bold">
                            +{qtyNumber} {selectedProduct.unit}
                          </strong>
                        </div>
                        <div className="p-2.5 rounded-xl bg-emerald-500/20 border border-emerald-500/30">
                          <span className="text-[10px] text-emerald-700 dark:text-emerald-300 block font-semibold">New Total Stock</span>
                          <strong className="text-sm text-emerald-700 dark:text-emerald-300 font-extrabold">
                            {projectedStock} {selectedProduct.unit}
                          </strong>
                        </div>
                      </div>

                      {totalPurchaseValue > 0 && (
                        <div className="text-xs text-right text-slate-500 pt-1 font-mono">
                          Total Inward Cost:{" "}
                          <strong className="text-slate-900 dark:text-white font-bold">
                            ${totalPurchaseValue.toFixed(2)}
                          </strong>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Modal Footer Controls */}
                  <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                    <button
                      type="button"
                      onClick={() => setIsRestockModalOpen(false)}
                      disabled={isSubmitting}
                      className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold cursor-pointer"
                    >
                      Cancel
                    </button>

                    <button
                      type="submit"
                      disabled={isSubmitting || products.length === 0 || qtyNumber <= 0}
                      className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold shadow-md shadow-emerald-600/20 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50 text-xs"
                    >
                      {isSubmitting ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="w-4 h-4" />
                      )}
                      <span>
                        {isSubmitting
                          ? "Adding to Warehouse..."
                          : `Confirm & Add ${qtyNumber} ${selectedProduct?.unit || "units"}`}
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

      {/* PO View Modal */}
      {activePO && (
        <PurchaseOrderModal
          order={activePO}
          isOpen={!!activePO}
          onClose={() => setActivePO(null)}
        />
      )}

      {/* Completion Modal */}
      {showSuccessDialog && lastCompletedPO && (
        <PurchaseOrderModal
          order={lastCompletedPO}
          isOpen={showSuccessDialog}
          onClose={() => setShowSuccessDialog(false)}
        />
      )}
    </div>
  );
}
