"use client";

import React, { useState, useEffect, useCallback, use, Suspense } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Package,
  Boxes,
  Truck,
  ShoppingBag,
  AlertTriangle,
  CheckCircle2,
  Printer,
  Barcode as BarcodeIcon,
  RefreshCw,
  Layers,
  Building2,
  Calendar,
  Lock,
  ArrowRight,
  ShieldCheck,
  Activity,
  DollarSign,
  Clock,
  Loader2,
  Wrench,
  AlertCircle,
} from "lucide-react";
import { useInventory, Product } from "@/lib/inventory-store";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/components/ui/toast";
import { apiClient } from "@/lib/api";
import { PrintLabelModal } from "@/components/barcode/print-label-modal";
import { cn } from "@/lib/utils";

interface ProductDetailPageProps {
  params: Promise<{ id: string }>;
}

export default function ProductDetailPage({ params }: ProductDetailPageProps) {
  return (
    <Suspense fallback={<div className="py-24 flex items-center justify-center gap-2 text-xs text-slate-400"><Loader2 className="w-5 h-5 animate-spin text-indigo-500" /><span>Loading Product Dossier...</span></div>}>
      <ProductDetailContent params={params} />
    </Suspense>
  );
}

function ProductDetailContent({ params }: ProductDetailPageProps) {
  const resolvedParams = use(params);
  const itemId = resolvedParams.id;
  const router = useRouter();
  const { products } = useInventory();
  const { isAdmin, isStaff } = useAuth();
  const { toast } = useToast();

  const [summary, setSummary] = useState<any>(null);
  const [itemDetails, setItemDetails] = useState<any>(null);
  const [movements, setMovements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [reconciling, setReconciling] = useState(false);
  const [printModalOpen, setPrintModalOpen] = useState(false);

  const localProduct = products.find((p) => p.id === itemId);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Fetch Item Live Summary (Phase B4)
      const sumRes = await apiClient.stock.getItemSummary(itemId);
      if (sumRes.data) {
        setSummary(sumRes.data);
      }

      // 2. Fetch Item Master Details
      const itemRes = await apiClient.items.get(itemId);
      if (itemRes.data) {
        setItemDetails(itemRes.data);
      }

      // 3. Fetch Recent Stock Moves
      const movesRes = await apiClient.stock.listMoves({ limit: 50 });
      if (movesRes.data) {
        const itemMoves = movesRes.data.filter((m: any) => m.item_id === itemId);
        setMovements(itemMoves);
      }
    } catch (err: any) {
      console.warn("Could not load full item summary:", err);
    } finally {
      setLoading(false);
    }
  }, [itemId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleReconcile = async () => {
    setReconciling(true);
    try {
      const res = await apiClient.stock.reconcileItem(itemId);
      const report = res.data;
      if (report.discrepancies > 0) {
        toast({
          title: "Ledger Discrepancy Healed",
          description: `Detected and auto-healed ${report.discrepancies} location drift(s) to match immutable stock ledger truth!`,
          variant: "success",
        });
      } else {
        toast({
          title: "Ledger Invariant 100% Intact",
          description: "Zero discrepancy. On-hand cache matches stock_moves ledger truth with mathematical precision.",
          variant: "success",
        });
      }
      await loadData();
    } catch (err: any) {
      toast({
        title: "Reconciliation Failed",
        description: err?.message || "Could not run ledger audit",
        variant: "destructive",
      });
    } finally {
      setReconciling(false);
    }
  };

  const activeLocations = summary?.locations?.filter((l: any) => !l.is_backup_location) || [];
  const backupLocations = summary?.locations?.filter((l: any) => l.is_backup_location) || [];

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "IN_STOCK":
        return { label: "In Stock", bg: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" };
      case "LOW_STOCK":
        return { label: "Low Stock Alert", bg: "bg-amber-500/10 text-amber-500 border-amber-500/20" };
      case "BUFFER_ALERT":
        return { label: "Buffer Stock Breach", bg: "bg-orange-500/10 text-orange-500 border-orange-500/20" };
      case "OUT_OF_STOCK":
        return { label: "Out of Stock", bg: "bg-rose-500/10 text-rose-500 border-rose-500/20" };
      default:
        return { label: "Normal", bg: "bg-slate-500/10 text-slate-400 border-slate-500/20" };
    }
  };

  const badge = getStatusBadge(summary?.stock_status || (localProduct && localProduct.currentStock <= localProduct.reorderLevel ? "LOW_STOCK" : "IN_STOCK"));

  const pForPrint: Product = {
    id: itemId,
    sku: summary?.sku || itemDetails?.sku || localProduct?.sku || "SKU-PROD",
    name: summary?.name || itemDetails?.name || localProduct?.name || "Product Item",
    category: itemDetails?.category_name || itemDetails?.attributes?.category || localProduct?.category || "General",
    cost: Number(itemDetails?.cost_price || localProduct?.cost || 0),
    price: Number(itemDetails?.selling_price || localProduct?.price || 0),
    currentStock: summary?.total_on_hand ?? localProduct?.currentStock ?? 0,
    reorderLevel: summary?.reorder_level ?? itemDetails?.reorder_level ?? 5,
    unit: summary?.base_uom || itemDetails?.base_uom || localProduct?.unit || "pcs",
    updatedAt: itemDetails?.updated_at || new Date().toISOString(),
  };

  return (
    <div className="space-y-6">
      {/* Top Breadcrumb & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <Link
            href="/products"
            className="p-2 rounded-xl bg-slate-100 dark:bg-slate-900 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white transition-all cursor-pointer"
            title="Back to Products Catalog"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
                {summary?.name || itemDetails?.name || localProduct?.name || "Product Dossier"}
              </h1>
              <span className={cn("px-2.5 py-0.5 rounded-full text-[10px] font-bold border uppercase tracking-wider", badge.bg)}>
                {badge.label}
              </span>
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-400 mt-0.5">
              <span className="font-mono font-semibold text-indigo-500">{summary?.sku || itemDetails?.sku || localProduct?.sku}</span>
              <span>&bull;</span>
              <span>UOM: <strong className="text-slate-300">{summary?.base_uom || itemDetails?.base_uom || "pcs"}</strong></span>
              <span>&bull;</span>
              <span>Barcode: <strong className="font-mono text-slate-300">{itemDetails?.barcode || "890100000001"}</strong></span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            href={`/stock-in?productId=${itemId}`}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-xs transition-all"
          >
            <Truck className="w-3.5 h-3.5" />
            <span>Receive (IN)</span>
          </Link>

          <Link
            href={`/stock-out?productId=${itemId}`}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-xs transition-all"
          >
            <ShoppingBag className="w-3.5 h-3.5" />
            <span>Dispatch (OUT)</span>
          </Link>

          <button
            type="button"
            onClick={() => setPrintModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-900 hover:bg-slate-200 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-all cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5 text-indigo-500" />
            <span>Print Label</span>
          </button>

          <button
            type="button"
            disabled={reconciling}
            onClick={handleReconcile}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-900 hover:bg-slate-200 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-all cursor-pointer"
            title="Audit immutable stock_moves ledger against stock_balances cache"
          >
            <RefreshCw className={cn("w-3.5 h-3.5 text-emerald-500", reconciling && "animate-spin")} />
            <span>Reconcile Ledger</span>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="py-24 flex flex-col items-center justify-center gap-3 text-slate-400">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
          <p className="text-xs font-medium">Computing 360° stock dossier from PostgreSQL ledger...</p>
        </div>
      ) : (
        <>
          {/* Key Metrics KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 rounded-2xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 shadow-xs">
              <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
                <span>Total On-Hand</span>
                <Boxes className="w-4 h-4 text-emerald-500" />
              </div>
              <div className="text-2xl font-black text-slate-900 dark:text-white">
                {summary?.total_on_hand ?? localProduct?.currentStock ?? 0}
                <span className="text-xs font-normal text-slate-400 ml-1">{summary?.base_uom || "pcs"}</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">Physical stock present across all depots</p>
            </div>

            <div className="p-4 rounded-2xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 shadow-xs">
              <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
                <span>Available Free Stock</span>
                <CheckCircle2 className="w-4 h-4 text-indigo-500" />
              </div>
              <div className="text-2xl font-black text-indigo-600 dark:text-indigo-400">
                {summary?.total_available ?? localProduct?.currentStock ?? 0}
                <span className="text-xs font-normal text-slate-400 ml-1">{summary?.base_uom || "pcs"}</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">Unreserved & ready for immediate dispatch</p>
            </div>

            <div className="p-4 rounded-2xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 shadow-xs">
              <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
                <span>Reserved for Orders</span>
                <Lock className="w-4 h-4 text-amber-500" />
              </div>
              <div className="text-2xl font-black text-amber-600 dark:text-amber-400">
                {summary?.total_reserved ?? 0}
                <span className="text-xs font-normal text-slate-400 ml-1">{summary?.base_uom || "pcs"}</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">Locked in pending dispatches/orders</p>
            </div>

            <div className="p-4 rounded-2xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 shadow-xs">
              <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
                <span>Checked-Out / Custody</span>
                <Wrench className="w-4 h-4 text-purple-500" />
              </div>
              <div className="text-2xl font-black text-purple-600 dark:text-purple-400">
                {summary?.total_checked_out ?? 0}
                <span className="text-xs font-normal text-slate-400 ml-1">{summary?.base_uom || "pcs"}</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">Issued to staff/technicians in field</p>
            </div>
          </div>

          {/* Active Shop Floor vs Backup Godown Storage Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Active Shop Floor Card */}
            <div className="p-5 rounded-2xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
                    <Building2 className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">Active Shop Floor & Stores</h3>
                    <p className="text-[11px] text-slate-400">Frontline shelves & active fulfillment locations</p>
                  </div>
                </div>
                <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-500">
                  {activeLocations.reduce((sum: number, l: any) => sum + l.on_hand, 0)} {summary?.base_uom || "pcs"}
                </span>
              </div>

              {activeLocations.length === 0 ? (
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/60 text-center text-xs text-slate-400">
                  No stock currently stored on active shop floor shelves.
                </div>
              ) : (
                <div className="space-y-2">
                  {activeLocations.map((loc: any) => (
                    <div key={loc.location_id} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                      <div>
                        <div className="text-xs font-bold text-slate-900 dark:text-white">{loc.location_name}</div>
                        <div className="text-[10px] text-slate-400">Reserved: {loc.reserved} &bull; Available: {loc.available}</div>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400">{loc.on_hand}</span>
                        <span className="text-[10px] text-slate-400 ml-1">{summary?.base_uom || "pcs"}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Backup Godown Storage Card */}
            <div className="p-5 rounded-2xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center">
                    <Layers className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">Reserve Godown Storage</h3>
                    <p className="text-[11px] text-slate-400">Bulk reserve depots & overstock pallets</p>
                  </div>
                </div>
                <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-500">
                  {backupLocations.reduce((sum: number, l: any) => sum + l.on_hand, 0)} {summary?.base_uom || "pcs"}
                </span>
              </div>

              {backupLocations.length === 0 ? (
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/60 text-center text-xs text-slate-400">
                  No stock stored in backup godown depots.
                </div>
              ) : (
                <div className="space-y-2">
                  {backupLocations.map((loc: any) => (
                    <div key={loc.location_id} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                      <div>
                        <div className="text-xs font-bold text-slate-900 dark:text-white">{loc.location_name}</div>
                        <div className="text-[10px] text-slate-400">Reserved: {loc.reserved} &bull; Available: {loc.available}</div>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-mono font-bold text-blue-600 dark:text-blue-400">{loc.on_hand}</span>
                        <span className="text-[10px] text-slate-400 ml-1">{summary?.base_uom || "pcs"}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Product Dossier & Specifications Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-5 rounded-2xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Pricing & Valuation</h3>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-900">
                  <span className="text-slate-500">Cost Price (Buy):</span>
                  <span className="font-mono font-semibold text-slate-900 dark:text-white">
                    {isStaff ? (
                      <span className="inline-flex items-center gap-1 text-[11px] text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded">
                        <Lock className="w-2.5 h-2.5" /> Masked
                      </span>
                    ) : (
                      `$${Number(itemDetails?.cost_price || localProduct?.cost || 0).toFixed(2)}`
                    )}
                  </span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-900">
                  <span className="text-slate-500">Selling Price:</span>
                  <span className="font-mono font-bold text-slate-900 dark:text-white">
                    ${Number(itemDetails?.selling_price || localProduct?.price || 0).toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between py-1.5">
                  <span className="text-slate-500">Valuation Method:</span>
                  <span className="font-mono font-semibold uppercase text-indigo-500">
                    {itemDetails?.valuation_method || "WAC"}
                  </span>
                </div>
              </div>
            </div>

            <div className="p-5 rounded-2xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Inventory Thresholds</h3>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-900">
                  <span className="text-slate-500">Reorder Level:</span>
                  <span className="font-mono font-bold text-amber-500">
                    {summary?.reorder_level || itemDetails?.reorder_level || 5} {summary?.base_uom || "pcs"}
                  </span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-900">
                  <span className="text-slate-500">Buffer Safety Stock:</span>
                  <span className="font-mono font-bold text-orange-500">
                    {summary?.buffer_stock || itemDetails?.buffer_stock || 2} {summary?.base_uom || "pcs"}
                  </span>
                </div>
                <div className="flex justify-between py-1.5">
                  <span className="text-slate-500">Tracking Mode:</span>
                  <span className="font-mono font-semibold capitalize text-slate-900 dark:text-white">
                    {itemDetails?.tracking_mode || "Simple Count"}
                  </span>
                </div>
              </div>
            </div>

            <div className="p-5 rounded-2xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Identification & Classification</h3>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-900">
                  <span className="text-slate-500">Category:</span>
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {itemDetails?.category_name || itemDetails?.attributes?.category || localProduct?.category || "General"}
                  </span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-900">
                  <span className="text-slate-500">SKU / Item Code:</span>
                  <span className="font-mono font-bold text-indigo-400">{summary?.sku || itemDetails?.sku}</span>
                </div>
                <div className="flex justify-between py-1.5">
                  <span className="text-slate-500">Barcode:</span>
                  <span className="font-mono text-slate-300">{itemDetails?.barcode || "890100000001"}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Movement Audit Timeline */}
          <div className="p-5 rounded-2xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Clock className="w-4 h-4 text-indigo-500" />
                  <span>Immutable Stock Movement Audit Trail</span>
                </h3>
                <p className="text-[11px] text-slate-400">Append-only transactions verified by two-sided double entry ledger</p>
              </div>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-900 text-slate-400">
                {movements.length} Record(s)
              </span>
            </div>

            {movements.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">
                No stock movements logged for this product yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-slate-500 uppercase font-semibold text-[10px]">
                    <tr>
                      <th className="px-4 py-2.5">Date & Time</th>
                      <th className="px-4 py-2.5">Type</th>
                      <th className="px-4 py-2.5 text-right">Quantity</th>
                      <th className="px-4 py-2.5">Reference</th>
                      <th className="px-4 py-2.5">Move ID</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                    {movements.map((m: any) => {
                      const isPositive = m.move_type === "inward" || m.move_type === "INWARD_RECEIPT";
                      return (
                        <tr key={m.move_id} className="hover:bg-slate-50/60 dark:hover:bg-slate-900/50">
                          <td className="px-4 py-2.5 font-mono text-[11px] text-slate-500">
                            {new Date(m.created_at).toLocaleString()}
                          </td>
                          <td className="px-4 py-2.5">
                            <span
                              className={cn(
                                "px-2 py-0.5 rounded-md text-[10px] font-bold uppercase",
                                isPositive
                                  ? "bg-emerald-500/10 text-emerald-500"
                                  : "bg-blue-500/10 text-blue-500"
                              )}
                            >
                              {m.move_type}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono font-bold">
                            <span className={isPositive ? "text-emerald-500" : "text-slate-900 dark:text-white"}>
                              {isPositive ? "+" : "-"}{m.quantity} {summary?.base_uom || "pcs"}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 font-mono text-[11px] text-indigo-400">
                            {m.reference_code || "N/A"}
                          </td>
                          <td className="px-4 py-2.5 font-mono text-[10px] text-slate-500">
                            {m.move_id.slice(0, 8)}...
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* Barcode Print Modal */}
      <PrintLabelModal
        product={pForPrint}
        isOpen={printModalOpen}
        onClose={() => setPrintModalOpen(false)}
      />
    </div>
  );
}
