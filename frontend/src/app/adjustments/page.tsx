"use client";

import React, { useState, useEffect, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  Wrench,
  CheckCircle2,
  Plus,
  Download,
  X,
  Search,
  RefreshCw,
  DollarSign,
  Truck,
  Trash2,
  SlidersHorizontal,
  Mail,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { apiClient, RepairRecord, RepairSummary } from "@/lib/api";
import { useInventory } from "@/lib/inventory-store";
import { useToast } from "@/components/ui/toast";
import { ModalPortal } from "@/components/ui/modal-portal";
import { FinanceReportModal } from "@/components/documents/finance-report-modal";
import { sanitizeCSVCell, downloadCSV } from "@/lib/export-csv";
import { cn } from "@/lib/utils";
import { useRequireCompanyAdmin } from "@/lib/use-require-company-admin";

const STATUS_META: Record<
  string,
  { label: string; short: string; className: string; dot: string }
> = {
  FAULTY: {
    label: "Faulty",
    short: "In office",
    className: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800",
    dot: "bg-rose-500",
  },
  AT_VENDOR: {
    label: "At vendor",
    short: "In repair",
    className: "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800",
    dot: "bg-amber-500",
  },
  REPAIRED: {
    label: "Restored",
    short: "Back in store",
    className: "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800",
    dot: "bg-emerald-500",
  },
  SCRAPPED: {
    label: "Scrapped",
    short: "Retired",
    className: "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
    dot: "bg-slate-400",
  },
};

function StatusPill({ status }: { status: string }) {
  const meta = STATUS_META[status] || STATUS_META.SCRAPPED;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 max-w-full px-2 py-1 rounded-lg border text-[11px] font-bold whitespace-nowrap",
        meta.className
      )}
      title={`${meta.label} · ${meta.short}`}
    >
      <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", meta.dot)} />
      <span>{meta.label}</span>
      <span className="font-medium opacity-70 hidden xl:inline">· {meta.short}</span>
    </span>
  );
}

export default function FaultyAndRepairsPage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-xs text-slate-400">
          Loading Faulty Equipment & Vendor Repair Tracker...
        </div>
      }
    >
      <FaultyAndRepairsContent />
    </Suspense>
  );
}

function FaultyAndRepairsContent() {
  useRequireCompanyAdmin();
  const searchParams = useSearchParams();
  const { products, adjustStock, refetch: refetchStore } = useInventory();
  const { toast } = useToast();

  const [repairs, setRepairs] = useState<RepairRecord[]>([]);
  const [summary, setSummary] = useState<RepairSummary>({
    total_faulty: 0,
    total_at_vendor: 0,
    total_repaired: 0,
    total_scrapped: 0,
    total_repair_spend: 0,
  });
  const [isLoading, setIsLoading] = useState(true);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>("ALL"); // ALL, FAULTY, AT_VENDOR, REPAIRED, SCRAPPED
  const [searchQuery, setSearchQuery] = useState("");

  // Pagination (15 items per page)
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 15;

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter]);

  // Modals
  const [isCreateRepairOpen, setIsCreateRepairOpen] = useState(false);
  const [sendVendorModalRecord, setSendVendorModalRecord] = useState<RepairRecord | null>(null);
  const [completeModalRecord, setCompleteModalRecord] = useState<RepairRecord | null>(null);
  const [isManualAdjustOpen, setIsManualAdjustOpen] = useState(false);
  const [isFinanceModalOpen, setIsFinanceModalOpen] = useState(false);

  // Create Faulty / Repair Form States
  const [selectedItemId, setSelectedItemId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [serialNumber, setSerialNumber] = useState("");
  const [initialStatus, setInitialStatus] = useState<"FAULTY" | "AT_VENDOR">("FAULTY");
  const [issueDescription, setIssueDescription] = useState("");
  const [reportedBy, setReportedBy] = useState("");
  const [vendorName, setVendorName] = useState("");
  const [vendorContact, setVendorContact] = useState("");
  const [expectedReturnDate, setExpectedReturnDate] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Send to Vendor Form States
  const [dispatchVendorName, setDispatchVendorName] = useState("");
  const [dispatchVendorContact, setDispatchVendorContact] = useState("");
  const [dispatchTicketRef, setDispatchTicketRef] = useState("");
  const [dispatchExpectedDate, setDispatchExpectedDate] = useState("");

  // Complete Repair (Receive from Vendor) Form States
  const [repairCost, setRepairCost] = useState("0");
  const [resolutionNotes, setResolutionNotes] = useState("");

  // Manual Stock Count Adjustment Form States
  const [adjProductId, setAdjProductId] = useState("");
  const [adjNewStock, setAdjNewStock] = useState("");
  const [adjReason, setAdjReason] = useState("Physical Cycle Count");

  const fetchRepairs = async () => {
    setIsLoading(true);
    try {
      const res = await apiClient.repairs.list();
      if (res.success && res.data) {
        setRepairs(res.data.records || []);
        if (res.data.summary) {
          setSummary(res.data.summary);
        }
      }
    } catch (err: any) {
      toast({
        title: "Error Loading Repairs",
        description: err?.message || "Could not load repair tracker.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRepairs();
  }, []);

  useEffect(() => {
    const pId = searchParams.get("productId");
    const st = searchParams.get("status");
    if (st) {
      setStatusFilter(st.toUpperCase());
    }
    if (pId) {
      setSelectedItemId(pId);
      setIsCreateRepairOpen(true);
    } else if (!selectedItemId && products.length > 0) {
      setSelectedItemId(products[0].id);
      setAdjProductId(products[0].id);
    }
  }, [searchParams, products]);

  const filteredRepairs = useMemo(() => {
    return repairs.filter((r) => {
      if (statusFilter !== "ALL" && r.status !== statusFilter) return false;
      const q = searchQuery.toLowerCase().trim();
      if (!q) return true;
      return (
        r.item_name.toLowerCase().includes(q) ||
        r.item_sku.toLowerCase().includes(q) ||
        r.issue_description.toLowerCase().includes(q) ||
        r.vendor_name.toLowerCase().includes(q) ||
        r.reported_by.toLowerCase().includes(q) ||
        r.serial_number.toLowerCase().includes(q) ||
        r.ticket_reference.toLowerCase().includes(q)
      );
    });
  }, [repairs, statusFilter, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredRepairs.length / PAGE_SIZE));
  const paginatedRepairs = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredRepairs.slice(start, start + PAGE_SIZE);
  }, [filteredRepairs, currentPage]);

  // 1. Submit New Faulty / Vendor Repair Record
  const handleCreateRepair = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItemId || !issueDescription.trim()) {
      toast({
        title: "Missing Details",
        description: "Please select an item and describe the fault/issue.",
        variant: "destructive",
      });
      return;
    }
    if (initialStatus === "AT_VENDOR" && !vendorName.trim()) {
      toast({
        title: "Vendor Name Required",
        description: "Please enter the repair vendor name.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await apiClient.repairs.create({
        item_id: selectedItemId,
        quantity: Math.max(1, Number(quantity) || 1),
        serial_number: serialNumber.trim(),
        status: initialStatus,
        issue_description: issueDescription.trim(),
        reported_by: reportedBy.trim() || "IT Store Admin",
        vendor_name: vendorName.trim(),
        vendor_contact: vendorContact.trim(),
        expected_return_date: expectedReturnDate || undefined,
        deduct_from_store: true,
      });

      if (res.success) {
        toast({
          title:
            initialStatus === "AT_VENDOR"
              ? "Dispatched to Repair Vendor"
              : "Logged as Faulty Equipment",
          description: `Recorded ${quantity} unit(s) in the Faulty & Vendor Repair ledger.`,
          variant: "success",
        });
        setIsCreateRepairOpen(false);
        setIssueDescription("");
        setSerialNumber("");
        setVendorName("");
        setVendorContact("");
        setQuantity("1");
        await fetchRepairs();
        await refetchStore();
      }
    } catch (err: any) {
      toast({
        title: "Failed to Log Faulty Item",
        description: err?.message || "Could not create repair record.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // 2. Send Faulty Item to Vendor
  const handleSendToVendor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sendVendorModalRecord || !dispatchVendorName.trim()) return;

    setIsSubmitting(true);
    try {
      const res = await apiClient.repairs.sendToVendor(sendVendorModalRecord.repair_id, {
        vendor_name: dispatchVendorName.trim(),
        vendor_contact: dispatchVendorContact.trim(),
        ticket_reference: dispatchTicketRef.trim(),
        expected_return_date: dispatchExpectedDate || undefined,
      });
      if (res.success) {
        toast({
          title: "Sent to Vendor for Repair!",
          description: `${sendVendorModalRecord.item_name} is now tracked under '${dispatchVendorName}'.`,
          variant: "success",
        });
        setSendVendorModalRecord(null);
        setDispatchVendorName("");
        setDispatchVendorContact("");
        await fetchRepairs();
        await refetchStore();
      }
    } catch (err: any) {
      toast({
        title: "Vendor Dispatch Failed",
        description: err?.message || "Could not update vendor status.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // 3. Receive Repaired Item from Vendor (Restores to Available IT Store Stock)
  const handleCompleteRepair = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!completeModalRecord) return;

    setIsSubmitting(true);
    try {
      const res = await apiClient.repairs.complete(completeModalRecord.repair_id, {
        repair_cost: Number(repairCost) || 0,
        resolution_notes:
          resolutionNotes.trim() || "Repaired by vendor and verified working",
      });
      if (res.success) {
        toast({
          title: "Repaired & Added Back to IT Store!",
          description: `${completeModalRecord.quantity} unit(s) of ${completeModalRecord.item_name} restored to Available Store Stock.`,
          variant: "success",
        });
        setCompleteModalRecord(null);
        setRepairCost("0");
        setResolutionNotes("");
        await fetchRepairs();
        await refetchStore();
      }
    } catch (err: any) {
      toast({
        title: "Error Completing Repair",
        description: err?.message || "Could not complete repair.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // 4. Mark Unrepairable / Scrap
  const handleScrap = async (rec: RepairRecord) => {
    try {
      const res = await apiClient.repairs.scrap(rec.repair_id, {
        resolution_notes: "Marked unrepairable / permanently scrapped",
      });
      if (res.success) {
        toast({
          title: "Marked as Unrepairable / Scrapped",
          description: `${rec.item_name} marked as permanently scrapped.`,
        });
        await fetchRepairs();
        await refetchStore();
      }
    } catch (err: any) {
      toast({
        title: "Error",
        description: err?.message || "Failed to scrap item.",
        variant: "destructive",
      });
    }
  };

  // 5. Manual Stock Count Adjustment
  const handleManualAdjust = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjProductId || adjNewStock === "") return;
    setIsSubmitting(true);
    try {
      const res = await adjustStock({
        productId: adjProductId,
        newStock: Math.max(0, Number(adjNewStock) || 0),
        reason: adjReason,
        reference: `ADJ-${Date.now().toString().slice(-4)}`,
      });
      if (res.success) {
        toast({
          title: "Store Stock Count Adjusted",
          description: "Available store balance reconciled.",
          variant: "success",
        });
        setIsManualAdjustOpen(false);
        await fetchRepairs();
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleExportCSV = () => {
    if (filteredRepairs.length === 0) return;
    const headers = [
      "Ticket #",
      "Item SKU",
      "Item Name",
      "Serial #",
      "Quantity",
      "Status",
      "Fault / Issue",
      "Reported By",
      "Vendor Name",
      "Vendor Contact",
      "Repair Cost ($)",
      "Resolution Notes",
      "Date Logged",
    ];
    const rows = filteredRepairs.map((r) =>
      [
        sanitizeCSVCell(r.ticket_reference),
        sanitizeCSVCell(r.item_sku),
        sanitizeCSVCell(r.item_name),
        sanitizeCSVCell(r.serial_number || "N/A"),
        r.quantity,
        sanitizeCSVCell(r.status),
        sanitizeCSVCell(r.issue_description),
        sanitizeCSVCell(r.reported_by),
        sanitizeCSVCell(r.vendor_name || "Not Sent Yet"),
        sanitizeCSVCell(r.vendor_contact || ""),
        r.repair_cost.toFixed(2),
        sanitizeCSVCell(r.resolution_notes),
        sanitizeCSVCell(new Date(r.created_at).toLocaleDateString()),
      ].join(",")
    );
    downloadCSV([headers.join(","), ...rows].join("\n"), "Faulty_And_Vendor_Repairs_Report.csv");
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12 page-enter">
      {/* Page Header (2-Tier Spacious Architecture) */}
      <div className="page-hero space-y-2.5">
        {/* Tier 1: Title & Primary CTAs */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 border border-amber-500/20 shadow-2xs">
              <Wrench className="w-5 h-5" />
            </div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 dark:text-white whitespace-nowrap">
                Faulty &amp; vendor
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20 shadow-2xs whitespace-nowrap">
                Repair ledger
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <button
              type="button"
              onClick={() => {
                if (!selectedItemId && products.length > 0) {
                  setSelectedItemId(products[0].id);
                }
                setIsCreateRepairOpen(true);
              }}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#0c3843] hover:bg-[#082931] text-white text-xs font-bold shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-4 h-4 text-cyan-300" />
              <span>Report faulty</span>
            </button>

            <button
              type="button"
              onClick={() => setIsFinanceModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200/90 dark:border-slate-700 bg-white/90 dark:bg-slate-900 text-slate-700 dark:text-slate-300 text-xs font-semibold hover:-translate-y-0.5 transition-all cursor-pointer whitespace-nowrap"
            >
              <Mail className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Finance record</span>
            </button>
          </div>
        </div>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pt-0.5">
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-3xl leading-relaxed">
            How many units are faulty, sent to a vendor, or returned after repair — with category and cost.
          </p>

          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <button
              type="button"
              onClick={() => {
                if (!adjProductId && products.length > 0) {
                  setAdjProductId(products[0].id);
                  setAdjNewStock(String(products[0].currentStock));
                }
                setIsManualAdjustOpen(true);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 text-xs font-semibold hover:bg-slate-50 cursor-pointer whitespace-nowrap"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-slate-500" />
              <span>Manual count</span>
            </button>

            <button
              type="button"
              onClick={handleExportCSV}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 text-xs font-semibold hover:bg-slate-50 cursor-pointer whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5 text-slate-500" />
              <span>Export</span>
            </button>

            <button
              type="button"
              onClick={fetchRepairs}
              className="p-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 hover:bg-slate-50 cursor-pointer"
              title="Refresh"
            >
              <RefreshCw className={cn("w-4 h-4 text-[#0c3843]", isLoading && "animate-spin")} />
            </button>
          </div>
        </div>
      </div>

      {/* Single toolbar: search + status filters + spend */}
      <div className="surface-panel p-3.5 space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center gap-3">
          <div className="relative flex-1 min-w-0">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search ticket, item, serial, vendor…"
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-[#0c3843]/20 focus:border-[#0c3843]"
            />
          </div>
          <div className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-emerald-200/80 bg-emerald-50/60 dark:bg-emerald-950/20 text-xs font-semibold text-emerald-800 dark:text-emerald-300 shrink-0">
            <DollarSign className="w-3.5 h-3.5" />
            Repair spend{" "}
            <span className="font-mono font-bold">${summary.total_repair_spend.toLocaleString()}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { id: "ALL", label: "All", count: repairs.length },
            { id: "FAULTY", label: "Faulty", count: summary.total_faulty },
            { id: "AT_VENDOR", label: "At vendor", count: summary.total_at_vendor },
            { id: "REPAIRED", label: "Restored", count: summary.total_repaired },
            {
              id: "SCRAPPED",
              label: "Scrapped",
              count: repairs.filter((x) => x.status === "SCRAPPED").length,
            },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setStatusFilter(tab.id)}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer border",
                statusFilter === tab.id
                  ? "bg-[#0c3843] text-white border-[#0c3843] shadow-sm"
                  : "bg-white dark:bg-slate-950 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:border-[#0c3843]/30"
              )}
            >
              {tab.label}
              <span
                className={cn(
                  "min-w-[1.25rem] text-center px-1.5 py-0.5 rounded-md font-mono text-[10px]",
                  statusFilter === tab.id ? "bg-white/15 text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-500"
                )}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Repairs Table */}
      <div className="surface-panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50/90 dark:bg-slate-900/80 border-b border-slate-200 dark:border-slate-800 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                <th className="py-3 px-3 text-center w-12">#</th>
                <th className="py-3 px-3">Ticket</th>
                <th className="py-3 px-3">Item</th>
                <th className="py-3 px-2 text-center w-14">Qty</th>
                <th className="py-3 px-3">Issue</th>
                <th className="py-3 px-3">Vendor</th>
                <th className="py-3 px-3 w-36">Status</th>
                <th className="py-3 px-3 text-right w-24">Cost</th>
                <th className="py-3 px-3 text-right w-28">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
              {paginatedRepairs.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-14 text-center text-slate-400">
                    <div className="flex flex-col items-center gap-2">
                      <Wrench className="w-8 h-8 text-slate-300" />
                      <p className="text-sm font-semibold text-slate-500">No repair tickets here</p>
                      <p className="text-xs">Report a faulty unit to start a ticket.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedRepairs.map((r, idx) => {
                  const continuousSerial = (currentPage - 1) * PAGE_SIZE + idx + 1;
                  const formattedSerial = continuousSerial < 10 ? `0${continuousSerial}` : `${continuousSerial}`;
                  const openTicket = r.status === "FAULTY" || r.status === "AT_VENDOR";

                  return (
                  <tr
                    key={r.repair_id}
                    className="hover:bg-slate-50/80 dark:hover:bg-slate-900/40 transition-colors"
                  >
                    <td className="py-3 px-3 text-center font-mono text-[11px] text-slate-400">
                      {formattedSerial}
                    </td>
                    <td className="py-3 px-3">
                      <div className="font-mono font-bold text-slate-900 dark:text-white text-[11px]">
                        {r.ticket_reference}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        {new Date(r.created_at).toLocaleDateString()}
                      </div>
                    </td>

                    <td className="py-3 px-3 min-w-[140px]">
                      <div className="font-semibold text-slate-900 dark:text-white leading-snug">{r.item_name}</div>
                      <div className="text-[10px] font-mono text-slate-400 mt-0.5 truncate max-w-[200px]">
                        {r.item_sku}
                        {r.serial_number ? ` · ${r.serial_number}` : ""}
                      </div>
                    </td>

                    <td className="py-3 px-2 text-center font-mono font-bold text-slate-800 dark:text-slate-200">
                      {r.quantity}
                    </td>

                    <td className="py-3 px-3 max-w-[200px]">
                      <div className="text-slate-700 dark:text-slate-300 line-clamp-2 leading-snug">
                        {r.issue_description}
                      </div>
                      {r.resolution_notes && (
                        <div className="text-[10px] text-emerald-700 dark:text-emerald-400 mt-0.5 line-clamp-1">
                          Fix: {r.resolution_notes}
                        </div>
                      )}
                    </td>

                    <td className="py-3 px-3">
                      {r.vendor_name ? (
                        <div>
                          <div className="font-semibold text-slate-900 dark:text-white">{r.vendor_name}</div>
                          {r.vendor_contact && (
                            <div className="text-[10px] text-slate-400 truncate max-w-[140px]">{r.vendor_contact}</div>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>

                    <td className="py-3 px-3">
                      <StatusPill status={r.status} />
                    </td>

                    <td className="py-3 px-3 text-right font-mono font-semibold text-slate-800 dark:text-slate-200">
                      {r.repair_cost > 0 ? `$${r.repair_cost.toLocaleString()}` : "—"}
                    </td>

                    <td className="py-3 px-3 text-right">
                      {openTicket ? (
                        <div className="inline-flex items-center justify-end gap-1">
                          {r.status === "FAULTY" && (
                            <button
                              type="button"
                              onClick={() => {
                                setSendVendorModalRecord(r);
                                setDispatchVendorName(r.vendor_name || "");
                                setDispatchVendorContact(r.vendor_contact || "");
                                setDispatchTicketRef(r.ticket_reference || "");
                              }}
                              className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:bg-amber-950/40 dark:border-amber-800 dark:text-amber-300 cursor-pointer transition-colors"
                              title="Send to vendor"
                            >
                              <Truck className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              setCompleteModalRecord(r);
                              setRepairCost(r.repair_cost ? String(r.repair_cost) : "0");
                              setResolutionNotes("");
                            }}
                            className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-300 cursor-pointer transition-colors"
                            title="Receive repaired"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleScrap(r)}
                            className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-slate-200 bg-white text-slate-400 hover:text-rose-600 hover:border-rose-200 hover:bg-rose-50 dark:bg-slate-950 dark:border-slate-800 cursor-pointer transition-colors"
                            title="Scrap / unrepairable"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <span className="text-[11px] text-slate-400 font-medium">Done</span>
                      )}
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
              {filteredRepairs.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1}
            </strong>{" "}
            to{" "}
            <strong className="text-slate-900 dark:text-white">
              {Math.min(currentPage * PAGE_SIZE, filteredRepairs.length)}
            </strong>{" "}
            of{" "}
            <strong className="text-slate-900 dark:text-white">
              {filteredRepairs.length}
            </strong>{" "}
            repair records
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

      {/* MODAL 1: REPORT FAULTY OR SEND TO VENDOR */}
      {isCreateRepairOpen && (
        <ModalPortal>
        <div className="fixed inset-0 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4 z-[100] animate-in fade-in duration-150">
          <div className="w-full max-w-xl bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 bg-rose-600 text-white">
              <div className="flex items-center gap-2">
                <Wrench className="w-5 h-5" />
                <div>
                  <h3 className="text-sm font-extrabold">
                    Report Faulty IT Equipment / Send to Repair Vendor
                  </h3>
                  <p className="text-[11px] text-rose-100">
                    Deducts damaged unit from Available Store Stock and tracks its repair lifecycle
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsCreateRepairOpen(false)}
                className="p-1.5 rounded-lg text-white/80 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateRepair} className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                    Select IT Product *
                  </label>
                  <select
                    value={selectedItemId}
                    onChange={(e) => setSelectedItemId(e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold"
                  >
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.sku}) — {p.currentStock} in Store
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                    Faulty Quantity *
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                    Serial Number / Asset Tag (Optional)
                  </label>
                  <input
                    type="text"
                    value={serialNumber}
                    onChange={(e) => setSerialNumber(e.target.value)}
                    placeholder="e.g. SN-DELL-8821"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                    Reported By (Employee / IT Admin)
                  </label>
                  <input
                    type="text"
                    value={reportedBy}
                    onChange={(e) => setReportedBy(e.target.value)}
                    placeholder="e.g. Usman (EMP-1022) or IT Store"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                  What is the Fault / Issue? *
                </label>
                <input
                  type="text"
                  required
                  value={issueDescription}
                  onChange={(e) => setIssueDescription(e.target.value)}
                  placeholder="e.g. Hinge broken, display dead, keyboard keys not working..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1.5">
                  Current Stage
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setInitialStatus("FAULTY")}
                    className={cn(
                      "p-2.5 rounded-xl border-2 text-left text-xs font-bold cursor-pointer",
                      initialStatus === "FAULTY"
                        ? "border-rose-500 bg-rose-50/50 text-rose-700"
                        : "border-slate-200 text-slate-600"
                    )}
                  >
                    1. Mark Faulty (In Office)
                  </button>
                  <button
                    type="button"
                    onClick={() => setInitialStatus("AT_VENDOR")}
                    className={cn(
                      "p-2.5 rounded-xl border-2 text-left text-xs font-bold cursor-pointer",
                      initialStatus === "AT_VENDOR"
                        ? "border-amber-500 bg-amber-50/50 text-amber-700"
                        : "border-slate-200 text-slate-600"
                    )}
                  >
                    2. Send Directly to Vendor
                  </button>
                </div>
              </div>

              {initialStatus === "AT_VENDOR" && (
                <div className="p-3.5 rounded-2xl bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-amber-900 dark:text-amber-300 mb-1">
                        Repair Vendor Name *
                      </label>
                      <input
                        type="text"
                        required
                        value={vendorName}
                        onChange={(e) => setVendorName(e.target.value)}
                        placeholder="e.g. Dell Service Center / Hafeez Center Lab"
                        className="w-full px-3 py-2 rounded-xl border border-amber-200 bg-white text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-amber-900 dark:text-amber-300 mb-1">
                        Vendor Phone / Contact
                      </label>
                      <input
                        type="text"
                        value={vendorContact}
                        onChange={(e) => setVendorContact(e.target.value)}
                        placeholder="e.g. 0300-1234567"
                        className="w-full px-3 py-2 rounded-xl border border-amber-200 bg-white text-xs"
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCreateRepairOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-md cursor-pointer"
                >
                  {isSubmitting ? "Saving..." : "Save Faulty / Repair Record"}
                </button>
              </div>
            </form>
          </div>
        </div>
        </ModalPortal>
      )}

      {/* MODAL 2: SEND FAULTY ITEM TO VENDOR */}
      {sendVendorModalRecord && (
        <ModalPortal>
        <div className="fixed inset-0 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4 z-[100]">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 shadow-2xl overflow-hidden">
            <div className="px-6 py-4 bg-amber-600 text-white flex items-center justify-between">
              <h3 className="text-sm font-extrabold">
                Send {sendVendorModalRecord.item_name} to Repair Vendor
              </h3>
              <button onClick={() => setSendVendorModalRecord(null)}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSendToVendor} className="p-6 space-y-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  Vendor / Repair Shop Name *
                </label>
                <input
                  type="text"
                  required
                  value={dispatchVendorName}
                  onChange={(e) => setDispatchVendorName(e.target.value)}
                  placeholder="e.g. Dell Authorized Service Center"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  Vendor Contact / Phone
                </label>
                <input
                  type="text"
                  value={dispatchVendorContact}
                  onChange={(e) => setDispatchVendorContact(e.target.value)}
                  placeholder="e.g. +92 300 1234567"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  Expected Return Date
                </label>
                <input
                  type="date"
                  value={dispatchExpectedDate}
                  onChange={(e) => setDispatchExpectedDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSendVendorModalRecord(null)}
                  className="px-4 py-2 rounded-xl border text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold cursor-pointer"
                >
                  Confirm Dispatch to Vendor
                </button>
              </div>
            </form>
          </div>
        </div>
        </ModalPortal>
      )}

      {/* MODAL 3: RECEIVE REPAIRED ITEM BACK FROM VENDOR */}
      {completeModalRecord && (
        <ModalPortal>
        <div className="fixed inset-0 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4 z-[100]">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 shadow-2xl overflow-hidden">
            <div className="px-6 py-4 bg-emerald-600 text-white flex items-center justify-between">
              <div>
                <h3 className="text-sm font-extrabold">
                  Receive Repaired Item Back from Vendor
                </h3>
                <p className="text-[11px] text-emerald-100">
                  {completeModalRecord.item_name} ({completeModalRecord.quantity} unit) will be added back to Available IT Store Stock
                </p>
              </div>
              <button onClick={() => setCompleteModalRecord(null)}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleCompleteRepair} className="p-6 space-y-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  Vendor Repair Cost ($)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={repairCost}
                  onChange={(e) => setRepairCost(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  What was repaired / Resolution Notes *
                </label>
                <input
                  type="text"
                  required
                  value={resolutionNotes}
                  onChange={(e) => setResolutionNotes(e.target.value)}
                  placeholder="e.g. Replaced display panel & tested OK"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCompleteModalRecord(null)}
                  className="px-4 py-2 rounded-xl border text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold cursor-pointer"
                >
                  Mark Repaired & Add to Store Stock
                </button>
              </div>
            </form>
          </div>
        </div>
        </ModalPortal>
      )}

      {/* MODAL 4: MANUAL STOCK COUNT ADJUSTMENT */}
      {isManualAdjustOpen && (
        <ModalPortal>
        <div className="fixed inset-0 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4 z-[100]">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 shadow-2xl overflow-hidden">
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
              <h3 className="text-sm font-extrabold">Manual IT Store Stock Count Reconciliation</h3>
              <button onClick={() => setIsManualAdjustOpen(false)}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleManualAdjust} className="p-6 space-y-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Product</label>
                <select
                  value={adjProductId}
                  onChange={(e) => {
                    setAdjProductId(e.target.value);
                    const p = products.find((x) => x.id === e.target.value);
                    if (p) setAdjNewStock(String(p.currentStock));
                  }}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold"
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} (Current Store Stock: {p.currentStock})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  Verified Physical Store Count
                </label>
                <input
                  type="number"
                  min="0"
                  value={adjNewStock}
                  onChange={(e) => setAdjNewStock(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Reason</label>
                <input
                  type="text"
                  value={adjReason}
                  onChange={(e) => setAdjReason(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsManualAdjustOpen(false)}
                  className="px-4 py-2 rounded-xl border text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl bg-[#0c3843] text-white text-xs font-bold cursor-pointer"
                >
                  Update Store Stock
                </button>
              </div>
            </form>
          </div>
        </div>
        </ModalPortal>
      )}

      {/* Finance Report Modal */}
      <FinanceReportModal
        isOpen={isFinanceModalOpen}
        onClose={() => setIsFinanceModalOpen(false)}
      />
    </div>
  );
}
