"use client";

import React, { useState, useEffect, useMemo, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Package,
  DollarSign,
  AlertTriangle,
  ArrowDownLeft,
  Plus,
  ArrowRight,
  Layers,
  CheckCircle2,
  Clock,
  RefreshCw,
  Loader2,
  Download,
  ShieldCheck,
  AlertCircle,
  Boxes,
  Wrench,
  Mail,
  UserCheck,
  PenTool,
  RotateCcw,
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Check,
  X,
  Briefcase,
} from "lucide-react";
import { useInventory, Product } from "@/lib/inventory-store";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/components/ui/toast";
import { exportLowStockReportToCSV } from "@/lib/export-csv";
import { apiClient, CustodySummary, WarrantyAlertItem } from "@/lib/api";
import { FinanceReportModal } from "@/components/documents/finance-report-modal";
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
  return (
    <Suspense fallback={<div className="py-16 text-center text-xs text-slate-400">Loading office overview…</div>}>
      <DashboardContent />
    </Suspense>
  );
}

function DashboardContent() {
  const {
    products,
    movements,
    totalProductsCount,
    totalInventoryValuation,
    totalOwnedUnits,
    totalInStoreUnits,
    totalAssignedUnits,
    totalFaultyUnits,
    totalInRepairUnits,
    totalRepairedUnits,
    lowStockItems,
    isLoading: isStoreLoading,
    refetch,
  } = useInventory();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { user, isSuperAdmin, isAdmin, isStaff, isLoading: isAuthLoading } = useAuth();

  // Staff portal home is /my-assets — block admin fleet console for staff roles
  useEffect(() => {
    if (isAuthLoading) return;
    if (isStaff && !isAdmin) {
      router.replace("/my-assets");
    }
  }, [isAuthLoading, isStaff, isAdmin, router]);

  // Operational Data States
  const [backendAlerts, setBackendAlerts] = useState<StockAlert[]>([]);
  const [custodySummary, setCustodySummary] = useState<CustodySummary | null>(null);
  const [warrantyAlerts, setWarrantyAlerts] = useState<WarrantyAlertItem[]>([]);
  const [isLoadingAlerts, setIsLoadingAlerts] = useState(false);
  const [isFinanceModalOpen, setIsFinanceModalOpen] = useState(false);

  // Sidebar "Finance record" → /dashboard?finance=1
  useEffect(() => {
    if (searchParams.get("finance") === "1") {
      setIsFinanceModalOpen(true);
    }
  }, [searchParams]);

  const closeFinanceModal = () => {
    setIsFinanceModalOpen(false);
    if (searchParams.get("finance") === "1") {
      router.replace("/dashboard");
    }
  };
  const [emailingWarranty, setEmailingWarranty] = useState(false);
  const [emailingLowStock, setEmailingLowStock] = useState(false);

  // Table Search, Filtering, and Pagination States
  const [tableSearchQuery, setTableSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "IN_STORE" | "ASSIGNED" | "FAULTY_OR_REPAIR">("ALL");
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 15;

  // Fetch alerts and custody feeds
  const fetchDashboardFeeds = async () => {
    setIsLoadingAlerts(true);
    try {
      const alertsRes = await apiClient.stock.getAlerts();
      if (alertsRes.success && Array.isArray(alertsRes.data)) {
        setBackendAlerts(alertsRes.data);
      } else {
        setBackendAlerts([]);
      }
    } catch {
      setBackendAlerts([]);
    }

    try {
      const custodyRes = await apiClient.custody.getSummary();
      if (custodyRes.success && custodyRes.data) {
        setCustodySummary(custodyRes.data);
      } else {
        setCustodySummary(null);
      }
    } catch {
      setCustodySummary(null);
    }

    try {
      const warrantyRes = await apiClient.reports.getWarrantyAlerts(30);
      if (warrantyRes.success && warrantyRes.data?.items) {
        setWarrantyAlerts(warrantyRes.data.items);
      } else {
        setWarrantyAlerts([]);
      }
    } catch {
      setWarrantyAlerts([]);
    } finally {
      setIsLoadingAlerts(false);
    }
  };

  const handleEmailWarrantyDigest = async () => {
    setEmailingWarranty(true);
    try {
      const res = await apiClient.reports.emailWarrantyAlerts({ days: 30 });
      toast({
        title: "Warranty digest sent",
        description: `Sent ${res.data?.count || 0} alert(s). Check Mailpit at ${res.data?.mailpit_url || "http://localhost:8025"}.`,
        variant: "success",
      });
    } catch (err: any) {
      toast({
        title: "Could not send warranty digest",
        description: err?.problem?.detail || err?.message || "Set an alert email in Workspace Settings.",
        variant: "destructive",
      });
    } finally {
      setEmailingWarranty(false);
    }
  };

  const handleEmailLowStockDigest = async () => {
    setEmailingLowStock(true);
    try {
      const res = await apiClient.reports.emailLowStockDigest();
      toast({
        title: "Low-stock digest sent",
        description: `Sent ${res.data?.count || 0} item(s). Check Mailpit at ${res.data?.mailpit_url || "http://localhost:8025"}.`,
        variant: "success",
      });
    } catch (err: any) {
      toast({
        title: "Could not send low-stock digest",
        description: err?.problem?.detail || err?.message || "Set an alert email in Workspace Settings.",
        variant: "destructive",
      });
    } finally {
      setEmailingLowStock(false);
    }
  };

  useEffect(() => {
    fetchDashboardFeeds();
  }, []);

  const handleRefresh = async () => {
    await Promise.all([refetch(), fetchDashboardFeeds()]);
    toast({
      title: "Data Refreshed",
      description: "Live IT inventory and fleet lifecycle metrics are up to date.",
      variant: "success",
    });
  };

  // Reset page when search or filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [tableSearchQuery, categoryFilter, statusFilter]);

  // Unique Categories
  const categories = useMemo(() => {
    return Array.from(new Set(products.map((p) => p.category))).filter(Boolean);
  }, [products]);

  // Category stats calculation
  const categoryStats = useMemo(() => {
    return categories.map((cat) => {
      const catProducts = products.filter((p) => p.category === cat);
      const catValuation = catProducts.reduce((sum, p) => sum + p.totalOwned * p.cost, 0);
      const catUnits = catProducts.reduce((sum, p) => sum + p.totalOwned, 0);
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
  }, [categories, products, totalInventoryValuation]);

  // Filtered Products for the Lifecycle Breakdown Table
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      // 1. Text search
      const q = tableSearchQuery.trim().toLowerCase();
      const matchesSearch =
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q);

      // 2. Category filter
      const matchesCategory = categoryFilter === "ALL" || p.category === categoryFilter;

      // 3. Status filter
      let matchesStatus = true;
      if (statusFilter === "IN_STORE") {
        matchesStatus = p.currentStock > 0;
      } else if (statusFilter === "ASSIGNED") {
        matchesStatus = p.assignedCount > 0;
      } else if (statusFilter === "FAULTY_OR_REPAIR") {
        matchesStatus = p.faultyCount > 0 || p.inRepairCount > 0;
      }

      return matchesSearch && matchesCategory && matchesStatus;
    });
  }, [products, tableSearchQuery, categoryFilter, statusFilter]);

  // Pagination slice
  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / PAGE_SIZE));
  const paginatedProducts = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredProducts.slice(start, start + PAGE_SIZE);
  }, [filteredProducts, currentPage]);

  const activeAlertsCount =
    products.length === 0
      ? 0
      : backendAlerts.length > 0
      ? backendAlerts.length
      : lowStockItems.length;

  const effectiveAssignedUnits = Math.max(
    totalAssignedUnits,
    custodySummary?.deployed_to_employees || 0
  );

  if (isAuthLoading || (isStaff && !isAdmin)) {
    return (
      <div className="py-24 flex items-center justify-center text-xs text-slate-400">
        Redirecting to your devices…
      </div>
    );
  }

  // 1. Suspension Lockout Guard
  if (user?.is_suspended || user?.org_plan?.toLowerCase() === "suspended") {
    return (
      <div className="max-w-xl mx-auto my-16 p-8 rounded-3xl bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-900/40 shadow-2xl text-center space-y-5">
        <div className="w-16 h-16 rounded-2xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 flex items-center justify-center mx-auto border border-rose-200 dark:border-rose-800">
          <AlertTriangle className="w-8 h-8 text-rose-600" />
        </div>
        <div className="space-y-2">
          <span className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-rose-50 text-rose-700 border border-rose-200">
            Workspace Suspended
          </span>
          <h2 className="text-xl font-extrabold text-slate-900 dark:text-white">
            Commercial Billing Hold Enforced
          </h2>
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed max-w-md mx-auto">
            This organization software workspace has been placed on commercial billing hold. All equipment records and employee digital signatures remain secure in PostgreSQL Row-Level Security.
          </p>
        </div>
        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-300 space-y-1">
          <div className="font-semibold text-slate-900 dark:text-white">Need Immediate Access?</div>
          <div>Contact Whoopit SaaS Administration: <strong className="text-[#0c3843] dark:text-cyan-400">admin@whoopit.io</strong></div>
        </div>
      </div>
    );
  }

  // 2. 30-Day Evaluation Period Expired Lockout Guard
  if (user?.is_trial_expired) {
    return (
      <div className="max-w-xl mx-auto my-16 p-8 rounded-3xl bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-900/40 shadow-2xl text-center space-y-5">
        <div className="w-16 h-16 rounded-2xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 flex items-center justify-center mx-auto border border-amber-200 dark:border-amber-800">
          <Clock className="w-8 h-8 text-amber-600" />
        </div>
        <div className="space-y-2">
          <span className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-200">
            30-Day Evaluation Expired
          </span>
          <h2 className="text-xl font-extrabold text-slate-900 dark:text-white">
            Your 30-Day Evaluation Period Has Ended
          </h2>
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed max-w-md mx-auto">
            Your evaluation access for Whoopit Office IT software has ended. All your company assets, custody records, and digital signatures are safely preserved. Upgrade to a commercial license (Standard or Enterprise) to resume active management.
          </p>
        </div>
        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-300 space-y-1">
          <div className="font-semibold text-slate-900 dark:text-white">Commercial License Upgrades:</div>
          <div>Contact Platform Administrator: <strong className="text-[#0c3843] dark:text-cyan-400">admin@whoopit.io</strong></div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16 page-enter">
      {/* 30-Day Evaluation Trial Active Banner */}
      {user?.org_plan?.toLowerCase() === "trial" && (
        <div className="p-3.5 rounded-2xl bg-gradient-to-r from-amber-50 via-amber-100/70 to-amber-50 border border-amber-200 text-amber-900 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-xs">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <span className="font-extrabold text-amber-950 block">
                30-Day Free Evaluation Trial &bull; {user?.trial_days_remaining ?? 30} Days Remaining
              </span>
              <span className="text-[11px] text-amber-800">
                Full e-Signature handovers and hardware tracking active. Contact admin@whoopit.io for permanent Enterprise deployment.
              </span>
            </div>
          </div>
          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-200/80 text-amber-900 border border-amber-300 shrink-0 self-start sm:self-center">
            Evaluation License
          </span>
        </div>
      )}

      <div className="page-hero space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap mb-1.5">
              <span className="text-[11px] font-semibold text-slate-500">
                {user?.org_name || "Office IT"} · {user?.org_plan || "plan"}
              </span>
              {activeAlertsCount > 0 && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200 animate-pulse">
                  {activeAlertsCount} stock alerts
                </span>
              )}
            </div>
            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 dark:text-white">
              Office overview
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-xl leading-relaxed">
              In store, with staff, faulty, and at vendor — one glance before you buy or issue more stock.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <Link
              href="/custody?action=new"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#0c3843] hover:bg-[#082931] text-white text-xs font-bold shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all"
            >
              <ShieldCheck className="w-4 h-4 text-cyan-300" />
              Assign to staff
            </Link>
            <Link
              href="/products?action=new"
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200/90 dark:border-slate-700 bg-white/90 dark:bg-slate-900 text-slate-700 text-xs font-semibold hover:border-[#0c3843]/35 hover:bg-white hover:-translate-y-0.5 transition-all"
            >
              <Plus className="w-4 h-4" />
              Add equipment
            </Link>
            <button
              type="button"
              onClick={() => setIsFinanceModalOpen(true)}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-emerald-200/90 bg-emerald-50/80 dark:bg-emerald-950/30 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200 text-xs font-semibold hover:-translate-y-0.5 transition-all cursor-pointer"
            >
              <DollarSign className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Show finance the previous record</span>
              <span className="sm:hidden">Finance record</span>
            </button>
            <button
              type="button"
              onClick={handleRefresh}
              disabled={isStoreLoading || isLoadingAlerts}
              className="p-2 rounded-xl border border-slate-200/90 dark:border-slate-700 bg-white/90 dark:bg-slate-900 hover:border-[#0c3843]/35 hover:-translate-y-0.5 transition-all cursor-pointer disabled:opacity-50"
            >
              <RefreshCw
                className={cn("w-4 h-4 text-[#0c3843]", (isStoreLoading || isLoadingAlerts) && "animate-spin")}
              />
            </button>
          </div>
        </div>

        {/* Fleet KPI cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 kpi-stagger">
          <Link
            href="/products"
            className="kpi-card border border-[#0c3843]/20 bg-gradient-to-br from-[#0c3843]/10 to-white dark:from-[#0c3843]/30 dark:to-slate-950 text-[#0c3843]"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wide text-[#0c3843]/90">Fleet</span>
              <div className="kpi-icon w-8 h-8 rounded-xl bg-[#0c3843]/12 text-[#0c3843] flex items-center justify-center border border-[#0c3843]/20">
                <Package className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-extrabold text-slate-900 dark:text-white font-mono tracking-tight">
              {isStoreLoading ? "…" : totalOwnedUnits}
            </div>
            <div className="text-[11px] text-[#0c3843]/75 font-medium mt-1">
              {isStoreLoading ? "Loading…" : `${totalProductsCount} models`}
            </div>
          </Link>

          <Link
            href="/products?filter=in_store"
            className="kpi-card border border-emerald-200/90 bg-gradient-to-br from-emerald-50 to-white dark:from-emerald-950/40 dark:to-slate-950 text-emerald-700"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wide text-emerald-800 dark:text-emerald-300">Available</span>
              <div className="kpi-icon w-8 h-8 rounded-xl bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 flex items-center justify-center border border-emerald-200 dark:border-emerald-800">
                <CheckCircle2 className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-extrabold text-slate-900 dark:text-white font-mono tracking-tight">
              {isStoreLoading ? "…" : totalInStoreUnits}
            </div>
            <div className="text-[11px] text-emerald-700/80 dark:text-emerald-400/80 font-medium mt-1">In store ready</div>
          </Link>

          <Link
            href="/custody"
            className="kpi-card border border-teal-200/90 bg-gradient-to-br from-teal-50 to-white dark:from-teal-950/40 dark:to-slate-950 text-teal-700"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wide text-teal-800 dark:text-teal-300">With staff</span>
              <div className="kpi-icon w-8 h-8 rounded-xl bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300 flex items-center justify-center border border-teal-200 dark:border-teal-800">
                <UserCheck className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-extrabold text-slate-900 dark:text-white font-mono tracking-tight">
              {isStoreLoading ? "…" : effectiveAssignedUnits}
            </div>
            <div className="text-[11px] text-teal-700/80 dark:text-teal-400/80 font-medium mt-1">Active custody</div>
          </Link>

          <Link
            href="/adjustments?status=FAULTY"
            className="kpi-card border border-rose-200/90 bg-gradient-to-br from-rose-50 to-white dark:from-rose-950/40 dark:to-slate-950 text-rose-700"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wide text-rose-800 dark:text-rose-300">Faulty</span>
              <div className="kpi-icon w-8 h-8 rounded-xl bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300 flex items-center justify-center border border-rose-200 dark:border-rose-800">
                <AlertTriangle className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-extrabold text-slate-900 dark:text-white font-mono tracking-tight">
              {isStoreLoading ? "…" : totalFaultyUnits}
            </div>
            <div className="text-[11px] text-rose-700/80 dark:text-rose-400/80 font-medium mt-1">Needs attention</div>
          </Link>

          <Link
            href="/adjustments?status=AT_VENDOR"
            className="kpi-card border border-amber-200/90 bg-gradient-to-br from-amber-50 to-white dark:from-amber-950/40 dark:to-slate-950 text-amber-700"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wide text-amber-800 dark:text-amber-300">At vendor</span>
              <div className="kpi-icon w-8 h-8 rounded-xl bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 flex items-center justify-center border border-amber-200 dark:border-amber-800">
                <Wrench className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-extrabold text-slate-900 dark:text-white font-mono tracking-tight">
              {isStoreLoading ? "…" : totalInRepairUnits}
            </div>
            <div className="text-[11px] text-amber-700/80 dark:text-amber-400/80 font-medium mt-1">Out for repair</div>
          </Link>

          <Link
            href="/adjustments?status=REPAIRED"
            className="kpi-card border border-slate-200 dark:border-slate-700 bg-gradient-to-br from-slate-50 to-white dark:from-slate-900 dark:to-slate-950 text-slate-600"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wide text-slate-700 dark:text-slate-300">Restored</span>
              <div className="kpi-icon w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center border border-slate-200 dark:border-slate-700">
                <RotateCcw className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-extrabold text-slate-900 dark:text-white font-mono tracking-tight">
              {isStoreLoading ? "…" : totalRepairedUnits}
            </div>
            <div className="text-[11px] text-slate-500 font-medium mt-1">Back in circulation</div>
          </Link>

          <button
            type="button"
            onClick={() => setIsFinanceModalOpen(true)}
            className="kpi-card border border-sky-200/90 bg-gradient-to-br from-sky-50 to-white dark:from-sky-950/40 dark:to-slate-950 text-sky-700 cursor-pointer col-span-2 md:col-span-1 xl:col-span-2"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wide text-sky-800 dark:text-sky-300">Book value</span>
              <div className="kpi-icon w-8 h-8 rounded-xl bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300 flex items-center justify-center border border-sky-200 dark:border-sky-800">
                <DollarSign className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-extrabold text-slate-900 dark:text-white font-mono tracking-tight">
              {isStoreLoading
                ? "…"
                : `$${totalInventoryValuation.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
            </div>
            <div className="text-[11px] text-sky-700/80 dark:text-sky-400/80 font-medium mt-1">Show previous record</div>
          </button>
        </div>
      </div>

      <div className="surface-panel border-amber-200/80 bg-gradient-to-r from-amber-50/90 via-amber-50/50 to-white dark:from-amber-950/30 dark:via-amber-950/10 dark:to-slate-950 dark:border-amber-900/40 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-600" />
            Warranty / AMC due soon
            <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold">
              {isLoadingAlerts ? "…" : warrantyAlerts.length}
            </span>
          </h3>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
            {warrantyAlerts.length === 0
              ? "No warranty or AMC dates fall inside the next 30 days."
              : warrantyAlerts
                  .slice(0, 3)
                  .map((item) => `${item.name} (${item.expiry_date})`)
                  .join(" · ") + (warrantyAlerts.length > 3 ? ` · +${warrantyAlerts.length - 3} more` : "")}
          </p>
        </div>
        <button
          type="button"
          disabled={emailingWarranty || warrantyAlerts.length === 0}
          onClick={handleEmailWarrantyDigest}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#0c3843] hover:bg-[#082931] text-white text-xs font-bold disabled:opacity-50 hover:-translate-y-0.5 transition-all cursor-pointer"
        >
          <Mail className="w-3.5 h-3.5" />
          {emailingWarranty ? "Sending…" : "Email digest"}
        </button>
      </div>

      {/* ======================================================== */}
      {/* 4. COMPLETE IT EQUIPMENT LIFECYCLE BREAKDOWN TABLE        */}
      {/* ======================================================== */}
      <div className="surface-panel overflow-hidden">
        {/* Table Header & Controls Bar */}
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                <Boxes className="w-5 h-5 text-[#0c3843] dark:text-cyan-400" />
                <span>Equipment by model</span>
                <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-xs font-mono font-bold">
                  {isStoreLoading ? "…" : filteredProducts.length}
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Owned · available · with staff · faulty · at vendor — per model.
              </p>
            </div>
          </div>

          {/* Search Bar & Quick Filters Toolbar */}
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 pt-2">
            {/* Search Input */}
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search equipment by model, brand, SKU, or category..."
                value={tableSearchQuery}
                onChange={(e) => setTableSearchQuery(e.target.value)}
                className="w-full pl-9 pr-8 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0c3843]/30 focus:border-[#0c3843] transition-all"
              />
              {tableSearchQuery && (
                <button
                  onClick={() => setTableSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Filter Pills */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Category Dropdown */}
              <div className="relative">
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-[#0c3843]/30 cursor-pointer shadow-2xs"
                >
                  <option value="ALL">All Categories ({products.length})</option>
                  {categories.map((c) => (
                    <option key={c} value={c}>
                      {c} ({products.filter((p) => p.category === c).length})
                    </option>
                  ))}
                </select>
              </div>

              {/* Status Filter Buttons */}
              <div className="flex items-center rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 p-0.5 text-xs font-medium">
                <button
                  onClick={() => setStatusFilter("ALL")}
                  className={cn(
                    "px-2.5 py-1 rounded-lg transition-all",
                    statusFilter === "ALL"
                      ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-bold shadow-2xs"
                      : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
                  )}
                >
                  All
                </button>
                <button
                  onClick={() => setStatusFilter("IN_STORE")}
                  className={cn(
                    "px-2.5 py-1 rounded-lg transition-all",
                    statusFilter === "IN_STORE"
                      ? "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 font-bold shadow-2xs"
                      : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
                  )}
                >
                  Available ({products.filter((p) => p.currentStock > 0).length})
                </button>
                <button
                  onClick={() => setStatusFilter("ASSIGNED")}
                  className={cn(
                    "px-2.5 py-1 rounded-lg transition-all",
                    statusFilter === "ASSIGNED"
                      ? "bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-400 font-bold shadow-2xs"
                      : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
                  )}
                >
                  Assigned ({products.filter((p) => p.assignedCount > 0).length})
                </button>
                <button
                  onClick={() => setStatusFilter("FAULTY_OR_REPAIR")}
                  className={cn(
                    "px-2.5 py-1 rounded-lg transition-all",
                    statusFilter === "FAULTY_OR_REPAIR"
                      ? "bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 font-bold shadow-2xs"
                      : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
                  )}
                >
                  Repairs ({products.filter((p) => p.faultyCount > 0 || p.inRepairCount > 0).length})
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Table Content */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                <th className="py-3 px-3.5 text-center w-14">S.No</th>
                <th className="py-3 px-4 min-w-[200px]">IT Equipment / SKU</th>
                <th className="py-3 px-3">Category</th>
                <th className="py-3 px-3 text-center">Total Owned</th>
                <th className="py-3 px-3 text-center text-emerald-700 dark:text-emerald-400">
                  In Store (Available)
                </th>
                <th className="py-3 px-3 text-center text-blue-700 dark:text-blue-400">
                  Assigned to Staff
                </th>
                <th className="py-3 px-3 text-center text-rose-700 dark:text-rose-400">
                  Defective / Faulty
                </th>
                <th className="py-3 px-3 text-center text-amber-700 dark:text-amber-400">
                  At Vendor Repair
                </th>
                <th className="py-3 px-3 text-center text-purple-700 dark:text-purple-400">
                  Repaired History
                </th>
                <th className="py-3 px-4 text-right min-w-[190px]">Quick Operations</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
              {isStoreLoading ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <RefreshCw className="w-8 h-8 text-slate-300 dark:text-slate-600 animate-spin" />
                      <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
                        Loading office equipment…
                      </p>
                      <p className="text-xs text-slate-400">
                        Pulling live store, custody, and repair balances from the company database.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : paginatedProducts.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Boxes className="w-8 h-8 text-slate-300 dark:text-slate-600" />
                      <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
                        {tableSearchQuery || categoryFilter !== "ALL" || statusFilter !== "ALL"
                          ? "No IT assets match your current search or filters."
                          : "No IT items registered yet."}
                      </p>
                      <p className="text-xs text-slate-400">
                        {tableSearchQuery || categoryFilter !== "ALL" || statusFilter !== "ALL"
                          ? "Try clearing the search query or changing your filter criteria."
                          : "Click 'Add IT Asset' above to register laptops, displays, or peripherals."}
                      </p>
                      {(tableSearchQuery || categoryFilter !== "ALL" || statusFilter !== "ALL") && (
                        <button
                          onClick={() => {
                            setTableSearchQuery("");
                            setCategoryFilter("ALL");
                            setStatusFilter("ALL");
                          }}
                          className="mt-2 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300 transition-all cursor-pointer"
                        >
                          Reset Filters
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedProducts.map((p, idx) => {
                  const continuousSerial = (currentPage - 1) * PAGE_SIZE + idx + 1;
                  const formattedSerial = continuousSerial < 10 ? `#0${continuousSerial}` : `#${continuousSerial}`;

                  return (
                    <tr
                      key={p.id}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-900/40 transition-colors group"
                    >
                      {/* S.No */}
                      <td className="py-3.5 px-3.5 text-center font-mono font-bold text-slate-400 text-[11px]">
                        {formattedSerial}
                      </td>

                      {/* Equipment Name & SKU */}
                      <td className="py-3.5 px-4">
                        <Link
                          href={`/products/${p.id}`}
                          className="font-bold text-slate-900 dark:text-white hover:text-[#0c3843] dark:hover:text-cyan-400 transition-colors flex items-center gap-1.5"
                        >
                          <span>{p.name}</span>
                          <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity text-slate-400" />
                        </Link>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] font-mono text-slate-400 font-medium">
                            {p.sku}
                          </span>
                          {p.barcode && (
                            <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-500">
                              {p.barcode}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Category */}
                      <td className="py-3.5 px-3">
                        <span className="px-2.5 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-[11px] whitespace-nowrap">
                          {p.category}
                        </span>
                      </td>

                      {/* Total Owned */}
                      <td className="py-3.5 px-3 text-center font-mono font-extrabold text-sm text-slate-900 dark:text-white">
                        {p.totalOwned}
                      </td>

                      {/* In Store (Available) */}
                      <td className="py-3.5 px-3 text-center">
                        <span
                          className={cn(
                            "px-2.5 py-1 rounded-lg font-mono font-extrabold text-xs inline-block min-w-[36px]",
                            p.currentStock > 0
                              ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20"
                              : "text-slate-400 bg-slate-100 dark:bg-slate-900"
                          )}
                        >
                          {p.currentStock}
                        </span>
                      </td>

                      {/* Assigned to Staff */}
                      <td className="py-3.5 px-3 text-center">
                        <span
                          className={cn(
                            "px-2.5 py-1 rounded-lg font-mono font-extrabold text-xs inline-block min-w-[36px]",
                            p.assignedCount > 0
                              ? "bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-500/20"
                              : "text-slate-400 bg-slate-100 dark:bg-slate-900"
                          )}
                        >
                          {p.assignedCount}
                        </span>
                      </td>

                      {/* Defective / Faulty */}
                      <td className="py-3.5 px-3 text-center">
                        <span
                          className={cn(
                            "px-2.5 py-1 rounded-lg font-mono font-extrabold text-xs inline-block min-w-[36px]",
                            p.faultyCount > 0
                              ? "bg-rose-500/15 text-rose-700 dark:text-rose-400 border border-rose-500/30"
                              : "text-slate-400"
                          )}
                        >
                          {p.faultyCount}
                        </span>
                      </td>

                      {/* At Vendor Repair */}
                      <td className="py-3.5 px-3 text-center">
                        <span
                          className={cn(
                            "px-2.5 py-1 rounded-lg font-mono font-extrabold text-xs inline-block min-w-[36px]",
                            p.inRepairCount > 0
                              ? "bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30"
                              : "text-slate-400"
                          )}
                        >
                          {p.inRepairCount}
                        </span>
                      </td>

                      {/* Repaired History */}
                      <td className="py-3.5 px-3 text-center">
                        <span
                          className={cn(
                            "px-2.5 py-1 rounded-lg font-mono font-extrabold text-xs inline-block min-w-[36px]",
                            p.repairedCount > 0
                              ? "bg-purple-500/15 text-purple-700 dark:text-purple-400 border border-purple-500/30"
                              : "text-slate-400"
                          )}
                        >
                          {p.repairedCount}
                        </span>
                      </td>

                      {/* Quick Operations */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {p.currentStock > 0 ? (
                            <Link
                              href={`/custody?assetId=${p.id}`}
                              className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-bold transition-all shadow-2xs whitespace-nowrap"
                              title="Assign to Employee with Employee ID & Digital Signature"
                            >
                              Assign
                            </Link>
                          ) : (
                            <Link
                              href={`/stock-in?productId=${p.id}`}
                              className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[11px] font-bold transition-all whitespace-nowrap"
                              title="Stock depleted — Add purchase shipment"
                            >
                              Add Stock
                            </Link>
                          )}

                          <Link
                            href={`/adjustments?productId=${p.id}`}
                            className="px-2.5 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30 text-[11px] font-bold transition-all whitespace-nowrap"
                            title="Log Faulty or Send to Vendor Workshop"
                          >
                            Repair
                          </Link>

                          <Link
                            href={`/products/${p.id}`}
                            className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
                            title="View Full Item Details & Specs"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Table Footer with Pagination Controls */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-500">
          <div>
            Showing{" "}
            <strong className="text-slate-900 dark:text-white">
              {filteredProducts.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1}
            </strong>{" "}
            to{" "}
            <strong className="text-slate-900 dark:text-white">
              {Math.min(currentPage * PAGE_SIZE, filteredProducts.length)}
            </strong>{" "}
            of{" "}
            <strong className="text-slate-900 dark:text-white">
              {filteredProducts.length}
            </strong>{" "}
            hardware models
          </div>

          {totalPages > 1 && (
            <div className="flex items-center gap-1.5 self-center sm:self-auto">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed shadow-2xs transition-all flex items-center gap-1 cursor-pointer"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>Previous</span>
              </button>

              <span className="px-3 py-1 font-mono font-bold text-slate-700 dark:text-slate-300">
                Page {currentPage} of {totalPages}
              </span>

              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed shadow-2xs transition-all flex items-center gap-1 cursor-pointer"
              >
                <span>Next</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ======================================================== */}
      {/* 5. OPERATIONAL INTELLIGENCE: ALERTS, VALUATION & AUDIT   */}
      {/* ======================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 min-w-0">
        {/* Left 2 Columns: Low Stock Procurement & Category Valuation */}
        <div className="lg:col-span-2 space-y-6 min-w-0">
          {/* Automated Replenishment & Low Stock Alerts */}
          <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 shadow-xs space-y-4 overflow-hidden">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <AlertCircle className="w-4.5 h-4.5 text-amber-500" />
                  <span>IT Store Low Stock &amp; Procurement Alerts</span>
                  {activeAlertsCount > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-400 font-mono font-bold text-xs">
                      {activeAlertsCount} Critical
                    </span>
                  )}
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Flags accessories and hardware below reorder buffer levels in the store room.
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0 flex-wrap">
                {activeAlertsCount > 0 && (
                  <button
                    type="button"
                    disabled={emailingLowStock}
                    onClick={handleEmailLowStockDigest}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#0c3843] text-white text-xs font-semibold shadow-xs transition-all cursor-pointer disabled:opacity-50"
                  >
                    <Mail className="w-3.5 h-3.5" />
                    <span>{emailingLowStock ? "Sending…" : "Email digest"}</span>
                  </button>
                )}
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
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-400 text-xs font-semibold shadow-xs transition-all cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Procurement CSV</span>
                  </button>
                )}
                <Link
                  href="/products?filter=low_stock"
                  className="text-xs font-semibold text-[#0c3843] dark:text-teal-400 hover:underline flex items-center gap-1"
                >
                  <span>All Items</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>

            {products.length === 0 || (backendAlerts.length === 0 && lowStockItems.length === 0) ? (
              <div className="py-8 text-center text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
                <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                <p className="text-xs font-medium text-slate-600 dark:text-slate-300">
                  All IT Store inventory levels are healthy and above minimum thresholds.
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  No accessories or components require emergency procurement.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto -mx-5 px-5 sm:mx-0 sm:px-0">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-slate-500 uppercase font-bold text-[10px] tracking-wider">
                    <tr>
                      <th className="px-3 py-2.5">Hardware Item &amp; Buffer Threshold</th>
                      <th className="px-2 py-2.5 text-center">In IT Store</th>
                      <th className="px-2 py-2.5 text-center">Suggested Order</th>
                      <th className="px-3 py-2.5 text-right">Action</th>
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
                      const suggested = isAlertObj
                        ? alert.suggested_reorder
                        : Math.max(5, reorderLvl * 2 - onHand);
                      const id = isAlertObj ? alert.item_id : alert.id;

                      return (
                        <tr key={sku} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/50 transition-colors">
                          <td className="px-3 py-3">
                            <Link
                              href={`/products/${id}`}
                              className="font-bold text-slate-900 dark:text-white hover:text-[#0c3843] dark:hover:text-cyan-400 block transition-colors"
                            >
                              {name}
                            </Link>
                            <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                              {sku} &bull; Min Buffer: {reorderLvl} {uom}
                            </div>
                          </td>
                          <td className="px-2 py-3 text-center font-bold font-mono text-amber-600">
                            {onHand} {uom}
                          </td>
                          <td className="px-2 py-3 text-center font-extrabold font-mono text-emerald-600">
                            +{suggested} {uom}
                          </td>
                          <td className="px-3 py-3 text-right">
                            <Link
                              href={`/stock-in?productId=${id}`}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-xs transition-all"
                            >
                              <ArrowDownLeft className="w-3.5 h-3.5" />
                              <span>Add Stock</span>
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

          {/* IT Asset Valuation by Category */}
          <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Layers className="w-4.5 h-4.5 text-[#0c3843] dark:text-cyan-400" />
                <span>IT Fleet Valuation by Category</span>
              </h3>
              <span className="text-xs text-slate-400 font-mono">
                {categories.length} Categories
              </span>
            </div>

            {categoryStats.length === 0 ? (
              <p className="text-xs text-slate-400 py-4 text-center">No categories recorded yet.</p>
            ) : (
              <div className="space-y-3">
                {categoryStats.map((c) => (
                  <div
                    key={c.name}
                    className="p-3.5 rounded-xl border border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/40 space-y-2 hover:border-slate-200 dark:hover:border-slate-700 transition-all"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-900 dark:text-white">{c.name}</span>
                      <div className="font-mono font-bold text-[#0c3843] dark:text-teal-300">
                        {`$${c.valuation.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                      </div>
                    </div>
                    <div className="w-full bg-slate-200 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
                      <div
                        className="bg-[#0c3843] dark:bg-cyan-400 h-1.5 rounded-full transition-all duration-500"
                        style={{ width: `${c.percentage}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-slate-400">
                      <span>
                        {c.count} {c.count === 1 ? "Product" : "Products"} &bull; {c.units} total units
                      </span>
                      <span className="font-semibold text-slate-600 dark:text-slate-300">
                        {c.percentage}% of IT budget
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Live Movement Feed & Recent Activity */}
        <div className="space-y-6">
          <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Clock className="w-4.5 h-4.5 text-blue-500" />
                <span>Live Office IT Activity Feed</span>
              </h3>
              <span className="px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-400 text-[10px] font-bold font-mono">
                Live Ledger
              </span>
            </div>

            {movements.length === 0 ? (
              <p className="text-xs text-slate-400 py-8 text-center">No asset movements recorded yet.</p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800/60 text-xs">
                {movements.slice(0, 10).map((m) => {
                  const isIn = m.type === "IN";
                  const isOut = m.type === "OUT";

                  return (
                    <div key={m.id} className="py-3 space-y-1 group">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className={cn(
                              "px-1.5 py-0.5 rounded text-[10px] font-bold uppercase shrink-0 font-mono",
                              isIn
                                ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20"
                                : isOut
                                ? "bg-blue-500/10 text-blue-600 border border-blue-500/20"
                                : "bg-amber-500/10 text-amber-600 border border-amber-500/20"
                            )}
                          >
                            {m.type}
                          </span>
                          <span className="font-semibold text-slate-900 dark:text-white truncate">
                            {m.productName}
                          </span>
                        </div>
                        <span
                          className={cn(
                            "font-bold font-mono shrink-0",
                            isIn ? "text-emerald-500" : isOut ? "text-blue-500" : "text-amber-500"
                          )}
                        >
                          {isIn ? `+${m.quantity}` : isOut ? `-${m.quantity}` : `${m.quantity}`}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-slate-400">
                        <span className="truncate max-w-[170px]">
                          {m.partyName || m.reason || m.reference || "Internal Transfer"}
                        </span>
                        <span className="font-mono text-[10px]">
                          {new Date(m.timestamp).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ======================================================== */}
      {/* 6. FINANCE MANAGER REPORT & DIRECT EMAIL MODAL           */}
      {/* ======================================================== */}
      <FinanceReportModal
        isOpen={isFinanceModalOpen}
        onClose={closeFinanceModal}
      />
    </div>
  );
}
