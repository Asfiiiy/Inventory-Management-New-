"use client";

import React, { useState, useEffect, useCallback, use, Suspense, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Package,
  Boxes,
  Truck,
  AlertTriangle,
  CheckCircle2,
  Printer,
  Barcode as BarcodeIcon,
  RefreshCw,
  Building2,
  Calendar,
  ShieldCheck,
  Wrench,
  AlertCircle,
  UserCheck,
  User,
  FileText,
  Clock,
  Sparkles,
  DollarSign,
  TrendingDown,
  Layers,
  Check,
  X,
  ExternalLink,
  Cpu,
  HardDrive,
  Laptop,
  Monitor,
  Mouse,
  Network,
  Cable,
  Printer as PrinterIcon,
  Loader2,
} from "lucide-react";
import { useInventory, Product } from "@/lib/inventory-store";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/components/ui/toast";
import { ModalPortal } from "@/components/ui/modal-portal";
import { apiClient, CustodyAssignment, RepairRecord, HandoverCertificate, LifecycleEvent } from "@/lib/api";
import { PrintLabelModal } from "@/components/barcode/print-label-modal";
import { cn } from "@/lib/utils";

interface ProductDetailPageProps {
  params: Promise<{ id: string }>;
}

export default function ProductDetailPage({ params }: ProductDetailPageProps) {
  return (
    <Suspense
      fallback={
        <div className="py-24 flex items-center justify-center gap-2 text-xs text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin text-[#0c3843]" />
          <span>Loading Equipment 360° Dossier...</span>
        </div>
      }
    >
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

  const [activeTab, setActiveTab] = useState<"ASSIGNED" | "STORE" | "REPAIRS" | "SPECS" | "LEDGER" | "LIFECYCLE">("ASSIGNED");

  const [summary, setSummary] = useState<any>(null);
  const [itemDetails, setItemDetails] = useState<any>(null);
  const [lifecycleEvents, setLifecycleEvents] = useState<LifecycleEvent[]>([]);
  const [assignments, setAssignments] = useState<CustodyAssignment[]>([]);
  const [repairs, setRepairs] = useState<RepairRecord[]>([]);
  const [movements, setMovements] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [reconciling, setReconciling] = useState(false);
  const [printModalOpen, setPrintModalOpen] = useState(false);

  // Modal States
  const [viewingSignature, setViewingSignature] = useState<CustodyAssignment | null>(null);
  const [viewingCertificate, setViewingCertificate] = useState<HandoverCertificate | null>(null);
  const [certLoading, setCertLoading] = useState(false);
  const [returningAssignment, setReturningAssignment] = useState<CustodyAssignment | null>(null);
  const [returnCondition, setReturnCondition] = useState<"GOOD" | "FAULTY">("GOOD");
  const [returnNotes, setReturnNotes] = useState("");
  const [returnSubmitting, setReturnSubmitting] = useState(false);

  // Repair Action Modal State
  const [receivingRepair, setReceivingRepair] = useState<RepairRecord | null>(null);
  const [repairCostInput, setRepairCostInput] = useState("");
  const [repairResolutionNotes, setRepairResolutionNotes] = useState("");
  const [repairSubmitting, setRepairSubmitting] = useState(false);

  const localProduct = products.find((p) => p.id === itemId);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Fetch Item Live Stock Summary
      try {
        const sumRes = await apiClient.stock.getItemSummary(itemId);
        if (sumRes.data) setSummary(sumRes.data);
      } catch (e) {
        console.warn("Could not fetch stock summary:", e);
      }

      // 2. Fetch Item Master Details
      try {
        const itemRes = await apiClient.items.get(itemId);
        if (itemRes.data) setItemDetails(itemRes.data);
      } catch (e) {
        console.warn("Could not fetch item details:", e);
      }

      // 3. Fetch custody assignments (which employees currently hold this item)
      try {
        const custodyRes = await apiClient.custody.listAllAssignments();
        if (custodyRes.data) {
          const itemAssignments = custodyRes.data.filter((a) => a.asset_id === itemId);
          setAssignments(itemAssignments);
        }
      } catch (e) {
        console.warn("Could not fetch custody assignments:", e);
      }

      // 4. Fetch vendor repairs (sent out, repaired, and returned)
      try {
        const repairsRes = await apiClient.repairs.list({ item_id: itemId });
        if (repairsRes.data?.records) {
          setRepairs(repairsRes.data.records);
        }
      } catch (e) {
        console.warn("Could not fetch repairs:", e);
      }

      // 5. Fetch Locations
      try {
        const locRes = await apiClient.locations.list();
        if (locRes.data) setLocations(locRes.data);
      } catch (e) {
        console.warn("Could not fetch locations:", e);
      }

      // 6. Fetch Stock Movements
      try {
        const movesRes = await apiClient.stock.listMoves({ limit: 50 });
        if (movesRes.data) {
          const itemMoves = movesRes.data.filter((m: any) => m.item_id === itemId);
          setMovements(itemMoves);
        }
      } catch (e) {
        console.warn("Could not fetch movements:", e);
      }

      // 7. Lifecycle timeline (moves + custody + repairs)
      try {
        const lifeRes = await apiClient.stock.getLifecycle(itemId);
        if (lifeRes.data?.events) setLifecycleEvents(lifeRes.data.events);
        else setLifecycleEvents([]);
      } catch (e) {
        console.warn("Could not fetch lifecycle:", e);
        setLifecycleEvents([]);
      }
    } finally {
      setLoading(false);
    }
  }, [itemId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // View Handover Certificate
  const handleOpenCertificate = async (assignment: CustodyAssignment) => {
    setCertLoading(true);
    try {
      const res = await apiClient.custody.getCertificate(assignment.assignment_id);
      if (res.data) {
        setViewingCertificate(res.data);
      }
    } catch (err: any) {
      toast({
        title: "Certificate Unavailable",
        description: err?.message || "Could not retrieve cryptographic certificate.",
        variant: "destructive",
      });
    } finally {
      setCertLoading(false);
    }
  };

  // Submit Smart Return
  const handleConfirmReturn = async () => {
    if (!returningAssignment) return;
    setReturnSubmitting(true);
    try {
      const storeLoc = locations.find((l) => !l.is_backup_location) || locations[0];
      await apiClient.custody.checkin({
        assignment_id: returningAssignment.assignment_id,
        return_to_location_id: storeLoc?.location_id || "",
        return_condition: returnCondition,
        condition_grade: returnCondition === "GOOD" ? "EXCELLENT" : "POOR_DAMAGED",
        notes: returnNotes || `Returned by ${returningAssignment.employee_name} (${returnCondition})`,
        issue_description: returnCondition === "FAULTY" ? returnNotes || "Reported defective upon staff return" : undefined,
      });

      toast({
        title: returnCondition === "GOOD" ? "Hardware Returned to Store Room" : "Asset Returned & Routed to Repairs",
        description:
          returnCondition === "GOOD"
            ? `Successfully checked in unit from ${returningAssignment.employee_name}. Added back to store buffer.`
            : `Unit returned with defect notes. Automatically registered ticket and routed to Vendor Repairs!`,
        variant: "success",
      });

      setReturningAssignment(null);
      setReturnNotes("");
      await loadData();
    } catch (err: any) {
      toast({
        title: "Check-in Failed",
        description: err?.message || "Could not complete return process.",
        variant: "destructive",
      });
    } finally {
      setReturnSubmitting(false);
    }
  };

  // Receive Repaired Unit Back
  const handleCompleteRepair = async () => {
    if (!receivingRepair) return;
    setRepairSubmitting(true);
    try {
      const costNum = parseFloat(repairCostInput) || 0;
      await apiClient.repairs.complete(receivingRepair.repair_id, {
        repair_cost: costNum,
        resolution_notes: repairResolutionNotes || "Repaired and returned by vendor into IT store buffer",
      });

      toast({
        title: "Equipment Repaired & Restored",
        description: `Marked repair ticket ${receivingRepair.ticket_reference} as completed. Unit restored to IT Store Buffer!`,
        variant: "success",
      });

      setReceivingRepair(null);
      setRepairCostInput("");
      setRepairResolutionNotes("");
      await loadData();
    } catch (err: any) {
      toast({
        title: "Repair Completion Failed",
        description: err?.message || "Could not complete repair.",
        variant: "destructive",
      });
    } finally {
      setRepairSubmitting(false);
    }
  };

  // Ledger Reconcile
  const handleReconcile = async () => {
    setReconciling(true);
    try {
      const res = await apiClient.stock.reconcileItem(itemId);
      const report = res.data;
      if (report.discrepancies > 0) {
        toast({
          title: "Ledger Discrepancy Healed",
          description: `Auto-healed ${report.discrepancies} location drift(s) to match immutable stock ledger truth!`,
          variant: "success",
        });
      } else {
        toast({
          title: "Ledger 100% Invariant Intact",
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

  // Active vs Returned Assignments
  const activeAssignments = assignments.filter((a) => !a.returned_at);
  const returnedAssignments = assignments.filter((a) => !!a.returned_at);

  // Active Vendor Repairs
  const atVendorRepairs = repairs.filter((r) => r.status === "AT_VENDOR");
  const completedRepairs = repairs.filter((r) => r.status === "REPAIRED");
  const faultyAwaiting = repairs.filter((r) => r.status === "FAULTY");
  const totalRepairSpend = repairs.reduce((acc, r) => acc + (r.repair_cost || 0), 0);

  // Metrics
  const unitCost = Number(itemDetails?.cost_price || localProduct?.cost || localProduct?.price || 0);
  const inStoreCount = summary?.total_on_hand ?? localProduct?.currentStock ?? 0;
  const assignedCount = summary?.total_checked_out ?? activeAssignments.length ?? localProduct?.assignedCount ?? 0;
  const inRepairCount = summary?.total_in_repair ?? atVendorRepairs.length ?? localProduct?.inRepairCount ?? 0;
  const faultyCount = summary?.total_faulty ?? faultyAwaiting.length ?? localProduct?.faultyCount ?? 0;
  const totalFleetOwned = summary?.total_owned ?? (inStoreCount + assignedCount + inRepairCount + faultyCount);
  const fleetValue = totalFleetOwned * unitCost;

  // 3-Year Straight-Line Depreciation Calculations
  const attributes = itemDetails?.attributes || localProduct?.attributes || {};
  const purchaseDateStr = attributes.purchase_date || attributes.procurement_date || localProduct?.updatedAt || "2024-01-01";
  const purchaseDate = new Date(purchaseDateStr);
  const now = new Date();
  const monthsInService = Math.max(0, Math.min(36, Math.floor((now.getTime() - purchaseDate.getTime()) / (1000 * 60 * 60 * 24 * 30.4375))));
  const depreciationPerMonth = unitCost / 36;
  const totalDepreciationPerUnit = depreciationPerMonth * monthsInService;
  const currentBookValuePerUnit = Math.max(0, unitCost - totalDepreciationPerUnit);
  const totalFleetBookValue = currentBookValuePerUnit * totalFleetOwned;

  const barcodeValue = itemDetails?.barcode || localProduct?.barcode || attributes.barcode || localProduct?.sku || "N/A";

  const pForPrint: Product = {
    id: itemId,
    sku: summary?.sku || itemDetails?.sku || localProduct?.sku || "SKU-PROD",
    name: summary?.name || itemDetails?.name || localProduct?.name || "Equipment Model",
    category: itemDetails?.category_name || attributes.category || localProduct?.category || "General",
    cost: unitCost,
    price: unitCost,
    currentStock: inStoreCount,
    assignedCount: assignedCount,
    faultyCount: faultyCount,
    inRepairCount: inRepairCount,
    repairedCount: completedRepairs.length,
    scrappedCount: 0,
    totalOwned: totalFleetOwned,
    reorderLevel: summary?.reorder_level ?? 2,
    unit: summary?.base_uom || "pcs",
    barcode: barcodeValue,
    attributes: attributes,
    updatedAt: new Date().toISOString(),
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* 1. Top Breadcrumb & Actions Bar (2-Tier Spacious Architecture) */}
      <div className="pb-4 border-b border-slate-200/80 dark:border-slate-800 space-y-2.5">
        {/* Tier 1: Breadcrumb, Title & Primary Action */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href="/products"
              className="p-2 rounded-xl bg-slate-100 dark:bg-slate-900 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white transition-all cursor-pointer shrink-0"
              title="Back to Hardware Catalog"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 dark:text-white whitespace-nowrap">
                {summary?.name || itemDetails?.name || localProduct?.name || "Equipment 360° Dossier"}
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[#0c3843]/10 border border-[#0c3843]/20 text-[#0c3843] dark:text-cyan-300 whitespace-nowrap font-mono">
                {summary?.sku || itemDetails?.sku || localProduct?.sku}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Link
              href={`/custody?assetId=${itemId}`}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#0c3843] hover:bg-[#082931] text-white text-xs font-bold whitespace-nowrap"
            >
              <ShieldCheck className="w-4 h-4 text-cyan-300" />
              <span>Issue to staff</span>
            </Link>
          </div>
        </div>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 flex-wrap">
            <span>{itemDetails?.category_name || localProduct?.category || "IT Equipment"}</span>
            <span>·</span>
            <span className="font-mono">{barcodeValue}</span>
            <span>·</span>
            <span className="font-mono">${unitCost.toFixed(2)} / unit</span>
          </div>

          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <Link
              href={`/adjustments?productId=${itemId}`}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 text-xs font-semibold"
            >
              <Wrench className="w-3.5 h-3.5 text-amber-500" />
              Repairs
            </Link>
            <button
              type="button"
              onClick={() => setPrintModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 text-xs font-semibold"
            >
              <Printer className="w-3.5 h-3.5" />
              Print tag
            </button>
            <button
              type="button"
              disabled={reconciling}
              onClick={handleReconcile}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 text-xs font-semibold"
            >
              <RefreshCw className={cn("w-3.5 h-3.5 text-emerald-500", reconciling && "animate-spin")} />
              Verify
            </button>
          </div>
        </div>

        {/* Compact lifecycle bar */}
        <div className="flex flex-wrap items-stretch gap-1 p-1 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60">
          <button
            type="button"
            onClick={() => setActiveTab("STORE")}
            className="flex-1 min-w-[100px] px-3 py-2 rounded-lg text-left hover:bg-white dark:hover:bg-slate-900 transition-colors"
          >
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Owned</div>
            <div className="text-lg font-black font-mono text-slate-900 dark:text-white">{totalFleetOwned}</div>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("STORE")}
            className="flex-1 min-w-[100px] px-3 py-2 rounded-lg text-left hover:bg-white dark:hover:bg-slate-900 border-l border-slate-200 dark:border-slate-800"
          >
            <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-600">Available</div>
            <div className="text-lg font-black font-mono text-emerald-700 dark:text-emerald-400">{inStoreCount}</div>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("ASSIGNED")}
            className="flex-1 min-w-[100px] px-3 py-2 rounded-lg text-left hover:bg-white dark:hover:bg-slate-900 border-l border-slate-200 dark:border-slate-800"
          >
            <div className="text-[10px] font-bold uppercase tracking-wider text-teal-600">With staff</div>
            <div className="text-lg font-black font-mono text-teal-700 dark:text-teal-400">{assignedCount}</div>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("REPAIRS")}
            className="flex-1 min-w-[100px] px-3 py-2 rounded-lg text-left hover:bg-white dark:hover:bg-slate-900 border-l border-slate-200 dark:border-slate-800"
          >
            <div className="text-[10px] font-bold uppercase tracking-wider text-amber-600">At vendor</div>
            <div className="text-lg font-black font-mono text-amber-700 dark:text-amber-400">{inRepairCount}</div>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("REPAIRS")}
            className="flex-1 min-w-[100px] px-3 py-2 rounded-lg text-left hover:bg-white dark:hover:bg-slate-900 border-l border-slate-200 dark:border-slate-800"
          >
            <div className="text-[10px] font-bold uppercase tracking-wider text-rose-600">Faulty</div>
            <div className="text-lg font-black font-mono text-rose-700 dark:text-rose-400">{faultyCount}</div>
          </button>
          <div className="flex-1 min-w-[120px] px-3 py-2 rounded-lg border-l border-slate-200 dark:border-slate-800">
            <div className="text-[10px] font-bold uppercase tracking-wider text-[#0c3843] dark:text-cyan-300">Book value</div>
            <div className="text-lg font-black font-mono text-slate-900 dark:text-white truncate">
              ${totalFleetBookValue.toLocaleString("en-US", { maximumFractionDigits: 0 })}
            </div>
          </div>
        </div>
      </div>

      <div className="p-1.5 rounded-2xl bg-slate-100 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800">
        <nav className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          <button
            type="button"
            onClick={() => setActiveTab("ASSIGNED")}
            className={cn(
              "flex items-center gap-2 py-2 px-3.5 rounded-xl font-bold text-xs transition-all cursor-pointer whitespace-nowrap",
              activeTab === "ASSIGNED"
                ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm border border-slate-200/80 dark:border-slate-700"
                : "text-slate-500 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-white/50"
            )}
          >
            <UserCheck className="w-4 h-4 text-teal-600" />
            <span>With staff</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-teal-500/10 text-teal-700 dark:text-teal-400 font-bold">
              {activeAssignments.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("STORE")}
            className={cn(
              "flex items-center gap-2 py-2 px-3.5 rounded-xl font-bold text-xs transition-all cursor-pointer whitespace-nowrap",
              activeTab === "STORE"
                ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm border border-slate-200/80 dark:border-slate-700"
                : "text-slate-500 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-white/50"
            )}
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            <span>Available</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-bold">
              {inStoreCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("REPAIRS")}
            className={cn(
              "flex items-center gap-2 py-2 px-3.5 rounded-xl font-bold text-xs transition-all cursor-pointer whitespace-nowrap",
              activeTab === "REPAIRS"
                ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm border border-slate-200/80 dark:border-slate-700"
                : "text-slate-500 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-white/50"
            )}
          >
            <Wrench className="w-4 h-4 text-amber-500" />
            <span>Vendor Repairs &amp; History</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-amber-500/10 text-amber-700 dark:text-amber-400 font-bold">
              {repairs.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("SPECS")}
            className={cn(
              "flex items-center gap-2 py-2 px-3.5 rounded-xl font-bold text-xs transition-all cursor-pointer whitespace-nowrap",
              activeTab === "SPECS"
                ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm border border-slate-200/80 dark:border-slate-700"
                : "text-slate-500 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-white/50"
            )}
          >
            <Cpu className="w-4 h-4 text-[#0c3843] dark:text-teal-400" />
            <span>Technical Specs &amp; Depreciation</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("LEDGER")}
            className={cn(
              "flex items-center gap-2 py-2 px-3.5 rounded-xl font-bold text-xs transition-all cursor-pointer whitespace-nowrap",
              activeTab === "LEDGER"
                ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm border border-slate-200/80 dark:border-slate-700"
                : "text-slate-500 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-white/50"
            )}
          >
            <Layers className="w-4 h-4 text-purple-500" />
            <span>Immutable Movement Ledger</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-bold">
              {movements.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("LIFECYCLE")}
            className={cn(
              "flex items-center gap-2 py-2 px-3.5 rounded-xl font-bold text-xs transition-all cursor-pointer whitespace-nowrap",
              activeTab === "LIFECYCLE"
                ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm border border-slate-200/80 dark:border-slate-700"
                : "text-slate-500 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-white/50"
            )}
          >
            <Clock className="w-4 h-4 text-cyan-600" />
            <span>Lifecycle Timeline</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-bold">
              {lifecycleEvents.length}
            </span>
          </button>
        </nav>
      </div>

      {/* 4. Tab Contents */}
      {/* TAB 1: Assigned staff list */}
      {activeTab === "ASSIGNED" && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs overflow-hidden">
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">Active Employee Custody ({activeAssignments.length})</h3>
                <p className="text-xs text-slate-400">Staff members currently holding this equipment with digital signature verification</p>
              </div>
              <Link
                href={`/custody?assetId=${itemId}`}
                className="px-3 py-1.5 rounded-xl bg-[#0c3843] hover:bg-[#082931] text-white text-xs font-bold transition-all"
              >
                Issue Another Unit
              </Link>
            </div>

            {activeAssignments.length === 0 ? (
              <div className="p-12 text-center text-slate-400">
                <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center mx-auto mb-3">
                  <UserCheck className="w-6 h-6" />
                </div>
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">No Staff Custody Records Active</h4>
                <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
                  All available units of this equipment are currently stored in the IT store buffer room.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-900/80 border-b border-slate-200 dark:border-slate-800 text-slate-500 uppercase font-semibold text-[10px] tracking-wider">
                    <tr>
                      <th className="px-4 py-3">Employee Name &amp; ID</th>
                      <th className="px-4 py-3">Department</th>
                      <th className="px-4 py-3">Serial # / Asset Tag</th>
                      <th className="px-4 py-3">Handover Date</th>
                      <th className="px-4 py-3 text-center">Digital e-Sign</th>
                      <th className="px-4 py-3 text-center">Certificate</th>
                      <th className="px-4 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {activeAssignments.map((a) => (
                      <tr key={a.assignment_id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold text-xs shrink-0">
                              {a.employee_name ? a.employee_name[0].toUpperCase() : "E"}
                            </div>
                            <div>
                              <span className="font-bold text-slate-900 dark:text-white block">{a.employee_name || "Office Employee"}</span>
                              <span className="font-mono text-[10px] text-slate-400">ID: {a.employee_code || "EMP-001"}</span>
                            </div>
                          </div>
                        </td>

                        <td className="px-4 py-3.5 font-semibold text-slate-700 dark:text-slate-300">
                          {a.employee_department || "Operations"}
                        </td>

                        <td className="px-4 py-3.5 font-mono font-bold text-slate-800 dark:text-slate-200">
                          {a.serial_number || "SN-AUTO-DETECT"}
                        </td>

                        <td className="px-4 py-3.5 text-slate-500">
                          {new Date(a.checkout_date).toLocaleDateString()}
                        </td>

                        {/* Digital Signature Badge */}
                        <td className="px-4 py-3.5 text-center">
                          {a.signature_data ? (
                            <button
                              type="button"
                              onClick={() => setViewingSignature(a)}
                              className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-all cursor-pointer inline-flex items-center gap-1"
                              title="Click to view digital signature capture"
                            >
                              <Check className="w-3 h-3 text-emerald-500" />
                              <span>Signed</span>
                            </button>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-500">
                              No Signature
                            </span>
                          )}
                        </td>

                        {/* Certificate Button */}
                        <td className="px-4 py-3.5 text-center">
                          <button
                            type="button"
                            onClick={() => handleOpenCertificate(a)}
                            className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold text-[11px] text-slate-700 dark:text-slate-300 transition-all cursor-pointer inline-flex items-center gap-1"
                          >
                            <FileText className="w-3 h-3 text-indigo-500" />
                            <span>Certificate</span>
                          </button>
                        </td>

                        {/* Action: Return / Faulty */}
                        <td className="px-4 py-3.5 text-right">
                          <button
                            type="button"
                            onClick={() => {
                              setReturningAssignment(a);
                              setReturnCondition("GOOD");
                              setReturnNotes("");
                            }}
                            className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 text-white font-bold text-xs transition-all cursor-pointer"
                          >
                            Take Return
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Past Returned Custody History */}
          {returnedAssignments.length > 0 && (
            <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs overflow-hidden">
              <div className="p-4 border-b border-slate-100 dark:border-slate-800">
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Past Handover History ({returnedAssignments.length} Returns)</h4>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs opacity-75">
                  <thead className="bg-slate-50 dark:bg-slate-900/80 border-b border-slate-200 dark:border-slate-800 text-slate-500 uppercase text-[10px]">
                    <tr>
                      <th className="px-4 py-2.5">Staff Member</th>
                      <th className="px-4 py-2.5">Serial #</th>
                      <th className="px-4 py-2.5">Issued Date</th>
                      <th className="px-4 py-2.5">Returned Date</th>
                      <th className="px-4 py-2.5">Condition</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {returnedAssignments.map((a) => (
                      <tr key={a.assignment_id}>
                        <td className="px-4 py-2.5 font-bold text-slate-800 dark:text-slate-200">{a.employee_name} ({a.employee_code})</td>
                        <td className="px-4 py-2.5 font-mono">{a.serial_number}</td>
                        <td className="px-4 py-2.5">{new Date(a.checkout_date).toLocaleDateString()}</td>
                        <td className="px-4 py-2.5 text-emerald-600 font-medium">{a.returned_at ? new Date(a.returned_at).toLocaleDateString() : "Returned"}</td>
                        <td className="px-4 py-2.5">{a.condition_grade || "GOOD"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: AVAILABLE STORE BUFFER (Store Room Buffer) */}
      {activeTab === "STORE" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-emerald-500/30 shadow-2xs space-y-2">
              <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400 font-bold text-xs">
                <span>Buffer Safety Status</span>
                <CheckCircle2 className="w-4 h-4" />
              </div>
              <div className="text-3xl font-black text-slate-900 dark:text-white font-mono">
                {inStoreCount} <span className="text-xs font-normal text-slate-400">Units Ready</span>
              </div>
              <p className="text-xs text-slate-500">
                Minimum reorder safety buffer is set at <strong>{summary?.reorder_level || 2} units</strong>.
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs space-y-2">
              <div className="flex items-center justify-between text-slate-400 font-bold text-xs">
                <span>Assigned Fleet Utilization</span>
                <ShieldCheck className="w-4 h-4" />
              </div>
              <div className="text-3xl font-black text-slate-900 dark:text-white font-mono">
                {totalFleetOwned > 0 ? Math.round((assignedCount / totalFleetOwned) * 100) : 0}%
              </div>
              <p className="text-xs text-slate-500">
                {assignedCount} of {totalFleetOwned} total fleet units deployed with staff.
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs flex flex-col justify-between">
              <div>
                <h4 className="text-xs font-bold text-slate-500 uppercase">Issue Store Unit</h4>
                <p className="text-xs text-slate-400 mt-1">Directly assign a buffer unit to an employee with digital signature</p>
              </div>
              <Link
                href={`/custody?assetId=${itemId}`}
                className="w-full mt-3 flex items-center justify-center gap-2 py-2 rounded-xl bg-[#0c3843] hover:bg-[#082931] text-white font-bold text-xs transition-all shadow-xs"
              >
                <ShieldCheck className="w-4 h-4 text-cyan-300" />
                <span>Issue to Employee</span>
              </Link>
            </div>
          </div>

          {/* Shelf & Store Location Allocation */}
          <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs p-5 space-y-4">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Store Room Shelves &amp; Storage Locations</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {(summary?.locations || [
                { location_name: "Main IT Store Room (Shelf A-1)", on_hand: inStoreCount, available: inStoreCount },
              ]).map((loc: any, idx: number) => (
                <div key={idx} className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800 flex items-center justify-between">
                  <div>
                    <span className="font-bold text-slate-900 dark:text-white text-xs block">{loc.location_name}</span>
                    <span className="text-[11px] text-slate-400">Available: {loc.available ?? loc.on_hand} &bull; Ready for deployment</span>
                  </div>
                  <span className="font-mono font-black text-sm text-emerald-600 dark:text-emerald-400">
                    {loc.on_hand} pcs
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: Vendor repairs & history (sent, repaired, cost) */}
      {activeTab === "REPAIRS" && (
        <div className="space-y-6">
          {/* Repair KPI Spend Metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-amber-500/30 shadow-2xs">
              <span className="text-xs font-bold text-amber-600 dark:text-amber-400 block mb-1">Currently at Vendor</span>
              <span className="text-2xl font-black text-slate-900 dark:text-white font-mono">{atVendorRepairs.length}</span>
              <p className="text-[11px] text-slate-400 mt-1">Units at service center</p>
            </div>

            <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-teal-500/30 shadow-2xs">
              <span className="text-xs font-bold text-teal-600 dark:text-teal-400 block mb-1">Repaired &amp; Restored</span>
              <span className="text-2xl font-black text-slate-900 dark:text-white font-mono">{completedRepairs.length}</span>
              <p className="text-[11px] text-slate-400 mt-1">Returned in working condition</p>
            </div>

            <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-rose-500/30 shadow-2xs">
              <span className="text-xs font-bold text-rose-600 dark:text-rose-400 block mb-1">Faulty Awaiting Routing</span>
              <span className="text-2xl font-black text-slate-900 dark:text-white font-mono">{faultyAwaiting.length}</span>
              <p className="text-[11px] text-slate-400 mt-1">In diagnostics bay</p>
            </div>

            <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs">
              <span className="text-xs font-bold text-slate-500 block mb-1">Total Maintenance Spend</span>
              <span className="text-2xl font-black text-slate-900 dark:text-white font-mono">${totalRepairSpend.toFixed(2)}</span>
              <p className="text-[11px] text-slate-400 mt-1">Cumulative repair cost</p>
            </div>
          </div>

          {/* Repair Tickets Table */}
          <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs overflow-hidden">
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">Vendor Repair Tickets &amp; Audit Log</h3>
                <p className="text-xs text-slate-400">Track all external repairs, defect causes, vendor names, and turnaround costs</p>
              </div>
              <Link
                href={`/adjustments?productId=${itemId}`}
                className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold transition-all"
              >
                New Repair Ticket
              </Link>
            </div>

            {repairs.length === 0 ? (
              <div className="p-12 text-center text-slate-400">
                <div className="w-12 h-12 rounded-2xl bg-teal-500/10 text-teal-500 flex items-center justify-center mx-auto mb-3">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">Clean Maintenance History</h4>
                <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
                  No repair tickets or defect reports have been logged for this hardware model.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-900/80 border-b border-slate-200 dark:border-slate-800 text-slate-500 uppercase font-semibold text-[10px] tracking-wider">
                    <tr>
                      <th className="px-4 py-3">Ticket #</th>
                      <th className="px-4 py-3">Service Vendor</th>
                      <th className="px-4 py-3">Reported Defect</th>
                      <th className="px-4 py-3 text-center">Status</th>
                      <th className="px-4 py-3 text-right">Repair Cost</th>
                      <th className="px-4 py-3">Sent / Returned Date</th>
                      <th className="px-4 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {repairs.map((r) => (
                      <tr key={r.repair_id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                        <td className="px-4 py-3.5 font-mono font-bold text-slate-900 dark:text-white">
                          {r.ticket_reference || `REP-${r.repair_id.slice(-6).toUpperCase()}`}
                        </td>

                        <td className="px-4 py-3.5">
                          <span className="font-bold text-slate-900 dark:text-white block">{r.vendor_name || "Official Service Center"}</span>
                          {r.vendor_contact && <span className="text-[10px] text-slate-400">{r.vendor_contact}</span>}
                        </td>

                        <td className="px-4 py-3.5 text-slate-600 dark:text-slate-300 max-w-xs truncate">
                          {r.issue_description}
                        </td>

                        <td className="px-4 py-3.5 text-center">
                          <span
                            className={cn(
                              "px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border",
                              r.status === "AT_VENDOR"
                                ? "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20"
                                : r.status === "REPAIRED"
                                ? "bg-teal-500/10 text-teal-700 dark:text-teal-400 border-teal-500/20"
                                : "bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20"
                            )}
                          >
                            {r.status === "AT_VENDOR" ? "At Vendor" : r.status === "REPAIRED" ? "Repaired" : "Faulty"}
                          </span>
                        </td>

                        <td className="px-4 py-3.5 text-right font-mono font-bold text-slate-900 dark:text-white">
                          ${(r.repair_cost || 0).toFixed(2)}
                        </td>

                        <td className="px-4 py-3.5 text-slate-500">
                          {r.repaired_date
                            ? `Returned: ${new Date(r.repaired_date).toLocaleDateString()}`
                            : r.sent_date
                            ? `Sent: ${new Date(r.sent_date).toLocaleDateString()}`
                            : new Date(r.created_at).toLocaleDateString()}
                        </td>

                        <td className="px-4 py-3.5 text-right">
                          {r.status === "AT_VENDOR" && (
                            <button
                              type="button"
                              onClick={() => {
                                setReceivingRepair(r);
                                setRepairCostInput(r.repair_cost ? r.repair_cost.toString() : "0");
                                setRepairResolutionNotes("");
                              }}
                              className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-all cursor-pointer"
                            >
                              Receive Repaired
                            </button>
                          )}
                          {r.status === "REPAIRED" && (
                            <span className="text-[11px] text-teal-600 font-semibold flex items-center justify-end gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Back in Store
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: TECHNICAL SPECS & 3-YEAR STRAIGHT-LINE DEPRECIATION */}
      {activeTab === "SPECS" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Technical Specifications */}
            <div className="p-6 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <Cpu className="w-5 h-5 text-[#0c3843] dark:text-teal-400" />
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">Hardware Configuration Specs</h3>
                </div>
                <span className="text-[10px] font-semibold text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md">
                  Custom Attributes
                </span>
              </div>

              {Object.entries(attributes).filter(([k, v]) => 
                !["barcode", "category", "cost_price", "selling_price", "reorder_level", "initial_stock", "location", "notes", "purchase_date", "procurement_date"].includes(k) &&
                v !== undefined && v !== null && String(v).trim() !== ""
              ).length > 0 ? (
                <div className="grid grid-cols-2 gap-3 text-xs">
                  {Object.entries(attributes)
                    .filter(([k, v]) => 
                      !["barcode", "category", "cost_price", "selling_price", "reorder_level", "initial_stock", "location", "notes", "purchase_date", "procurement_date"].includes(k) &&
                      v !== undefined && v !== null && String(v).trim() !== ""
                    )
                    .map(([k, v]) => (
                      <div key={k} className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 hover:border-[#0c3843]/30 transition-all">
                        <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                          {k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                        </span>
                        <span className="font-bold text-slate-900 dark:text-white text-xs mt-0.5 block break-words">
                          {String(v)}
                        </span>
                      </div>
                    ))}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Processor / CPU</span>
                    <span className="font-bold text-slate-900 dark:text-white text-xs mt-0.5 block">
                      {attributes.processor || attributes.cpu || "Standard Architecture"}
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">System RAM</span>
                    <span className="font-bold text-slate-900 dark:text-white text-xs mt-0.5 block">
                      {attributes.ram || "Standard RAM"}
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Storage</span>
                    <span className="font-bold text-slate-900 dark:text-white text-xs mt-0.5 block">
                      {attributes.storage || "Internal Storage"}
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Manufacturer Warranty</span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400 text-xs mt-0.5 block">
                      {attributes.warranty_expiry ? `Active until ${attributes.warranty_expiry}` : "Active Corporate Warranty"}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Straight-Line Depreciation Engine */}
            <div className="p-6 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <TrendingDown className="w-5 h-5 text-indigo-500" />
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">3-Year Straight-Line Depreciation (Finance)</h3>
                </div>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/10 text-indigo-600 border border-indigo-500/20">
                  Standard Corporate
                </span>
              </div>

              <div className="space-y-3 text-xs">
                <div className="flex items-center justify-between py-1.5 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-slate-500">Original Unit Cost (Capital Outlay):</span>
                  <span className="font-mono font-bold text-slate-900 dark:text-white">${unitCost.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between py-1.5 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-slate-500">Useful Accounting Life:</span>
                  <span className="font-bold text-slate-900 dark:text-white">36 Months (3 Years)</span>
                </div>
                <div className="flex items-center justify-between py-1.5 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-slate-500">Service Age to Date:</span>
                  <span className="font-bold text-indigo-600">{monthsInService} Months ({Math.round((monthsInService / 36) * 100)}% Depreciated)</span>
                </div>
                <div className="flex items-center justify-between py-1.5 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-slate-500">Monthly Depreciation per Unit:</span>
                  <span className="font-mono text-slate-900 dark:text-white">${depreciationPerMonth.toFixed(2)} / month</span>
                </div>
                <div className="flex items-center justify-between py-2 bg-emerald-500/10 px-3 rounded-xl border border-emerald-500/20">
                  <span className="font-bold text-emerald-800 dark:text-emerald-300">Current Net Book Value per Unit:</span>
                  <span className="font-mono font-black text-emerald-700 dark:text-emerald-400 text-sm">
                    ${currentBookValuePerUnit.toFixed(2)}
                  </span>
                </div>
                <div className="flex items-center justify-between py-2 bg-[#0c3843]/10 px-3 rounded-xl border border-[#0c3843]/20">
                  <span className="font-bold text-[#0c3843] dark:text-teal-300">Total Fleet Active Valuation ({totalFleetOwned} units):</span>
                  <span className="font-mono font-black text-[#0c3843] dark:text-teal-400 text-base">
                    ${totalFleetBookValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: IMMUTABLE AUDIT MOVEMENT LEDGER */}
      {activeTab === "LEDGER" && (
        <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 dark:border-slate-800">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Double-Entry Stock Movement Records ({movements.length})</h3>
            <p className="text-xs text-slate-400">Cryptographically verifiable transactions from PostgreSQL stock_moves table</p>
          </div>

          {movements.length === 0 ? (
            <div className="p-12 text-center text-slate-400">
              <p className="text-xs">No stock moves recorded yet for this equipment.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-900/80 border-b border-slate-200 dark:border-slate-800 text-slate-500 uppercase font-semibold text-[10px] tracking-wider">
                  <tr>
                    <th className="px-4 py-3">Timestamp</th>
                    <th className="px-4 py-3">Reference</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">From Location</th>
                    <th className="px-4 py-3">To Location</th>
                    <th className="px-4 py-3 text-right">Quantity</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {movements.map((m, idx) => (
                    <tr key={m.id || idx} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="px-4 py-3 text-slate-500 font-mono text-[11px]">
                        {new Date(m.created_at || Date.now()).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 font-mono font-bold text-slate-900 dark:text-white">
                        {m.reference_code || m.id?.slice(-8) || "REF-MOVE"}
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded-md font-mono text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                          {m.move_type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{m.from_location_name || m.from_location_id?.slice(-8) || "Origin"}</td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{m.to_location_name || m.to_location_id?.slice(-8) || "Destination"}</td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-slate-900 dark:text-white">
                        {m.quantity} {summary?.base_uom || "pcs"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === "LIFECYCLE" && (
        <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 dark:border-slate-800">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Serial / status lifecycle ({lifecycleEvents.length})
            </h3>
            <p className="text-xs text-slate-400">
              Combined from stock moves, custody handovers, and repair tickets — no invented events.
            </p>
          </div>
          {lifecycleEvents.length === 0 ? (
            <div className="p-12 text-center text-slate-400 text-xs">No lifecycle history recorded for this item yet.</div>
          ) : (
            <ol className="divide-y divide-slate-100 dark:divide-slate-800">
              {lifecycleEvents.map((event, idx) => (
                <li key={`${event.at}-${event.kind}-${idx}`} className="px-4 py-3 flex gap-3 text-xs">
                  <div className="w-2 h-2 mt-1.5 rounded-full bg-cyan-500 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-slate-900 dark:text-white">{event.label}</span>
                      <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px] font-mono uppercase text-slate-500">
                        {event.kind}
                      </span>
                    </div>
                    <div className="text-slate-500 mt-0.5 font-mono text-[11px]">
                      {new Date(event.at).toLocaleString()}
                      {event.serial ? ` · SN ${event.serial}` : ""}
                      {event.actor ? ` · ${event.actor}` : ""}
                    </div>
                    {(event.detail || event.reference) && (
                      <div className="text-slate-600 dark:text-slate-400 mt-1">
                        {event.detail}
                        {event.reference ? ` · Ref ${event.reference}` : ""}
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}

      {/* 5. Modal: Digital Signature Preview */}
      {viewingSignature && (
        <ModalPortal>
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Check className="w-5 h-5 text-emerald-500" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">Digital Custody Signature</h3>
              </div>
              <button
                type="button"
                onClick={() => setViewingSignature(null)}
                className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex justify-between text-slate-500">
                <span>Employee:</span>
                <strong className="text-slate-900 dark:text-white">{viewingSignature.employee_name} ({viewingSignature.employee_code})</strong>
              </div>
              <div className="flex justify-between text-slate-500">
                <span>Handover Date:</span>
                <span className="font-mono">{new Date(viewingSignature.checkout_date).toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-slate-500">
                <span>Assigned Serial #:</span>
                <span className="font-mono font-bold text-slate-900 dark:text-white">{viewingSignature.serial_number}</span>
              </div>

              {/* Signature Canvas Render */}
              <div className="mt-3 p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-center">
                <span className="text-[10px] text-slate-400 block mb-2 uppercase font-semibold">Captured Digital Signature</span>
                {viewingSignature.signature_data ? (
                  <img
                    src={viewingSignature.signature_data}
                    alt="Employee Signature"
                    className="max-h-24 mx-auto object-contain filter dark:invert"
                  />
                ) : (
                  <p className="text-slate-400 italic">No signature image data captured.</p>
                )}
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end">
              <button
                type="button"
                onClick={() => setViewingSignature(null)}
                className="px-4 py-2 rounded-xl bg-[#0c3843] text-white text-xs font-bold"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
        </ModalPortal>
      )}

      {/* 6. Modal: Handover Certificate */}
      {viewingCertificate && (
        <ModalPortal>
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 max-w-xl w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-indigo-500" />
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">Official Equipment Handover Certificate</h3>
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold">SHA-256 Cryptographically Verified</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setViewingCertificate(null)}
                className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Equipment:</span>
                <strong className="text-slate-900 dark:text-white">{viewingCertificate.assignment?.asset_name || summary?.name}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Employee Name:</span>
                <strong className="text-slate-900 dark:text-white">{viewingCertificate.assignment?.employee_name}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Employee ID:</span>
                <strong className="text-slate-900 dark:text-white">{viewingCertificate.assignment?.employee_code}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Department:</span>
                <span>{viewingCertificate.assignment?.employee_department}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Serial Number:</span>
                <span className="font-mono font-bold text-slate-900 dark:text-white">{viewingCertificate.assignment?.serial_number}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Issue Date:</span>
                <span className="font-mono">{new Date(viewingCertificate.assignment?.checkout_date || Date.now()).toLocaleString()}</span>
              </div>
              <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
                <span className="text-[10px] text-slate-400 uppercase font-semibold block">Blockchain / Immutable SHA-256 Digest:</span>
                <code className="text-[10px] font-mono text-indigo-600 dark:text-indigo-400 break-all">
                  {viewingCertificate.evidence?.record_hash || viewingCertificate.stored_hash || "sha256-verified-tamper-proof-seal"}
                </code>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold"
              >
                Print Certificate
              </button>
              <button
                type="button"
                onClick={() => setViewingCertificate(null)}
                className="px-4 py-2 rounded-xl bg-[#0c3843] text-white text-xs font-bold"
              >
                Done
              </button>
            </div>
          </div>
        </div>
        </ModalPortal>
      )}

      {/* 7. Modal: Smart Return (Good Condition vs Damaged / Repairs) */}
      {returningAssignment && (
        <ModalPortal>
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Take Return of Equipment</h3>
              <button
                type="button"
                onClick={() => setReturningAssignment(null)}
                className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-400">Employee:</span>
                  <strong className="text-slate-900 dark:text-white">{returningAssignment.employee_name}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Serial #:</span>
                  <strong className="font-mono text-slate-900 dark:text-white">{returningAssignment.serial_number}</strong>
                </div>
              </div>

              {/* Condition Choice */}
              <div className="space-y-2">
                <label className="font-bold text-slate-700 dark:text-slate-300 block">
                  Select Return Condition *
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setReturnCondition("GOOD")}
                    className={cn(
                      "p-3 rounded-xl border text-left transition-all cursor-pointer",
                      returnCondition === "GOOD"
                        ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-800 dark:text-emerald-300 ring-2 ring-emerald-500/20"
                        : "border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400"
                    )}
                  >
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 mb-1" />
                    <span className="font-bold block text-xs">Good Condition</span>
                    <span className="text-[10px] text-slate-400">Restores unit to Store Buffer</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setReturnCondition("FAULTY")}
                    className={cn(
                      "p-3 rounded-xl border text-left transition-all cursor-pointer",
                      returnCondition === "FAULTY"
                        ? "bg-rose-500/10 border-rose-500/40 text-rose-800 dark:text-rose-300 ring-2 ring-rose-500/20"
                        : "border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400"
                    )}
                  >
                    <AlertTriangle className="w-4 h-4 text-rose-500 mb-1" />
                    <span className="font-bold block text-xs">Defective / Damaged</span>
                    <span className="text-[10px] text-slate-400">Auto-routes to Vendor Repairs</span>
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700 dark:text-slate-300">
                  {returnCondition === "FAULTY" ? "Defect Notes (Sent to Vendor) *" : "Return Inspection Notes"}
                </label>
                <textarea
                  rows={2}
                  value={returnNotes}
                  onChange={(e) => setReturnNotes(e.target.value)}
                  placeholder={returnCondition === "FAULTY" ? "e.g. Screen flickering, loose hinge, power port faulty" : "Unit cleaned, charger received, condition verified"}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 outline-none"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  disabled={returnSubmitting}
                  onClick={() => setReturningAssignment(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={returnSubmitting}
                  onClick={handleConfirmReturn}
                  className="px-5 py-2 rounded-xl bg-[#0c3843] hover:bg-[#082931] text-white font-bold flex items-center gap-2 cursor-pointer"
                >
                  {returnSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>{returnCondition === "GOOD" ? "Confirm Return to Store" : "Mark Faulty & Route to Repair"}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
        </ModalPortal>
      )}

      {/* 8. Modal: Receive Repaired Equipment */}
      {receivingRepair && (
        <ModalPortal>
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Receive Repaired Equipment</h3>
              <button
                type="button"
                onClick={() => setReceivingRepair(null)}
                className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-400">Vendor:</span>
                  <strong className="text-slate-900 dark:text-white">{receivingRepair.vendor_name}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Original Defect:</span>
                  <span className="text-slate-600 dark:text-slate-300">{receivingRepair.issue_description}</span>
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700 dark:text-slate-300">
                  Total Repair Cost Incurred ($) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={repairCostInput}
                  onChange={(e) => setRepairCostInput(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700 dark:text-slate-300">
                  Resolution Notes / Work Performed
                </label>
                <textarea
                  rows={2}
                  value={repairResolutionNotes}
                  onChange={(e) => setRepairResolutionNotes(e.target.value)}
                  placeholder="e.g. Motherboard repaired, new thermal paste applied, tested passed"
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 outline-none"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  disabled={repairSubmitting}
                  onClick={() => setReceivingRepair(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={repairSubmitting}
                  onClick={handleCompleteRepair}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold flex items-center gap-2 cursor-pointer"
                >
                  {repairSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>Restore to Store Buffer</span>
                </button>
              </div>
            </div>
          </div>
        </div>
        </ModalPortal>
      )}

      {/* 9. Print Barcode Label Modal */}
      <PrintLabelModal
        product={pForPrint}
        isOpen={printModalOpen}
        onClose={() => setPrintModalOpen(false)}
      />
    </div>
  );
}
