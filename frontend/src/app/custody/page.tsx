"use client";

import React, { useState, useEffect, useMemo, Suspense } from "react";
import {
  ShieldCheck,
  Boxes,
  Users,
  Search,
  Plus,
  RefreshCw,
  FileCheck2,
  ArrowDownToDot,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  RotateCcw,
  Printer,
  ChevronRight,
  HardHat,
  Filter,
} from "lucide-react";
import {
  apiClient,
  CustodySummary,
  CustodyAssignment,
  HandoverCertificate,
  UserProfile,
} from "@/lib/api";
import { useInventory } from "@/lib/inventory-store";
import { useToast } from "@/components/ui/toast";
import { HandoverCertificateModal } from "@/components/documents/handover-certificate-modal";
import { cn } from "@/lib/utils";

export default function CustodyPage() {
  return (
    <Suspense fallback={<div className="p-8 text-xs text-slate-400">Loading Tool & Staff Custody...</div>}>
      <CustodyContent />
    </Suspense>
  );
}

function CustodyContent() {
  const { products, refetch: refetchStore } = useInventory();
  const { toast } = useToast();

  // State
  const [summary, setSummary] = useState<CustodySummary | null>(null);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [assignments, setAssignments] = useState<CustodyAssignment[]>([]);
  const [locations, setLocations] = useState<Array<{ location_id: string; name: string }>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedUserFilter, setSelectedUserFilter] = useState<string>("ALL");

  // Modals
  const [isCheckOutOpen, setIsCheckOutOpen] = useState(false);
  const [isCheckInOpen, setIsCheckInOpen] = useState(false);
  const [selectedAssignmentForReturn, setSelectedAssignmentForReturn] = useState<CustodyAssignment | null>(null);

  // Certificate Modal State
  const [activeCert, setActiveCert] = useState<HandoverCertificate | null>(null);
  const [certEmployeeName, setCertEmployeeName] = useState<string>("");
  const [certEmployeeEmail, setCertEmployeeEmail] = useState<string>("");
  const [isCertModalOpen, setIsCertModalOpen] = useState(false);

  // Form states for Check-Out
  const [checkoutAssetId, setCheckoutAssetId] = useState("");
  const [checkoutUserId, setCheckoutUserId] = useState("");
  const [checkoutLocationId, setCheckoutLocationId] = useState("");
  const [checkoutExpectedDate, setCheckoutExpectedDate] = useState("");
  const [checkoutGrade, setCheckoutGrade] = useState("A");
  const [isSubmittingCheckout, setIsSubmittingCheckout] = useState(false);

  // Form states for Check-In
  const [checkinLocationId, setCheckinLocationId] = useState("");
  const [checkinGrade, setCheckinGrade] = useState("A");
  const [checkinNotes, setCheckinNotes] = useState("");
  const [isSubmittingCheckin, setIsSubmittingCheckin] = useState(false);

  // Fetch initial data
  const fetchData = async () => {
    setIsLoading(true);
    try {
      // 1. Summary
      try {
        const sumRes = await apiClient.custody.getSummary();
        if (sumRes.success && sumRes.data) {
          setSummary(sumRes.data);
        }
      } catch (err) {
        console.warn("Custody summary fallback:", err);
      }

      // 2. Users
      let fetchedUsers: UserProfile[] = [];
      try {
        const usersRes = await apiClient.users.list();
        if (usersRes.success && usersRes.data) {
          fetchedUsers = usersRes.data;
          setUsers(fetchedUsers);
          if (!checkoutUserId && fetchedUsers.length > 0) {
            setCheckoutUserId(fetchedUsers[0].id);
          }
        }
      } catch (err) {
        console.warn("Users list fallback:", err);
      }

      // 3. Locations
      try {
        const locRes = await apiClient.locations.list();
        if (locRes.success && locRes.data) {
          setLocations(locRes.data);
          if (!checkoutLocationId && locRes.data.length > 0) {
            setCheckoutLocationId(locRes.data[0].location_id);
          }
          if (!checkinLocationId && locRes.data.length > 0) {
            setCheckinLocationId(locRes.data[0].location_id);
          }
        }
      } catch (err) {
        console.warn("Locations fallback:", err);
      }

      // 4. Assignments across users
      const allAssignments: CustodyAssignment[] = [];
      for (const u of fetchedUsers) {
        try {
          const empRes = await apiClient.custody.listEmployeeCustody(u.id);
          if (empRes.success && empRes.data) {
            allAssignments.push(...empRes.data);
          }
        } catch {
          // ignore per-user error
        }
      }
      setAssignments(allAssignments);
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

  // Filtered assignments
  const filteredAssignments = useMemo(() => {
    return assignments.filter((a) => {
      const matchesUser =
        selectedUserFilter === "ALL" || a.assigned_to_user_id === selectedUserFilter;
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        (a.asset_sku && a.asset_sku.toLowerCase().includes(q)) ||
        (a.asset_name && a.asset_name.toLowerCase().includes(q)) ||
        a.assignment_id.toLowerCase().includes(q);
      return matchesUser && matchesSearch;
    });
  }, [assignments, selectedUserFilter, searchQuery]);

  // Handle Checkout Submit
  const handleCheckoutSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!checkoutAssetId || !checkoutUserId || !checkoutLocationId) {
      toast({
        title: "Missing Information",
        description: "Please select an asset, employee, and source warehouse location.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmittingCheckout(true);
    try {
      const expDateIso = checkoutExpectedDate
        ? new Date(checkoutExpectedDate).toISOString()
        : undefined;

      const res = await apiClient.custody.checkout({
        asset_id: checkoutAssetId,
        employee_user_id: checkoutUserId,
        source_location_id: checkoutLocationId,
        expected_return_date: expDateIso,
        condition_grade: checkoutGrade,
      });

      if (res.success && res.data) {
        toast({
          title: "Asset Deployed Successfully",
          description: `Custody assignment ${res.data.assignment.assignment_id.slice(0, 8)} created.`,
        });

        setIsCheckOutOpen(false);

        // Fetch cryptographic certificate
        try {
          const certRes = await apiClient.custody.getCertificate(res.data.assignment.assignment_id);
          if (certRes.success && certRes.data) {
            const user = users.find((u) => u.id === checkoutUserId);
            setActiveCert(certRes.data);
            setCertEmployeeName(user?.name || "Employee");
            setCertEmployeeEmail(user?.email || "");
            setIsCertModalOpen(true);
          }
        } catch (certErr) {
          console.warn("Could not load cert immediately:", certErr);
        }

        // Refresh lists
        await fetchData();
        await refetchStore();
      }
    } catch (err: any) {
      toast({
        title: "Check-Out Failed",
        description: err?.problem?.detail || err.message || "Failed to deploy asset",
        variant: "destructive",
      });
    } finally {
      setIsSubmittingCheckout(false);
    }
  };

  // Open Check-In Modal
  const openCheckInModal = (assignment: CustodyAssignment) => {
    setSelectedAssignmentForReturn(assignment);
    setCheckinGrade(assignment.condition_grade || "A");
    setCheckinNotes("");
    setIsCheckInOpen(true);
  };

  // Handle Check-In Submit
  const handleCheckInSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAssignmentForReturn || !checkinLocationId) {
      return;
    }

    setIsSubmittingCheckin(true);
    try {
      const res = await apiClient.custody.checkin({
        assignment_id: selectedAssignmentForReturn.assignment_id,
        return_to_location_id: checkinLocationId,
        condition_grade: checkinGrade,
        notes: checkinNotes,
      });

      if (res.success) {
        toast({
          title: "Asset Returned to Warehouse",
          description: "Custody assignment closed and stock ledger credited.",
        });
        setIsCheckInOpen(false);
        setSelectedAssignmentForReturn(null);
        await fetchData();
        await refetchStore();
      }
    } catch (err: any) {
      toast({
        title: "Check-In Failed",
        description: err?.problem?.detail || err.message || "Failed to return asset",
        variant: "destructive",
      });
    } finally {
      setIsSubmittingCheckin(false);
    }
  };

  // View Handover Certificate
  const viewCertificate = async (assignment: CustodyAssignment) => {
    try {
      const res = await apiClient.custody.getCertificate(assignment.assignment_id);
      if (res.success && res.data) {
        const user = users.find((u) => u.id === assignment.assigned_to_user_id);
        setActiveCert(res.data);
        setCertEmployeeName(user?.name || "Staff Member");
        setCertEmployeeEmail(user?.email || "");
        setIsCertModalOpen(true);
      }
    } catch (err: any) {
      toast({
        title: "Certificate Unavailable",
        description: err?.problem?.detail || err.message || "Could not retrieve certificate.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider mb-1">
            <HardHat className="w-4 h-4" />
            <span>Asset Lifecycle & Field Operations</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Tool & Staff Custody Manager
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Cryptographically sealed equipment deployment to employees, field sites, and contractors.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => fetchData()}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/80 text-xs font-semibold text-slate-700 dark:text-slate-300 transition-colors shadow-xs cursor-pointer"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", isLoading && "animate-spin")} />
            <span>Refresh</span>
          </button>

          <button
            onClick={() => setIsCheckOutOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Check-Out Asset</span>
          </button>
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/50 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-slate-500">Total Tracked Assets</span>
            <div className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
              {summary ? summary.total_assets : products.length}
            </div>
            <span className="text-[11px] text-slate-400">Master Catalog Hardware</span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
            <Boxes className="w-6 h-6" />
          </div>
        </div>

        <div className="p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/50 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-slate-500">In Active Custody</span>
            <div className="text-2xl font-bold text-indigo-600 dark:text-indigo-400 mt-1">
              {summary ? summary.deployed_to_employees : assignments.length}
            </div>
            <span className="text-[11px] text-slate-400">Deployed to Field / Staff</span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center">
            <Users className="w-6 h-6" />
          </div>
        </div>

        <div className="p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/50 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-slate-500">Remaining in Storage</span>
            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
              {summary
                ? summary.remaining_in_storage
                : Math.max(0, products.length - assignments.length)}
            </div>
            <span className="text-[11px] text-slate-400">Ready for Issuance</span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
            <CheckCircle2 className="w-6 h-6" />
          </div>
        </div>

        <div className="p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/50 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-slate-500">Security Ledger</span>
            <div className="text-base font-bold text-slate-900 dark:text-white mt-1 flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>SHA-256 Proof</span>
            </div>
            <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold">
              Tamper-Evident Chain
            </span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-blue-500/10 text-blue-500 flex items-center justify-center">
            <ShieldCheck className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/50 shadow-xs flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by SKU, asset name, or ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 text-slate-900 dark:text-white placeholder:text-slate-400"
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <span className="text-xs text-slate-500 shrink-0">Assignee:</span>
          <select
            value={selectedUserFilter}
            onChange={(e) => setSelectedUserFilter(e.target.value)}
            className="px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 text-slate-900 dark:text-white"
          >
            <option value="ALL">All Staff Members ({users.length})</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} ({u.role})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Active Custody Deployments Table */}
      <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/50 shadow-xs overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <span>Active Equipment Assignments</span>
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
              {filteredAssignments.length}
            </span>
          </h3>
          <span className="text-xs text-slate-400">Virtual / Custody Location</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[850px] text-left text-xs">
            <thead className="bg-slate-50/75 dark:bg-slate-900 text-slate-500 border-b border-slate-200/80 dark:border-slate-800">
              <tr>
                <th className="py-3 px-5 font-semibold min-w-[200px]">Asset / Tool</th>
                <th className="py-3 px-5 font-semibold min-w-[180px]">Custodian (Staff)</th>
                <th className="py-3 px-5 font-semibold min-w-[120px]">Checkout Date</th>
                <th className="py-3 px-5 font-semibold min-w-[120px]">Expected Return</th>
                <th className="py-3 px-5 font-semibold text-center min-w-[90px]">Grade</th>
                <th className="py-3 px-5 font-semibold text-right min-w-[120px] whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
              {filteredAssignments.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    <ShieldCheck className="w-8 h-8 mx-auto mb-2 text-slate-300 dark:text-slate-700 stroke-1" />
                    <p className="font-medium text-slate-600 dark:text-slate-400">
                      No active equipment assignments found.
                    </p>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Click &ldquo;Check-Out Asset&rdquo; above to assign serialized tools or hardware to staff.
                    </p>
                  </td>
                </tr>
              ) : (
                filteredAssignments.map((a) => {
                  const assignedUser = users.find((u) => u.id === a.assigned_to_user_id);
                  const isOverdue =
                    a.expected_return_date &&
                    new Date(a.expected_return_date).getTime() < Date.now();

                  return (
                    <tr
                      key={a.assignment_id}
                      className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="py-3.5 px-5">
                        <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                          <span>{a.asset_name || "Hardware Asset"}</span>
                          <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800">
                            SERIALIZED
                          </span>
                        </div>
                        <div className="font-mono text-[11px] text-indigo-600 dark:text-indigo-400 mt-0.5">
                          {a.asset_sku || a.asset_id.slice(0, 8)}
                        </div>
                      </td>

                      <td className="py-3.5 px-5">
                        <div className="font-semibold text-slate-900 dark:text-white">
                          {assignedUser ? assignedUser.name : "Staff Member"}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {assignedUser?.email || a.assigned_to_user_id.slice(0, 8)}
                        </div>
                      </td>

                      <td className="py-3.5 px-5 text-slate-500">
                        {new Date(a.checkout_date).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </td>

                      <td className="py-3.5 px-5">
                        {a.expected_return_date ? (
                          <div className="flex items-center gap-1.5">
                            <span
                              className={cn(
                                "font-medium",
                                isOverdue ? "text-rose-600 font-bold" : "text-slate-600 dark:text-slate-300"
                              )}
                            >
                              {new Date(a.expected_return_date).toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                              })}
                            </span>
                            {isOverdue && (
                              <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-rose-500/10 text-rose-600 border border-rose-500/20">
                                OVERDUE
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400">Indefinite</span>
                        )}
                      </td>

                      <td className="py-3.5 px-5 text-center">
                        <span className="px-2 py-0.5 rounded-full font-bold text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                          Grade {a.condition_grade || "A"}
                        </span>
                      </td>

                      <td className="py-3.5 px-5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => viewCertificate(a)}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-[11px] font-medium text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
                            title="View Cryptographic Evidence"
                          >
                            <FileCheck2 className="w-3.5 h-3.5 text-indigo-500" />
                            <span>Certificate</span>
                          </button>

                          <button
                            onClick={() => openCheckInModal(a)}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-semibold transition-colors shadow-xs cursor-pointer"
                            title="Check-In Asset to Warehouse"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>Return</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Check-Out Modal */}
      {isCheckOutOpen && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center">
                  <Plus className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Deploy Asset to Custody
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Double-entry stock transfer to employee with cryptographic audit seal.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsCheckOutOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-xs cursor-pointer"
              >
                Cancel
              </button>
            </div>

            <form onSubmit={handleCheckoutSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Select Hardware Asset / Tool *
                </label>
                <select
                  value={checkoutAssetId}
                  onChange={(e) => setCheckoutAssetId(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  required
                >
                  <option value="">-- Choose an item to deploy --</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.sku}) &bull; Stock: {p.currentStock}
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-slate-400 mt-1">
                  Item will be assigned and debited from warehouse into Virtual/Custody.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Assign to Employee / Custodian *
                </label>
                <select
                  value={checkoutUserId}
                  onChange={(e) => setCheckoutUserId(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  required
                >
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.email}) - {u.role}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Source Warehouse / Location *
                </label>
                <select
                  value={checkoutLocationId}
                  onChange={(e) => setCheckoutLocationId(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  required
                >
                  {locations.map((loc) => (
                    <option key={loc.location_id} value={loc.location_id}>
                      {loc.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Expected Return Date
                  </label>
                  <input
                    type="date"
                    value={checkoutExpectedDate}
                    onChange={(e) => setCheckoutExpectedDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Condition Grade
                  </label>
                  <select
                    value={checkoutGrade}
                    onChange={(e) => setCheckoutGrade(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white"
                  >
                    <option value="A">Grade A (Mint / New)</option>
                    <option value="B">Grade B (Good / Minor Wear)</option>
                    <option value="C">Grade C (Fair / Scratched)</option>
                    <option value="D">Grade D (Heavily Used)</option>
                  </select>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsCheckOutOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingCheckout}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-xs transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {isSubmittingCheckout ? "Deploying..." : "Confirm & Issue Slip"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Check-In Modal */}
      {isCheckInOpen && selectedAssignmentForReturn && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
                  <RotateCcw className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Return Asset to Store
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Restores stock into warehouse and closes custody assignment.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsCheckInOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-xs cursor-pointer"
              >
                Cancel
              </button>
            </div>

            <form onSubmit={handleCheckInSubmit} className="p-6 space-y-4">
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs">
                <div className="font-bold text-slate-900 dark:text-white">
                  {selectedAssignmentForReturn.asset_name || "Hardware Asset"}
                </div>
                <div className="text-[11px] text-indigo-600 dark:text-indigo-400 font-mono mt-0.5">
                  SKU: {selectedAssignmentForReturn.asset_sku}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Return To Location *
                </label>
                <select
                  value={checkinLocationId}
                  onChange={(e) => setCheckinLocationId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white"
                  required
                >
                  {locations.map((loc) => (
                    <option key={loc.location_id} value={loc.location_id}>
                      {loc.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Return Condition Grade
                </label>
                <select
                  value={checkinGrade}
                  onChange={(e) => setCheckinGrade(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white"
                >
                  <option value="A">Grade A (Good as Issued)</option>
                  <option value="B">Grade B (Normal Wear)</option>
                  <option value="C">Grade C (Minor Defect / Scratched)</option>
                  <option value="D">Grade D (Damaged / Needs Repair)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Inspection Notes
                </label>
                <textarea
                  value={checkinNotes}
                  onChange={(e) => setCheckinNotes(e.target.value)}
                  placeholder="e.g. Returned with original charger, no physical damage..."
                  rows={2}
                  className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsCheckInOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingCheckin}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-xs transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {isSubmittingCheckin ? "Processing..." : "Complete Return"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Handover Certificate Modal */}
      <HandoverCertificateModal
        certificate={activeCert}
        isOpen={isCertModalOpen}
        onClose={() => setIsCertModalOpen(false)}
        employeeName={certEmployeeName}
        employeeEmail={certEmployeeEmail}
      />
    </div>
  );
}
