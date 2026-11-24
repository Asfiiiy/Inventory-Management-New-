"use client";

import React, { useState, useEffect, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ShieldCheck,
  Search,
  Plus,
  RefreshCw,
  FileCheck2,
  AlertTriangle,
  CheckCircle2,
  RotateCcw,
  ChevronRight,
  ChevronLeft,
  Download,
  X,
  UserCheck,
  PenTool,
  Hash,
  Building2,
  Package,
  Mail,
  ArrowRight,
  Layers,
} from "lucide-react";
import {
  apiClient,
  AssetRequest,
  CustodyAssignment,
  HandoverCertificate,
  UserProfile,
} from "@/lib/api";
import { useInventory } from "@/lib/inventory-store";
import { useToast } from "@/components/ui/toast";
import { ModalPortal } from "@/components/ui/modal-portal";
import { HandoverCertificateModal } from "@/components/documents/handover-certificate-modal";
import { FinanceReportModal } from "@/components/documents/finance-report-modal";
import { SignaturePad } from "@/components/ui/signature-pad";
import { sanitizeCSVCell, downloadCSV } from "@/lib/export-csv";
import { cn } from "@/lib/utils";
import { useRequireCompanyAdmin } from "@/lib/use-require-company-admin";

export default function CustodyPage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-xs text-slate-400">
          Loading Employee Handover & Digital Signature Register...
        </div>
      }
    >
      <CustodyContent />
    </Suspense>
  );
}

function CustodyContent() {
  useRequireCompanyAdmin();
  const searchParams = useSearchParams();
  const { products, refetch: refetchStore } = useInventory();
  const { toast } = useToast();

  // Core Data States
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [assignments, setAssignments] = useState<CustodyAssignment[]>([]);
  const [locations, setLocations] = useState<Array<{ location_id: string; name: string }>>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Search & Filter States
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<"ALL" | "ACTIVE" | "RETURNED">("ALL");

  // Pagination States
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [itemsPerPage] = useState<number>(15);

  // Modals
  const [isCheckOutOpen, setIsCheckOutOpen] = useState(false);
  const [isCheckInOpen, setIsCheckInOpen] = useState(false);
  const [isFinanceModalOpen, setIsFinanceModalOpen] = useState(false);
  const [selectedAssignmentForReturn, setSelectedAssignmentForReturn] =
    useState<CustodyAssignment | null>(null);

  // Certificate Modal State
  const [activeCert, setActiveCert] = useState<HandoverCertificate | null>(null);
  const [certEmployeeName, setCertEmployeeName] = useState<string>("");
  const [certEmployeeEmail, setCertEmployeeEmail] = useState<string>("");
  const [isCertModalOpen, setIsCertModalOpen] = useState(false);

  // Handover Form States
  const [employeeName, setEmployeeName] = useState("");
  const [employeeCode, setEmployeeCode] = useState("");
  const [employeeDept, setEmployeeDept] = useState("IT / Engineering");
  const [employeeEmail, setEmployeeEmail] = useState("");
  const [checkoutAssetId, setCheckoutAssetId] = useState("");
  const [checkoutQuantity, setCheckoutQuantity] = useState("1");
  const [serialNumber, setSerialNumber] = useState("");
  const [checkoutLocationId, setCheckoutLocationId] = useState("");
  const [checkoutExpectedDate, setCheckoutExpectedDate] = useState("");
  const [checkoutGrade, setCheckoutGrade] = useState("A");
  const [checkoutNotes, setCheckoutNotes] = useState("");
  const [signatureData, setSignatureData] = useState("");
  const [isSubmittingCheckout, setIsSubmittingCheckout] = useState(false);

  // Return / Check-In Form States
  const [checkinLocationId, setCheckinLocationId] = useState("");
  const [returnCondition, setReturnCondition] = useState<"GOOD" | "FAULTY">("GOOD");
  const [checkinGrade, setCheckinGrade] = useState("A");
  const [checkinNotes, setCheckinNotes] = useState("");
  const [faultyIssueDesc, setFaultyIssueDesc] = useState("");
  const [faultyVendorName, setFaultyVendorName] = useState("");
  const [isSubmittingCheckin, setIsSubmittingCheckin] = useState(false);
  const [pendingRequests, setPendingRequests] = useState<AssetRequest[]>([]);
  const [decidingId, setDecidingId] = useState<string | null>(null);

  // Fetch initial data
  const fetchData = async () => {
    setIsLoading(true);
    try {
      try {
        const reqRes = await apiClient.custody.listRequests("PENDING");
        if (reqRes.success && reqRes.data) setPendingRequests(reqRes.data);
      } catch {
        setPendingRequests([]);
      }
      // 1. Fetch Users
      let fetchedUsers: UserProfile[] = [];
      try {
        const usersRes = await apiClient.users.list();
        if (usersRes.success && usersRes.data) {
          fetchedUsers = usersRes.data.filter(
            (u) => u.role !== "superadmin" && !u.email.toLowerCase().includes("admin@whoopit.io")
          );
          setUsers(fetchedUsers);
        }
      } catch {
        // ignore
      }

      // 2. Fetch Physical Locations
      try {
        const locRes = await apiClient.locations.list();
        if (locRes.success && locRes.data) {
          const physicalLocs = locRes.data.filter(
            (l: any) =>
              l.category === "physical_warehouse" ||
              l.category === "physical_office" ||
              !l.category?.startsWith("virtual_")
          );
          const validLocs = physicalLocs.length > 0 ? physicalLocs : locRes.data;
          setLocations(validLocs);
          if (!checkoutLocationId && validLocs.length > 0) {
            setCheckoutLocationId(validLocs[0].location_id);
          }
          if (!checkinLocationId && validLocs.length > 0) {
            setCheckinLocationId(validLocs[0].location_id);
          }
        }
      } catch {
        // ignore
      }

      // 3. Fetch All Assignments in 1 fast call
      try {
        const allRes = await apiClient.custody.listAllAssignments();
        if (allRes.success && Array.isArray(allRes.data)) {
          setAssignments(allRes.data);
        } else {
          setAssignments([]);
        }
      } catch {
        // Fallback per user
        const allAssignments: CustodyAssignment[] = [];
        for (const u of fetchedUsers) {
          try {
            const empRes = await apiClient.custody.listEmployeeCustody(u.id);
            if (empRes.success && empRes.data) {
              allAssignments.push(...empRes.data);
            }
          } catch {
            // ignore
          }
        }
        setAssignments(allAssignments);
      }
    } catch (err: any) {
      toast({
        title: "Load Error",
        description: err?.message || "Failed to load custody data",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const decideRequest = async (id: string, approve: boolean) => {
    setDecidingId(id);
    try {
      if (approve) {
        await apiClient.custody.approveRequest(id, { decision_notes: "Approved from custody queue" });
        toast({ title: "Request approved", description: "Hardware issue completed after approval.", variant: "success" });
      } else {
        await apiClient.custody.rejectRequest(id, { decision_notes: "Rejected from custody queue" });
        toast({ title: "Request rejected", description: "Staff request was declined.", variant: "success" });
      }
      await fetchData();
      await refetchStore();
    } catch (err: any) {
      toast({
        title: "Decision failed",
        description: err?.message || "Could not update the approval request.",
        variant: "destructive",
      });
    } finally {
      setDecidingId(null);
    }
  };

  // Pre-select product if ?assetId=, ?action=new, or ?employee= is in URL
  useEffect(() => {
    const assetParam = searchParams.get("assetId");
    const actionParam = searchParams.get("action");
    const employeeParam = searchParams.get("employee");
    if (assetParam || actionParam === "new" || employeeParam) {
      if (assetParam) setCheckoutAssetId(assetParam);
      if (employeeParam) setEmployeeName(employeeParam);
      if (!employeeCode) {
        setEmployeeCode(`EMP-${Math.floor(1000 + Math.random() * 9000)}`);
      }
      setIsCheckOutOpen(true);
    } else if (!checkoutAssetId && products.length > 0) {
      setCheckoutAssetId(products[0].id);
    }
  }, [searchParams, products]);

  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return "Permanent / Open";
    try {
      return new Date(dateStr).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return dateStr;
    }
  };

  // Filtered assignments
  const filteredAssignments = useMemo(() => {
    return assignments.filter((a) => {
      const isReturned = Boolean(a.returned_at);
      if (selectedStatusFilter === "ACTIVE" && isReturned) return false;
      if (selectedStatusFilter === "RETURNED" && !isReturned) return false;

      const q = searchQuery.toLowerCase().trim();
      if (!q) return true;

      return (
        (a.asset_sku && a.asset_sku.toLowerCase().includes(q)) ||
        (a.asset_name && a.asset_name.toLowerCase().includes(q)) ||
        (a.employee_name && a.employee_name.toLowerCase().includes(q)) ||
        (a.employee_code && a.employee_code.toLowerCase().includes(q)) ||
        (a.employee_department && a.employee_department.toLowerCase().includes(q)) ||
        (a.serial_number && a.serial_number.toLowerCase().includes(q)) ||
        a.assignment_id.toLowerCase().includes(q)
      );
    });
  }, [assignments, selectedStatusFilter, searchQuery]);

  // Summary counts
  const activeAssignmentsCount = useMemo(
    () =>
      assignments
        .filter((a) => !a.returned_at)
        .reduce((sum, a) => sum + (Number(a.quantity) || 1), 0),
    [assignments]
  );
  const returnedAssignmentsCount = useMemo(
    () =>
      assignments
        .filter((a) => Boolean(a.returned_at))
        .reduce((sum, a) => sum + (Number(a.quantity) || 1), 0),
    [assignments]
  );
  const totalStoreStock = useMemo(
    () => products.reduce((s, p) => s + p.currentStock, 0),
    [products]
  );

  // Pagination
  const totalPages = Math.ceil(filteredAssignments.length / itemsPerPage) || 1;
  const validCurrentPage = Math.min(Math.max(1, currentPage), totalPages);
  const paginatedAssignments = filteredAssignments.slice(
    (validCurrentPage - 1) * itemsPerPage,
    validCurrentPage * itemsPerPage
  );

  // Reset page when filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedStatusFilter, searchQuery]);

  const handleOpenCheckoutModal = () => {
    if (!checkoutAssetId && products.length > 0) {
      setCheckoutAssetId(products[0].id);
    }
    if (!employeeCode) {
      setEmployeeCode(`EMP-${Math.floor(1000 + Math.random() * 9000)}`);
    }
    setSignatureData("");
    setIsCheckOutOpen(true);
  };

  // Submit Employee Handover with Employee ID & Online Signature
  const handleCheckoutSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!checkoutAssetId || !checkoutLocationId) {
      toast({
        title: "Missing Item or Location",
        description: "Please select an IT item and store location.",
        variant: "destructive",
      });
      return;
    }

    const trimmedName = employeeName.trim();
    const trimmedCode = employeeCode.trim().toUpperCase();
    if (!trimmedName || !trimmedCode) {
      toast({
        title: "Employee Name & ID Required",
        description: "Please enter both the Employee Name and Employee ID (e.g. EMP-1042).",
        variant: "destructive",
      });
      return;
    }

    if (!signatureData) {
      toast({
        title: "Employee Signature Required",
        description:
          "Please take the employee's online signature on the Signature Pad before completing handover.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmittingCheckout(true);
    try {
      // Find or create employee user record in backend
      let finalUserId = "";
      const existingUser = users.find(
        (u) => u.name.toLowerCase() === trimmedName.toLowerCase()
      );
      if (existingUser) {
        finalUserId = existingUser.id;
      } else {
        const cleanEmail =
          employeeEmail.trim() && employeeEmail.includes("@")
            ? employeeEmail.trim()
            : `${trimmedCode.toLowerCase().replace(/[^a-z0-9]/g, "")}_${Date.now()
                .toString(36)
                .slice(-4)}@office.staff`;
        const createRes = await apiClient.users.create({
          name: trimmedName,
          role: employeeDept.trim() || "staff",
          email: cleanEmail,
          password: "StaffPassword123!",
        });
        if (createRes.success && createRes.data) {
          finalUserId = createRes.data.id;
          setUsers((prev) => [createRes.data, ...prev]);
        }
      }

      const expDateIso = checkoutExpectedDate
        ? new Date(checkoutExpectedDate).toISOString()
        : undefined;

      const qtyNum = Math.max(1, Number(checkoutQuantity) || 1);

      const res = await apiClient.custody.checkout({
        asset_id: checkoutAssetId,
        employee_user_id: finalUserId,
        source_location_id: checkoutLocationId,
        expected_return_date: expDateIso,
        condition_grade: checkoutGrade,
        quantity: qtyNum,
        employee_code: trimmedCode,
        employee_name: trimmedName,
        employee_department: employeeDept.trim() || "Office Staff",
        employee_email: employeeEmail.trim(),
        serial_number: serialNumber.trim(),
        signature_data: signatureData,
        notes: checkoutNotes.trim(),
        admin_override: true,
      });

      if (res.success && res.data?.pending_approval) {
        toast({
          title: "Queued for approval",
          description: res.data.message || `Estimated value $${Number(res.data.estimated_value || 0).toFixed(0)} needs approval.`,
          variant: "success",
        });
        setIsCheckOutOpen(false);
        await fetchData();
        return;
      }

      if (res.success && res.data?.assignment) {
        toast({
          title: "IT Asset Handed Over & Signed!",
          description: `Issued to ${trimmedName} (${trimmedCode}) with online digital signature.`,
          variant: "success",
        });

        setIsCheckOutOpen(false);

        // Open Signed Handover Certificate immediately
        try {
          const certRes = await apiClient.custody.getCertificate(
            res.data.assignment.assignment_id
          );
          if (certRes.success && certRes.data) {
            setActiveCert(certRes.data);
            setCertEmployeeName(trimmedName);
            setCertEmployeeEmail(employeeEmail.trim());
            setIsCertModalOpen(true);
          }
        } catch {
          // ignore
        }

        // Reset fields
        setEmployeeName("");
        setEmployeeCode(`EMP-${Math.floor(1000 + Math.random() * 9000)}`);
        setEmployeeEmail("");
        setSerialNumber("");
        setCheckoutQuantity("1");
        setCheckoutNotes("");
        setSignatureData("");

        await fetchData();
        await refetchStore();
      }
    } catch (err: any) {
      toast({
        title: "Handover Failed",
        description: err?.problem?.detail || err?.message || "Could not complete handover.",
        variant: "destructive",
      });
    } finally {
      setIsSubmittingCheckout(false);
    }
  };

  // Handle Return / Check-In Submit (Good or Faulty)
  const handleCheckinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAssignmentForReturn || !checkinLocationId) return;

    setIsSubmittingCheckin(true);
    try {
      const res = await apiClient.custody.checkin({
        assignment_id: selectedAssignmentForReturn.assignment_id,
        return_to_location_id: checkinLocationId,
        condition_grade: returnCondition === "FAULTY" ? "FAULTY" : checkinGrade,
        notes: checkinNotes.trim(),
        return_condition: returnCondition,
        issue_description: faultyIssueDesc.trim(),
        vendor_name: faultyVendorName.trim(),
      });

      if (res.success) {
        toast({
          title:
            returnCondition === "FAULTY"
              ? "Returned as Faulty & Logged for Repair"
              : "Returned to Available IT Store Stock",
          description:
            returnCondition === "FAULTY"
              ? "Item has been added to the Faulty & Vendor Repair tracker."
              : "Item is now back in the IT Store and ready for reassignment.",
          variant: "success",
        });
        setIsCheckInOpen(false);
        setSelectedAssignmentForReturn(null);
        setCheckinNotes("");
        setFaultyIssueDesc("");
        setFaultyVendorName("");
        await fetchData();
        await refetchStore();
      }
    } catch (err: any) {
      toast({
        title: "Return Failed",
        description: err?.problem?.detail || err?.message || "Failed to return asset.",
        variant: "destructive",
      });
    } finally {
      setIsSubmittingCheckin(false);
    }
  };

  const handleViewCertificate = async (a: CustodyAssignment) => {
    try {
      const certRes = await apiClient.custody.getCertificate(a.assignment_id);
      if (certRes.success && certRes.data) {
        setActiveCert(certRes.data);
        setCertEmployeeName(a.employee_name || "Employee");
        setCertEmployeeEmail(a.employee_email || "");
        setIsCertModalOpen(true);
      }
    } catch (err: any) {
      toast({
        title: "Certificate Error",
        description: err?.message || "Could not load handover certificate.",
        variant: "destructive",
      });
    }
  };

  const handleExportCSV = () => {
    if (filteredAssignments.length === 0) {
      toast({
        title: "No Data to Export",
        description: "There are no records matching your current filter.",
      });
      return;
    }
    const headers = [
      "Employee ID",
      "Employee Name",
      "Department",
      "Asset SKU",
      "Asset Name",
      "Serial / Tag #",
      "Quantity",
      "Condition",
      "Online Signature",
      "Handover Date",
      "Return Status",
    ];
    const rows = filteredAssignments.map((a) =>
      [
        sanitizeCSVCell(a.employee_code || "N/A"),
        sanitizeCSVCell(a.employee_name || "Employee"),
        sanitizeCSVCell(a.employee_department || "Office"),
        sanitizeCSVCell(a.asset_sku || ""),
        sanitizeCSVCell(a.asset_name || ""),
        sanitizeCSVCell(a.serial_number || "N/A"),
        a.quantity || 1,
        sanitizeCSVCell(a.condition_grade || "A"),
        sanitizeCSVCell(a.signature_data ? "Signed Online (Verified)" : "Verified"),
        sanitizeCSVCell(formatDate(a.checkout_date)),
        sanitizeCSVCell(a.returned_at ? `Returned (${formatDate(a.returned_at)})` : "Active with Employee"),
      ].join(",")
    );
    downloadCSV([headers.join(","), ...rows].join("\n"), "Employee_IT_Handover_Register.csv");
  };

  const selectedProductObj = products.find((p) => p.id === checkoutAssetId);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12 page-enter">
      {/* Executive Header Toolbar (2-Tier Spacious Architecture) */}
      <div className="page-hero space-y-2.5">
        {/* Tier 1: Full-Width Title & Primary CTA */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 border border-blue-500/20 shadow-xs transition-transform duration-300 hover:scale-105">
              <UserCheck className="w-5 h-5" />
            </div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 dark:text-white whitespace-nowrap">
                Assigned to staff
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-500/20 shadow-2xs whitespace-nowrap">
                Returnable + e-sign
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleOpenCheckoutModal}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#0c3843] hover:bg-[#082931] text-white text-xs font-bold shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all cursor-pointer whitespace-nowrap"
            >
              <PenTool className="w-3.5 h-3.5 text-cyan-300" />
              <span>Assign with e-sign</span>
            </button>

            <button
              onClick={() => setIsFinanceModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 text-xs font-bold shadow-2xs transition-all cursor-pointer whitespace-nowrap"
            >
              <Mail className="w-3.5 h-3.5 text-emerald-600" />
              <span className="hidden sm:inline">Finance record</span>
            </button>
          </div>
        </div>

        {/* Tier 2: Subtitle & Secondary Controls */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pt-0.5">
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-3xl leading-relaxed">
            Laptops, monitors, phones, and other office kit — assign to staff with Employee ID and digital signature.
          </p>

          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <button
              onClick={handleExportCSV}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 text-xs font-semibold hover:bg-slate-50 transition-all cursor-pointer whitespace-nowrap shadow-2xs"
            >
              <Download className="w-3.5 h-3.5 text-slate-500" />
              <span>Export CSV</span>
            </button>

            <button
              onClick={fetchData}
              title="Refresh Custody Register"
              className="p-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 hover:bg-slate-50 transition-all cursor-pointer"
            >
              <RefreshCw className={cn("w-4 h-4 text-[#0c3843]", isLoading && "animate-spin")} />
            </button>
          </div>
        </div>
      </div>

      {pendingRequests.length > 0 && (
        <div className="rounded-2xl border border-amber-200 dark:border-amber-900/50 bg-amber-50/60 dark:bg-amber-950/20 p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-extrabold text-amber-900 dark:text-amber-200 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              Approvals queue ({pendingRequests.length})
            </h2>
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300">
              Admin decision required
            </span>
          </div>
          <div className="space-y-2">
            {pendingRequests.map((req) => (
              <div
                key={req.request_id}
                className="rounded-xl border border-amber-200/80 dark:border-amber-800/60 bg-white dark:bg-slate-950 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="text-sm font-bold text-slate-900 dark:text-white truncate">
                    {req.item_name} <span className="font-mono text-xs text-slate-500">({req.item_sku})</span>
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    For {req.employee_name || "staff"} · Qty {req.quantity} · Est. ${Number(req.estimated_value || 0).toFixed(0)}
                    {req.serial_number ? ` · S/N ${req.serial_number}` : ""}
                  </div>
                  {req.reason && <div className="text-[11px] text-slate-600 dark:text-slate-400 mt-1">{req.reason}</div>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={decidingId === req.request_id}
                    onClick={() => decideRequest(req.request_id, false)}
                    className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 disabled:opacity-50"
                  >
                    Reject
                  </button>
                  <button
                    type="button"
                    disabled={decidingId === req.request_id}
                    onClick={() => decideRequest(req.request_id, true)}
                    className="px-3 py-2 rounded-xl bg-[#0c3843] text-white text-xs font-bold disabled:opacity-50"
                  >
                    {decidingId === req.request_id ? "Working…" : "Approve & issue"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}


      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setSelectedStatusFilter(selectedStatusFilter === "ACTIVE" ? "ALL" : "ACTIVE")}
          className={cn(
            "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold",
            selectedStatusFilter === "ACTIVE"
              ? "border-[#0c3843] bg-[#0c3843] text-white"
              : "border-teal-200 bg-teal-50/70 text-teal-800 dark:bg-teal-950/30 dark:text-teal-300 dark:border-teal-800"
          )}
        >
          <UserCheck className="w-3.5 h-3.5" />
          With staff <span className="font-mono font-bold">{activeAssignmentsCount}</span>
        </button>
        <Link
          href="/products"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-emerald-200 bg-emerald-50/70 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300 text-xs font-semibold"
        >
          <Package className="w-3.5 h-3.5" />
          Available <span className="font-mono font-bold">{totalStoreStock}</span>
        </Link>
        <button
          type="button"
          onClick={() => setSelectedStatusFilter(selectedStatusFilter === "RETURNED" ? "ALL" : "RETURNED")}
          className={cn(
            "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold",
            selectedStatusFilter === "RETURNED"
              ? "border-slate-700 bg-slate-800 text-white"
              : "border-slate-200 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300"
          )}
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Returned <span className="font-mono font-bold">{returnedAssignmentsCount}</span>
        </button>
      </div>

      <div className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by Employee Name, Employee ID (EMP-...), Department, Laptop/Item, or Serial #..."
            className="w-full pl-10 pr-9 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-xs font-medium text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#0c3843]/20"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Filter Pills with Counts */}
        <div className="flex items-center gap-1.5 shrink-0 overflow-x-auto pb-1 sm:pb-0">
          {(["ALL", "ACTIVE", "RETURNED"] as const).map((st) => (
            <button
              key={st}
              onClick={() => setSelectedStatusFilter(st)}
              className={cn(
                "px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap",
                selectedStatusFilter === st
                  ? "bg-[#0c3843] text-white shadow-xs"
                  : "bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800"
              )}
            >
              {st === "ALL" && `All Records (${assignments.length})`}
              {st === "ACTIVE" && `Active with Staff (${activeAssignmentsCount})`}
              {st === "RETURNED" && `Returned History (${returnedAssignmentsCount})`}
            </button>
          ))}
        </div>
      </div>

      {/* Mobile-first assignment cards */}
      <div className="md:hidden space-y-3">
        {paginatedAssignments.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 p-8 text-center text-xs text-slate-500">
            No custody records match this filter.
          </div>
        ) : (
          paginatedAssignments.map((a) => {
            const isReturned = !!a.returned_at;
            return (
              <div
                key={a.assignment_id}
                className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-4 space-y-3 shadow-xs"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-extrabold text-slate-900 dark:text-white">{a.employee_name || "Employee"}</div>
                    <div className="text-[11px] font-mono text-slate-500">{a.employee_code || "—"} · {a.employee_department || "—"}</div>
                  </div>
                  {isReturned ? (
                    <span className="text-[10px] font-bold uppercase px-2 py-1 rounded-full bg-slate-100 text-slate-600">Returned</span>
                  ) : (
                    <span className="text-[10px] font-bold uppercase px-2 py-1 rounded-full bg-blue-500/10 text-blue-700">Active</span>
                  )}
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-800 dark:text-slate-100">{a.asset_name}</div>
                  <div className="text-[11px] text-slate-500 font-mono">{a.asset_sku} · S/N {a.serial_number || "—"} · Qty {a.quantity || 1}</div>
                  <div className="text-[11px] text-slate-500 mt-1">Issued {formatDate(a.checkout_date)}</div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleViewCertificate(a)}
                    className="flex-1 py-2.5 rounded-xl border border-indigo-200 text-indigo-700 text-xs font-bold"
                  >
                    Certificate
                  </button>
                  {!isReturned && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedAssignmentForReturn(a);
                        setReturnCondition("GOOD");
                        setIsCheckInOpen(true);
                      }}
                      className="flex-1 py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-bold"
                    >
                      Return / Faulty
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Custody Register Table Card */}
      <div className="hidden md:block surface-panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs min-w-[980px]">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <th className="py-3 px-3 text-center w-12 whitespace-nowrap">#</th>
                <th className="py-3 px-4 min-w-[210px] whitespace-nowrap">Employee &amp; ID</th>
                <th className="py-3 px-3 min-w-[130px] whitespace-nowrap">Department</th>
                <th className="py-3 px-3 min-w-[210px] whitespace-nowrap">Assigned IT Equipment</th>
                <th className="py-3 px-2 text-center w-14 whitespace-nowrap">Qty</th>
                <th className="py-3 px-3 min-w-[130px] whitespace-nowrap">Serial / Tag #</th>
                <th className="py-3 px-3 min-w-[140px] whitespace-nowrap">Online Signature</th>
                <th className="py-3 px-3 min-w-[110px] whitespace-nowrap">Handover Date</th>
                <th className="py-3 px-3 min-w-[140px] whitespace-nowrap">Status</th>
                <th className="py-3 px-4 text-right min-w-[190px] whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
              {paginatedAssignments.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-14 text-center">
                    <div className="flex flex-col items-center justify-center text-slate-400">
                      <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-900 flex items-center justify-center mb-2.5">
                        <UserCheck className="w-6 h-6 text-slate-400" />
                      </div>
                      <p className="text-sm font-bold text-slate-700 dark:text-slate-300">
                        No employee handovers found
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {searchQuery
                          ? "Try adjusting your search criteria."
                          : 'Click "Issue Hardware (e-Sign)" to issue an IT asset to staff.'}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedAssignments.map((a, idx) => {
                  const isReturned = Boolean(a.returned_at);
                  const continuousSerial = (currentPage - 1) * itemsPerPage + idx + 1;
                  const formattedSerial = continuousSerial < 10 ? `#0${continuousSerial}` : `#${continuousSerial}`;

                  return (
                    <tr
                      key={a.assignment_id}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-900/40 transition-colors"
                    >
                      {/* S.No */}
                      <td className="py-3.5 px-3 text-center font-mono font-bold text-slate-400 text-[11px] whitespace-nowrap">
                        {formattedSerial}
                      </td>

                      {/* Employee & ID */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="font-bold text-slate-900 dark:text-white">
                          {a.employee_name || "Office Employee"}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="px-1.5 py-0.2 rounded bg-cyan-500/15 text-[#0c3843] dark:text-cyan-300 border border-cyan-500/30 font-mono text-[10px] font-extrabold">
                            {a.employee_code || "EMP-STAFF"}
                          </span>
                          {a.employee_email && (
                            <span className="text-[10px] text-slate-400 truncate max-w-[130px]">
                              {a.employee_email}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Department */}
                      <td className="py-3.5 px-3 font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap">
                        {a.employee_department || "IT / Operations"}
                      </td>

                      {/* Assigned Hardware */}
                      <td className="py-3.5 px-3 whitespace-nowrap">
                        <div className="font-bold text-slate-900 dark:text-white">
                          {a.asset_name || "IT Equipment"}
                        </div>
                        <div className="text-[10px] font-mono text-slate-400">{a.asset_sku}</div>
                      </td>

                      {/* Quantity */}
                      <td className="py-3.5 px-2 text-center font-black text-slate-900 dark:text-white whitespace-nowrap">
                        {a.quantity || 1}
                      </td>

                      {/* Serial / Tag # */}
                      <td className="py-3.5 px-3 font-mono text-[11px] text-slate-600 dark:text-slate-400 whitespace-nowrap">
                        {a.serial_number ? (
                          <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold border border-slate-200 dark:border-slate-700">
                            {a.serial_number}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      {/* Online Signature */}
                      <td className="py-3.5 px-3 whitespace-nowrap">
                        {a.signature_data ? (
                          <div className="inline-flex items-center gap-2 bg-slate-50 dark:bg-slate-900 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-800">
                            <div className="p-0.5 bg-white rounded border border-slate-200 shrink-0">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={a.signature_data}
                                alt="Signature"
                                className="h-5 w-14 object-contain"
                              />
                            </div>
                            <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-0.5">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              <span>Signed</span>
                            </span>
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 text-[10px] font-bold border border-emerald-500/20">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>Verified</span>
                          </span>
                        )}
                      </td>

                      {/* Handover Date */}
                      <td className="py-3.5 px-3 text-slate-600 dark:text-slate-400 whitespace-nowrap">
                        {formatDate(a.checkout_date)}
                      </td>

                      {/* Status (Fixed: No Awkward Vertical Text Wrapping!) */}
                      <td className="py-3.5 px-3 whitespace-nowrap">
                        {isReturned ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-[10px] font-bold border border-slate-200 dark:border-slate-700">
                            <RotateCcw className="w-3 h-3 text-slate-500" />
                            <span>Returned ({formatDate(a.returned_at)})</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-500/20 text-[10px] font-extrabold">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-pulse" />
                            <span>Active with Staff</span>
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleViewCertificate(a)}
                            className="px-2.5 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/40 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 text-[11px] font-bold inline-flex items-center gap-1.5 border border-indigo-200 dark:border-indigo-800/60 transition-colors cursor-pointer"
                            title="View & Print Cryptographic Certificate"
                          >
                            <FileCheck2 className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                            <span>Certificate</span>
                          </button>

                          {!isReturned && (
                            <button
                              onClick={() => {
                                setSelectedAssignmentForReturn(a);
                                setReturnCondition("GOOD");
                                setIsCheckInOpen(true);
                              }}
                              className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold inline-flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                              title="Return Hardware to Store or Report Faulty"
                            >
                              <RotateCcw className="w-3 h-3" />
                              <span>Return / Faulty</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Clean Pagination Footer */}
        {filteredAssignments.length > 0 && (
          <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs bg-slate-50/50 dark:bg-slate-900/40">
            <span className="text-slate-500 font-medium">
              Showing {(validCurrentPage - 1) * itemsPerPage + 1} to{" "}
              {Math.min(validCurrentPage * itemsPerPage, filteredAssignments.length)} of{" "}
              {filteredAssignments.length} records
            </span>

            {totalPages > 1 && (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={validCurrentPage <= 1}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 font-medium disabled:opacity-40 hover:bg-slate-50 transition-colors cursor-pointer disabled:cursor-not-allowed flex items-center gap-1"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Previous</span>
                </button>
                <span className="px-3 py-1 text-slate-600 dark:text-slate-400 font-bold font-mono text-[11px]">
                  {validCurrentPage} / {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={validCurrentPage >= totalPages}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 font-medium disabled:opacity-40 hover:bg-slate-50 transition-colors cursor-pointer disabled:cursor-not-allowed flex items-center gap-1"
                >
                  <span>Next</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* MODAL 1: ISSUE ITEM TO EMPLOYEE (WITH EMPLOYEE ID & ONLINE SIGNATURE PAD) */}
      {isCheckOutOpen && (
        <ModalPortal>
        <div className="fixed inset-0 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4 z-[100] animate-in fade-in duration-150">
          <div className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[94vh]">
            <div className="flex items-center justify-between px-6 py-4 bg-[#0c3843] text-white">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-cyan-400/20 border border-cyan-300/30 flex items-center justify-center">
                  <PenTool className="w-4 h-4 text-cyan-300" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold">
                    Issue IT Hardware &amp; Record Online Signature
                  </h3>
                  <p className="text-[11px] text-cyan-200/80">
                    Verify Employee ID, select IT equipment, and capture digital signature
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsCheckOutOpen(false)}
                className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCheckoutSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
              {/* Step 1: Select IT Item & Quantity */}
              <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/50 space-y-3">
                <div className="text-[11px] font-extrabold uppercase tracking-wider text-[#0c3843] dark:text-cyan-400 flex items-center gap-1.5">
                  <span className="w-4 h-4 rounded-full bg-[#0c3843] dark:bg-cyan-500 text-white dark:text-slate-900 text-[10px] font-bold flex items-center justify-center">1</span>
                  <span>Select IT Equipment from Store</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                      IT Product / Hardware *
                    </label>
                    <select
                      value={checkoutAssetId}
                      onChange={(e) => setCheckoutAssetId(e.target.value)}
                      required
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#0c3843]/20"
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
                      Quantity *
                    </label>
                    <input
                      type="number"
                      min="1"
                      max={Math.max(1, selectedProductObj?.currentStock || 999)}
                      value={checkoutQuantity}
                      onChange={(e) => setCheckoutQuantity(e.target.value)}
                      required
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#0c3843]/20"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                      Serial Number / Asset Tag (Recommended)
                    </label>
                    <input
                      type="text"
                      value={serialNumber}
                      onChange={(e) => setSerialNumber(e.target.value)}
                      placeholder="e.g. SN-DELL-99281 or TAG-042"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#0c3843]/20"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                      Condition Grade
                    </label>
                    <select
                      value={checkoutGrade}
                      onChange={(e) => setCheckoutGrade(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#0c3843]/20"
                    >
                      <option value="A+">Grade A+ (Brand New)</option>
                      <option value="A">Grade A (Excellent Working)</option>
                      <option value="B">Grade B (Good / Minor Wear)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Step 2: Employee ID & Details */}
              <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/50 space-y-3">
                <div className="text-[11px] font-extrabold uppercase tracking-wider text-[#0c3843] dark:text-cyan-400 flex items-center gap-1.5">
                  <span className="w-4 h-4 rounded-full bg-[#0c3843] dark:bg-cyan-500 text-white dark:text-slate-900 text-[10px] font-bold flex items-center justify-center">2</span>
                  <span>Employee ID &amp; Recipient Details</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                      Employee ID * (e.g. EMP-1042)
                    </label>
                    <div className="relative">
                      <Hash className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        required
                        value={employeeCode}
                        onChange={(e) => setEmployeeCode(e.target.value)}
                        placeholder="e.g. EMP-1042"
                        className="w-full pl-8 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#0c3843]/20"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                      Employee Full Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={employeeName}
                      onChange={(e) => setEmployeeName(e.target.value)}
                      placeholder="e.g. Sarah Jenkins"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#0c3843]/20"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                      Department / Designation
                    </label>
                    <div className="relative">
                      <Building2 className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={employeeDept}
                        onChange={(e) => setEmployeeDept(e.target.value)}
                        placeholder="e.g. Software Engineering / Marketing"
                        className="w-full pl-8 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#0c3843]/20"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                      Employee Official Email (Optional)
                    </label>
                    <input
                      type="email"
                      value={employeeEmail}
                      onChange={(e) => setEmployeeEmail(e.target.value)}
                      placeholder="e.g. sarah.jenkins@company.com"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#0c3843]/20"
                    />
                  </div>
                </div>
              </div>

              {/* Step 3: Online Digital Signature Pad */}
              <div className="p-4 rounded-2xl border-2 border-cyan-500/30 bg-cyan-50/20 dark:bg-cyan-950/10 space-y-2">
                <div className="text-[11px] font-extrabold uppercase tracking-wider text-[#0c3843] dark:text-cyan-400 flex items-center gap-1.5">
                  <span className="w-4 h-4 rounded-full bg-[#0c3843] dark:bg-cyan-500 text-white dark:text-slate-900 text-[10px] font-bold flex items-center justify-center">3</span>
                  <span>Employee Digital e-Signature *</span>
                </div>
                <SignaturePad
                  value={signatureData}
                  onChange={setSignatureData}
                  employeeName={employeeName}
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCheckOutOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingCheckout}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#0c3843] hover:bg-[#082931] text-white text-xs font-bold shadow-md transition-all cursor-pointer disabled:opacity-50"
                >
                  <ShieldCheck className="w-4 h-4 text-cyan-300" />
                  <span>
                    {isSubmittingCheckout
                      ? "Recording Handover..."
                      : "Complete Handover & Generate Signed Certificate"}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
        </ModalPortal>
      )}

      {/* MODAL 2: RETURN FROM EMPLOYEE (WORKING OR FAULTY/DAMAGED) */}
      {isCheckInOpen && selectedAssignmentForReturn && (
        <ModalPortal>
        <div className="fixed inset-0 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4 z-[100] animate-in fade-in duration-150">
          <div className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 bg-slate-900 text-white">
              <div>
                <h3 className="text-sm font-extrabold">
                  Receive IT Item Back from Employee
                </h3>
                <p className="text-[11px] text-slate-400">
                  {selectedAssignmentForReturn.asset_name} — from{" "}
                  {selectedAssignmentForReturn.employee_name} (
                  {selectedAssignmentForReturn.employee_code})
                </p>
              </div>
              <button
                onClick={() => setIsCheckInOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCheckinSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">
                  What is the operational condition of the returned item?
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setReturnCondition("GOOD")}
                    className={cn(
                      "p-3 rounded-2xl border-2 text-left transition-all cursor-pointer",
                      returnCondition === "GOOD"
                        ? "border-emerald-500 bg-emerald-50/60 dark:bg-emerald-950/30"
                        : "border-slate-200 dark:border-slate-800"
                    )}
                  >
                    <div className="flex items-center gap-1.5 font-extrabold text-xs text-emerald-700 dark:text-emerald-400">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Working / Good</span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Add back into Available IT Store Stock
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setReturnCondition("FAULTY")}
                    className={cn(
                      "p-3 rounded-2xl border-2 text-left transition-all cursor-pointer",
                      returnCondition === "FAULTY"
                        ? "border-rose-500 bg-rose-50/60 dark:bg-rose-950/30"
                        : "border-slate-200 dark:border-slate-800"
                    )}
                  >
                    <div className="flex items-center gap-1.5 font-extrabold text-xs text-rose-700 dark:text-rose-400">
                      <AlertTriangle className="w-4 h-4" />
                      <span>Defective / Faulty</span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Move directly to Faulty &amp; Vendor Repair tracker
                    </p>
                  </button>
                </div>
              </div>

              {returnCondition === "FAULTY" ? (
                <div className="p-4 rounded-2xl bg-rose-50/50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/50 space-y-3">
                  <div>
                    <label className="block text-[11px] font-bold text-rose-800 dark:text-rose-300 mb-1">
                      Fault / Damage Description *
                    </label>
                    <input
                      type="text"
                      required
                      value={faultyIssueDesc}
                      onChange={(e) => setFaultyIssueDesc(e.target.value)}
                      placeholder="e.g. Broken display, motherboard issue, keyboard damaged..."
                      className="w-full px-3 py-2 rounded-xl border border-rose-200 dark:border-rose-800 bg-white dark:bg-slate-900 text-xs focus:outline-none focus:ring-2 focus:ring-rose-500/20"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-rose-800 dark:text-rose-300 mb-1">
                      Send to Repair Vendor (Optional)
                    </label>
                    <input
                      type="text"
                      value={faultyVendorName}
                      onChange={(e) => setFaultyVendorName(e.target.value)}
                      placeholder="Leave blank to hold in internal faulty pool, or enter Vendor Name..."
                      className="w-full px-3 py-2 rounded-xl border border-rose-200 dark:border-rose-800 bg-white dark:bg-slate-900 text-xs focus:outline-none focus:ring-2 focus:ring-rose-500/20"
                    />
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                    Return Remarks (Optional)
                  </label>
                  <input
                    type="text"
                    value={checkinNotes}
                    onChange={(e) => setCheckinNotes(e.target.value)}
                    placeholder="e.g. Returned in clean working condition"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs focus:outline-none focus:ring-2 focus:ring-[#0c3843]/20"
                  />
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCheckInOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingCheckin}
                  className={cn(
                    "px-5 py-2 rounded-xl text-white text-xs font-bold shadow-md transition-all cursor-pointer disabled:opacity-50",
                    returnCondition === "FAULTY"
                      ? "bg-rose-600 hover:bg-rose-500"
                      : "bg-emerald-600 hover:bg-emerald-500"
                  )}
                >
                  {isSubmittingCheckin
                    ? "Processing..."
                    : returnCondition === "FAULTY"
                    ? "Confirm Faulty Return"
                    : "Confirm Return to Store"}
                </button>
              </div>
            </form>
          </div>
        </div>
        </ModalPortal>
      )}

      {/* Signed Handover Certificate Modal */}
      <HandoverCertificateModal
        certificate={activeCert}
        isOpen={isCertModalOpen}
        onClose={() => setIsCertModalOpen(false)}
        employeeName={certEmployeeName}
        employeeEmail={certEmployeeEmail}
      />

      {/* Finance Report Modal */}
      <FinanceReportModal
        isOpen={isFinanceModalOpen}
        onClose={() => setIsFinanceModalOpen(false)}
      />
    </div>
  );
}
