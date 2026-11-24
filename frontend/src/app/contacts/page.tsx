"use client";

import React, { useState, useMemo, useEffect, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Users,
  Plus,
  Search,
  Mail,
  Phone,
  MapPin,
  Trash2,
  X,
  Truck,
  Info,
  Laptop,
  Download,
  ChevronLeft,
  ChevronRight,
  Edit3,
  RotateCcw,
  ArrowDownLeft,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  FileCheck2,
  Loader2,
} from "lucide-react";
import { useInventory, Contact } from "@/lib/inventory-store";
import { useToast } from "@/components/ui/toast";
import { apiClient, CustodyAssignment } from "@/lib/api";
import { sanitizeCSVCell, downloadCSV } from "@/lib/export-csv";
import { cn } from "@/lib/utils";
import { useRequireCompanyAdmin } from "@/lib/use-require-company-admin";
import { ModalPortal } from "@/components/ui/modal-portal";

export default function ContactsDirectoryPage() {
  return (
    <Suspense fallback={<div className="p-8 text-xs text-slate-400">Loading Directory...</div>}>
      <ContactsContent />
    </Suspense>
  );
}

function ContactsContent() {
  useRequireCompanyAdmin();
  const searchParams = useSearchParams();
  const { contacts, addContact, updateContact, deleteContact } = useInventory();
  const { toast } = useToast();

  // Tab and Filter States
  const [activeTab, setActiveTab] = useState<"SUPPLIER" | "CUSTOMER">("CUSTOMER");
  const [searchTerm, setSearchTerm] = useState("");
  const [showGuide, setShowGuide] = useState(false);

  // Pagination State (15 items default)
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [itemsPerPage, setItemsPerPage] = useState<number>(15);

  // Modal State (Add / Edit)
  const [modalOpen, setModalOpen] = useState(false);
  const [editingContactId, setEditingContactId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    company: "",
    type: "SUPPLIER" as "SUPPLIER" | "CUSTOMER",
    email: "",
    phone: "",
    address: "",
    employeeCode: "",
    department: "",
    deskLocation: "",
  });

  // Exit Clearance Modal State
  const [clearanceStaff, setClearanceStaff] = useState<Contact | null>(null);
  const [clearanceAssignments, setClearanceAssignments] = useState<CustodyAssignment[]>([]);
  const [clearanceLoading, setClearanceLoading] = useState(false);
  const [clearanceSubmitting, setClearanceSubmitting] = useState(false);
  const [clearanceDone, setClearanceDone] = useState(false);

  // Sync tab from URL query params (e.g. /contacts?tab=SUPPLIER)
  useEffect(() => {
    const tabParam = searchParams.get("tab");
    if (tabParam === "SUPPLIER" || tabParam === "CUSTOMER") {
      setActiveTab(tabParam);
    }
  }, [searchParams]);

  // Reset pagination on filter change
  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, searchTerm, itemsPerPage]);

  // Open Add Modal
  const handleOpenAdd = (type: "SUPPLIER" | "CUSTOMER" = "SUPPLIER") => {
    setEditingContactId(null);
    setFormData({
      name: "",
      company: "",
      type,
      email: "",
      phone: "",
      address: "",
      employeeCode: "",
      department: "",
      deskLocation: "",
    });
    setModalOpen(true);
  };

  // Open Edit Modal
  const handleOpenEdit = (contact: Contact) => {
    setEditingContactId(contact.id);
    setFormData({
      name: contact.name,
      company: contact.company || contact.department || "",
      type: contact.type,
      email: contact.email || "",
      phone: contact.phone || "",
      address: contact.address || contact.deskLocation || "",
      employeeCode: contact.employeeCode || "",
      department: contact.department || contact.company || "",
      deskLocation: contact.deskLocation || contact.address || "",
    });
    setModalOpen(true);
  };

  // Save (Create or Update)
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast({
        title: "Missing Name",
        description: "Please enter the contact person or organization name.",
        variant: "destructive",
      });
      return;
    }
    if (formData.type === "CUSTOMER" && !formData.email.trim()) {
      toast({
        title: "Email required",
        description: "Office staff need an email so they can sign in.",
        variant: "destructive",
      });
      return;
    }

    const payload = {
      name: formData.name.trim(),
      company: formData.type === "CUSTOMER" ? formData.department.trim() || undefined : formData.company.trim() || undefined,
      type: formData.type,
      email: formData.email.trim(),
      phone: formData.phone.trim(),
      address: formData.type === "CUSTOMER" ? formData.deskLocation.trim() : formData.address.trim(),
      employeeCode: formData.employeeCode.trim(),
      department: formData.department.trim(),
      deskLocation: formData.deskLocation.trim(),
    };
    const result = editingContactId
      ? await updateContact(editingContactId, payload)
      : await addContact(payload);
    if (!result.success) {
      toast({
        title: "Could not save",
        description: result.error || "The directory record was not saved.",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: editingContactId ? "Directory updated" : "Directory record saved",
      description: result.notice || `Saved "${formData.name.trim()}".`,
      variant: "success",
    });
    setModalOpen(false);
  };

  // Delete Contact
  const handleDelete = async (c: Contact) => {
    const label = c.type === "SUPPLIER" ? "vendor" : "staff account";
    if (!confirm(`Remove ${label} "${c.name}"?`)) return;
    const result = await deleteContact(c.id);
    if (!result.success) {
      toast({
        title: "Could not remove",
        description: result.error || "The directory record was not removed.",
        variant: "destructive",
      });
      return;
    }
    toast({
      title: "Removed from directory",
      description: result.notice || `"${c.name}" is no longer in the directory.`,
    });
  };

  // Open IT Exit Clearance Modal
  const handleOpenExitClearance = async (c: Contact) => {
    setClearanceStaff(c);
    setClearanceLoading(true);
    setClearanceDone(false);
    try {
      const res = await apiClient.custody.listAllAssignments();
      if (res.data) {
        const staffAssignments = res.data.filter(
          (a) =>
            !a.returned_at &&
            ((a.employee_name && a.employee_name.toLowerCase().trim() === c.name.toLowerCase().trim()) ||
              (a.employee_email && c.email && a.employee_email.toLowerCase().trim() === c.email.toLowerCase().trim()))
        );
        setClearanceAssignments(staffAssignments);
      }
    } catch (err) {
      console.warn("Could not fetch staff assignments:", err);
    } finally {
      setClearanceLoading(false);
    }
  };

  // Confirm Return All & Issue Clearance Pass
  const handleConfirmExitClearance = async () => {
    if (!clearanceStaff) return;
    setClearanceSubmitting(true);
    try {
      const locRes = await apiClient.locations.list();
      const storeLoc = locRes.data?.find((l: any) => !l.is_backup_location) || locRes.data?.[0];
      const locId = storeLoc?.location_id || "";

      for (const a of clearanceAssignments) {
        await apiClient.custody.checkin({
          assignment_id: a.assignment_id,
          return_to_location_id: locId,
          condition_grade: "EXCELLENT",
          return_condition: "GOOD",
          notes: `Returned during IT Exit Clearance for ${clearanceStaff.name}`,
        });
      }

      setClearanceDone(true);
      toast({
        title: "IT Exit Clearance Granted!",
        description: `All ${clearanceAssignments.length} devices returned to IT Store Buffer. Clearance certificate generated.`,
        variant: "success",
      });
    } catch (err: any) {
      toast({
        title: "Exit Clearance Failed",
        description: err?.message || "Could not complete exit clearance.",
        variant: "destructive",
      });
    } finally {
      setClearanceSubmitting(false);
    }
  };

  // Counts
  const supplierCount = contacts.filter((c) => c.type === "SUPPLIER").length;
  const customerCount = contacts.filter((c) => c.type === "CUSTOMER").length;

  // Filtered List
  const filteredContacts = useMemo(() => {
    return contacts.filter((c) => {
      const matchesTab = c.type === activeTab;
      const q = searchTerm.toLowerCase().trim();
      const matchesSearch =
        !q ||
        c.name.toLowerCase().includes(q) ||
        (c.company && c.company.toLowerCase().includes(q)) ||
        (c.email && c.email.toLowerCase().includes(q)) ||
        (c.phone && c.phone.toLowerCase().includes(q)) ||
        (c.address && c.address.toLowerCase().includes(q));

      return matchesTab && matchesSearch;
    });
  }, [contacts, activeTab, searchTerm]);

  // Pagination Math
  const totalPages = Math.ceil(filteredContacts.length / itemsPerPage) || 1;
  const validCurrentPage = Math.min(Math.max(1, currentPage), totalPages);
  const startIndex = (validCurrentPage - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, filteredContacts.length);
  const paginatedContacts = useMemo(() => {
    return filteredContacts.slice(startIndex, endIndex);
  }, [filteredContacts, startIndex, endIndex]);

  // Export CSV
  const handleExportCSV = () => {
    if (filteredContacts.length === 0) return;

    const headers = [
      "Contact ID",
      "Type",
      "Name",
      "Company / Organization",
      "Phone",
      "Email",
      "Address",
    ];

    const rows = filteredContacts.map((c) => [
      sanitizeCSVCell(c.id),
      sanitizeCSVCell(c.type),
      sanitizeCSVCell(c.name),
      sanitizeCSVCell(c.company || ""),
      sanitizeCSVCell(c.phone || ""),
      sanitizeCSVCell(c.email || ""),
      sanitizeCSVCell(c.address || ""),
    ]);

    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const today = new Date().toISOString().split("T")[0];
    downloadCSV(csvContent, `suppliers_and_customers_${today}.csv`);

    toast({
      title: "Export Completed",
      description: `Downloaded ${filteredContacts.length} directory records as CSV.`,
    });
  };

  const isFilterActive = Boolean(searchTerm.trim());

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12 page-enter">
      <div className="page-hero space-y-2.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-[#0c3843]/10 text-[#0c3843] dark:text-cyan-300 flex items-center justify-center shrink-0 border border-[#0c3843]/20">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 dark:text-white">
                Staff &amp; Vendors
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Office staff accounts and IT hardware / repair vendors for this company.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <button
              type="button"
              onClick={handleExportCSV}
              disabled={filteredContacts.length === 0}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 text-xs font-semibold disabled:opacity-40"
            >
              <Download className="w-3.5 h-3.5" />
              Export
            </button>
            <button
              type="button"
              onClick={() => setShowGuide(!showGuide)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold",
                showGuide
                  ? "border-[#0c3843]/30 bg-[#0c3843]/10 text-[#0c3843] dark:text-cyan-300"
                  : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300"
              )}
            >
              <Info className="w-3.5 h-3.5" />
              Help
            </button>
            <button
              type="button"
              onClick={() => handleOpenAdd(activeTab)}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#0c3843] hover:bg-[#082931] text-white text-xs font-bold shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all"
            >
              <Plus className="w-4 h-4 text-cyan-300" />
              {activeTab === "CUSTOMER" ? "Add staff" : "Add vendor"}
            </button>
          </div>
        </div>
      </div>

      {showGuide && (
        <div className="rounded-2xl border border-[#0c3843]/15 bg-[#0c3843]/[0.04] p-4 text-xs text-slate-600 dark:text-slate-300 flex items-start justify-between gap-3">
          <p>
            <strong className="text-slate-900 dark:text-white">Office Staff</strong> can sign in and receive hardware.
            <strong className="text-slate-900 dark:text-white"> Vendors</strong> are used on purchase receipts and repair tickets.
            New staff get temporary password <span className="font-mono">Password123!</span> until changed.
          </p>
          <button type="button" onClick={() => setShowGuide(false)} className="p-1 text-slate-400 hover:text-slate-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 w-full sm:w-fit">
          <button
            type="button"
            onClick={() => setActiveTab("CUSTOMER")}
            className={cn(
              "px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer",
              activeTab === "CUSTOMER"
                ? "bg-[#0c3843] text-white shadow-xs"
                : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
            )}
          >
            <Laptop className="w-3.5 h-3.5" />
            Office Staff
            <span className={cn("px-1.5 py-0.5 rounded-full text-[10px]", activeTab === "CUSTOMER" ? "bg-white/20" : "bg-slate-200 dark:bg-slate-800")}>
              {customerCount}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("SUPPLIER")}
            className={cn(
              "px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer",
              activeTab === "SUPPLIER"
                ? "bg-[#0c3843] text-white shadow-xs"
                : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
            )}
          >
            <Truck className="w-3.5 h-3.5" />
            Vendors
            <span className={cn("px-1.5 py-0.5 rounded-full text-[10px]", activeTab === "SUPPLIER" ? "bg-white/20" : "bg-slate-200 dark:bg-slate-800")}>
              {supplierCount}
            </span>
          </button>
        </div>

        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder={activeTab === "CUSTOMER" ? "Search staff by name, email, dept…" : "Search vendors by name, email…"}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-8 py-2.5 rounded-xl text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 focus:border-[#0c3843] focus:ring-2 focus:ring-[#0c3843]/15 outline-none text-slate-900 dark:text-white"
          />
          {searchTerm && (
            <button type="button" onClick={() => setSearchTerm("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="surface-panel overflow-hidden">
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              {activeTab === "CUSTOMER" ? "Office staff" : "IT vendors"}
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#0c3843]/10 text-[#0c3843] dark:text-cyan-300 border border-[#0c3843]/15">
                {filteredContacts.length}
              </span>
            </h3>
            <p className="text-xs text-slate-500">
              {activeTab === "CUSTOMER"
                ? "People who can receive hardware and sign handovers"
                : "Hardware suppliers and repair service partners"}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-500 font-medium">Rows per page:</span>
            <select
              value={itemsPerPage}
              onChange={(e) => setItemsPerPage(Number(e.target.value))}
              className="px-2.5 py-1.5 rounded-xl text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 font-semibold outline-none cursor-pointer"
            >
              <option value={15}>15</option>
              <option value={30}>30</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
        </div>

        {/* Table Content */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs min-w-[1050px]">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-500 font-bold uppercase tracking-wider text-[11px]">
                <th className="py-3.5 px-5 font-bold whitespace-nowrap min-w-[220px]">Contact Person &amp; Organization</th>
                <th className="py-3.5 px-4 font-bold text-center whitespace-nowrap w-32">Type</th>
                <th className="py-3.5 px-4 font-bold whitespace-nowrap w-44">Phone Number</th>
                <th className="py-3.5 px-4 font-bold whitespace-nowrap min-w-[200px]">Email Address</th>
                <th className="py-3.5 px-4 font-bold whitespace-nowrap min-w-[220px]">Address / Location</th>
                <th className="py-3.5 px-4 font-bold text-center whitespace-nowrap w-44">Quick action</th>
                <th className="py-3.5 px-5 font-bold text-right whitespace-nowrap w-24">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {paginatedContacts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    <Users className="w-8 h-8 mx-auto mb-2 text-slate-300 dark:text-slate-700" />
                    <p className="font-semibold text-slate-600 dark:text-slate-400">
                      {isFilterActive
                        ? "No contacts match your search or filter."
                        : "No contacts registered in directory yet."}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Use Add staff or Add vendor to register the first record.
                    </p>
                  </td>
                </tr>
              ) : (
                paginatedContacts.map((c) => {
                  const isSupplier = c.type === "SUPPLIER";

                  return (
                    <tr
                      key={c.id}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors"
                    >
                      {/* Name & Company */}
                      <td className="py-3.5 px-5 align-middle">
                        <div className="flex items-center gap-3">
                          <div
                            className={cn(
                              "w-9 h-9 rounded-xl flex items-center justify-center shrink-0 font-bold text-xs",
                              isSupplier
                                ? "bg-[#0c3843]/10 text-[#0c3843] dark:text-cyan-300 border border-[#0c3843]/20"
                                : "bg-teal-500/10 text-teal-700 dark:text-teal-300 border border-teal-500/20"
                            )}
                          >
                            {isSupplier ? (
                              <Truck className="w-4 h-4 shrink-0" />
                            ) : (
                              <Laptop className="w-4 h-4 shrink-0" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="font-bold text-slate-900 dark:text-white text-xs sm:text-sm whitespace-nowrap">
                              {c.name}
                            </div>
                            <div className="text-[11px] text-slate-500 font-medium whitespace-nowrap">
                              {c.company || (
                                <span className="text-slate-400 italic">{isSupplier ? "Vendor" : "Office account"}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Type Badge */}
                      <td className="py-3.5 px-4 align-middle text-center whitespace-nowrap">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border whitespace-nowrap",
                            isSupplier
                              ? "bg-[#0c3843]/10 text-[#0c3843] border-[#0c3843]/20 dark:text-cyan-300 dark:border-cyan-800"
                              : "bg-teal-50 text-teal-700 border-teal-200/80 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-800"
                          )}
                        >
                          <span
                            className={cn(
                              "w-1.5 h-1.5 rounded-full shrink-0",
                              isSupplier ? "bg-[#0c3843]" : "bg-teal-500"
                            )}
                          />
                          <span>{isSupplier ? "Vendor" : "Staff"}</span>
                        </span>
                      </td>

                      {/* Phone */}
                      <td className="py-3.5 px-4 align-middle whitespace-nowrap text-slate-700 dark:text-slate-300 font-mono text-xs">
                        {c.phone ? (
                          <a
                            href={`tel:${c.phone}`}
                            className="inline-flex items-center gap-2 hover:text-[#0c3843] dark:hover:text-cyan-300 transition-colors whitespace-nowrap"
                          >
                            <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="whitespace-nowrap">{c.phone}</span>
                          </a>
                        ) : (
                          <span className="text-slate-400">&mdash;</span>
                        )}
                      </td>

                      {/* Email */}
                      <td className="py-3.5 px-4 align-middle text-slate-700 dark:text-slate-300 text-xs whitespace-nowrap">
                        {c.email ? (
                          <a
                            href={`mailto:${c.email}`}
                            className="inline-flex items-center gap-2 hover:text-[#0c3843] dark:hover:text-cyan-300 transition-colors whitespace-nowrap max-w-[240px] truncate"
                            title={c.email}
                          >
                            <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="truncate">{c.email}</span>
                          </a>
                        ) : (
                          <span className="text-slate-400">&mdash;</span>
                        )}
                      </td>

                      {/* Address */}
                      <td className="py-3.5 px-4 align-middle text-slate-600 dark:text-slate-400 text-xs whitespace-nowrap">
                        {c.address ? (
                          <div className="flex items-center gap-2 max-w-[260px] whitespace-nowrap truncate" title={c.address}>
                            <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="truncate">{c.address}</span>
                          </div>
                        ) : (
                          <span className="text-slate-400">&mdash;</span>
                        )}
                      </td>

                      {/* Direct Transaction */}
                      <td className="py-3.5 px-4 align-middle text-center whitespace-nowrap">
                        {isSupplier ? (
                          <Link
                            href="/stock-in"
                            className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-bold text-xs transition-colors whitespace-nowrap border border-emerald-500/20 shadow-2xs"
                          >
                            <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            <span>Receive Stock</span>
                          </Link>
                        ) : (
                          <div className="inline-flex items-center gap-1.5">
                            <Link
                              href={`/custody?employee=${encodeURIComponent(c.name)}`}
                              className="inline-flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-xl bg-indigo-500/10 hover:bg-indigo-600 text-indigo-700 dark:text-indigo-300 hover:text-white font-bold text-xs transition-all whitespace-nowrap border border-indigo-500/20 shadow-2xs"
                              title="Handover hardware to employee with digital signature"
                            >
                              <ShieldCheck className="w-3.5 h-3.5" />
                              <span>Issue Hardware</span>
                            </Link>

                            <button
                              type="button"
                              onClick={() => handleOpenExitClearance(c)}
                              className="inline-flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 text-white font-bold text-xs transition-all whitespace-nowrap shadow-2xs cursor-pointer"
                              title="1-Click Employee Exit Clearance: audit and return all devices"
                            >
                              <FileCheck2 className="w-3.5 h-3.5 text-cyan-300" />
                              <span>Exit Clearance</span>
                            </button>
                          </div>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-5 align-middle text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(c)}
                            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                            title="Edit contact details"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDelete(c)}
                            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                            title="Delete contact"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
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

        {/* 5. Pagination Controls Bar */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50 dark:bg-slate-950/40 text-xs text-slate-500">
          <div>
            Showing{" "}
            <span className="font-bold text-slate-700 dark:text-slate-300">
              {filteredContacts.length === 0 ? 0 : startIndex + 1}
            </span>{" "}
            to{" "}
            <span className="font-bold text-slate-700 dark:text-slate-300">{endIndex}</span> of{" "}
            <span className="font-bold text-slate-700 dark:text-slate-300">
              {filteredContacts.length}
            </span>{" "}
            contacts
          </div>

          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                disabled={validCurrentPage === 1}
                className="flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>Prev</span>
              </button>

              <div className="flex items-center gap-1 px-1">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => {
                  if (
                    pageNum !== 1 &&
                    pageNum !== totalPages &&
                    Math.abs(pageNum - validCurrentPage) > 1
                  ) {
                    if (pageNum === 2 || pageNum === totalPages - 1) {
                      return (
                        <span key={pageNum} className="px-1 text-slate-400">
                          ...
                        </span>
                      );
                    }
                    return null;
                  }

                  const isActive = pageNum === validCurrentPage;
                  return (
                    <button
                      key={pageNum}
                      type="button"
                      onClick={() => setCurrentPage(pageNum)}
                      className={cn(
                        "w-8 h-8 rounded-xl text-xs font-bold transition-all cursor-pointer",
                        isActive
                          ? "bg-[#0c3843] text-white shadow-xs"
                          : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                      )}
                    >
                      {pageNum}
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                disabled={validCurrentPage === totalPages}
                className="flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                <span>Next</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ========================================================
          6. MODAL: Add / Edit Contact Dialog
         ======================================================== */}
      {modalOpen && (
        <ModalPortal>
        <div className="fixed inset-0 z-[100] overflow-y-auto">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
            onClick={() => setModalOpen(false)}
          />

          <div className="flex min-h-full items-center justify-center p-4">
            <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden animate-in zoom-in-95 duration-200">
              {/* Header */}
              <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/70 dark:bg-slate-950/60">
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      "w-10 h-10 rounded-2xl flex items-center justify-center border",
                      formData.type === "SUPPLIER"
                        ? "bg-[#0c3843]/10 text-[#0c3843] border-[#0c3843]/20"
                        : "bg-teal-500/10 text-teal-700 border-teal-500/20"
                    )}
                  >
                    {formData.type === "SUPPLIER" ? (
                      <Truck className="w-5 h-5" />
                    ) : (
                      <Laptop className="w-5 h-5" />
                    )}
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-slate-900 dark:text-white">
                      {editingContactId
                        ? formData.type === "CUSTOMER"
                          ? "Edit staff"
                          : "Edit vendor"
                        : formData.type === "CUSTOMER"
                          ? "Add office staff"
                          : "Add vendor"}
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Vendors for purchase receipts. Staff for sign-in and asset issue.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Form */}
              <form onSubmit={handleSave} className="p-6 space-y-4 text-xs">
                {/* Type Switcher */}
                <div className="space-y-1.5">
                  <label className="font-bold text-slate-700 dark:text-slate-300">
                    Type *
                  </label>
                  <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800">
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, type: "CUSTOMER" })}
                      className={cn(
                        "py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer",
                        formData.type === "CUSTOMER"
                          ? "bg-[#0c3843] text-white shadow-2xs"
                          : "text-slate-500 hover:text-slate-900"
                      )}
                    >
                      <Laptop className="w-3.5 h-3.5" />
                      <span>Office Staff</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, type: "SUPPLIER" })}
                      className={cn(
                        "py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer",
                        formData.type === "SUPPLIER"
                          ? "bg-[#0c3843] text-white shadow-2xs"
                          : "text-slate-500 hover:text-slate-900"
                      )}
                    >
                      <Truck className="w-3.5 h-3.5" />
                      <span>Vendor</span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="font-bold text-slate-700 dark:text-slate-300">
                      Full Name / Contact Person *
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="e.g. Ayesha Malik"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white font-medium focus:border-[#0c3843] outline-none"
                    />
                  </div>

                  {formData.type === "SUPPLIER" ? (
                    <div className="space-y-1.5">
                      <label className="font-bold text-slate-700 dark:text-slate-300">
                        Vendor company
                      </label>
                      <input
                        type="text"
                        value={formData.company}
                        onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                        placeholder="e.g. Dell Technologies"
                        className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white font-medium focus:border-[#0c3843] outline-none"
                      />
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <label className="font-bold text-slate-700 dark:text-slate-300">
                        Sign-in email *
                      </label>
                      <input
                        type="email"
                        required
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        placeholder="staff@company.com"
                        className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white font-medium focus:border-[#0c3843] outline-none"
                      />
                    </div>
                  )}
                </div>

                {formData.type === "CUSTOMER" && (
                  <>
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      Staff accounts save name, email, employee ID, department, and desk. New people sign in with password Password123! and get an invite email.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="space-y-1.5">
                        <label className="font-bold text-slate-700 dark:text-slate-300">Employee ID</label>
                        <input
                          type="text"
                          value={formData.employeeCode}
                          onChange={(e) => setFormData({ ...formData, employeeCode: e.target.value })}
                          placeholder="EMP-1024"
                          className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white font-medium focus:border-[#0c3843] outline-none"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="font-bold text-slate-700 dark:text-slate-300">Department</label>
                        <input
                          type="text"
                          value={formData.department}
                          onChange={(e) => setFormData({ ...formData, department: e.target.value, company: e.target.value })}
                          placeholder="Engineering"
                          className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white font-medium focus:border-[#0c3843] outline-none"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="font-bold text-slate-700 dark:text-slate-300">Desk / Location</label>
                        <input
                          type="text"
                          value={formData.deskLocation}
                          onChange={(e) => setFormData({ ...formData, deskLocation: e.target.value, address: e.target.value })}
                          placeholder="Floor 3, Desk 12"
                          className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white font-medium focus:border-[#0c3843] outline-none"
                        />
                      </div>
                    </div>
                  </>
                )}

                {formData.type === "SUPPLIER" && (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <label className="font-bold text-slate-700 dark:text-slate-300">
                          Phone Number
                        </label>
                        <input
                          type="tel"
                          value={formData.phone}
                          onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                          placeholder="+92 300 0000000"
                          className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white font-mono focus:border-[#0c3843] outline-none"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="font-bold text-slate-700 dark:text-slate-300">
                          Email Address
                        </label>
                        <input
                          type="email"
                          value={formData.email}
                          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                          placeholder="orders@vendor.com"
                          className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white font-medium focus:border-[#0c3843] outline-none"
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="font-bold text-slate-700 dark:text-slate-300">
                        Address
                      </label>
                      <textarea
                        rows={2}
                        value={formData.address}
                        onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                        placeholder="Street, city"
                        className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white font-medium focus:border-[#0c3843] outline-none"
                      />
                    </div>
                  </>
                )}

                {/* Modal Buttons */}
                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setModalOpen(false)}
                    className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 text-xs font-semibold cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2.5 rounded-xl bg-[#0c3843] hover:bg-[#082931] text-white text-xs font-bold shadow-md shadow-[#0c3843]/20 transition-all cursor-pointer"
                  >
                    {editingContactId ? "Update Contact" : "Save Contact Details"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
        </ModalPortal>
      )}

      {/* IT Exit Clearance Modal */}
      {clearanceStaff && (
        <ModalPortal>
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <FileCheck2 className="w-5 h-5 text-indigo-600 dark:text-cyan-400" />
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    IT Exit Clearance: {clearanceStaff.name}
                  </h3>
                  <span className="text-xs text-slate-400">{clearanceStaff.company || "Staff Member"} &bull; {clearanceStaff.email}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setClearanceStaff(null)}
                className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {clearanceLoading ? (
              <div className="py-12 flex flex-col items-center justify-center gap-2 text-slate-400 text-xs">
                <Loader2 className="w-6 h-6 animate-spin text-[#0c3843]" />
                <span>Auditing active custody records...</span>
              </div>
            ) : clearanceDone ? (
              <div className="py-8 text-center space-y-3">
                <div className="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-600 flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                  100% IT Exit Clearance Issued
                </h4>
                <p className="text-xs text-slate-500 max-w-xs mx-auto">
                  All assigned hardware has been returned to the IT Store Buffer. The employee has zero outstanding IT assets.
                </p>
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setClearanceStaff(null);
                      setClearanceDone(false);
                    }}
                    className="px-4 py-2 rounded-xl bg-[#0c3843] text-white font-bold text-xs"
                  >
                    Close &amp; Finish
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4 text-xs">
                <div>
                  <h4 className="font-bold text-slate-700 dark:text-slate-300 mb-2">
                    Company Devices Currently Assigned ({clearanceAssignments.length})
                  </h4>

                  {clearanceAssignments.length === 0 ? (
                    <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-center">
                      <CheckCircle2 className="w-5 h-5 text-emerald-600 mx-auto mb-1" />
                      <span className="font-bold text-emerald-800 dark:text-emerald-300 block">
                        Eligible for Immediate Clearance
                      </span>
                      <p className="text-slate-500 text-[11px] mt-0.5">
                        This employee has no active hardware assets checked out.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                      {clearanceAssignments.map((a) => (
                        <div
                          key={a.assignment_id}
                          className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-center justify-between"
                        >
                          <div>
                            <span className="font-bold text-slate-900 dark:text-white block">{a.asset_name || a.asset_sku}</span>
                            <span className="font-mono text-[10px] text-slate-400">SN: {a.serial_number || "N/A"} &bull; Checked out: {new Date(a.checkout_date).toLocaleDateString()}</span>
                          </div>
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20">
                            Unreturned
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-slate-600 dark:text-slate-300 text-[11px] leading-relaxed">
                  Clicking <strong>&ldquo;Receive All &amp; Grant Clearance&rdquo;</strong> will automatically check in all {clearanceAssignments.length} devices back into the Main IT Store Room buffer and generate the official IT clearance pass.
                </div>

                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2">
                  <button
                    type="button"
                    disabled={clearanceSubmitting}
                    onClick={() => setClearanceStaff(null)}
                    className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 font-semibold cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={clearanceSubmitting}
                    onClick={handleConfirmExitClearance}
                    className="px-5 py-2.5 rounded-xl bg-[#0c3843] hover:bg-[#082931] text-white font-bold flex items-center gap-2 cursor-pointer shadow-sm"
                  >
                    {clearanceSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                    <span>Receive All &amp; Grant Clearance</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
        </ModalPortal>
      )}
    </div>
  );
}
