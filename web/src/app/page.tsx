"use client";

import React from "react";
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
} from "lucide-react";
import { useInventory } from "@/lib/inventory-store";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/components/ui/toast";
import { exportLowStockReportToCSV } from "@/lib/export-csv";
import { cn } from "@/lib/utils";


export default function DashboardPage() {
  const {
    products,
    movements,
    totalProductsCount,
    totalInventoryValuation,
    lowStockItems,
    isLoading,
    isBackendConnected,
    refetch,
    resetToDefaults,
  } = useInventory();
  const { toast } = useToast();
  const { isAdmin, isStaff } = useAuth();

  const [isSeeding, setIsSeeding] = React.useState(false);

  const handleSeed = async () => {
    setIsSeeding(true);
    try {
      await resetToDefaults();
      toast({
        title: "Catalog Seeded",
        description: "Successfully seeded initial items and warehouse balances into PostgreSQL.",
        variant: "success",
      });
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
    return { name: cat, count: catProducts.length, valuation: catValuation, units: catUnits };
  });

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
              Inventory Dashboard
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
              <span>{isBackendConnected ? "PostgreSQL Ledger Online" : "Connecting Backend..."}</span>
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Real-time stock tracking, valuation, and low stock alerts powered by PostgreSQL two-sided ledger.
          </p>
        </div>

        {/* Quick Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {products.length === 0 && (
            <button
              onClick={handleSeed}
              disabled={isSeeding || isLoading}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold shadow-xs transition-all cursor-pointer disabled:opacity-50"
            >
              {isSeeding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              <span>Seed Initial Catalog</span>
            </button>
          )}

          <button
            onClick={() => refetch()}
            disabled={isLoading}
            className="flex items-center gap-1 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold shadow-xs transition-all cursor-pointer"
            title="Refresh Live Data"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", isLoading && "animate-spin")} />
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
              Total Products
            </span>
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-500 flex items-center justify-center">
              <Package className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-extrabold text-slate-900 dark:text-white mt-2">
            {isLoading ? <Loader2 className="w-7 h-7 animate-spin text-slate-400" /> : totalProductsCount}
          </div>
          <p className="text-xs text-slate-400 mt-2 flex items-center gap-1">
            <span className="font-semibold text-slate-600 dark:text-slate-300">
              {totalUnitsInStock}
            </span>{" "}
            total units in stock
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
                {isLoading ? (
                  <Loader2 className="w-7 h-7 animate-spin text-slate-400" />
                ) : (
                  `$${totalInventoryValuation.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                )}
              </div>
              <p className="text-xs text-slate-400 mt-2">
                Based on current stock &times; cost price
              </p>
            </>
          )}
        </div>

        {/* Metric 3: Low Stock Alerts */}
        <div
          className={cn(
            "p-5 rounded-2xl border shadow-xs transition-colors",
            lowStockItems.length > 0
              ? "border-amber-500/30 bg-amber-500/5"
              : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950"
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider">
              Low Stock Alerts
            </span>
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-500 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-extrabold text-amber-600 dark:text-amber-400 mt-2">
            {isLoading ? <Loader2 className="w-7 h-7 animate-spin text-slate-400" /> : lowStockItems.length}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
            {lowStockItems.length > 0
              ? "Items at or below reorder level"
              : "All stock levels healthy"}
          </p>
        </div>

        {/* Metric 4: Recent Activity Count */}
        <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Stock Moves in DB
            </span>
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-500 flex items-center justify-center">
              <Activity className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-extrabold text-slate-900 dark:text-white mt-2">
            {isLoading ? <Loader2 className="w-7 h-7 animate-spin text-slate-400" /> : movements.length}
          </div>
          <p className="text-xs text-slate-400 mt-2">
            Live two-sided ledger rows in PostgreSQL
          </p>
        </div>
      </div>

      {/* Main Grid: Low Stock Table & Activity Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (2 Cols): Low Stock Alerts Table & Categories */}
        <div className="lg:col-span-2 space-y-6">
          {/* Low Stock Alert Section */}
          <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                  <span>Low Stock Alert List</span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Products requiring purchase reorder (Current Stock &le; Reorder Level)
                </p>
              </div>
              <div className="flex items-center gap-2">
                {lowStockItems.length > 0 && (
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
                    <span>Export Low Stock Report</span>
                  </button>
                )}
                <Link
                  href="/products"
                  className="text-xs font-semibold text-indigo-500 hover:underline flex items-center gap-1"
                >
                  <span>View All Products</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>


            {lowStockItems.length === 0 ? (
              <div className="py-8 text-center text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
                <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                <p className="text-xs font-medium">All products have sufficient stock levels.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-slate-500 uppercase font-semibold text-[11px]">
                    <tr>
                      <th className="px-4 py-2.5">SKU / Item</th>
                      <th className="px-4 py-2.5">Category</th>
                      <th className="px-4 py-2.5 text-center">Current Stock</th>
                      <th className="px-4 py-2.5 text-center">Reorder Level</th>
                      <th className="px-4 py-2.5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                    {lowStockItems.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/50">
                        <td className="px-4 py-3">
                          <div className="font-semibold text-slate-900 dark:text-white">
                            {item.name}
                          </div>
                          <div className="text-[11px] font-mono text-indigo-500">{item.sku}</div>
                        </td>
                        <td className="px-4 py-3 text-slate-500">{item.category}</td>
                        <td className="px-4 py-3 text-center">
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                            {item.currentStock} {item.unit}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center font-mono text-slate-400">
                          {item.reorderLevel} {item.unit}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Link
                            href={`/stock-in?productId=${item.id}`}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-semibold transition-all"
                          >
                            <ArrowDownLeft className="w-3 h-3" />
                            <span>Restock</span>
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Category Breakdown */}
          <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 shadow-xs space-y-4">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Layers className="w-4 h-4 text-indigo-500" />
              <span>Inventory by Category</span>
            </h3>
            {categoryStats.length === 0 ? (
              <p className="text-xs text-slate-400 py-4 text-center">No categories recorded yet.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                {categoryStats.map((c) => (
                  <div
                    key={c.name}
                    className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40"
                  >
                    <span className="text-xs font-bold text-slate-900 dark:text-white truncate block">
                      {c.name}
                    </span>
                    <div className="text-base font-extrabold text-indigo-600 dark:text-indigo-400 mt-1">
                      {isStaff ? (
                        <span className="text-xs font-semibold text-slate-400 flex items-center gap-1">
                          <Lock className="w-3 h-3 text-amber-500" /> Masked (Staff)
                        </span>
                      ) : (
                        `$${c.valuation.toLocaleString("en-US", { maximumFractionDigits: 0 })}`
                      )}
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      {c.count} {c.count === 1 ? "product" : "products"} &middot; {c.units} units
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column (1 Col): Recent Movement Activity Feed */}
        <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 shadow-xs space-y-4 h-fit">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Clock className="w-4 h-4 text-blue-500" />
              <span>Recent Activity Feed</span>
            </h3>
            <span className="text-[11px] text-slate-400 font-medium">PostgreSQL Live</span>
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
      </div>
    </div>
  );
}
