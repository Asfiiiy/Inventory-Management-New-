"use client";

import React, { useState, useEffect, Suspense } from "react";
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
  Database,
  Barcode,
  Printer,
  FileCheck,
} from "lucide-react";
import { useInventory, Product } from "@/lib/inventory-store";
import { useToast } from "@/components/ui/toast";
import { BarcodeScannerInput } from "@/components/barcode/barcode-scanner-input";
import { PurchaseOrderModal, PurchaseOrderData } from "@/components/documents/purchase-order-modal";



export default function StockInPurchasesPage() {
  return (
    <Suspense fallback={<div className="p-8 text-xs text-slate-400">Loading Stock In...</div>}>
      <StockInContent />
    </Suspense>
  );
}

function StockInContent() {
  const searchParams = useSearchParams();
  const { products, movements, contacts, stockIn, isBackendConnected } = useInventory();
  const { toast } = useToast();

  const [selectedProductId, setSelectedProductId] = useState(products[0]?.id || "");
  const [quantity, setQuantity] = useState("10");
  const [supplierName, setSupplierName] = useState("");
  const [reference, setReference] = useState("PO-1001");
  const [unitCost, setUnitCost] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Purchase Order & Success Dialog State
  const [activePO, setActivePO] = useState<PurchaseOrderData | null>(null);
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [lastCompletedPO, setLastCompletedPO] = useState<PurchaseOrderData | null>(null);


  // If redirected with ?productId=...
  useEffect(() => {
    const pId = searchParams.get("productId");
    if (pId) {
      setSelectedProductId(pId);
    } else if (!selectedProductId && products.length > 0) {
      setSelectedProductId(products[0].id);
    }
  }, [searchParams, products, selectedProductId]);

  // Set default supplier if available
  const suppliers = contacts.filter((c) => c.type === "SUPPLIER");
  useEffect(() => {
    if (suppliers.length > 0 && !supplierName) {
      setSupplierName(suppliers[0].name);
    }
  }, [suppliers, supplierName]);

  const selectedProduct = products.find((p) => p.id === selectedProductId);

  const handleBarcodeScan = (scannedProduct: Product) => {
    if (scannedProduct.id === selectedProductId) {
      const currentQty = parseInt(quantity, 10) || 0;
      setQuantity((currentQty + 1).toString());
    } else {
      setSelectedProductId(scannedProduct.id);
      setQuantity("1");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProductId || !quantity) return;

    const qty = parseInt(quantity, 10);
    if (qty <= 0) return;

    setIsSubmitting(true);
    try {
      const refCode = reference.trim() || `PO-${Date.now().toString().slice(-4)}`;
      const res = await stockIn({
        productId: selectedProductId,
        quantity: qty,
        supplierName: supplierName.trim() || "General Supplier",
        reference: refCode,
        unitCost: unitCost ? parseFloat(unitCost) : undefined,
      });

      if (res.success) {
        const suppName = supplierName.trim() || "General Supplier";
        const uCost = unitCost ? parseFloat(unitCost) : selectedProduct?.cost || 0;
        const totalVal = qty * uCost;

        const poObj: PurchaseOrderData = {
          poNumber: `PO-${refCode.replace(/^PO-?/, "") || Date.now().toString().slice(-4)}`,
          supplierName: suppName,
          date: new Date().toISOString(),
          warehouseName: "Central Storage Warehouse",
          items: [
            {
              sku: selectedProduct?.sku || "SKU-PROD",
              name: selectedProduct?.name || "Inventory Product",
              quantity: qty,
              unitCost: uCost,
              totalCost: totalVal,
            },
          ],
          grandTotal: totalVal,
          status: "RECEIVED & STORED",
        };

        setLastCompletedPO(poObj);
        setShowSuccessDialog(true);

        toast({
          title: "Inward Stock Received",
          description: `Received ${qty} ${selectedProduct?.unit || "units"} of "${selectedProduct?.name}" via two-sided ledger entry (${refCode}).`,
          variant: "success",
        });
        setQuantity("10");
        setReference(`PO-${Date.now().toString().slice(-4)}`);
        setUnitCost("");
      } else {
        toast({
          title: "Stock In Failed",
          description: res.error || "The Go Backend rejected this inward receipt.",
          variant: "destructive",
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  };


  const inMovements = movements.filter((m) => m.type === "IN");

  return (
    <div className="space-y-8">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white flex items-center gap-2.5">
              <ArrowDownLeft className="w-6 h-6 text-emerald-500" />
              <span>Stock In / Purchases</span>
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold flex items-center gap-1.5 border bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400">
              <Database className="w-3 h-3" />
              <span>Two-Sided Inward Ledger</span>
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Receive supplier deliveries and inward inventory entries. Posts an INWARD_RECEIPT move from Virtual Vendor to Warehouse in PostgreSQL.
          </p>
        </div>

        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-emerald-500/20 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400 text-xs font-semibold">
          <Truck className="w-4 h-4" />
          <span>Inward Movements: {inMovements.length}</span>
        </div>
      </div>

      {/* Main Grid: Entry Form + History Table */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Entry Form */}
        <div className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 shadow-xs space-y-5 h-fit">
          <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Plus className="w-4 h-4 text-emerald-500" />
            <span>Record Inward Stock</span>
          </h2>

          {/* Barcode Scanner Input */}
          <BarcodeScannerInput
            products={products}
            onProductScan={handleBarcodeScan}
            placeholder="Scan barcode sticker or type SKU and hit Enter..."
          />

          <form onSubmit={handleSubmit} className="space-y-4 text-xs">
            <div className="space-y-1">
              <label className="font-semibold text-slate-700 dark:text-slate-300">
                Select Product *
              </label>
              <select
                disabled={isSubmitting || products.length === 0}
                value={selectedProductId}
                onChange={(e) => setSelectedProductId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 focus:border-emerald-500 outline-none text-slate-900 dark:text-white"
              >
                {products.length === 0 ? (
                  <option value="">No products available. Please add a product first.</option>
                ) : (
                  products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.sku}) &mdash; Available: {p.currentStock} {p.unit}
                    </option>
                  ))
                )}
              </select>
              {selectedProduct && (
                <div className="text-[11px] text-slate-400 mt-1 flex justify-between">
                  <span>Current Stock: <strong className="text-slate-900 dark:text-white">{selectedProduct.currentStock} {selectedProduct.unit}</strong></span>
                  <span>Unit Cost: ${selectedProduct.cost.toFixed(2)}</span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="font-semibold text-slate-700 dark:text-slate-300">
                  Quantity Received *
                </label>
                <input
                  type="number"
                  min="1"
                  required
                  disabled={isSubmitting}
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 font-mono focus:border-emerald-500 outline-none"
                  placeholder="e.g. 10"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700 dark:text-slate-300">
                  Unit Cost (Optional)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  disabled={isSubmitting}
                  value={unitCost}
                  onChange={(e) => setUnitCost(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 font-mono focus:border-emerald-500 outline-none"
                  placeholder={selectedProduct ? selectedProduct.cost.toString() : "0.00"}
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-slate-700 dark:text-slate-300">
                Supplier Name
              </label>
              <input
                type="text"
                disabled={isSubmitting}
                value={supplierName}
                onChange={(e) => setSupplierName(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 focus:border-emerald-500 outline-none"
                placeholder="e.g. Dell Commercial Direct"
                list="suppliers-list"
              />
              <datalist id="suppliers-list">
                {suppliers.map((s) => (
                  <option key={s.id} value={s.name} />
                ))}
              </datalist>
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-slate-700 dark:text-slate-300">
                PO / Reference Number
              </label>
              <input
                type="text"
                disabled={isSubmitting}
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 font-mono focus:border-emerald-500 outline-none"
                placeholder="PO-2026-001"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting || products.length === 0}
              className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold shadow-xs transition-all flex items-center justify-center gap-2 pt-2 cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <ArrowDownLeft className="w-4 h-4" />
              )}
              <span>{isSubmitting ? "Posting Stock In..." : "Confirm Stock In"}</span>
            </button>
          </form>
        </div>

        {/* Inward History Table */}
        <div className="lg:col-span-2 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 shadow-xs space-y-4">
          <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Truck className="w-4 h-4 text-emerald-500" />
            <span>Inward Purchases History</span>
          </h2>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-slate-500 uppercase font-semibold text-[11px]">
                <tr>
                  <th className="px-4 py-2.5 min-w-[130px]">Reference</th>
                  <th className="px-4 py-2.5 min-w-[180px]">Product</th>
                  <th className="px-4 py-2.5 min-w-[120px]">Supplier</th>
                  <th className="px-4 py-2.5 text-center min-w-[80px]">Qty In</th>
                  <th className="px-4 py-2.5 text-center min-w-[100px]">Move Type</th>
                  <th className="px-4 py-2.5 text-right min-w-[90px]">Time</th>
                  <th className="px-4 py-2.5 text-right min-w-[60px] whitespace-nowrap">PO</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {inMovements.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                      No inward stock transactions recorded yet.
                    </td>
                  </tr>
                ) : (
                  inMovements.map((m) => {
                    const matchedProd = products.find((p) => p.sku === m.sku || p.name === m.productName);
                    const unitC = matchedProd?.cost || 0;

                    return (
                      <tr key={m.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/50">
                        <td className="px-4 py-3 font-mono font-bold text-slate-900 dark:text-white">
                          {m.reference}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-semibold text-slate-900 dark:text-white">
                            {m.productName}
                          </div>
                          <div className="text-[11px] font-mono text-slate-400">{m.sku}</div>
                        </td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                          {m.partyName || "N/A"}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                            +{m.quantity}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center font-mono text-slate-400 text-[11px]">
                          <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 font-semibold">
                            INWARD_RECEIPT
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-slate-400 font-mono text-[11px]">
                          {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="px-4 py-3 text-right">
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
                                    totalCost: m.quantity * unitC,
                                  },
                                ],
                                grandTotal: m.quantity * unitC,
                                status: "RECEIVED & STORED",
                              });
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 font-semibold text-[11px] transition-all cursor-pointer"
                            title="Print Purchase Order Document"
                          >
                            <Printer className="w-3 h-3" />
                            <span>PO</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Instant Post-Inward Success & Print Prompt Modal */}
      {showSuccessDialog && lastCompletedPO && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150 no-print">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Stock Received Successfully!
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Quantity added to physical warehouse ledger.
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400">PO Number:</span>
                <span className="font-mono font-bold text-slate-900 dark:text-white">
                  {lastCompletedPO.poNumber}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Supplier:</span>
                <span className="font-semibold text-slate-900 dark:text-white">
                  {lastCompletedPO.supplierName}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Order Value:</span>
                <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                  ${lastCompletedPO.grandTotal.toFixed(2)}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setShowSuccessDialog(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold text-xs cursor-pointer"
              >
                Done
              </button>
              <button
                type="button"
                onClick={() => {
                  setActivePO(lastCompletedPO);
                  setShowSuccessDialog(false);
                }}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs shadow-xs transition-all cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>Print Purchase Order</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Printable Purchase Order Modal */}
      <PurchaseOrderModal
        order={activePO}
        isOpen={!!activePO}
        onClose={() => setActivePO(null)}
      />

    </div>
  );
}
