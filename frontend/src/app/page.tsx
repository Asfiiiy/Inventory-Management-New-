"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Package,
  DollarSign,
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  SlidersHorizontal,
  Plus,
  ArrowRight,
  Activity,
  Layers,
  CheckCircle2,
  TrendingDown,
  Building2,
  Clock,
  Database,
  RefreshCw,
  Loader2,
  Sparkles,
  Download,
  Lock,
  ShieldCheck,
  AlertCircle,
  TrendingUp,
  FileSpreadsheet,
} from "lucide-react";
import { useInventory } from "@/lib/inventory-store";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/components/ui/toast";
import { exportProductsToCSV, exportLowStockReportToCSV } from "@/lib/export-csv";
import { apiClient, CustodySummary } from "@/lib/api";
import { cn } from "@/lib/utils";

interface StockAlert {
  item_id: string;
  sku: string;
  name: string;
  base_uom: string;
  total_on_hand: number;
  reorder_level: number;
  buffer_stock: number;
  alert_type: "OUT_OF_STOCK" | "BUFFER_ALERT" | "LOW_STOCK";
  suggested_reorder: number;
}

export default function DashboardPage() {
  const {
    products,
    movements,
    totalProductsCount,
    totalInventoryValuation,
    lowStockItems,
    isLoading: isStoreLoading,
    isBackendConnected,
    refetch,
    resetToDefaults,
  } = useInventory();
  const { toast } = useToast();
  const { isAdmin, isStaff } = useAuth();

  const [isSeeding, setIsSeeding] = useState(false);
  const [backendAlerts, setBackendAlerts] = useState<StockAlert[]>([]);
  const [custodySummary, setCustodySummary] = useState<CustodySummary | null>(null);
  const [isLoadingAlerts, setIsLoadingAlerts] = useState(false);
  const [alertTab, setAlertTab] = useState<"backend" | "all">("backend");

  // Fetch backend stock threshold alerts and custody summary
  const fetchDashboardFeeds = async () => {
    setIsLoadingAlerts(true);
    try {
      // 1. Stock alerts
      const alertsRes = await apiClient.stock.getAlerts();
      if (alertsRes.success && alertsRes.data) {
        setBackendAlerts(alertsRes.data);
      }
    } catch (err) {
      console.warn("Backend stock alerts error:", err);
    }

    try {
      // 2. Custody summary
      const custodyRes = await apiClient.custody.getSummary();
      if (custodyRes.success && custodyRes.data) {
        setCustodySummary(custodyRes.data);
      }
    } catch (err) {
      console.warn("Custody summary error:", err);
    } finally {
      setIsLoadingAlerts(false);
    }
  };

  useEffect(() => {
    fetchDashboardFeeds();
  }, []);

  const handleRefresh = async () => {
    await Promise.all([refetch(), fetchDashboardFeeds()]);
  };

  const handleSeed = async () => {
    setIsSeeding(true);
    try {
      await resetToDefaults();
      toast({
        title: "Catalog Seeded",
        description: "Successfully seeded initial items and warehouse balances into PostgreSQL.",
        variant: "success",
      });
      await fetchDashboardFeeds();
    } catch (e: any) {
      toast({
        title: "Seeding Failed",
        description: e?.message || "Could not seed catalog",
        variant: "destructive",
      });
    } finally {
      setIsSeeding(false);
    }
  };

  const totalUnitsInStock = products.reduce((sum, p) => sum + p.currentStock, 0);

  // Group by category for distribution
  const categories = Array.from(new Set(products.map((p) => p.category)));
  const categoryStats = categories.map((cat) => {
    const catProducts = products.filter((p) => p.category === cat);
    const catValuation = catProducts.reduce(
      (sum, p) => sum + p.currentStock * p.cost,
      0
    );
    const catUnits = catProducts.reduce((sum, p) => sum + p.currentStock, 0);
    const percentage =
      totalInventoryValuation > 0
        ? Math.min(100, Math.round((catValuation / totalInventoryValuation) * 100))
        : 0;
    return {
      name: cat,
      count: catProducts.length,
      valuation: catValuation,
      units: catUnits,
      percentage,
    };
  });

  const activeAlertsCount = backendAlerts.length > 0 ? backendAlerts.length : lowStockItems.length;

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-12">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
              Inventory Dashboard & Telemetry
            </h1>
            <span
              className={cn(
                "px-2.5 py-0.5 rounded-full text-[11px] font-semibold flex items-center gap-1.5 border",
                isBackendConnected
                  ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                  : "bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400"
              )}
            >
              <Database className="w-3 h-3" />
              <span>{isBackendConnected ? "PostgreSQL 18 RLS Online" : "Connecting Backend..."}</span>
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Real-time stock ledger, automated replenishment calculations, and cryptographic custody telemetry.
          </p>
        </div>

        {/* Quick Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {products.length === 0 && (
            <button
              onClick={handleSeed}
              disabled={isSeeding || isStoreLoading}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold shadow-xs transition-all cursor-pointer disabled:opacity-50"
            >
              {isSeeding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              <span>Seed Catalog</span>
            </button>
          )}

          <button
            onClick={handleRefresh}
            disabled={isStoreLoading || isLoadingAlerts}
            className="flex items-center gap-1 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold shadow-xs transition-all cursor-pointer"
            title="Refresh Live Data"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", (isStoreLoading || isLoadingAlerts) && "animate-spin")} />
          </button>

          <button
            onClick={() => {
              exportProductsToCSV(products);
              toast({
                title: "Catalog Exported",
                description: `Exported ${products.length} products to Excel CSV (UTF-8 BOM).`,
                variant: "success",
              });
            }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold shadow-xs transition-all cursor-pointer"
            title="Export full catalog to Excel CSV"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
            <span>Export CSV</span>
          </button>

          <Link
            href="/stock-in"
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-xs transition-all"
          >
            <ArrowDownLeft className="w-3.5 h-3.5" />
            <span>Stock In</span>
          </Link>
          <Link
            href="/stock-out"
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-xs transition-all"
          >
            <ArrowUpRight className="w-3.5 h-3.5" />
            <span>Stock Out</span>
          </Link>
          {isAdmin && (
            <Link
              href="/products?action=new"
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-xs transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Product</span>
            </Link>
          )}
        </div>
      </div>

      {/* 4 Core Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Total Unique Products */}
        <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Total Catalog SKUs
            </span>
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-500 flex items-center justify-center">
              <Package className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-extrabold text-slate-900 dark:text-white mt-2">
            {isStoreLoading ? <Loader2 className="w-7 h-7 animate-spin text-slate-400" /> : totalProductsCount}
          </div>
          <p className="text-xs text-slate-400 mt-2 flex items-center gap-1">
            <span className="font-semibold text-slate-600 dark:text-slate-300">
              {totalUnitsInStock}
            </span>{" "}
            warehouse units on-hand
          </p>
        </div>

        {/* Metric 2: Total Inventory Valuation */}
        <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Inventory Valuation
            </span>
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
              {isStaff ? <Lock className="w-4 h-4 text-amber-500" /> : <DollarSign className="w-4 h-4" />}
            </div>
          </div>
          {isStaff ? (
            <div className="mt-2 space-y-1">
              <div className="flex items-center gap-1.5 text-amber-500 dark:text-amber-400 font-bold text-xl">
                <Lock className="w-4 h-4" />
                <span>Restricted</span>
              </div>
              <p className="text-xs text-slate-400">
                Staff accounts: valuation masked (Admin Only)
              </p>
            </div>
          ) : (
            <>
              <div className="text-3xl font-extrabold text-slate-900 dark:text-white mt-2">
                {isStoreLoading ? (
                  <Loader2 className="w-7 h-7 animate-spin text-slate-400" />
                ) : (
                  `$${totalInventoryValuation.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                )}
              </div>
              <p className="text-xs text-slate-400 mt-2">
                Weighted moving average / standard cost
              </p>
            </>
          )}
        </div>

        {/* Metric 3: Active Stock Threshold Alerts */}
        <div
          className={cn(
            "p-5 rounded-2xl border shadow-xs transition-colors",
            activeAlertsCount > 0
              ? "border-amber-500/30 bg-amber-500/5"
              : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950"
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider">
              Replenishment Alerts
            </span>
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-500 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-extrabold text-amber-600 dark:text-amber-400 mt-2">
            {isStoreLoading ? <Loader2 className="w-7 h-7 animate-spin text-slate-400" /> : activeAlertsCount}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
            {activeAlertsCount > 0
              ? `${activeAlertsCount} item${activeAlertsCount === 1 ? "" : "s"} need restock order`
              : "All stock levels within buffer limits"}
          </p>
        </div>

        {/* Metric 4: Field & Staff Custody Telemetry */}
        <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Active Staff Custody
            </span>
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-500 flex items-center justify-center">
              <ShieldCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-extrabold text-indigo-600 dark:text-indigo-400 mt-2">
            {custodySummary ? custodySummary.deployed_to_employees : 0}
          </div>
          <div className="text-xs text-slate-400 mt-2 flex items-center justify-between">
            <span>Hardware in field</span>
            <Link href="/custody" className="text-indigo-500 hover:underline font-medium">
              Manage &rarr;
            </Link>
          </div>
        </div>
      </div>

      {/* Main Grid: Replenishment Alerts & Live Activity Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (2 Cols): Replenishment Engine & Category Valuation */}
        <div className="lg:col-span-2 space-y-6">
          {/* Automated Replenishment Alerts Section */}
          <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-500" />
                  <span>Automated Stock Replenishment Feed</span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Calculated by Phase B5 Replenishment Engine: Suggests order quantity based on safety buffers.
                </p>
              </div>

              <div className="flex items-center gap-2">
                {activeAlertsCount > 0 && (
                  <button
                    onClick={() => {
                      exportLowStockReportToCSV(lowStockItems);
                      toast({
                        title: "Low Stock Report Exported",
                        description: `Generated procurement report for ${lowStockItems.length} items.`,
                        variant: "success",
                      });
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 text-xs font-semibold shadow-xs transition-all cursor-pointer"
                    title="Export Low Stock Procurement Report to CSV"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Procurement CSV</span>
                  </button>
                )}
                <Link
                  href="/products?filter=low_stock"
                  className="text-xs font-semibold text-indigo-500 hover:underline flex items-center gap-1"
                >
                  <span>All Products</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>

            {backendAlerts.length === 0 && lowStockItems.length === 0 ? (
              <div className="py-8 text-center text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
                <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                <p className="text-xs font-medium">All products have healthy buffer and reorder levels.</p>
                <p className="text-[11px] text-slate-400 mt-1">
                  Automatic background checks continuously reconcile ledger and evaluate replenishment triggers.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-slate-500 uppercase font-semibold text-[11px]">
                    <tr>
                      <th className="px-4 py-2.5">Item / SKU</th>
                      <th className="px-4 py-2.5 text-center">Alert State</th>
                      <th className="px-4 py-2.5 text-center">On-Hand</th>
                      <th className="px-4 py-2.5 text-center">Buffer / Reorder</th>
                      <th className="px-4 py-2.5 text-center">Suggested PO</th>
                      <th className="px-4 py-2.5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                    {(backendAlerts.length > 0 ? backendAlerts : lowStockItems).map((alert: any) => {
                      const isAlertObj = "suggested_reorder" in alert;
                      const name = alert.name;
                      const sku = alert.sku;
                      const onHand = isAlertObj ? alert.total_on_hand : alert.currentStock;
                      const uom = isAlertObj ? alert.base_uom : alert.unit;
                      const reorderLvl = isAlertObj ? alert.reorder_level : alert.reorderLevel;
                      const bufferLvl = isAlertObj ? alert.buffer_stock : 5;
                      const alertType = isAlertObj
                        ? alert.alert_type
                        : onHand === 0
                        ? "OUT_OF_STOCK"
                        : onHand <= bufferLvl
                        ? "BUFFER_ALERT"
                        : "LOW_STOCK";
                      const suggested = isAlertObj
                        ? alert.suggested_reorder
                        : Math.max(10, reorderLvl * 2 - onHand);
                      const id = isAlertObj ? alert.item_id : alert.id;

                      return (
                        <tr key={sku} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/50">
                          <td className="px-4 py-3">
                            <Link
                              href={`/products/${id}`}
                              className="font-semibold text-slate-900 dark:text-white hover:text-indigo-600 block"
                            >
                              {name}
                            </Link>
                            <div className="text-[11px] font-mono text-indigo-500">{sku}</div>
                          </td>

                          <td className="px-4 py-3 text-center">
                            {alertType === "OUT_OF_STOCK" ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                                OUT OF STOCK
                              </span>
                            ) : alertType === "BUFFER_ALERT" ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                                BUFFER CRITICAL
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                                LOW STOCK
                              </span>
                            )}
                          </td>

                          <td className="px-4 py-3 text-center font-bold text-slate-900 dark:text-white">
                            {onHand} {uom}
                          </td>

                          <td className="px-4 py-3 text-center text-slate-400 text-[11px] font-mono">
                            {bufferLvl} buf &bull; {reorderLvl} reorder
                          </td>

                          <td className="px-4 py-3 text-center">
                            <span className="font-bold text-indigo-600 dark:text-indigo-400 font-mono">
                              +{suggested} {uom}
                            </span>
                          </td>

                          <td className="px-4 py-3 text-right">
                            <Link
                              href={`/stock-in?productId=${id}`}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-semibold transition-all cursor-pointer"
                            >
                              <ArrowDownLeft className="w-3 h-3" />
                              <span>Order</span>
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Category Breakdown & Valuation Share */}
          <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Layers className="w-4 h-4 text-indigo-500" />
                <span>Inventory Valuation by Category</span>
              </h3>
              <span className="text-xs text-slate-400">Total: {categories.length} Categories</span>
            </div>

            {categoryStats.length === 0 ? (
              <p className="text-xs text-slate-400 py-4 text-center">No categories recorded yet.</p>
            ) : (
              <div className="space-y-3">
                {categoryStats.map((c) => (
                  <div
                    key={c.name}
                    className="p-3 rounded-xl border border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/40 space-y-1.5"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-900 dark:text-white">{c.name}</span>
                      <div className="font-mono font-bold text-indigo-600 dark:text-indigo-400">
                        {isStaff ? (
                          <span className="text-[11px] text-slate-400 flex items-center gap-1">
                            <Lock className="w-2.5 h-2.5 text-amber-500" /> Masked
                          </span>
                        ) : (
                          `$${c.valuation.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                        )}
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full bg-slate-200 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
                      <div
                        className="bg-indigo-600 h-1.5 rounded-full transition-all duration-500"
                        style={{ width: `${c.percentage}%` }}
                      />
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-slate-400">
                      <span>
                        {c.count} {c.count === 1 ? "SKU" : "SKUs"} &bull; {c.units} units
                      </span>
                      <span>{c.percentage}% of portfolio</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column (1 Col): Live Movement Activity Feed & Probes */}
        <div className="space-y-6">
          {/* Movement Activity Feed */}
          <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Clock className="w-4 h-4 text-blue-500" />
                <span>Live Audit Timeline</span>
              </h3>
              <span className="text-[11px] text-slate-400 font-mono">PostgreSQL 18</span>
            </div>

            {movements.length === 0 ? (
              <p className="text-xs text-slate-400 py-6 text-center">No stock movements recorded yet.</p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800/60 text-xs">
                {movements.slice(0, 7).map((m) => {
                  const isIn = m.type === "IN";
                  const isOut = m.type === "OUT";

                  return (
                    <div key={m.id} className="py-3 space-y-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              "px-1.5 py-0.5 rounded text-[10px] font-bold uppercase",
                              isIn
                                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                                : isOut
                                ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20"
                                : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                            )}
                          >
                            {m.type}
                          </span>
                          <span className="font-semibold text-slate-900 dark:text-white truncate max-w-[140px]">
                            {m.productName}
                          </span>
                        </div>
                        <span
                          className={cn(
                            "font-bold font-mono",
                            isIn ? "text-emerald-500" : isOut ? "text-blue-500" : "text-amber-500"
                          )}
                        >
                          {isIn ? `+${m.quantity}` : isOut ? `-${m.quantity}` : `${m.quantity > 0 ? "+" : ""}${m.quantity}`}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-slate-400">
                        <span className="truncate max-w-[150px]">
                          {m.partyName || m.reason || m.reference}
                        </span>
                        <span className="font-mono text-[10px]">
                          {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
              <Link
                href="/adjustments"
                className="text-xs font-semibold text-indigo-500 hover:underline flex items-center justify-center gap-1 w-full text-center"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span>Record Inventory Adjustment</span>
              </Link>
            </div>
          </div>

          {/* Infrastructure & Probe Telemetry */}
          <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 shadow-xs space-y-2.5 text-xs text-slate-500">
            <div className="font-bold text-slate-900 dark:text-white flex items-center justify-between">
              <span>Cluster Probes & Security</span>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                HEALTHY
              </span>
            </div>
            <div className="space-y-1.5 pt-1 text-[11px]">
              <div className="flex items-center justify-between">
                <span>PostgreSQL 18 RLS:</span>
                <span className="font-mono text-emerald-600 font-semibold">Ready (Port 5432)</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Valkey 9 In-Memory:</span>
                <span className="font-mono text-emerald-600 font-semibold">Ready (Port 6379)</span>
              </div>
              <div className="flex items-center justify-between">
                <span>OWASP Headers:</span>
                <span className="font-mono text-slate-700 dark:text-slate-300 font-semibold">Strict CSP / HSTS</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Rate Limiting:</span>
                <span className="font-mono text-slate-700 dark:text-slate-300 font-semibold">Sliding Window (RFC 7807)</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
