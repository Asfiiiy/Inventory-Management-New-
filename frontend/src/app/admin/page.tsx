"use client";

import React, { useState, useEffect, Suspense } from "react";
import {
  Shield,
  Building2,
  Users,
  Boxes,
  Activity,
  Plus,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertTriangle,
  Lock,
  ArrowRight,
  TrendingUp,
  Sliders,
  Sparkles,
  Layers,
  ChevronRight,
  Briefcase,
  Database,
  Cpu,
  FileText,
  Key,
  LogOut,
  HardDrive,
  Mail,
  ShieldCheck,
  Clock,
  UserCheck,
  Copy,
} from "lucide-react";
import {
  apiClient,
  OrganizationSummary,
  PlatformTelemetry,
  GlobalUser,
  AuditEvent,
  setTenantId,
  getTenantId,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

type AdminTab = "overview" | "clients" | "licenses" | "users" | "system" | "audit";

export default function AdminPortalPage() {
  return (
    <Suspense
      fallback={
        <div className="h-screen w-screen bg-slate-950 flex items-center justify-center text-xs text-slate-500">
          Loading Admin Portal...
        </div>
      }
    >
      <AdminPortalContent />
    </Suspense>
  );
}

function AdminPortalContent() {
  const { toast } = useToast();
  const { user, isStaff, isLoading: isAuthLoading, logout } = useAuth();

  // Guard: If regular store staff/user visits /admin, redirect to store software
  useEffect(() => {
    if (!isAuthLoading && isStaff && user?.email !== "admin@whoopit.io") {
      window.location.href = "/";
    }
  }, [isAuthLoading, isStaff, user]);

  const [activeTab, setActiveTab] = useState<AdminTab>("overview");
  const [clients, setClients] = useState<OrganizationSummary[]>([]);
  const [telemetry, setTelemetry] = useState<PlatformTelemetry | null>(null);
  const [usersList, setUsersList] = useState<GlobalUser[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Search & Filter states
  const [searchQuery, setSearchQuery] = useState("");
  const [planFilter, setPlanFilter] = useState("ALL");
  const [userSearchQuery, setUserSearchQuery] = useState("");
  const [userRoleFilter, setUserRoleFilter] = useState("ALL");

  // Modal State for Giving Software
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [clientName, setClientName] = useState("");
  const [clientSlug, setClientSlug] = useState("");
  const [clientPlan, setClientPlan] = useState("enterprise");
  const [managerName, setManagerName] = useState("");
  const [managerEmail, setManagerEmail] = useState("");
  const [managerPassword, setManagerPassword] = useState("Password123!");
  const [createdCredentials, setCreatedCredentials] = useState<{
    name: string;
    slug: string;
    email: string;
    password: string;
    plan: string;
  } | null>(null);

  // Selected Client for Details & Activity Modal
  const [selectedClient, setSelectedClient] = useState<OrganizationSummary | null>(null);
  const [modalTab, setModalTab] = useState<"details" | "activity">("details");
  const [editPlan, setEditPlan] = useState<string>("enterprise");
  const [isSavingPlan, setIsSavingPlan] = useState<boolean>(false);
  const [clientActivity, setClientActivity] = useState<AuditEvent[]>([]);
  const [isLoadingActivity, setIsLoadingActivity] = useState(false);

  // Fetch all admin data
  const fetchAdminData = async () => {
    setIsLoading(true);
    try {
      // 1. Fetch Clients
      try {
        const res = await apiClient.superadmin.listOrganizations();
        if (res.success && res.data) {
          setClients(res.data);
        }
      } catch (err) {
        console.warn("Fetch clients error:", err);
      }

      // 2. Fetch Telemetry
      try {
        const res = await apiClient.superadmin.getTelemetry();
        if (res.success && res.data) {
          setTelemetry(res.data);
        }
      } catch (err) {
        console.warn("Fetch telemetry error:", err);
      }

      // 3. Fetch Global Users
      try {
        const res = await apiClient.superadmin.listUsers();
        if (res.success && res.data) {
          setUsersList(res.data);
        }
      } catch (err) {
        console.warn("Fetch users error:", err);
      }

      // 4. Fetch Audit Logs
      try {
        const res = await apiClient.superadmin.listAuditLogs();
        if (res.success && res.data) {
          setAuditLogs(res.data);
        }
      } catch (err) {
        console.warn("Fetch audit logs error:", err);
      }
    } catch (err: any) {
      toast({
        title: "Load Error",
        description: err?.message || "Failed to load admin data",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAdminData();
  }, []);

  // Fetch client specific activity when modal tab switches to activity
  const openClientModal = async (client: OrganizationSummary, tab: "details" | "activity" = "details") => {
    setSelectedClient(client);
    setEditPlan(client.plan.toLowerCase());
    setModalTab(tab);

    setIsLoadingActivity(true);
    try {
      const res = await apiClient.superadmin.getOrgActivity(client.org_id);
      if (res.success && res.data) {
        setClientActivity(res.data);
      } else {
        setClientActivity([]);
      }
    } catch (err) {
      console.warn("Fetch org activity error:", err);
      setClientActivity([]);
    } finally {
      setIsLoadingActivity(false);
    }
  };

  // Update Plan Handler
  const handleUpdatePlan = async () => {
    if (!selectedClient) return;
    setIsSavingPlan(true);
    try {
      const res = await apiClient.superadmin.updateOrganization(selectedClient.org_id, { plan: editPlan });
      if (res.success) {
        toast({
          title: "Plan Updated",
          description: `Successfully updated ${selectedClient.name} to ${editPlan.toUpperCase()}.`,
          variant: "success",
        });
        setSelectedClient({ ...selectedClient, plan: editPlan });
        await fetchAdminData();
      }
    } catch (err: any) {
      toast({
        title: "Update Failed",
        description: err?.message || "Could not update plan",
        variant: "destructive",
      });
    } finally {
      setIsSavingPlan(false);
    }
  };

  // Submit Give Software Form
  const handleCreateClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientName || !managerEmail) {
      toast({
        title: "Missing Information",
        description: "Please specify client / shop name and email.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await apiClient.superadmin.provisionOrganization({
        name: clientName,
        slug: clientSlug,
        plan: clientPlan,
        admin_name: managerName || "Store Manager",
        admin_email: managerEmail,
        admin_password: managerPassword,
      });

      if (res.success && res.data) {
        toast({
          title: "Software Given Successfully!",
          description: `Created clean software workspace for "${clientName}".`,
          variant: "success",
        });

        setCreatedCredentials({
          name: clientName,
          slug: clientSlug || res.data.slug || clientName.toLowerCase().replace(/\s+/g, "-"),
          email: managerEmail,
          password: managerPassword,
          plan: clientPlan,
        });

        setClientName("");
        setClientSlug("");
        setManagerName("");
        setManagerEmail("");
        setManagerPassword("Password123!");
        await fetchAdminData();
      }
    } catch (err: any) {
      toast({
        title: "Creation Failed",
        description: err?.problem?.detail || err.message || "Could not register client",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filter clients
  const filteredClients = clients.filter((c) => {
    const matchesPlan = planFilter === "ALL" || c.plan.toLowerCase() === planFilter.toLowerCase();
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch =
      !q ||
      c.name.toLowerCase().includes(q) ||
      c.slug.toLowerCase().includes(q) ||
      c.org_id.toLowerCase().includes(q);
    return matchesPlan && matchesSearch;
  });

  // Filter global users
  const filteredUsers = usersList.filter((u) => {
    const matchesRole = userRoleFilter === "ALL" || u.role.toLowerCase() === userRoleFilter.toLowerCase();
    const q = userSearchQuery.toLowerCase().trim();
    const matchesSearch =
      !q ||
      u.email.toLowerCase().includes(q) ||
      u.name.toLowerCase().includes(q) ||
      u.org_name.toLowerCase().includes(q);
    return matchesRole && matchesSearch;
  });

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-950 text-slate-100 font-sans selection:bg-indigo-600 selection:text-white">
      {/* ======================================================== */}
      {/* 1. DEDICATED ADMIN SIDEBAR                               */}
      {/* ======================================================== */}
      <aside className="w-64 border-r border-slate-800/80 bg-slate-900/60 flex flex-col justify-between shrink-0 select-none z-30">
        <div>
          {/* Admin Header */}
          <div className="h-16 px-5 border-b border-slate-800/80 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-purple-600 text-white flex items-center justify-center shadow-lg shadow-indigo-600/30">
              <Shield className="w-5 h-5 text-indigo-100" />
            </div>
            <div className="flex flex-col">
              <span className="font-extrabold text-sm tracking-tight text-white flex items-center gap-1.5">
                WHOOPIT ADMIN
              </span>
              <span className="text-[10px] text-slate-400 font-medium">
                Master Control Room
              </span>
            </div>
          </div>

          {/* Quick Action Button */}
          <div className="p-3">
            <button
              onClick={() => setIsModalOpen(true)}
              className="w-full flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-xs font-bold shadow-lg shadow-indigo-600/20 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>+ Give Software to Client</span>
            </button>
          </div>

          {/* Primary Navigation Tabs */}
          <nav className="px-3 py-1 space-y-1">
            <button
              onClick={() => setActiveTab("overview")}
              className={cn(
                "w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer",
                activeTab === "overview"
                  ? "bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 font-bold"
                  : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-200"
              )}
            >
              <div className="flex items-center gap-2.5">
                <Activity className="w-4 h-4 text-indigo-400" />
                <span>Overview &amp; Stats</span>
              </div>
            </button>

            <button
              onClick={() => setActiveTab("clients")}
              className={cn(
                "w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer",
                activeTab === "clients"
                  ? "bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 font-bold"
                  : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-200"
              )}
            >
              <div className="flex items-center gap-2.5">
                <Building2 className="w-4 h-4 text-purple-400" />
                <span>Clients &amp; Companies</span>
              </div>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-slate-800 text-slate-300">
                {clients.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab("licenses")}
              className={cn(
                "w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer",
                activeTab === "licenses"
                  ? "bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 font-bold"
                  : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-200"
              )}
            >
              <div className="flex items-center gap-2.5">
                <Key className="w-4 h-4 text-amber-400" />
                <span>Licenses &amp; Plans</span>
              </div>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-slate-800 text-slate-300">
                3
              </span>
            </button>

            <button
              onClick={() => setActiveTab("users")}
              className={cn(
                "w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer",
                activeTab === "users"
                  ? "bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 font-bold"
                  : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-200"
              )}
            >
              <div className="flex items-center gap-2.5">
                <Users className="w-4 h-4 text-blue-400" />
                <span>All Store Users</span>
              </div>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-slate-800 text-slate-300">
                {usersList.length || (telemetry ? telemetry.total_users : 0)}
              </span>
            </button>

            <button
              onClick={() => setActiveTab("system")}
              className={cn(
                "w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer",
                activeTab === "system"
                  ? "bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 font-bold"
                  : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-200"
              )}
            >
              <div className="flex items-center gap-2.5">
                <Database className="w-4 h-4 text-emerald-400" />
                <span>Database &amp; System</span>
              </div>
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            </button>

            <button
              onClick={() => setActiveTab("audit")}
              className={cn(
                "w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer",
                activeTab === "audit"
                  ? "bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 font-bold"
                  : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-200"
              )}
            >
              <div className="flex items-center gap-2.5">
                <FileText className="w-4 h-4 text-fuchsia-400" />
                <span>Audit &amp; Security Logs</span>
              </div>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-slate-800 text-slate-300">
                {auditLogs.length}
              </span>
            </button>
          </nav>
        </div>

        {/* Bottom Profile & Privacy Shield */}
        <div className="p-3 border-t border-slate-800/80 space-y-2">
          {/* Zero-Knowledge Privacy Badge */}
          <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center gap-2">
            <Lock className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span className="text-[10px] text-slate-400 leading-tight">
              Client store privacy enforced via PostgreSQL RLS.
            </span>
          </div>

          {/* Admin User Card & Sign Out */}
          <div className="flex items-center justify-between p-2 rounded-xl bg-slate-900/80 border border-slate-800">
            <div className="flex items-center gap-2 truncate">
              <div className="w-7 h-7 rounded-lg bg-indigo-600/30 text-indigo-300 font-bold text-xs flex items-center justify-center border border-indigo-500/30">
                AD
              </div>
              <div className="flex flex-col truncate leading-tight">
                <span className="text-xs font-bold text-white truncate">Admin (Hum)</span>
                <span className="text-[10px] text-slate-400 truncate">admin@whoopit.io</span>
              </div>
            </div>

            <button
              onClick={() => logout()}
              className="w-7 h-7 rounded-lg hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 flex items-center justify-center transition-colors cursor-pointer"
              title="Sign Out"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </aside>

      {/* ======================================================== */}
      {/* 2. ADMIN MAIN VIEWPORT                                   */}
      {/* ======================================================== */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Header Bar */}
        <header className="h-16 border-b border-slate-800/80 bg-slate-900/40 backdrop-blur-md px-6 flex items-center justify-between shrink-0 z-20">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span className="text-slate-500">Admin Console</span>
              <span>/</span>
              <span className="font-semibold text-white capitalize">{activeTab}</span>
            </div>

            <div className="h-4 w-px bg-slate-800 hidden sm:block" />

            <div className="hidden sm:flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-semibold flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                PostgreSQL 18 Online
              </span>
              <span className="px-2 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-[10px] font-semibold">
                Multi-Tenant RLS Active
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={fetchAdminData}
              disabled={isLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800 text-xs font-semibold transition-all cursor-pointer"
              title="Refresh live data"
            >
              <RefreshCw className={cn("w-3.5 h-3.5", isLoading && "animate-spin")} />
              <span className="hidden sm:inline">Refresh</span>
            </button>

            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900/90 border border-slate-800 text-xs text-emerald-400 font-semibold shadow-xs">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Zero-Knowledge Privacy Active</span>
            </div>
          </div>
        </header>

        {/* Scrollable Admin Content Body */}
        <main className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6">
          {/* ==================================================== */}
          {/* TAB 1: OVERVIEW & STATS                              */}
          {/* ==================================================== */}
          {activeTab === "overview" && (
            <div className="space-y-6">
              <div className="border-b border-slate-800 pb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-white flex items-center gap-2">
                    <Activity className="w-5 h-5 text-indigo-400" />
                    <span>Master Control Room Overview</span>
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">
                    Real-time software distribution, license analytics, and platform health telemetry across all client companies.
                  </p>
                </div>
                <button
                  onClick={() => setIsModalOpen(true)}
                  className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all shadow-md shadow-indigo-600/20 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Give Software</span>
                </button>
              </div>

              {/* 4 Executive KPI Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div
                  onClick={() => setActiveTab("clients")}
                  className="p-5 rounded-2xl border border-slate-800/80 bg-slate-900/60 shadow-lg relative overflow-hidden group hover:border-indigo-500/50 transition-all cursor-pointer"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      Clients Given Software
                    </span>
                    <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center border border-indigo-500/20">
                      <Building2 className="w-5 h-5" />
                    </div>
                  </div>
                  <div className="text-3xl font-extrabold text-white mt-3">
                    {telemetry ? telemetry.total_organizations : clients.length}
                  </div>
                  <div className="flex items-center gap-1.5 mt-2 text-[11px] text-emerald-400 font-semibold">
                    <TrendingUp className="w-3.5 h-3.5" />
                    <span>{clients.length} Companies Tracked</span>
                  </div>
                </div>

                <div
                  onClick={() => setActiveTab("licenses")}
                  className="p-5 rounded-2xl border border-slate-800/80 bg-slate-900/60 shadow-lg relative overflow-hidden group hover:border-purple-500/50 transition-all cursor-pointer"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      Enterprise Clients
                    </span>
                    <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center border border-purple-500/20">
                      <Briefcase className="w-5 h-5" />
                    </div>
                  </div>
                  <div className="text-3xl font-extrabold text-purple-300 mt-3">
                    {telemetry ? telemetry.active_enterprises : 0}
                  </div>
                  <div className="flex items-center gap-1.5 mt-2 text-[11px] text-purple-400 font-semibold">
                    <span>Paid &amp; Unlimited Tier</span>
                  </div>
                </div>

                <div
                  onClick={() => setActiveTab("users")}
                  className="p-5 rounded-2xl border border-slate-800/80 bg-slate-900/60 shadow-lg relative overflow-hidden group hover:border-blue-500/50 transition-all cursor-pointer"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      Total End-Users
                    </span>
                    <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center border border-blue-500/20">
                      <Users className="w-5 h-5" />
                    </div>
                  </div>
                  <div className="text-3xl font-extrabold text-blue-300 mt-3">
                    {usersList.length || (telemetry ? telemetry.total_users : 0)}
                  </div>
                  <div className="flex items-center gap-1.5 mt-2 text-[11px] text-blue-400 font-semibold">
                    <span>Active Staff Across All Clients</span>
                  </div>
                </div>

                <div className="p-5 rounded-2xl border border-slate-800/80 bg-slate-900/60 shadow-lg relative overflow-hidden group hover:border-emerald-500/50 transition-all">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      Total Store SKUs Tracked
                    </span>
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center border border-emerald-500/20">
                      <Boxes className="w-5 h-5" />
                    </div>
                  </div>
                  <div className="text-3xl font-extrabold text-emerald-300 mt-3">
                    {telemetry ? telemetry.total_items.toLocaleString() : 0}
                  </div>
                  <div className="flex items-center gap-1.5 mt-2 text-[11px] text-emerald-400 font-semibold">
                    <span>Products in Client Stores</span>
                  </div>
                </div>
              </div>

              {/* License Distribution Progress Bar */}
              <div className="p-6 rounded-2xl border border-slate-800/80 bg-slate-900/50 shadow-xl space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <Key className="w-4 h-4 text-amber-400" />
                      <span>Software License Distribution</span>
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Visual allocation breakdown of active commercial packages across {clients.length} client companies.
                    </p>
                  </div>
                  <button
                    onClick={() => setActiveTab("licenses")}
                    className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <span>Manage Plans</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Progress bar */}
                <div className="h-3 w-full bg-slate-950 rounded-full overflow-hidden flex">
                  <div
                    style={{
                      width: `${
                        clients.length
                          ? Math.round(((telemetry?.active_enterprises || 0) / clients.length) * 100)
                          : 70
                      }%`,
                    }}
                    className="bg-purple-500 transition-all"
                    title="Enterprise Tier"
                  />
                  <div
                    style={{
                      width: `${
                        clients.length
                          ? Math.round(((telemetry?.active_standards || 0) / clients.length) * 100)
                          : 20
                      }%`,
                    }}
                    className="bg-blue-500 transition-all"
                    title="Standard Tier"
                  />
                  <div
                    style={{
                      width: `${
                        clients.length
                          ? Math.round(((telemetry?.active_trials || 0) / clients.length) * 100)
                          : 10
                      }%`,
                    }}
                    className="bg-amber-500 transition-all"
                    title="30-Day Trial"
                  />
                </div>

                <div className="grid grid-cols-3 gap-4 pt-2">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-md bg-purple-500" />
                    <span className="text-xs text-slate-300 font-semibold">Enterprise:</span>
                    <span className="text-xs font-mono font-bold text-purple-400">
                      {telemetry?.active_enterprises || 0}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-md bg-blue-500" />
                    <span className="text-xs text-slate-300 font-semibold">Standard:</span>
                    <span className="text-xs font-mono font-bold text-blue-400">
                      {telemetry?.active_standards || 0}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-md bg-amber-500" />
                    <span className="text-xs text-slate-300 font-semibold">30-Day Trial:</span>
                    <span className="text-xs font-mono font-bold text-amber-400">
                      {telemetry?.active_trials || 0}
                    </span>
                  </div>
                </div>
              </div>

              {/* Recent Audit & Provisioning Ticker */}
              <div className="p-6 rounded-2xl border border-slate-800/80 bg-slate-900/50 shadow-xl space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-fuchsia-400" />
                    <span className="text-sm font-bold text-white">Recent Platform Audit Events</span>
                  </div>
                  <button
                    onClick={() => setActiveTab("audit")}
                    className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <span>View All {auditLogs.length} Logs</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="divide-y divide-slate-800/60">
                  {auditLogs.slice(0, 4).map((log) => (
                    <div key={log.audit_id} className="py-3 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-3">
                        <span className="w-2 h-2 rounded-full bg-emerald-400" />
                        <div>
                          <span className="font-semibold text-white">{log.action}</span>
                          <span className="text-slate-400 ml-2">in {log.org_name}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 text-slate-400 font-mono text-[11px]">
                        <span>{log.user_email}</span>
                        <span>{new Date(log.created_at).toLocaleTimeString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ==================================================== */}
          {/* TAB 2: CLIENTS & COMPANIES DIRECTORY                 */}
          {/* ==================================================== */}
          {activeTab === "clients" && (
            <div className="space-y-6">
              {/* Header & Controls */}
              <div className="p-4 rounded-2xl border border-slate-800/80 bg-slate-900/50 shadow-xs flex flex-col md:flex-row items-center justify-between gap-3">
                <div className="relative w-full md:w-96">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search client by company name, slug, or ID..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-4 py-2.5 rounded-xl text-xs bg-slate-950 border border-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 text-white placeholder:text-slate-500"
                  />
                </div>

                <div className="flex items-center gap-3 w-full md:w-auto">
                  <span className="text-xs text-slate-400 shrink-0">Plan Filter:</span>
                  <select
                    value={planFilter}
                    onChange={(e) => setPlanFilter(e.target.value)}
                    className="px-3 py-2 rounded-xl text-xs bg-slate-950 border border-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 text-white cursor-pointer"
                  >
                    <option value="ALL">All License Plans</option>
                    <option value="enterprise">Enterprise</option>
                    <option value="standard">Standard</option>
                    <option value="trial">30-Day Trial</option>
                  </select>

                  <button
                    onClick={() => setIsModalOpen(true)}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all shadow-md shadow-indigo-600/20 cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Give Software</span>
                  </button>
                </div>
              </div>

              {/* Master Clients Table */}
              <div className="rounded-2xl border border-slate-800/80 bg-slate-900/50 shadow-xl overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-800/80 flex items-center justify-between bg-slate-900/80">
                  <div>
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-indigo-400" />
                      <span>Clients &amp; Companies Directory</span>
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
                        {filteredClients.length} Tracked
                      </span>
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Jisko bhi humne software dia hai wo yahan listed hai. Unke license plans aur operational activity logs yahan se control karein.
                    </p>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-900/90 text-slate-400 border-b border-slate-800">
                      <tr>
                        <th className="py-3.5 px-6 font-semibold">Client Company</th>
                        <th className="py-3.5 px-6 font-semibold">License Tier</th>
                        <th className="py-3.5 px-6 font-semibold text-center">Status</th>
                        <th className="py-3.5 px-6 font-semibold text-center">Staff Count</th>
                        <th className="py-3.5 px-6 font-semibold text-center">Store SKUs</th>
                        <th className="py-3.5 px-6 font-semibold text-center">Ledger Moves</th>
                        <th className="py-3.5 px-6 font-semibold">Given On</th>
                        <th className="py-3.5 px-6 font-semibold text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/80 text-slate-300">
                      {filteredClients.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="py-12 text-center text-slate-500">
                            <Building2 className="w-8 h-8 mx-auto mb-2 text-slate-700 stroke-1" />
                            <p className="font-medium text-slate-400">
                              No matching clients found.
                            </p>
                          </td>
                        </tr>
                      ) : (
                        filteredClients.map((c) => (
                          <tr key={c.org_id} className="hover:bg-slate-800/40 transition-colors">
                            <td className="py-4 px-6">
                              <div className="font-bold text-white flex items-center gap-2">
                                <span>{c.name}</span>
                              </div>
                              <div className="text-[11px] font-mono text-slate-400 mt-0.5 flex items-center gap-1.5">
                                <span>slug: {c.slug}</span>
                                <span>&bull;</span>
                                <span className="text-[10px] text-slate-500">{c.org_id.slice(0, 8)}...</span>
                              </div>
                            </td>

                            <td className="py-4 px-6">
                              <span
                                className={cn(
                                  "px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border",
                                  c.plan.toLowerCase() === "enterprise"
                                    ? "bg-purple-500/10 text-purple-300 border-purple-500/30"
                                    : c.plan.toLowerCase() === "standard"
                                    ? "bg-blue-500/10 text-blue-300 border-blue-500/30"
                                    : "bg-amber-500/10 text-amber-300 border-amber-500/30"
                                )}
                              >
                                {c.plan}
                              </span>
                            </td>

                            <td className="py-4 px-6 text-center">
                              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-400">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                <span>Active</span>
                              </span>
                            </td>

                            <td className="py-4 px-6 text-center font-mono font-medium">
                              {c.user_count}
                            </td>

                            <td className="py-4 px-6 text-center font-mono font-medium">
                              {c.item_count}
                            </td>

                            <td className="py-4 px-6 text-center font-mono font-medium text-slate-400">
                              {c.movement_count}
                            </td>

                            <td className="py-4 px-6 text-slate-400 text-[11px]">
                              {new Date(c.created_at).toLocaleDateString()}
                            </td>

                            <td className="py-4 px-6 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  onClick={() => openClientModal(c, "details")}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 transition-all cursor-pointer border border-slate-700/60"
                                  title="Manage this client's license & details"
                                >
                                  <Sliders className="w-3.5 h-3.5 text-indigo-400" />
                                  <span>Manage Client</span>
                                </button>
                                <button
                                  onClick={() => openClientModal(c, "activity")}
                                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-indigo-600/15 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 transition-all cursor-pointer"
                                  title="View operational activity logs for this client"
                                >
                                  <Activity className="w-3.5 h-3.5" />
                                  <span className="hidden xl:inline">Activity Logs</span>
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ==================================================== */}
          {/* TAB 3: LICENSES & PLANS                              */}
          {/* ==================================================== */}
          {activeTab === "licenses" && (
            <div className="space-y-6">
              <div className="border-b border-slate-800 pb-4">
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <Key className="w-5 h-5 text-amber-400" />
                  <span>License &amp; Plan Tiers</span>
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Configure and monitor the 3 standard software distribution packages given to clients.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Enterprise Tier */}
                <div className="p-6 rounded-3xl border border-purple-500/30 bg-purple-950/20 shadow-xl space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-purple-500/20 text-purple-300 border border-purple-500/40">
                      Enterprise Tier
                    </span>
                    <span className="text-2xl font-bold text-white">
                      {telemetry?.active_enterprises || 0} Clients
                    </span>
                  </div>
                  <h3 className="text-lg font-bold text-white">Full Commercial License</h3>
                  <p className="text-xs text-purple-200/70">
                    Unlimited warehouses, full barcode engine, cryptographic tool custody, and double-entry stock ledger.
                  </p>
                  <ul className="text-xs text-slate-300 space-y-2 pt-2 border-t border-purple-500/20">
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-purple-400" />
                      <span>Unlimited items &amp; movements</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-purple-400" />
                      <span>Custom Fields Builder</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-purple-400" />
                      <span>Priority Support &amp; RLS Isolation</span>
                    </li>
                  </ul>
                </div>

                {/* Standard Tier */}
                <div className="p-6 rounded-3xl border border-blue-500/30 bg-blue-950/20 shadow-xl space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-500/20 text-blue-300 border border-blue-500/40">
                      Standard Tier
                    </span>
                    <span className="text-2xl font-bold text-white">
                      {telemetry?.active_standards || 0} Clients
                    </span>
                  </div>
                  <h3 className="text-lg font-bold text-white">Store Commercial License</h3>
                  <p className="text-xs text-blue-200/70">
                    Up to 3 standard warehouse locations, purchase &amp; sales invoices, and stock valuation.
                  </p>
                  <ul className="text-xs text-slate-300 space-y-2 pt-2 border-t border-blue-500/20">
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-blue-400" />
                      <span>Up to 5,000 active SKUs</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-blue-400" />
                      <span>Standard Staff Role permissions</span>
                    </li>
                  </ul>
                </div>

                {/* Trial Tier */}
                <div className="p-6 rounded-3xl border border-amber-500/30 bg-amber-950/20 shadow-xl space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/40">
                      30-Day Trial
                    </span>
                    <span className="text-2xl font-bold text-white">
                      {telemetry?.active_trials || 0} Clients
                    </span>
                  </div>
                  <h3 className="text-lg font-bold text-white">Evaluation Package</h3>
                  <p className="text-xs text-amber-200/70">
                    Complimentary 30-day evaluation given to potential client shops to test their store flow.
                  </p>
                  <ul className="text-xs text-slate-300 space-y-2 pt-2 border-t border-amber-500/20">
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-amber-400" />
                      <span>30-Day automated expiry timer</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-amber-400" />
                      <span>1-Click upgrade to Enterprise</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* ==================================================== */}
          {/* TAB 4: ALL STORE USERS                               */}
          {/* ==================================================== */}
          {activeTab === "users" && (
            <div className="space-y-6">
              <div className="border-b border-slate-800 pb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-white flex items-center gap-2">
                    <Users className="w-5 h-5 text-blue-400" />
                    <span>Platform End-Users Directory</span>
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">
                    Global staff and managers across all client stores using the Whoopit IMS software ({filteredUsers.length} active).
                  </p>
                </div>
              </div>

              {/* Users Filter Bar */}
              <div className="p-4 rounded-2xl border border-slate-800/80 bg-slate-900/50 shadow-xs flex flex-col md:flex-row items-center justify-between gap-3">
                <div className="relative w-full md:w-96">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search by user email, name, or company..."
                    value={userSearchQuery}
                    onChange={(e) => setUserSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-4 py-2.5 rounded-xl text-xs bg-slate-950 border border-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 text-white placeholder:text-slate-500"
                  />
                </div>

                <div className="flex items-center gap-3 w-full md:w-auto">
                  <span className="text-xs text-slate-400 shrink-0">Role Filter:</span>
                  <select
                    value={userRoleFilter}
                    onChange={(e) => setUserRoleFilter(e.target.value)}
                    className="px-3 py-2 rounded-xl text-xs bg-slate-950 border border-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 text-white cursor-pointer"
                  >
                    <option value="ALL">All Roles</option>
                    <option value="owner">Owner</option>
                    <option value="admin">Admin</option>
                    <option value="staff">Staff</option>
                    <option value="employee">Employee</option>
                  </select>
                </div>
              </div>

              {/* Users Table */}
              <div className="rounded-2xl border border-slate-800/80 bg-slate-900/50 shadow-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-900/90 text-slate-400 border-b border-slate-800">
                      <tr>
                        <th className="py-3.5 px-6 font-semibold">User Account</th>
                        <th className="py-3.5 px-6 font-semibold">Client Company</th>
                        <th className="py-3.5 px-6 font-semibold text-center">Assigned Role</th>
                        <th className="py-3.5 px-6 font-semibold text-center">Status</th>
                        <th className="py-3.5 px-6 font-semibold">Created Date</th>
                        <th className="py-3.5 px-6 font-semibold text-right">Security</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/80 text-slate-300">
                      {filteredUsers.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-12 text-center text-slate-500">
                            <Users className="w-8 h-8 mx-auto mb-2 text-slate-700 stroke-1" />
                            <p className="font-medium text-slate-400">No matching store users found.</p>
                          </td>
                        </tr>
                      ) : (
                        filteredUsers.map((u) => (
                          <tr key={u.user_id} className="hover:bg-slate-800/40 transition-colors">
                            <td className="py-4 px-6">
                              <div className="font-bold text-white">{u.name || "Store User"}</div>
                              <div className="text-[11px] font-mono text-slate-400 mt-0.5">{u.email}</div>
                            </td>
                            <td className="py-4 px-6 text-slate-300 font-medium">
                              {u.org_name}
                            </td>
                            <td className="py-4 px-6 text-center">
                              <span
                                className={cn(
                                  "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border",
                                  u.role === "admin" || u.role === "owner"
                                    ? "bg-indigo-500/20 text-indigo-300 border-indigo-500/30"
                                    : "bg-slate-800 text-slate-300 border-slate-700"
                                )}
                              >
                                {u.role}
                              </span>
                            </td>
                            <td className="py-4 px-6 text-center">
                              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-400">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                <span>Active</span>
                              </span>
                            </td>
                            <td className="py-4 px-6 text-slate-400 text-[11px]">
                              {new Date(u.created_at).toLocaleDateString()}
                            </td>
                            <td className="py-4 px-6 text-right">
                              <span className="text-[10px] font-mono text-slate-500 px-2 py-1 rounded-md bg-slate-950 border border-slate-800">
                                Argon2id Hashed
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ==================================================== */}
          {/* TAB 5: DATABASE & SYSTEM                             */}
          {/* ==================================================== */}
          {activeTab === "system" && (
            <div className="space-y-6">
              <div className="border-b border-slate-800 pb-4">
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <Database className="w-5 h-5 text-emerald-400" />
                  <span>System &amp; Infrastructure Diagnostics</span>
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Status of underlying database containers, memory cache, storage cluster, and cryptographic security.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-5 rounded-2xl border border-emerald-500/30 bg-emerald-950/20 shadow-md space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-white flex items-center gap-2">
                      <Database className="w-4 h-4 text-emerald-400" />
                      PostgreSQL 18 Multi-Tenant Engine
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-bold">
                      HEALTHY
                    </span>
                  </div>
                  <p className="text-xs text-slate-300">
                    Port: 5432 &bull; Row-Level Security (RLS) active on all tables. Each client has isolated cryptographic data boundaries.
                  </p>
                </div>

                <div className="p-5 rounded-2xl border border-indigo-500/30 bg-indigo-950/20 shadow-md space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-white flex items-center gap-2">
                      <Cpu className="w-4 h-4 text-indigo-400" />
                      Valkey 8.0 In-Memory Cache
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 text-[10px] font-bold">
                      CONNECTED
                    </span>
                  </div>
                  <p className="text-xs text-slate-300">
                    Port: 6379 &bull; Fast stock reservation caching, distributed lock keys, and session tokens.
                  </p>
                </div>

                <div className="p-5 rounded-2xl border border-blue-500/30 bg-blue-950/20 shadow-md space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-white flex items-center gap-2">
                      <HardDrive className="w-4 h-4 text-blue-400" />
                      SeaweedFS Object Storage
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 text-[10px] font-bold">
                      READY
                    </span>
                  </div>
                  <p className="text-xs text-slate-300">
                    Port: 8888 / 9000 &bull; S3-compatible asset storage for barcode label PNGs and PDF custody vouchers.
                  </p>
                </div>

                <div className="p-5 rounded-2xl border border-purple-500/30 bg-purple-950/20 shadow-md space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-white flex items-center gap-2">
                      <Mail className="w-4 h-4 text-purple-400" />
                      Mailpit SMTP Server
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 text-[10px] font-bold">
                      READY
                    </span>
                  </div>
                  <p className="text-xs text-slate-300">
                    Port: 1025 (SMTP) / 8025 (Web UI) &bull; Outgoing email alerts and low stock digest notifications.
                  </p>
                </div>
              </div>

              {/* Architectural Security & Privacy Pillars */}
              <div className="p-6 rounded-2xl border border-slate-800 bg-slate-900/60 space-y-4">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span>Data Confidentiality &amp; Zero-Knowledge Isolation</span>
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs text-slate-300">
                  <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-1.5">
                    <span className="font-bold text-white flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5 text-emerald-400" />
                      Tenant Privacy Boundaries
                    </span>
                    <p className="text-[11px] text-slate-400">
                      The Master Admin portal can only manage organization plans, staff counts, and audit logs. Store invoices and customer stock levels are inaccessible to preserve complete business privacy.
                    </p>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-1.5">
                    <span className="font-bold text-white flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-indigo-400" />
                      PostgreSQL Row-Level Security
                    </span>
                    <p className="text-[11px] text-slate-400">
                      Every single query is bound strictly to <code className="text-indigo-300">app.org_id</code> at the kernel level. No tenant can ever read another tenant&apos;s data.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ==================================================== */}
          {/* TAB 6: AUDIT & SECURITY LOGS                         */}
          {/* ==================================================== */}
          {activeTab === "audit" && (
            <div className="space-y-6">
              <div className="border-b border-slate-800 pb-4">
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <FileText className="w-5 h-5 text-fuchsia-400" />
                  <span>Platform Security &amp; Audit Trail</span>
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Cryptographic log trail of administrative actions, software provisioning, and security events ({auditLogs.length} events).
                </p>
              </div>

              {/* Audit Table */}
              <div className="rounded-2xl border border-slate-800/80 bg-slate-900/50 shadow-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-900/90 text-slate-400 border-b border-slate-800">
                      <tr>
                        <th className="py-3.5 px-6 font-semibold">Timestamp</th>
                        <th className="py-3.5 px-6 font-semibold">Action / Event</th>
                        <th className="py-3.5 px-6 font-semibold">Entity Type &amp; ID</th>
                        <th className="py-3.5 px-6 font-semibold">Client Company</th>
                        <th className="py-3.5 px-6 font-semibold">Actor / User</th>
                        <th className="py-3.5 px-6 font-semibold text-right">IP Address</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/80 text-slate-300">
                      {auditLogs.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-12 text-center text-slate-500">
                            <FileText className="w-8 h-8 mx-auto mb-2 text-slate-700 stroke-1" />
                            <p className="font-medium text-slate-400">No audit events recorded yet.</p>
                          </td>
                        </tr>
                      ) : (
                        auditLogs.map((ev) => (
                          <tr key={ev.audit_id} className="hover:bg-slate-800/40 transition-colors">
                            <td className="py-4 px-6 text-slate-400 font-mono text-[11px]">
                              {new Date(ev.created_at).toLocaleString()}
                            </td>
                            <td className="py-4 px-6">
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                                {ev.action}
                              </span>
                            </td>
                            <td className="py-4 px-6">
                              <div className="font-semibold text-white capitalize">{ev.entity_type}</div>
                              <div className="text-[10px] font-mono text-slate-500 mt-0.5 truncate max-w-[140px]">
                                {ev.entity_id}
                              </div>
                            </td>
                            <td className="py-4 px-6 text-slate-300 font-medium">
                              {ev.org_name}
                            </td>
                            <td className="py-4 px-6 font-mono text-[11px] text-slate-400">
                              {ev.user_email}
                            </td>
                            <td className="py-4 px-6 text-right font-mono text-[11px] text-slate-500">
                              {ev.ip_address}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* ======================================================== */}
      {/* 3. MODAL: GIVE SOFTWARE TO NEW CLIENT                    */}
      {/* ======================================================== */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-5 text-slate-100">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-indigo-600/20 text-indigo-400 flex items-center justify-center border border-indigo-500/30">
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-base">Give Software to New Client</h3>
                  <p className="text-xs text-slate-400">
                    Creates an isolated multi-tenant workspace &amp; store manager credentials.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
              >
                &times;
              </button>
            </div>

            {createdCredentials ? (
              <div className="space-y-4">
                <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 space-y-1">
                  <div className="flex items-center gap-2 font-bold text-sm text-white">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>Software Workspace Provisioned Successfully!</span>
                  </div>
                  <p className="text-xs text-slate-300">
                    A completely clean, isolated software instance has been generated for <strong>{createdCredentials.name}</strong>.
                  </p>
                </div>

                {/* Credentials Handover Box */}
                <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3 font-mono text-xs">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-800/80 font-sans">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                      Client Handover Credentials
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                      {createdCredentials.plan.toUpperCase()} TIER
                    </span>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Company Name:</span>
                      <span className="text-white font-semibold">{createdCredentials.name}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Store Manager Email:</span>
                      <span className="text-indigo-400 font-bold">{createdCredentials.email}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Initial Password:</span>
                      <span className="text-emerald-400 font-bold">{createdCredentials.password}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Initial State:</span>
                      <span className="text-amber-400 font-semibold flex items-center gap-1">
                        <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                        0 Products &bull; Fresh Start
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Isolation:</span>
                      <span className="text-slate-300">PostgreSQL 18 RLS Enforced</span>
                    </div>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-800 text-[11px] text-slate-400 leading-relaxed">
                  💡 <strong>How it works:</strong> Give these credentials to the client. When they log in, they will be taken directly to their own store software (<code className="text-indigo-300">/</code>) with <strong>zero existing data</strong> so they can start fresh.
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => {
                      const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
                      const text = `=== WHOOPIT SOFTWARE CREDENTIALS ===\nCompany: ${createdCredentials.name}\nPlan: ${createdCredentials.plan.toUpperCase()}\nLogin Email: ${createdCredentials.email}\nPassword: ${createdCredentials.password}\nSoftware Portal: ${origin}/login\nStatus: 100% Fresh Start (0 Data)\n===================================`;
                      navigator.clipboard.writeText(text);
                      toast({
                        title: "Credentials Copied!",
                        description: "Ready to share with the client via WhatsApp or Email.",
                        variant: "success",
                      });
                    }}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold transition-all shadow-md shadow-indigo-600/20 cursor-pointer text-xs"
                  >
                    <Copy className="w-4 h-4" />
                    <span>Copy Credentials</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCreatedCredentials(null);
                      setIsModalOpen(false);
                    }}
                    className="px-4 py-2.5 rounded-xl border border-slate-800 hover:bg-slate-800 text-slate-300 font-semibold cursor-pointer text-xs"
                  >
                    Done &amp; Close
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleCreateClient} className="space-y-4 text-xs">
                {/* 0-Data Guarantee Banner */}
                <div className="p-3 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs flex items-start gap-2.5">
                  <Sparkles className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-white block font-semibold">✨ Fresh Start Guarantee:</strong>
                    <span className="text-[11px] text-slate-300">
                      When this company logs in, their workspace will be <strong>100% clean with 0 data</strong> (0 products, 0 valuation, 0 movements) under isolated database Row Security.
                    </span>
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block font-medium text-slate-400 mb-1">
                      Client / Shop Name *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Al-Madina Hardware &amp; Store"
                      value={clientName}
                      onChange={(e) => {
                        setClientName(e.target.value);
                        if (!clientSlug) {
                          setClientSlug(
                            e.target.value
                              .toLowerCase()
                              .replace(/[^a-z0-9]/g, "-")
                              .replace(/-+/g, "-")
                          );
                        }
                      }}
                      className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-medium text-slate-400 mb-1">
                        Custom URL Slug
                      </label>
                      <input
                        type="text"
                        placeholder="al-madina"
                        value={clientSlug}
                        onChange={(e) => setClientSlug(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono"
                      />
                    </div>

                    <div>
                      <label className="block font-medium text-slate-400 mb-1">
                        License Plan
                      </label>
                      <select
                        value={clientPlan}
                        onChange={(e) => setClientPlan(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white cursor-pointer"
                      >
                        <option value="enterprise">Enterprise Tier</option>
                        <option value="standard">Standard Tier</option>
                        <option value="trial">30-Day Free Trial</option>
                      </select>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-800">
                    <span className="text-[11px] font-bold text-indigo-400 uppercase tracking-wider block mb-2">
                      Client Initial Manager Account
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-medium text-slate-400 mb-1">
                        Manager Name
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Asif Khan"
                        value={managerName}
                        onChange={(e) => setManagerName(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white"
                      />
                    </div>

                    <div>
                      <label className="block font-medium text-slate-400 mb-1">
                        Email Address *
                      </label>
                      <input
                        type="email"
                        required
                        placeholder="asif@apex.com"
                        value={managerEmail}
                        onChange={(e) => setManagerEmail(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block font-medium text-slate-400 mb-1">
                      Initial Password
                    </label>
                    <input
                      type="text"
                      value={managerPassword}
                      onChange={(e) => setManagerPassword(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-4 py-2.5 rounded-xl border border-slate-800 hover:bg-slate-800 text-slate-400 font-semibold cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold transition-all shadow-lg shadow-indigo-600/30 cursor-pointer disabled:opacity-50"
                  >
                    {isSubmitting ? "Creating Workspace..." : "Create & Give Software"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 4. MODAL: MANAGE CLIENT & ACTIVITY LOGS (PRIVACY SAFE)    */}
      {/* ======================================================== */}
      {selectedClient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-2xl rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl p-6 md:p-8 space-y-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between">
              <div>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  Client Profile &amp; Control
                </span>
                <h3 className="text-xl font-bold text-white mt-1.5 flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-indigo-400" />
                  <span>{selectedClient.name}</span>
                </h3>
                <p className="text-xs text-slate-400 font-mono mt-0.5">
                  Tenant ID: {selectedClient.org_id} &bull; Slug: {selectedClient.slug}
                </p>
              </div>
              <button
                onClick={() => setSelectedClient(null)}
                className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
              >
                &times;
              </button>
            </div>

            {/* Modal Internal Navigation Tabs */}
            <div className="flex p-1 bg-slate-950/80 rounded-xl border border-slate-800">
              <button
                onClick={() => setModalTab("details")}
                className={cn(
                  "flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-2",
                  modalTab === "details"
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "text-slate-400 hover:text-white"
                )}
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>Client Details &amp; Plan</span>
              </button>
              <button
                onClick={() => setModalTab("activity")}
                className={cn(
                  "flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-2",
                  modalTab === "activity"
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "text-slate-400 hover:text-white"
                )}
              >
                <Activity className="w-3.5 h-3.5" />
                <span>Operational Activity Trail</span>
              </button>
            </div>

            {/* Modal Tab: Details */}
            {modalTab === "details" && (
              <div className="space-y-5">
                {/* Metrics cards */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800">
                    <span className="text-[10px] text-slate-400 font-semibold uppercase">Staff Accounts</span>
                    <p className="text-lg font-bold text-white mt-1 font-mono">{selectedClient.user_count}</p>
                  </div>
                  <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800">
                    <span className="text-[10px] text-slate-400 font-semibold uppercase">Store SKUs</span>
                    <p className="text-lg font-bold text-emerald-400 mt-1 font-mono">{selectedClient.item_count}</p>
                  </div>
                  <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800">
                    <span className="text-[10px] text-slate-400 font-semibold uppercase">Ledger Moves</span>
                    <p className="text-lg font-bold text-purple-400 mt-1 font-mono">{selectedClient.movement_count}</p>
                  </div>
                </div>

                {/* License tier upgrade/downgrade */}
                <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800/80 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-white flex items-center gap-2">
                      <Key className="w-4 h-4 text-amber-400" />
                      <span>Assigned License Tier</span>
                    </label>
                    <span className="text-[11px] text-slate-400">
                      Current: <strong className="uppercase text-amber-300">{selectedClient.plan}</strong>
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <select
                      value={editPlan}
                      onChange={(e) => setEditPlan(e.target.value)}
                      className="flex-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs font-bold text-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                    >
                      <option value="enterprise">ENTERPRISE (Full commercial license)</option>
                      <option value="standard">STANDARD (Standard store access)</option>
                      <option value="trial">30-DAY TRIAL (Evaluation mode)</option>
                    </select>
                    <button
                      onClick={handleUpdatePlan}
                      disabled={isSavingPlan || editPlan === selectedClient.plan.toLowerCase()}
                      className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all shadow-md shadow-indigo-600/30 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {isSavingPlan ? "Saving..." : "Save Plan"}
                    </button>
                  </div>
                </div>

                {/* Privacy Guarantee Note */}
                <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 flex items-start gap-3">
                  <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-white">Client Data Privacy Enforced</p>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      As platform administrator, your role is tracking license packages and operational telemetry. Client internal stock values, customer sales, and private store operations are securely protected and isolated via PostgreSQL Row-Level Security.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Modal Tab: Activity Logs */}
            {modalTab === "activity" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>Operational audit events for {selectedClient.name}:</span>
                  <span className="font-mono text-[11px]">{clientActivity.length} Events Logged</span>
                </div>

                {isLoadingActivity ? (
                  <div className="py-12 text-center text-xs text-slate-500">
                    Loading activity trail...
                  </div>
                ) : clientActivity.length === 0 ? (
                  <div className="py-12 text-center text-slate-500 border border-slate-800 rounded-2xl bg-slate-950/40">
                    <Activity className="w-8 h-8 mx-auto mb-2 text-slate-700 stroke-1" />
                    <p className="font-medium text-slate-400 text-xs">No recent events recorded for this workspace.</p>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-slate-800 bg-slate-950/60 divide-y divide-slate-800/80 max-h-64 overflow-y-auto">
                    {clientActivity.map((ev) => (
                      <div key={ev.audit_id} className="p-3.5 flex items-center justify-between text-xs">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                              {ev.action}
                            </span>
                            <span className="font-medium text-white capitalize">{ev.entity_type}</span>
                          </div>
                          <p className="text-[10px] text-slate-500 font-mono">
                            Actor: {ev.user_email} &bull; ID: {ev.entity_id}
                          </p>
                        </div>
                        <div className="text-right text-[11px] font-mono text-slate-400">
                          <div>{new Date(ev.created_at).toLocaleDateString()}</div>
                          <div className="text-[10px] text-slate-500">{new Date(ev.created_at).toLocaleTimeString()}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center justify-end pt-3 border-t border-slate-800">
              <button
                onClick={() => setSelectedClient(null)}
                className="px-5 py-2 rounded-xl border border-slate-800 hover:bg-slate-800 text-slate-300 text-xs font-semibold cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
