"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  SlidersHorizontal,
  AlertTriangle,
  CheckCircle2,
  Package,
  Layers,
  ArrowRight,
  Loader2,
  Database,
  Lock,
  ShieldAlert,
} from "lucide-react";
import { useInventory } from "@/lib/inventory-store";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

export default function StockAdjustmentsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-xs text-slate-400">Loading Adjustments...</div>}>
      <StockAdjustmentsContent />
    </Suspense>
  );
}

function StockAdjustmentsContent() {
  const searchParams = useSearchParams();
  const { products, movements, adjustStock, isBackendConnected } = useInventory();
  const { toast } = useToast();
  const { isAdmin, isStaff } = useAuth();

  const [selectedProductId, setSelectedProductId] = useState(products[0]?.id || "");
  const [newStockInput, setNewStockInput] = useState("");
  const [reason, setReason] = useState("Damaged Goods");
  const [reference, setReference] = useState("ADJ-1001");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // If redirected with ?productId=...
  useEffect(() => {
    const pId = searchParams.get("productId");
    if (pId) {
      setSelectedProductId(pId);
    } else if (!selectedProductId && products.length > 0) {
      setSelectedProductId(products[0].id);
    }
  }, [searchParams, products, selectedProductId]);

  const selectedProduct = products.find((p) => p.id === selectedProductId);

  // Set default newStockInput whenever selectedProduct changes
  useEffect(() => {
    if (selectedProduct) {
      setNewStockInput(selectedProduct.currentStock.toString());
    }
  }, [selectedProductId, selectedProduct]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isStaff) {
      toast({
        title: "Action Forbidden",
        description: "Staff accounts are blocked from performing manual stock adjustments.",
        variant: "destructive",
      });
      return;
    }
    if (!selectedProductId || newStockInput === "") return;

    const targetStock = parseInt(newStockInput, 10);
    if (isNaN(targetStock) || targetStock < 0) {
      toast({
        title: "Invalid Count",
        description: "New actual count must be a non-negative number.",
        variant: "destructive",
      });
      return;
    }

    const prev = selectedProduct?.currentStock || 0;
    const diff = targetStock - prev;

    setIsSubmitting(true);
    try {
      const refCode = reference.trim() || `ADJ-${Date.now().toString().slice(-4)}`;
      const res = await adjustStock({
        productId: selectedProductId,
        newStock: targetStock,
        reason: reason.trim() || "Manual cycle count adjustment",
        reference: refCode,
      });

      if (res.success) {
        toast({
          title: "Adjustment Recorded",
          description: `Adjusted "${selectedProduct?.name}" from ${prev} to ${targetStock} units (${diff >= 0 ? "+" : ""}${diff} ${selectedProduct?.unit || "units"}) via two-sided INVENTORY_ADJUSTMENT ledger move.`,
          variant: "success",
        });
        setReference(`ADJ-${Date.now().toString().slice(-4)}`);
      } else {
        toast({
          title: "Adjustment Failed",
          description: res.error || "The Go Backend rejected this stock adjustment.",
          variant: "destructive",
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const adjMovements = movements.filter((m) => m.type === "ADJUSTMENT");

  return (
    <div className="space-y-8">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white flex items-center gap-2.5">
              <SlidersHorizontal className="w-6 h-6 text-amber-500" />
              <span>Stock Adjustments</span>
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold flex items-center gap-1.5 border bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400">
              <Database className="w-3 h-3" />
              <span>Two-Sided Scrap/Gain Ledger</span>
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Manual inventory corrections for damaged items, cycle count discrepancies, and audit write-offs. Posts double-entry moves between Warehouse and Scrap/Loss locations.
          </p>
        </div>

        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-amber-500/20 bg-amber-500/5 text-amber-600 dark:text-amber-400 text-xs font-semibold">
          <AlertTriangle className="w-4 h-4" />
          <span>Adjustments Logged: {adjMovements.length}</span>
        </div>
      </div>

      {/* Main Grid: Form + History */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Adjustment Form */}
        <div className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 shadow-xs space-y-5 h-fit">
          <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-amber-500" />
            <span>Create Stock Adjustment</span>
          </h2>

          {isStaff && (
            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-500 text-xs flex items-start gap-2.5">
              <ShieldAlert className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-500" />
              <div>
                <strong className="block font-bold">Permission Restricted (Staff Role)</strong>
                <span className="text-[11px] text-amber-600 dark:text-amber-400">
                  Staff accounts are blocked from performing manual stock adjustments or loss write-offs. Only Administrators may apply count corrections.
                </span>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4 text-xs">
            <div className="space-y-1">
              <label className="font-semibold text-slate-700 dark:text-slate-300">
                Select Product *
              </label>
              <select
                disabled={isSubmitting || products.length === 0}
                value={selectedProductId}
                onChange={(e) => setSelectedProductId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 focus:border-amber-500 outline-none text-slate-900 dark:text-white"
              >
                {products.length === 0 ? (
                  <option value="">No products available. Please add a product first.</option>
                ) : (
                  products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.sku}) &mdash; On-Hand: {p.currentStock} {p.unit}
                    </option>
                  ))
                )}
              </select>
              {selectedProduct && (
                <div className="text-[11px] text-slate-400 mt-1">
                  Current On-Hand Stock: <strong className="text-slate-900 dark:text-white">{selectedProduct.currentStock} {selectedProduct.unit}</strong>
                </div>
              )}
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-slate-700 dark:text-slate-300">
                New Actual Count *
              </label>
              <input
                type="number"
                min="0"
                required
                disabled={isSubmitting}
                value={newStockInput}
                onChange={(e) => setNewStockInput(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 font-mono focus:border-amber-500 outline-none"
                placeholder="Enter physical count"
              />
              {selectedProduct && newStockInput !== "" && (
                <div className="text-[11px] font-semibold mt-1">
                  Adjustment Delta:{" "}
                  <span
                    className={
                      parseInt(newStockInput, 10) - selectedProduct.currentStock >= 0
                        ? "text-emerald-500"
                        : "text-rose-500"
                    }
                  >
                    {parseInt(newStockInput, 10) - selectedProduct.currentStock >= 0 ? "+" : ""}
                    {parseInt(newStockInput, 10) - selectedProduct.currentStock} {selectedProduct.unit}
                  </span>
                </div>
              )}
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-slate-700 dark:text-slate-300">
                Reason Code *
              </label>
              <select
                disabled={isSubmitting}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 focus:border-amber-500 outline-none text-slate-900 dark:text-white"
              >
                <option value="Damaged Goods">Damaged Goods / Broken in Handling</option>
                <option value="Cycle Count Discrepancy">Cycle Count Discrepancy</option>
                <option value="Loss / Theft">Loss / Unaccounted Shrinkage</option>
                <option value="Return to Inventory">Return to Inventory</option>
                <option value="Expired Product">Expired / Obsolete Item</option>
                <option value="Sample / Internal Use">Sample / Internal Demo Use</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-slate-700 dark:text-slate-300">
                Audit Reference ID
              </label>
              <input
                type="text"
                disabled={isSubmitting}
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 font-mono focus:border-amber-500 outline-none"
                placeholder="ADJ-2026-001"
              />
            </div>

            {isStaff ? (
              <div className="w-full py-2.5 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-400 text-xs font-semibold flex items-center justify-center gap-2 cursor-not-allowed">
                <Lock className="w-3.5 h-3.5 text-amber-500" />
                <span>Adjustments Restricted (Admin Only)</span>
              </div>
            ) : (
              <button
                type="submit"
                disabled={isSubmitting || products.length === 0}
                className="w-full py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-semibold shadow-xs transition-all flex items-center justify-center gap-2 pt-2 cursor-pointer disabled:opacity-50"
              >
                {isSubmitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-4 h-4" />
                )}
                <span>{isSubmitting ? "Posting Adjustment..." : "Apply Adjustment"}</span>
              </button>
            )}
          </form>
        </div>

        {/* Adjustments History Table */}
        <div className="lg:col-span-2 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 shadow-xs space-y-4">
          <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-amber-500" />
            <span>Adjustment Audit Log</span>
          </h2>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-slate-500 uppercase font-semibold text-[11px]">
                <tr>
                  <th className="px-4 py-2.5 min-w-[130px]">Reference</th>
                  <th className="px-4 py-2.5 min-w-[180px]">Product</th>
                  <th className="px-4 py-2.5 min-w-[140px]">Reason</th>
                  <th className="px-4 py-2.5 text-center min-w-[90px]">Move Delta</th>
                  <th className="px-4 py-2.5 text-center min-w-[100px]">Move Type</th>
                  <th className="px-4 py-2.5 text-right min-w-[80px] whitespace-nowrap">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {adjMovements.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                      No stock adjustments logged yet.
                    </td>
                  </tr>
                ) : (
                  adjMovements.map((m) => (
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
                        {m.reason || "Manual Correction"}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400">
                          {m.quantity}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center font-mono text-slate-400 text-[11px]">
                        <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-900 text-amber-600 dark:text-amber-400 font-semibold">
                          INVENTORY_ADJUSTMENT
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-slate-400 font-mono text-[11px]">
                        {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
