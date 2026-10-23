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
  Lock,
  TrendingUp,
  Sliders,
  Sparkles,
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
  Copy,
  Server,
  Layers,
} from "lucide-react";
import {
  apiClient,
  OrganizationSummary,
  PlatformTelemetry,
  GlobalUser,
  AuditEvent,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

type AdminTab = "overview" | "clients" | "licenses" | "users" | "system" | "audit";

export default function AdminPortalPage() {
  return (
    <Suspense
      fallback={
        <div className="h-screen w-screen bg-slate-50 flex items-center justify-center text-xs text-slate-500 font-sans">
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
  const [auditSearchQuery, setAuditSearchQuery] = useState("");
  const [auditActionFilter, setAuditActionFilter] = useState("ALL");

  // Sync tab and filters with URL search parameters on load
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get("tab") as AdminTab;
      if (tabParam && ["overview", "clients", "licenses", "users", "system", "audit"].includes(tabParam)) {
        setActiveTab(tabParam);
      }
      const planParam = params.get("plan");
      if (planParam) {
        setPlanFilter(planParam);
      }
    }
  }, []);

  const handleTabChange = (tab: AdminTab, plan?: string, query?: string) => {
    setActiveTab(tab);
    if (plan !== undefined) {
      setPlanFilter(plan);
    }
    if (query !== undefined) {
      setSearchQuery(query);
    }
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", tab);
      if (plan && plan !== "ALL") {
        url.searchParams.set("plan", plan);
      } else {
        url.searchParams.delete("plan");
      }
      window.history.pushState(null, "", url.toString());
    }
  };

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

  // Filter audit logs
  const filteredAuditLogs = auditLogs.filter((ev) => {
    const matchesAction = auditActionFilter === "ALL" || ev.action.toLowerCase() === auditActionFilter.toLowerCase();
    const q = auditSearchQuery.toLowerCase().trim();
    const matchesSearch =
      !q ||
      ev.action.toLowerCase().includes(q) ||
      ev.entity_type.toLowerCase().includes(q) ||
      ev.entity_id.toLowerCase().includes(q) ||
      ev.org_name.toLowerCase().includes(q) ||
      ev.user_email.toLowerCase().includes(q);
    return matchesAction && matchesSearch;
  });

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#f4f7f9] text-slate-800 font-sans selection:bg-[#0c3843] selection:text-white">
      {/* ======================================================== */}
      {/* 1. DEDICATED ADMIN SIDEBAR (PETROL TEAL THEME)            */}
      {/* ======================================================== */}
      <aside className="w-64 border-r border-[#082931] bg-[#0c3843] text-white flex flex-col justify-between shrink-0 select-none z-30 shadow-xl">
        <div>
          {/* Admin Header */}
          <div className="h-16 px-5 border-b border-white/10 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center text-cyan-300 border border-white/15 shadow-sm">
              <Boxes className="w-5 h-5 text-cyan-300" />
            </div>
            <div className="flex flex-col">
              <span className="font-extrabold text-sm tracking-tight text-white flex items-center gap-1.5">
                WHOOPIT ADMIN
              </span>
              <span className="text-[10px] text-cyan-200/70 font-medium">
                Master Control Room
              </span>
            </div>
          </div>

          {/* Quick Action Button */}
          <div className="p-3">
            <button
              onClick={() => setIsModalOpen(true)}
              className="w-full flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-slate-950 text-xs font-bold shadow-md shadow-cyan-500/20 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>+ Give Software to Client</span>
            </button>
          </div>

          {/* Primary Navigation Tabs */}
          <nav className="px-3 py-1 space-y-1">
            <button
              onClick={() => handleTabChange("overview")}
              className={cn(
                "w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer",
                activeTab === "overview"
                  ? "bg-white/15 text-white font-bold border-l-4 border-cyan-400 shadow-2xs"
                  : "text-slate-300 hover:bg-white/10 hover:text-white"
              )}
            >
              <div className="flex items-center gap-2.5">
                <Activity className="w-4 h-4 text-cyan-300" />
                <span>Overview &amp; Stats</span>
              </div>
            </button>

            <button
              onClick={() => handleTabChange("clients")}
              className={cn(
                "w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer",
                activeTab === "clients"
                  ? "bg-white/15 text-white font-bold border-l-4 border-cyan-400 shadow-2xs"
                  : "text-slate-300 hover:bg-white/10 hover:text-white"
              )}
            >
              <div className="flex items-center gap-2.5">
                <Building2 className="w-4 h-4 text-cyan-300" />
                <span>Clients &amp; Companies</span>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/10 text-cyan-200 border border-white/10">
                {clients.length}
              </span>
            </button>

            <button
              onClick={() => handleTabChange("licenses")}
              className={cn(
                "w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer",
                activeTab === "licenses"
                  ? "bg-white/15 text-white font-bold border-l-4 border-cyan-400 shadow-2xs"
                  : "text-slate-300 hover:bg-white/10 hover:text-white"
              )}
            >
              <div className="flex items-center gap-2.5">
                <Key className="w-4 h-4 text-cyan-300" />
                <span>Licenses &amp; Plans</span>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/10 text-cyan-200 border border-white/10">
                3
              </span>
            </button>

            <button
              onClick={() => handleTabChange("users")}
              className={cn(
                "w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer",
                activeTab === "users"
                  ? "bg-white/15 text-white font-bold border-l-4 border-cyan-400 shadow-2xs"
                  : "text-slate-300 hover:bg-white/10 hover:text-white"
              )}
            >
              <div className="flex items-center gap-2.5">
                <Users className="w-4 h-4 text-cyan-300" />
                <span>All Store Users</span>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/10 text-cyan-200 border border-white/10">
                {usersList.length || (telemetry ? telemetry.total_users : 0)}
              </span>
            </button>

            <button
              onClick={() => handleTabChange("system")}
              className={cn(
                "w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer",
                activeTab === "system"
                  ? "bg-white/15 text-white font-bold border-l-4 border-cyan-400 shadow-2xs"
                  : "text-slate-300 hover:bg-white/10 hover:text-white"
              )}
            >
              <div className="flex items-center gap-2.5">
                <Database className="w-4 h-4 text-cyan-300" />
                <span>Database &amp; System</span>
              </div>
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            </button>

            <button
              onClick={() => handleTabChange("audit")}
              className={cn(
                "w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer",
                activeTab === "audit"
                  ? "bg-white/15 text-white font-bold border-l-4 border-cyan-400 shadow-2xs"
                  : "text-slate-300 hover:bg-white/10 hover:text-white"
              )}
            >
              <div className="flex items-center gap-2.5">
                <FileText className="w-4 h-4 text-cyan-300" />
                <span>Audit &amp; Security Logs</span>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/10 text-cyan-200 border border-white/10">
                {auditLogs.length}
              </span>
            </button>
          </nav>
        </div>

        {/* Bottom Profile & Privacy Shield */}
        <div className="p-3 border-t border-white/10 space-y-2">
          {/* Zero-Knowledge Privacy Badge */}
          <div className="p-2.5 rounded-xl bg-white/5 border border-white/10 flex items-center gap-2">
            <Lock className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span className="text-[10px] text-slate-300 leading-tight">
              Client store privacy enforced via PostgreSQL RLS.
            </span>
          </div>

          {/* Admin User Card & Sign Out */}
          <div className="flex items-center justify-between p-2 rounded-xl bg-white/10 border border-white/10">
            <div className="flex items-center gap-2 truncate">
              <div className="w-7 h-7 rounded-lg bg-cyan-500/20 text-cyan-300 font-bold text-xs flex items-center justify-center border border-cyan-400/30">
                AD
              </div>
              <div className="flex flex-col truncate leading-tight">
                <span className="text-xs font-bold text-white truncate">Master Admin</span>
                <span className="text-[10px] text-cyan-200/70 truncate">admin@whoopit.io</span>
              </div>
            </div>

            <button
              onClick={() => logout()}
              className="w-7 h-7 rounded-lg hover:bg-rose-500/20 text-slate-300 hover:text-rose-300 flex items-center justify-center transition-colors cursor-pointer"
              title="Sign Out"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </aside>

      {/* ======================================================== */}
      {/* 2. ADMIN MAIN VIEWPORT (CLEAN LIGHT THEME)                */}
      {/* ======================================================== */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-[#f4f7f9]">
        {/* Top Header Bar */}
        <header className="h-16 border-b border-slate-200/80 bg-white/80 backdrop-blur-md px-6 sm:px-8 flex items-center justify-between shrink-0 z-20 shadow-2xs">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span className="text-slate-400">Admin Console</span>
              <span>/</span>
              <span className="font-bold text-slate-900 capitalize">{activeTab}</span>
            </div>

            <div className="h-4 w-px bg-slate-200 hidden sm:block" />

            <div className="hidden sm:flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-semibold flex items-center gap-1.5 shadow-2xs">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                PostgreSQL 18 Online
              </span>
              <span className="px-2.5 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-slate-700 text-[10px] font-semibold shadow-2xs">
                Multi-Tenant RLS Active
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={fetchAdminData}
              disabled={isLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-2xs transition-all cursor-pointer"
              title="Refresh live data"
            >
              <RefreshCw className={cn("w-3.5 h-3.5 text-[#0c3843]", isLoading && "animate-spin")} />
              <span className="hidden sm:inline">Refresh</span>
            </button>

            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-700 font-semibold shadow-2xs">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
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
              <div className="border-b border-slate-200/80 pb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
                    <Activity className="w-5 h-5 text-[#0c3843]" />
                    <span>Master Control Room Overview</span>
                  </h2>
                  <p className="text-xs text-slate-500 mt-1">
                    Real-time software distribution, license analytics, and platform health telemetry across all client companies.
                  </p>
                </div>
                <button
                  onClick={() => setIsModalOpen(true)}
                  className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-xl bg-[#0c3843] hover:bg-[#082931] text-white text-xs font-bold transition-all shadow-md shadow-[#0c3843]/20 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Give Software</span>
                </button>
              </div>

              {/* 4 Executive KPI Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Card 1: Clients Given Software */}
                <div
                  onClick={() => handleTabChange("clients", "ALL")}
                  className="p-5 rounded-2xl border border-slate-200/80 bg-white shadow-xs relative overflow-hidden group hover:-translate-y-1.5 hover:shadow-xl hover:shadow-[#0c3843]/10 hover:border-[#0c3843] transition-all duration-300 cursor-pointer select-none"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider group-hover:text-[#0c3843] transition-colors">
                      Clients Given Software
                    </span>
                    <div className="w-10 h-10 rounded-xl bg-[#0c3843]/10 text-[#0c3843] flex items-center justify-center border border-[#0c3843]/15 group-hover:scale-110 group-hover:bg-[#0c3843] group-hover:text-cyan-300 transition-all duration-300 shadow-2xs">
                      <Building2 className="w-5 h-5" />
                    </div>
                  </div>
                  <div className="text-3xl font-extrabold text-slate-900 mt-3 group-hover:text-[#0c3843] transition-colors">
                    {telemetry ? telemetry.total_organizations : clients.length}
                  </div>
                  <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-slate-100 text-[11px]">
                    <div className="flex items-center gap-1.5 text-emerald-600 font-semibold">
                      <TrendingUp className="w-3.5 h-3.5" />
                      <span>{clients.length} Companies Tracked</span>
                    </div>
                    <span className="text-slate-400 group-hover:text-[#0c3843] font-bold flex items-center gap-0.5 transition-colors">
                      View Directory <ChevronRight className="w-3 h-3 group-hover:translate-x-1 transition-transform" />
                    </span>
                  </div>
                </div>

                {/* Card 2: Enterprise Clients */}
                <div
                  onClick={() => handleTabChange("clients", "enterprise")}
                  className="p-5 rounded-2xl border border-slate-200/80 bg-white shadow-xs relative overflow-hidden group hover:-translate-y-1.5 hover:shadow-xl hover:shadow-purple-500/10 hover:border-purple-400 transition-all duration-300 cursor-pointer select-none"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider group-hover:text-purple-600 transition-colors">
                      Enterprise Clients
                    </span>
                    <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center border border-purple-200 group-hover:scale-110 group-hover:bg-purple-600 group-hover:text-white transition-all duration-300 shadow-2xs">
                      <Briefcase className="w-5 h-5" />
                    </div>
                  </div>
                  <div className="text-3xl font-extrabold text-slate-900 mt-3 group-hover:text-purple-700 transition-colors">
                    {telemetry ? telemetry.active_enterprises : 0}
                  </div>
                  <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-slate-100 text-[11px]">
                    <div className="flex items-center gap-1.5 text-purple-600 font-semibold">
                      <Sparkles className="w-3.5 h-3.5 text-purple-500" />
                      <span>Paid &amp; Unlimited Tier</span>
                    </div>
                    <span className="text-slate-400 group-hover:text-purple-600 font-bold flex items-center gap-0.5 transition-colors">
                      Filter Tier <ChevronRight className="w-3 h-3 group-hover:translate-x-1 transition-transform" />
                    </span>
                  </div>
                </div>

                {/* Card 3: Total End-Users */}
                <div
                  onClick={() => handleTabChange("users")}
                  className="p-5 rounded-2xl border border-slate-200/80 bg-white shadow-xs relative overflow-hidden group hover:-translate-y-1.5 hover:shadow-xl hover:shadow-blue-500/10 hover:border-blue-400 transition-all duration-300 cursor-pointer select-none"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider group-hover:text-blue-600 transition-colors">
                      Total End-Users
                    </span>
                    <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-200 group-hover:scale-110 group-hover:bg-blue-600 group-hover:text-white transition-all duration-300 shadow-2xs">
                      <Users className="w-5 h-5" />
                    </div>
                  </div>
                  <div className="text-3xl font-extrabold text-slate-900 mt-3 group-hover:text-blue-700 transition-colors">
                    {usersList.length || (telemetry ? telemetry.total_users : 0)}
                  </div>
                  <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-slate-100 text-[11px]">
                    <div className="flex items-center gap-1.5 text-blue-600 font-semibold">
                      <Users className="w-3.5 h-3.5" />
                      <span>Active Store Staff</span>
                    </div>
                    <span className="text-slate-400 group-hover:text-blue-600 font-bold flex items-center gap-0.5 transition-colors">
                      View Users <ChevronRight className="w-3 h-3 group-hover:translate-x-1 transition-transform" />
                    </span>
                  </div>
                </div>

                {/* Card 4: Total Store SKUs Tracked */}
                <div
                  onClick={() => handleTabChange("clients")}
                  className="p-5 rounded-2xl border border-slate-200/80 bg-white shadow-xs relative overflow-hidden group hover:-translate-y-1.5 hover:shadow-xl hover:shadow-emerald-500/10 hover:border-emerald-400 transition-all duration-300 cursor-pointer select-none"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider group-hover:text-emerald-600 transition-colors">
                      Total Store SKUs Tracked
                    </span>
                    <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-200 group-hover:scale-110 group-hover:bg-emerald-600 group-hover:text-white transition-all duration-300 shadow-2xs">
                      <Boxes className="w-5 h-5" />
                    </div>
                  </div>
                  <div className="text-3xl font-extrabold text-slate-900 mt-3 group-hover:text-emerald-700 transition-colors">
                    {telemetry ? telemetry.total_items.toLocaleString() : 0}
                  </div>
                  <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-slate-100 text-[11px]">
                    <div className="flex items-center gap-1.5 text-emerald-600 font-semibold">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Products in Stores</span>
                    </div>
                    <span className="text-slate-400 group-hover:text-emerald-600 font-bold flex items-center gap-0.5 transition-colors">
                      Client Inventory <ChevronRight className="w-3 h-3 group-hover:translate-x-1 transition-transform" />
                    </span>
                  </div>
                </div>
              </div>

              {/* License Distribution Progress Bar */}
              <div className="p-6 rounded-2xl border border-slate-200/80 bg-white shadow-xs space-y-4 hover:border-slate-300/80 hover:shadow-md transition-all">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <Key className="w-4 h-4 text-amber-500" />
                      <span>Software License Distribution</span>
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Visual allocation breakdown of active commercial packages across {clients.length} client companies. Click any plan to filter clients.
                    </p>
                  </div>
                  <button
                    onClick={() => handleTabChange("licenses")}
                    className="text-xs text-[#0c3843] hover:text-[#082931] font-bold flex items-center gap-1 cursor-pointer px-3 py-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 transition-colors"
                  >
                    <span>Manage Plans</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Progress bar */}
                <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden flex cursor-pointer" onClick={() => handleTabChange("licenses")}>
                  <div
                    style={{
                      width: `${
                        clients.length
                          ? Math.round(((telemetry?.active_enterprises || 0) / clients.length) * 100)
                          : 70
                      }%`,
                    }}
                    className="bg-purple-500 hover:bg-purple-600 transition-all"
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
                    className="bg-blue-500 hover:bg-blue-600 transition-all"
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
                    className="bg-amber-400 hover:bg-amber-500 transition-all"
                    title="30-Day Trial"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                  <div
                    onClick={() => handleTabChange("clients", "enterprise")}
                    className="flex items-center justify-between p-2.5 rounded-xl bg-purple-50/50 hover:bg-purple-100/70 border border-purple-100/70 cursor-pointer transition-colors group"
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-md bg-purple-500 group-hover:scale-110 transition-transform" />
                      <span className="text-xs text-purple-900 font-semibold">Enterprise:</span>
                    </div>
                    <span className="text-xs font-mono font-bold text-purple-700">
                      {telemetry?.active_enterprises || 0} Clients &rarr;
                    </span>
                  </div>

                  <div
                    onClick={() => handleTabChange("clients", "standard")}
                    className="flex items-center justify-between p-2.5 rounded-xl bg-blue-50/50 hover:bg-blue-100/70 border border-blue-100/70 cursor-pointer transition-colors group"
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-md bg-blue-500 group-hover:scale-110 transition-transform" />
                      <span className="text-xs text-blue-900 font-semibold">Standard:</span>
                    </div>
                    <span className="text-xs font-mono font-bold text-blue-700">
                      {telemetry?.active_standards || 0} Clients &rarr;
                    </span>
                  </div>

                  <div
                    onClick={() => handleTabChange("clients", "trial")}
                    className="flex items-center justify-between p-2.5 rounded-xl bg-amber-50/50 hover:bg-amber-100/70 border border-amber-100/70 cursor-pointer transition-colors group"
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-md bg-amber-400 group-hover:scale-110 transition-transform" />
                      <span className="text-xs text-amber-900 font-semibold">30-Day Trial:</span>
                    </div>
                    <span className="text-xs font-mono font-bold text-amber-700">
                      {telemetry?.active_trials || 0} Clients &rarr;
                    </span>
                  </div>
                </div>
              </div>

              {/* Recent Audit Events Ticker */}
              <div className="p-6 rounded-2xl border border-slate-200/80 bg-white shadow-xs space-y-4 hover:border-slate-300/80 hover:shadow-md transition-all">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-[#0c3843]" />
                    <span className="text-sm font-bold text-slate-900">Recent Platform Audit Events</span>
                  </div>
                  <button
                    onClick={() => handleTabChange("audit")}
                    className="text-xs text-[#0c3843] hover:text-[#082931] font-bold flex items-center gap-1 cursor-pointer px-3 py-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 transition-colors"
                  >
                    <span>View All {auditLogs.length} Logs</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="divide-y divide-slate-100">
                  {auditLogs.slice(0, 4).map((log) => (
                    <div
                      key={log.audit_id}
                      onClick={() => handleTabChange("audit")}
                      className="py-3 flex items-center justify-between text-xs hover:bg-slate-50 px-2 rounded-xl transition-colors cursor-pointer group"
                    >
                      <div className="flex items-center gap-3">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 group-hover:scale-125 transition-transform" />
                        <div>
                          <span className="font-bold text-slate-900 group-hover:text-[#0c3843] transition-colors">{log.action}</span>
                          <span className="text-slate-500 ml-2">in {log.org_name}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 text-slate-500 font-mono text-[11px]">
                        <span>{log.user_email}</span>
                        <span>{new Date(log.created_at).toLocaleTimeString()}</span>
                        <ChevronRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-[#0c3843] group-hover:translate-x-0.5 transition-all" />
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
              <div className="p-4 rounded-2xl border border-slate-200/80 bg-white shadow-xs flex flex-col md:flex-row items-center justify-between gap-3">
                <div className="relative w-full md:w-96">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search client by company name, slug, or ID..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-4 py-2.5 rounded-xl text-xs bg-slate-50 border border-slate-200 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-[#0c3843]/20 focus:border-[#0c3843] text-slate-900 placeholder:text-slate-400 transition-all"
                  />
                </div>

                <div className="flex items-center gap-3 w-full md:w-auto">
                  <span className="text-xs text-slate-500 shrink-0 font-medium">Plan Filter:</span>
                  <select
                    value={planFilter}
                    onChange={(e) => setPlanFilter(e.target.value)}
                    className="px-3 py-2 rounded-xl text-xs bg-slate-50 border border-slate-200 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-[#0c3843]/20 focus:border-[#0c3843] text-slate-900 cursor-pointer font-medium"
                  >
                    <option value="ALL">All License Plans</option>
                    <option value="enterprise">Enterprise</option>
                    <option value="standard">Standard</option>
                    <option value="trial">30-Day Trial</option>
                  </select>

                  <button
                    onClick={() => setIsModalOpen(true)}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#0c3843] hover:bg-[#082931] text-white text-xs font-bold transition-all shadow-md shadow-[#0c3843]/20 cursor-pointer shrink-0"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Give Software</span>
                  </button>
                </div>
              </div>

              {/* Active Filter Indicator if arrived from KPI cards */}
              {(planFilter !== "ALL" || searchQuery) && (
                <div className="px-4 py-2.5 rounded-2xl bg-white border border-[#0c3843]/20 shadow-xs flex items-center justify-between text-xs text-slate-800 animate-in fade-in">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[#0c3843] animate-pulse" />
                    <span>
                      Filtered view: {planFilter !== "ALL" && (
                        <span className="font-extrabold uppercase text-[#0c3843] bg-[#0c3843]/10 px-2 py-0.5 rounded-md mr-1.5 border border-[#0c3843]/20">
                          {planFilter} Tier
                        </span>
                      )}
                      {searchQuery && (
                        <span className="text-slate-600">Keyword: &quot;{searchQuery}&quot;</span>
                      )}
                      <span className="text-slate-500 font-semibold ml-1">({filteredClients.length} matching companies found)</span>
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      setPlanFilter("ALL");
                      setSearchQuery("");
                    }}
                    className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs cursor-pointer transition-colors"
                  >
                    Reset Filters ✕
                  </button>
                </div>
              )}

              {/* Master Clients Table */}
              <div className="rounded-2xl border border-slate-200/80 bg-white shadow-xs overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-white">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-[#0c3843]" />
                      <span>Clients &amp; Companies Directory</span>
                      <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                        {filteredClients.length} Tracked
                      </span>
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Jisko bhi humne software dia hai wo yahan listed hai. Unke license plans aur operational activity logs yahan se control karein.
                    </p>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full min-w-[840px] text-left text-xs">
                    <thead className="bg-slate-50/90 text-slate-600 border-b border-slate-200">
                      <tr>
                        <th className="py-3 px-4 font-bold uppercase tracking-wider text-[11px] min-w-[170px]">Client Company</th>
                        <th className="py-3 px-2 font-bold uppercase tracking-wider text-[11px] text-center min-w-[85px]">License Tier</th>
                        <th className="py-3 px-2 font-bold uppercase tracking-wider text-[11px] text-center min-w-[80px]">Status</th>
                        <th className="py-3 px-2 font-bold uppercase tracking-wider text-[11px] text-center min-w-[55px]">Staff</th>
                        <th className="py-3 px-2 font-bold uppercase tracking-wider text-[11px] text-center min-w-[55px]">SKUs</th>
                        <th className="py-3 px-2 font-bold uppercase tracking-wider text-[11px] text-center min-w-[55px]">Moves</th>
                        <th className="py-3 px-2 font-bold uppercase tracking-wider text-[11px] text-center min-w-[85px]">Given On</th>
                        <th className="py-3 px-4 font-bold uppercase tracking-wider text-[11px] text-right min-w-[210px] whitespace-nowrap">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {filteredClients.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="py-12 text-center text-slate-400">
                            <Building2 className="w-8 h-8 mx-auto mb-2 text-slate-300 stroke-1" />
                            <p className="font-semibold text-slate-500">
                              No matching clients found.
                            </p>
                          </td>
                        </tr>
                      ) : (
                        filteredClients.map((c) => (
                          <tr key={c.org_id} className="hover:bg-slate-50/70 transition-colors">
                            <td className="py-3.5 px-4">
                              <div className="font-bold text-slate-900 flex items-center gap-2">
                                <span>{c.name}</span>
                              </div>
                              <div className="text-[11px] font-mono text-slate-500 mt-0.5 flex items-center gap-1.5">
                                <span>slug: {c.slug}</span>
                                <span>&bull;</span>
                                <span className="text-[10px] text-slate-400">{c.org_id.slice(0, 8)}...</span>
                              </div>
                            </td>

                            <td className="py-3.5 px-2 text-center">
                              <span
                                className={cn(
                                  "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border",
                                  c.plan.toLowerCase() === "enterprise"
                                    ? "bg-purple-50 text-purple-700 border-purple-200"
                                    : c.plan.toLowerCase() === "standard"
                                    ? "bg-blue-50 text-blue-700 border-blue-200"
                                    : "bg-amber-50 text-amber-700 border-amber-200"
                                )}
                              >
                                {c.plan}
                              </span>
                            </td>

                            <td className="py-3.5 px-2 text-center">
                              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-600 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                <span>Active</span>
                              </span>
                            </td>

                            <td className="py-3.5 px-2 text-center font-mono font-semibold text-slate-800">
                              {c.user_count}
                            </td>

                            <td className="py-3.5 px-2 text-center font-mono font-semibold text-slate-800">
                              {c.item_count}
                            </td>

                            <td className="py-3.5 px-2 text-center font-mono font-medium text-slate-500">
                              {c.movement_count}
                            </td>

                            <td className="py-3.5 px-2 text-center text-slate-500 text-[11px] whitespace-nowrap">
                              {new Date(c.created_at).toLocaleDateString()}
                            </td>

                            <td className="py-3.5 px-4 text-right whitespace-nowrap">
                              <div className="flex items-center justify-end gap-1.5 shrink-0">
                                <button
                                  onClick={() => openClientModal(c, "details")}
                                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-800 transition-all cursor-pointer border border-slate-200 shrink-0 whitespace-nowrap"
                                  title="Manage this client's license & details"
                                >
                                  <Sliders className="w-3.5 h-3.5 text-[#0c3843]" />
                                  <span>Manage</span>
                                </button>
                                <button
                                  onClick={() => openClientModal(c, "activity")}
                                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-[#0c3843] hover:bg-[#08262e] text-white transition-all cursor-pointer shrink-0 whitespace-nowrap shadow-xs"
                                  title="View operational activity logs for this client"
                                >
                                  <Activity className="w-3.5 h-3.5 text-white" />
                                  <span>Activity Logs</span>
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
              <div className="border-b border-slate-200/80 pb-4">
                <h2 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
                  <Key className="w-5 h-5 text-amber-500" />
                  <span>License &amp; Plan Tiers</span>
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  Configure and monitor the 3 standard software distribution packages given to clients.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Enterprise Tier */}
                <div
                  onClick={() => handleTabChange("clients", "enterprise")}
                  className="p-6 rounded-3xl border border-purple-200 bg-white shadow-xs space-y-4 hover:-translate-y-1.5 hover:shadow-xl hover:border-purple-400 transition-all duration-300 cursor-pointer group flex flex-col justify-between"
                >
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-purple-50 text-purple-700 border border-purple-200">
                        Enterprise Tier
                      </span>
                      <span className="text-2xl font-extrabold text-slate-900 group-hover:text-purple-700 transition-colors">
                        {telemetry?.active_enterprises || 0} Clients
                      </span>
                    </div>
                    <h3 className="text-lg font-bold text-slate-900">Full Commercial License</h3>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      Unlimited warehouses, full barcode engine, cryptographic tool custody, and double-entry stock ledger.
                    </p>
                    <ul className="text-xs text-slate-700 space-y-2 pt-2 border-t border-slate-100">
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="w-3.5 h-3.5 text-purple-600" />
                        <span>Unlimited items &amp; movements</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="w-3.5 h-3.5 text-purple-600" />
                        <span>Custom Fields Builder</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="w-3.5 h-3.5 text-purple-600" />
                        <span>Priority Support &amp; RLS Isolation</span>
                      </li>
                    </ul>
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleTabChange("clients", "enterprise");
                    }}
                    className="w-full mt-4 py-2.5 px-3.5 rounded-xl bg-purple-50 hover:bg-purple-600 text-purple-700 hover:text-white border border-purple-200 text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-2xs group-hover:bg-purple-600 group-hover:text-white"
                  >
                    <span>View All {telemetry?.active_enterprises || 0} Enterprise Clients</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Standard Tier */}
                <div
                  onClick={() => handleTabChange("clients", "standard")}
                  className="p-6 rounded-3xl border border-blue-200 bg-white shadow-xs space-y-4 hover:-translate-y-1.5 hover:shadow-xl hover:border-blue-400 transition-all duration-300 cursor-pointer group flex flex-col justify-between"
                >
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200">
                        Standard Tier
                      </span>
                      <span className="text-2xl font-extrabold text-slate-900 group-hover:text-blue-700 transition-colors">
                        {telemetry?.active_standards || 0} Clients
                      </span>
                    </div>
                    <h3 className="text-lg font-bold text-slate-900">Store Commercial License</h3>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      Up to 3 standard warehouse locations, purchase &amp; sales invoices, and stock valuation.
                    </p>
                    <ul className="text-xs text-slate-700 space-y-2 pt-2 border-t border-slate-100">
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />
                        <span>Up to 5,000 active SKUs</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />
                        <span>Standard Staff Role permissions</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />
                        <span>Automated Barcode Generation</span>
                      </li>
                    </ul>
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleTabChange("clients", "standard");
                    }}
                    className="w-full mt-4 py-2.5 px-3.5 rounded-xl bg-blue-50 hover:bg-blue-600 text-blue-700 hover:text-white border border-blue-200 text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-2xs group-hover:bg-blue-600 group-hover:text-white"
                  >
                    <span>View All {telemetry?.active_standards || 0} Standard Clients</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Trial Tier */}
                <div
                  onClick={() => handleTabChange("clients", "trial")}
                  className="p-6 rounded-3xl border border-amber-200 bg-white shadow-xs space-y-4 hover:-translate-y-1.5 hover:shadow-xl hover:border-amber-400 transition-all duration-300 cursor-pointer group flex flex-col justify-between"
                >
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-200">
                        30-Day Trial
                      </span>
                      <span className="text-2xl font-extrabold text-slate-900 group-hover:text-amber-700 transition-colors">
                        {telemetry?.active_trials || 0} Clients
                      </span>
                    </div>
                    <h3 className="text-lg font-bold text-slate-900">Evaluation Package</h3>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      Complimentary 30-day evaluation given to potential client shops to test their store flow.
                    </p>
                    <ul className="text-xs text-slate-700 space-y-2 pt-2 border-t border-slate-100">
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="w-3.5 h-3.5 text-amber-500" />
                        <span>30-Day automated expiry timer</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="w-3.5 h-3.5 text-amber-500" />
                        <span>1-Click upgrade to Enterprise</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="w-3.5 h-3.5 text-amber-500" />
                        <span>Fresh Start (0 Data) Isolation</span>
                      </li>
                    </ul>
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleTabChange("clients", "trial");
                    }}
                    className="w-full mt-4 py-2.5 px-3.5 rounded-xl bg-amber-50 hover:bg-amber-600 text-amber-700 hover:text-white border border-amber-200 text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-2xs group-hover:bg-amber-600 group-hover:text-white"
                  >
                    <span>View All {telemetry?.active_trials || 0} Trial Clients</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Tier Feature Matrix Comparison Table */}
              <div className="rounded-3xl border border-slate-200/80 bg-white shadow-xs overflow-hidden space-y-3 p-6">
                <div className="border-b border-slate-100 pb-3">
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-[#0c3843]" />
                    <span>Commercial License Feature Matrix Comparison</span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Detailed feature entitlement breakdown across Enterprise, Standard, and 30-Day Trial commercial plans.
                  </p>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] text-left text-xs">
                    <thead className="bg-slate-50/90 text-slate-700 border-b border-slate-200">
                      <tr>
                        <th className="py-3 px-4 font-bold uppercase tracking-wider text-[11px] min-w-[260px]">Feature / Entitlement</th>
                        <th className="py-3 px-4 font-bold uppercase tracking-wider text-[11px] text-purple-700 min-w-[160px]">Enterprise</th>
                        <th className="py-3 px-4 font-bold uppercase tracking-wider text-[11px] text-blue-700 min-w-[160px]">Standard</th>
                        <th className="py-3 px-4 font-bold uppercase tracking-wider text-[11px] text-amber-700 min-w-[160px]">30-Day Trial</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-600">
                      <tr className="hover:bg-slate-50/50">
                        <td className="py-3 px-4 font-bold text-slate-800">Multi-Warehouse Locations</td>
                        <td className="py-3 px-4 text-purple-700 font-bold">Unlimited</td>
                        <td className="py-3 px-4 text-slate-700 font-semibold">Up to 3 Locations</td>
                        <td className="py-3 px-4 text-slate-500">1 Location</td>
                      </tr>
                      <tr className="hover:bg-slate-50/50">
                        <td className="py-3 px-4 font-bold text-slate-800">Catalog SKU Capacity</td>
                        <td className="py-3 px-4 text-purple-700 font-bold">Unlimited</td>
                        <td className="py-3 px-4 text-slate-700 font-semibold">Up to 5,000 SKUs</td>
                        <td className="py-3 px-4 text-slate-500">200 Evaluation SKUs</td>
                      </tr>
                      <tr className="hover:bg-slate-50/50">
                        <td className="py-3 px-4 font-bold text-slate-800">Double-Entry Stock Ledger</td>
                        <td className="py-3 px-4 text-emerald-600 font-bold">✓ Full Cryptographic</td>
                        <td className="py-3 px-4 text-emerald-600 font-bold">✓ Included</td>
                        <td className="py-3 px-4 text-emerald-600 font-bold">✓ Included</td>
                      </tr>
                      <tr className="hover:bg-slate-50/50">
                        <td className="py-3 px-4 font-bold text-slate-800">Barcode Engine (EAN-13, QR)</td>
                        <td className="py-3 px-4 text-emerald-600 font-bold">✓ Thermal &amp; A4 Print</td>
                        <td className="py-3 px-4 text-emerald-600 font-bold">✓ Standard Print</td>
                        <td className="py-3 px-4 text-emerald-600 font-bold">✓ Standard Print</td>
                      </tr>
                      <tr className="hover:bg-slate-50/50">
                        <td className="py-3 px-4 font-bold text-slate-800">Custody Vouchers &amp; Signatures</td>
                        <td className="py-3 px-4 text-emerald-600 font-bold">✓ Included</td>
                        <td className="py-3 px-4 text-slate-400">— Not Included</td>
                        <td className="py-3 px-4 text-slate-400">— Not Included</td>
                      </tr>
                      <tr className="hover:bg-slate-50/50">
                        <td className="py-3 px-4 font-bold text-slate-800">Custom Fields Builder</td>
                        <td className="py-3 px-4 text-emerald-600 font-bold">✓ Dynamic Schema Builder</td>
                        <td className="py-3 px-4 text-slate-400">— Standard Fields</td>
                        <td className="py-3 px-4 text-slate-400">— Standard Fields</td>
                      </tr>
                      <tr className="hover:bg-slate-50/50">
                        <td className="py-3 px-4 font-bold text-slate-800">Row-Level Security (RLS) Isolation</td>
                        <td className="py-3 px-4 text-emerald-600 font-bold">✓ Enforced</td>
                        <td className="py-3 px-4 text-emerald-600 font-bold">✓ Enforced</td>
                        <td className="py-3 px-4 text-emerald-600 font-bold">✓ Enforced</td>
                      </tr>
                      <tr className="hover:bg-slate-50/50">
                        <td className="py-3 px-4 font-bold text-slate-800">Priority SLA &amp; Support</td>
                        <td className="py-3 px-4 text-purple-700 font-bold">24/7 Dedicated Support</td>
                        <td className="py-3 px-4 text-slate-700 font-semibold">Standard Email Support</td>
                        <td className="py-3 px-4 text-slate-500">Community Support</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ==================================================== */}
          {/* TAB 4: ALL STORE USERS                               */}
          {/* ==================================================== */}
          {activeTab === "users" && (
            <div className="space-y-6">
              <div className="border-b border-slate-200/80 pb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
                    <Users className="w-5 h-5 text-[#0c3843]" />
                    <span>Platform End-Users Directory</span>
                  </h2>
                  <p className="text-xs text-slate-500 mt-1">
                    Global staff and managers across all client stores using the Whoopit IMS software ({filteredUsers.length} active).
                  </p>
                </div>
              </div>

              {/* Users Filter Bar */}
              <div className="p-4 rounded-2xl border border-slate-200/80 bg-white shadow-xs flex flex-col md:flex-row items-center justify-between gap-3">
                <div className="relative w-full md:w-96">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search by user email, name, or company..."
                    value={userSearchQuery}
                    onChange={(e) => setUserSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-4 py-2.5 rounded-xl text-xs bg-slate-50 border border-slate-200 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-[#0c3843]/20 focus:border-[#0c3843] text-slate-900 placeholder:text-slate-400 transition-all"
                  />
                </div>

                <div className="flex items-center gap-3 w-full md:w-auto">
                  <span className="text-xs text-slate-500 shrink-0 font-medium">Role Filter:</span>
                  <select
                    value={userRoleFilter}
                    onChange={(e) => setUserRoleFilter(e.target.value)}
                    className="px-3 py-2 rounded-xl text-xs bg-slate-50 border border-slate-200 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-[#0c3843]/20 focus:border-[#0c3843] text-slate-900 cursor-pointer font-medium"
                  >
                    <option value="ALL">All Roles</option>
                    <option value="owner">Owner</option>
                    <option value="admin">Admin</option>
                    <option value="staff">Staff</option>
                    <option value="employee">Employee</option>
                  </select>
                </div>
              </div>

              {/* Active Filter Indicator */}
              {(userRoleFilter !== "ALL" || userSearchQuery) && (
                <div className="px-4 py-2.5 rounded-2xl bg-white border border-[#0c3843]/20 shadow-xs flex items-center justify-between text-xs text-slate-800 animate-in fade-in">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[#0c3843] animate-pulse" />
                    <span>
                      Filtered view: {userRoleFilter !== "ALL" && (
                        <span className="font-extrabold uppercase text-[#0c3843] bg-[#0c3843]/10 px-2 py-0.5 rounded-md mr-1.5 border border-[#0c3843]/20">
                          {userRoleFilter} Role
                        </span>
                      )}
                      {userSearchQuery && (
                        <span className="text-slate-600">Keyword: &quot;{userSearchQuery}&quot;</span>
                      )}
                      <span className="text-slate-500 font-semibold ml-1">({filteredUsers.length} matching store accounts found)</span>
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      setUserRoleFilter("ALL");
                      setUserSearchQuery("");
                    }}
                    className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs cursor-pointer transition-colors"
                  >
                    Reset Filters ✕
                  </button>
                </div>
              )}

              {/* Users Table */}
              <div className="rounded-2xl border border-slate-200/80 bg-white shadow-xs overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[950px] text-left text-xs">
                    <thead className="bg-slate-50/90 text-slate-600 border-b border-slate-200">
                      <tr>
                        <th className="py-3.5 px-6 font-bold uppercase tracking-wider text-[11px] min-w-[220px]">User Account</th>
                        <th className="py-3.5 px-6 font-bold uppercase tracking-wider text-[11px] min-w-[200px]">Client Company</th>
                        <th className="py-3.5 px-6 font-bold uppercase tracking-wider text-[11px] text-center min-w-[120px]">Assigned Role</th>
                        <th className="py-3.5 px-6 font-bold uppercase tracking-wider text-[11px] text-center min-w-[100px]">Status</th>
                        <th className="py-3.5 px-6 font-bold uppercase tracking-wider text-[11px] min-w-[120px]">Created Date</th>
                        <th className="py-3.5 px-6 font-bold uppercase tracking-wider text-[11px] text-right min-w-[140px] whitespace-nowrap">Security</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {filteredUsers.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-12 text-center text-slate-400">
                            <Users className="w-8 h-8 mx-auto mb-2 text-slate-300 stroke-1" />
                            <p className="font-semibold text-slate-500">No matching store users found.</p>
                          </td>
                        </tr>
                      ) : (
                        filteredUsers.map((u) => (
                          <tr key={u.user_id} className="hover:bg-slate-50/70 transition-colors">
                            <td className="py-4 px-6">
                              <div className="font-bold text-slate-900">{u.name || "Store User"}</div>
                              <div className="text-[11px] font-mono text-slate-500 mt-0.5">{u.email}</div>
                            </td>
                            <td className="py-4 px-6 text-slate-700 font-semibold">
                              <button
                                onClick={() => handleTabChange("clients", undefined, u.org_name)}
                                className="font-semibold text-slate-800 hover:text-[#0c3843] hover:underline cursor-pointer flex items-center gap-1 group text-left"
                                title="View this client in directory"
                              >
                                <span>{u.org_name}</span>
                                <ChevronRight className="w-3 h-3 text-slate-300 group-hover:text-[#0c3843] group-hover:translate-x-0.5 transition-all" />
                              </button>
                            </td>
                            <td className="py-4 px-6 text-center">
                              <span
                                className={cn(
                                  "px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase border",
                                  u.role === "admin" || u.role === "owner"
                                    ? "bg-[#0c3843]/10 text-[#0c3843] border-[#0c3843]/20"
                                    : "bg-slate-100 text-slate-700 border-slate-200"
                                )}
                              >
                                {u.role}
                              </span>
                            </td>
                            <td className="py-4 px-6 text-center">
                              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-600 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                <span>Active</span>
                              </span>
                            </td>
                            <td className="py-4 px-6 text-slate-500 text-[11px]">
                              {new Date(u.created_at).toLocaleDateString()}
                            </td>
                            <td className="py-4 px-6 text-right">
                              <span className="text-[10px] font-mono text-slate-600 px-2 py-1 rounded-md bg-slate-100 border border-slate-200">
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
              <div className="border-b border-slate-200/80 pb-4">
                <h2 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
                  <Database className="w-5 h-5 text-emerald-600" />
                  <span>System &amp; Infrastructure Diagnostics</span>
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  Status of underlying database containers, memory cache, storage cluster, and cryptographic security.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-5 rounded-2xl border border-emerald-200 bg-white shadow-xs space-y-3 hover:-translate-y-1.5 hover:shadow-xl hover:border-emerald-400 transition-all duration-300 group cursor-default">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-200 group-hover:scale-110 transition-transform">
                        <Database className="w-4 h-4 text-emerald-600" />
                      </div>
                      PostgreSQL 18 Multi-Tenant Engine
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      HEALTHY
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Port: 5432 &bull; Row-Level Security (RLS) active on all tables. Each client has isolated cryptographic data boundaries.
                  </p>
                </div>

                <div className="p-5 rounded-2xl border border-indigo-200 bg-white shadow-xs space-y-3 hover:-translate-y-1.5 hover:shadow-xl hover:border-indigo-400 transition-all duration-300 group cursor-default">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center border border-indigo-200 group-hover:scale-110 transition-transform">
                        <Cpu className="w-4 h-4 text-indigo-600" />
                      </div>
                      Valkey 8.0 In-Memory Cache
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 text-[10px] font-bold flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
                      CONNECTED
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Port: 6379 &bull; Fast stock reservation caching, distributed lock keys, and session tokens.
                  </p>
                </div>

                <div className="p-5 rounded-2xl border border-blue-200 bg-white shadow-xs space-y-3 hover:-translate-y-1.5 hover:shadow-xl hover:border-blue-400 transition-all duration-300 group cursor-default">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-200 group-hover:scale-110 transition-transform">
                        <HardDrive className="w-4 h-4 text-blue-600" />
                      </div>
                      SeaweedFS Object Storage
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-bold flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                      READY
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Port: 8888 / 9000 &bull; S3-compatible asset storage for barcode label PNGs and PDF custody vouchers.
                  </p>
                </div>

                <div className="p-5 rounded-2xl border border-purple-200 bg-white shadow-xs space-y-3 hover:-translate-y-1.5 hover:shadow-xl hover:border-purple-400 transition-all duration-300 group cursor-default">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center border border-purple-200 group-hover:scale-110 transition-transform">
                        <Mail className="w-4 h-4 text-purple-600" />
                      </div>
                      Mailpit SMTP Server
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200 text-[10px] font-bold flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse" />
                      READY
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Port: 1025 (SMTP) / 8025 (Web UI) &bull; Outgoing email alerts and low stock digest notifications.
                  </p>
                </div>
              </div>

              {/* Architectural Security & Privacy Pillars */}
              <div className="p-6 rounded-2xl border border-slate-200 bg-white shadow-xs space-y-4">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <span>Data Confidentiality &amp; Zero-Knowledge Isolation</span>
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs text-slate-600">
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
                    <span className="font-bold text-slate-900 flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5 text-emerald-600" />
                      Tenant Privacy Boundaries
                    </span>
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      The Master Admin portal can only manage organization plans, staff counts, and audit logs. Store invoices and customer stock levels are inaccessible to preserve complete business privacy.
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
                    <span className="font-bold text-slate-900 flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#0c3843]" />
                      PostgreSQL Row-Level Security
                    </span>
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      Every single query is bound strictly to <code className="text-[#0c3843] font-bold">app.org_id</code> at the kernel level. No tenant can ever read another tenant&apos;s data.
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
              <div className="border-b border-slate-200/80 pb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
                    <FileText className="w-5 h-5 text-[#0c3843]" />
                    <span>Platform Security &amp; Audit Trail</span>
                  </h2>
                  <p className="text-xs text-slate-500 mt-1">
                    Cryptographic log trail of administrative actions, software provisioning, and security events ({filteredAuditLogs.length} events).
                  </p>
                </div>
              </div>

              {/* Audit Search & Filter Bar */}
              <div className="p-4 rounded-2xl border border-slate-200/80 bg-white shadow-xs flex flex-col md:flex-row items-center justify-between gap-3">
                <div className="relative w-full md:w-96">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search by action, actor email, company, or ID..."
                    value={auditSearchQuery}
                    onChange={(e) => setAuditSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-4 py-2.5 rounded-xl text-xs bg-slate-50 border border-slate-200 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-[#0c3843]/20 focus:border-[#0c3843] text-slate-900 placeholder:text-slate-400 transition-all"
                  />
                </div>

                <div className="flex items-center gap-3 w-full md:w-auto">
                  <span className="text-xs text-slate-500 shrink-0 font-medium">Action Filter:</span>
                  <select
                    value={auditActionFilter}
                    onChange={(e) => setAuditActionFilter(e.target.value)}
                    className="px-3 py-2 rounded-xl text-xs bg-slate-50 border border-slate-200 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-[#0c3843]/20 focus:border-[#0c3843] text-slate-900 cursor-pointer font-medium"
                  >
                    <option value="ALL">All Actions</option>
                    <option value="PROVISION">Provisioning</option>
                    <option value="UPDATE_PLAN">Plan Updates</option>
                    <option value="LOGIN">Auth &amp; Login</option>
                    <option value="RECONCILIATION">Reconciliation</option>
                  </select>
                </div>
              </div>

              {/* Active Filter Indicator */}
              {(auditActionFilter !== "ALL" || auditSearchQuery) && (
                <div className="px-4 py-2.5 rounded-2xl bg-white border border-[#0c3843]/20 shadow-xs flex items-center justify-between text-xs text-slate-800 animate-in fade-in">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[#0c3843] animate-pulse" />
                    <span>
                      Filtered view: {auditActionFilter !== "ALL" && (
                        <span className="font-extrabold uppercase text-[#0c3843] bg-[#0c3843]/10 px-2 py-0.5 rounded-md mr-1.5 border border-[#0c3843]/20">
                          {auditActionFilter} Action
                        </span>
                      )}
                      {auditSearchQuery && (
                        <span className="text-slate-600">Keyword: &quot;{auditSearchQuery}&quot;</span>
                      )}
                      <span className="text-slate-500 font-semibold ml-1">({filteredAuditLogs.length} matching events found)</span>
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      setAuditActionFilter("ALL");
                      setAuditSearchQuery("");
                    }}
                    className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs cursor-pointer transition-colors"
                  >
                    Reset Filters ✕
                  </button>
                </div>
              )}

              {/* Audit Table */}
              <div className="rounded-2xl border border-slate-200/80 bg-white shadow-xs overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1050px] text-left text-xs">
                    <thead className="bg-slate-50/90 text-slate-600 border-b border-slate-200">
                      <tr>
                        <th className="py-3.5 px-6 font-bold uppercase tracking-wider text-[11px] min-w-[160px] whitespace-nowrap">Timestamp</th>
                        <th className="py-3.5 px-6 font-bold uppercase tracking-wider text-[11px] min-w-[150px] whitespace-nowrap">Action / Event</th>
                        <th className="py-3.5 px-6 font-bold uppercase tracking-wider text-[11px] min-w-[180px]">Entity Type &amp; ID</th>
                        <th className="py-3.5 px-6 font-bold uppercase tracking-wider text-[11px] min-w-[180px]">Client Company</th>
                        <th className="py-3.5 px-6 font-bold uppercase tracking-wider text-[11px] min-w-[180px]">Actor / User</th>
                        <th className="py-3.5 px-6 font-bold uppercase tracking-wider text-[11px] text-right min-w-[120px] whitespace-nowrap">IP Address</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {filteredAuditLogs.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-12 text-center text-slate-400">
                            <FileText className="w-8 h-8 mx-auto mb-2 text-slate-300 stroke-1" />
                            <p className="font-semibold text-slate-500">No matching audit events recorded.</p>
                          </td>
                        </tr>
                      ) : (
                        filteredAuditLogs.map((ev) => (
                          <tr key={ev.audit_id} className="hover:bg-slate-50/70 transition-colors">
                            <td className="py-4 px-6 text-slate-500 font-mono text-[11px]">
                              {new Date(ev.created_at).toLocaleString()}
                            </td>
                            <td className="py-4 px-6">
                              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#0c3843]/10 text-[#0c3843] border border-[#0c3843]/20">
                                {ev.action}
                              </span>
                            </td>
                            <td className="py-4 px-6">
                              <div className="font-bold text-slate-900 capitalize">{ev.entity_type}</div>
                              <div className="text-[10px] font-mono text-slate-400 mt-0.5 truncate max-w-[140px]">
                                {ev.entity_id}
                              </div>
                            </td>
                            <td className="py-4 px-6 text-slate-800 font-semibold">
                              <button
                                onClick={() => handleTabChange("clients", undefined, ev.org_name)}
                                className="font-semibold text-slate-800 hover:text-[#0c3843] hover:underline cursor-pointer"
                                title="View client"
                              >
                                {ev.org_name}
                              </button>
                            </td>
                            <td className="py-4 px-6 font-mono text-[11px] text-slate-500">
                              {ev.user_email}
                            </td>
                            <td className="py-4 px-6 text-right font-mono text-[11px] text-slate-400">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="w-full max-w-lg bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-5 text-slate-900">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[#0c3843]/10 text-[#0c3843] flex items-center justify-center border border-[#0c3843]/20">
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-base">Give Software to New Client</h3>
                  <p className="text-xs text-slate-500">
                    Creates an isolated multi-tenant workspace &amp; store manager credentials.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center transition-colors cursor-pointer text-lg"
              >
                &times;
              </button>
            </div>

            {createdCredentials ? (
              <div className="space-y-4">
                <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 space-y-1">
                  <div className="flex items-center gap-2 font-bold text-sm text-emerald-900">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>Software Workspace Provisioned Successfully!</span>
                  </div>
                  <p className="text-xs text-emerald-700">
                    A completely clean, isolated software instance has been generated for <strong>{createdCredentials.name}</strong>.
                  </p>
                </div>

                {/* Credentials Handover Box */}
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3 font-mono text-xs">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-200 font-sans">
                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                      Client Handover Credentials
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#0c3843]/10 text-[#0c3843] border border-[#0c3843]/20">
                      {createdCredentials.plan.toUpperCase()} TIER
                    </span>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Company Name:</span>
                      <span className="text-slate-900 font-bold">{createdCredentials.name}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Store Manager Email:</span>
                      <span className="text-[#0c3843] font-bold">{createdCredentials.email}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Initial Password:</span>
                      <span className="text-emerald-700 font-bold">{createdCredentials.password}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Initial State:</span>
                      <span className="text-amber-700 font-bold flex items-center gap-1">
                        <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                        0 Products &bull; Fresh Start
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Isolation:</span>
                      <span className="text-slate-700 font-semibold">PostgreSQL 18 RLS Enforced</span>
                    </div>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-slate-100 border border-slate-200 text-[11px] text-slate-600 leading-relaxed">
                  💡 <strong>How it works:</strong> Give these credentials to the client. When they log in, they will be taken directly to their own store software (<code className="text-[#0c3843] font-bold">/</code>) with <strong>zero existing data</strong> so they can start fresh.
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
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
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#0c3843] hover:bg-[#082931] text-white font-bold transition-all shadow-md shadow-[#0c3843]/20 cursor-pointer text-xs"
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
                    className="px-4 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-700 font-semibold cursor-pointer text-xs"
                  >
                    Done &amp; Close
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleCreateClient} className="space-y-4 text-xs">
                {/* 0-Data Guarantee Banner */}
                <div className="p-3.5 rounded-2xl bg-indigo-50 border border-indigo-100 text-indigo-900 text-xs flex items-start gap-2.5">
                  <Sparkles className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-indigo-950 block font-bold">✨ Fresh Start Guarantee:</strong>
                    <span className="text-[11px] text-indigo-700">
                      When this company logs in, their workspace will be <strong>100% clean with 0 data</strong> (0 products, 0 valuation, 0 movements) under isolated database Row Security.
                    </span>
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
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
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 focus:bg-white focus:border-[#0c3843] focus:ring-2 focus:ring-[#0c3843]/10 outline-none transition-all"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">
                        Custom URL Slug
                      </label>
                      <input
                        type="text"
                        placeholder="al-madina"
                        value={clientSlug}
                        onChange={(e) => setClientSlug(e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 font-mono focus:bg-white focus:border-[#0c3843] focus:ring-2 focus:ring-[#0c3843]/10 outline-none transition-all"
                      />
                    </div>

                    <div>
                      <label className="block font-bold text-slate-700 mb-1">
                        License Plan
                      </label>
                      <select
                        value={clientPlan}
                        onChange={(e) => setClientPlan(e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 cursor-pointer focus:bg-white focus:border-[#0c3843] focus:ring-2 focus:ring-[#0c3843]/10 outline-none transition-all font-semibold"
                      >
                        <option value="enterprise">Enterprise Tier</option>
                        <option value="standard">Standard Tier</option>
                        <option value="trial">30-Day Free Trial</option>
                      </select>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-100">
                    <span className="text-[11px] font-bold text-[#0c3843] uppercase tracking-wider block mb-2">
                      Client Initial Manager Account
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">
                        Manager Name
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Asif Khan"
                        value={managerName}
                        onChange={(e) => setManagerName(e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 focus:bg-white focus:border-[#0c3843] focus:ring-2 focus:ring-[#0c3843]/10 outline-none transition-all"
                      />
                    </div>

                    <div>
                      <label className="block font-bold text-slate-700 mb-1">
                        Email Address *
                      </label>
                      <input
                        type="email"
                        required
                        placeholder="asif@apex.com"
                        value={managerEmail}
                        onChange={(e) => setManagerEmail(e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 focus:bg-white focus:border-[#0c3843] focus:ring-2 focus:ring-[#0c3843]/10 outline-none transition-all"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      Initial Password
                    </label>
                    <input
                      type="text"
                      value={managerPassword}
                      onChange={(e) => setManagerPassword(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 font-mono focus:bg-white focus:border-[#0c3843] focus:ring-2 focus:ring-[#0c3843]/10 outline-none transition-all"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-4 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-700 font-semibold cursor-pointer transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-5 py-2.5 rounded-xl bg-[#0c3843] hover:bg-[#082931] text-white font-bold transition-all shadow-md shadow-[#0c3843]/20 cursor-pointer disabled:opacity-50"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="w-full max-w-3xl rounded-3xl bg-white border border-slate-200 shadow-2xl p-6 md:p-8 space-y-6 max-h-[90vh] overflow-y-auto text-slate-900">
            <div className="flex items-start justify-between">
              <div>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[#0c3843]/10 text-[#0c3843] border border-[#0c3843]/20">
                  Client Profile &amp; Control
                </span>
                <h3 className="text-xl font-bold text-slate-900 mt-1.5 flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-[#0c3843]" />
                  <span>{selectedClient.name}</span>
                </h3>
                <p className="text-xs text-slate-500 font-mono mt-0.5">
                  Tenant ID: {selectedClient.org_id} &bull; Slug: {selectedClient.slug}
                </p>
              </div>
              <button
                onClick={() => setSelectedClient(null)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center transition-colors cursor-pointer text-lg"
              >
                &times;
              </button>
            </div>

            {/* Modal Internal Navigation Tabs */}
            <div className="flex p-1 bg-slate-100 rounded-xl border border-slate-200">
              <button
                onClick={() => setModalTab("details")}
                className={cn(
                  "flex-1 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-2",
                  modalTab === "details"
                    ? "bg-[#0c3843] text-white shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                )}
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>Client Details &amp; Plan</span>
              </button>
              <button
                onClick={() => setModalTab("activity")}
                className={cn(
                  "flex-1 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-2",
                  modalTab === "activity"
                    ? "bg-[#0c3843] text-white shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
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
                  <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200">
                    <span className="text-[10px] text-slate-500 font-bold uppercase">Staff Accounts</span>
                    <p className="text-lg font-bold text-slate-900 mt-1 font-mono">{selectedClient.user_count}</p>
                  </div>
                  <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200">
                    <span className="text-[10px] text-slate-500 font-bold uppercase">Store SKUs</span>
                    <p className="text-lg font-bold text-emerald-600 mt-1 font-mono">{selectedClient.item_count}</p>
                  </div>
                  <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200">
                    <span className="text-[10px] text-slate-500 font-bold uppercase">Ledger Moves</span>
                    <p className="text-lg font-bold text-purple-600 mt-1 font-mono">{selectedClient.movement_count}</p>
                  </div>
                </div>

                {/* License tier upgrade/downgrade */}
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-800 flex items-center gap-2">
                      <Key className="w-4 h-4 text-amber-500" />
                      <span>Assigned License Tier</span>
                    </label>
                    <span className="text-[11px] text-slate-500">
                      Current: <strong className="uppercase text-amber-600">{selectedClient.plan}</strong>
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <select
                      value={editPlan}
                      onChange={(e) => setEditPlan(e.target.value)}
                      className="flex-1 px-3 py-2 rounded-xl bg-white border border-slate-300 text-xs font-bold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-[#0c3843]/20 focus:border-[#0c3843] cursor-pointer"
                    >
                      <option value="enterprise">ENTERPRISE (Full commercial license)</option>
                      <option value="standard">STANDARD (Standard store access)</option>
                      <option value="trial">30-DAY TRIAL (Evaluation mode)</option>
                    </select>
                    <button
                      onClick={handleUpdatePlan}
                      disabled={isSavingPlan || editPlan === selectedClient.plan.toLowerCase()}
                      className="px-4 py-2 rounded-xl bg-[#0c3843] hover:bg-[#082931] text-white text-xs font-bold transition-all shadow-md shadow-[#0c3843]/20 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {isSavingPlan ? "Saving..." : "Save Plan"}
                    </button>
                  </div>
                </div>

                {/* Privacy Guarantee Note */}
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex items-start gap-3">
                  <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-slate-900">Client Data Privacy Enforced</p>
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      As platform administrator, your role is tracking license packages and operational telemetry. Client internal stock values, customer sales, and private store operations are securely protected and isolated via PostgreSQL Row-Level Security.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Modal Tab: Activity Logs */}
            {modalTab === "activity" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between text-xs text-slate-500 pb-1 border-b border-slate-100">
                  <span className="font-semibold text-slate-700">Audit trail &amp; operational history for {selectedClient.name}:</span>
                  <span className="font-mono text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-800 border border-slate-200">
                    {clientActivity.length} Events Logged
                  </span>
                </div>

                {isLoadingActivity ? (
                  <div className="py-14 text-center text-xs text-slate-400 flex flex-col items-center justify-center gap-2">
                    <RefreshCw className="w-5 h-5 animate-spin text-[#0c3843]" />
                    <span>Loading operational activity trail...</span>
                  </div>
                ) : clientActivity.length === 0 ? (
                  <div className="py-12 text-center text-slate-400 border border-slate-200 rounded-2xl bg-slate-50 space-y-2">
                    <Activity className="w-9 h-9 mx-auto text-slate-300 stroke-1" />
                    <p className="font-semibold text-slate-700 text-xs">No recent events recorded for this workspace.</p>
                    <p className="text-[11px] text-slate-400 max-w-xs mx-auto">
                      Administrative changes, software license upgrades, and operational logins for this client will be automatically logged here.
                    </p>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100 max-h-[380px] overflow-y-auto">
                    {clientActivity.map((ev) => {
                      const isProvision = ev.action.includes("PROVISION");
                      const isPlan = ev.action.includes("PLAN");
                      const isLogin = ev.action.includes("LOGIN") || ev.action.includes("AUTH");

                      return (
                        <div key={ev.audit_id} className="p-4 flex items-start justify-between gap-4 text-xs hover:bg-slate-50/70 transition-colors">
                          <div className="space-y-1.5 flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span
                                className={cn(
                                  "px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border whitespace-nowrap",
                                  isProvision
                                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                    : isPlan
                                    ? "bg-purple-50 text-purple-700 border-purple-200"
                                    : isLogin
                                    ? "bg-blue-50 text-blue-700 border-blue-200"
                                    : "bg-[#0c3843]/10 text-[#0c3843] border-[#0c3843]/20"
                                )}
                              >
                                {ev.action}
                              </span>
                              <span className="font-bold text-slate-900 capitalize text-xs">
                                {ev.entity_type}
                              </span>
                              {ev.entity_id && (
                                <span className="font-mono text-[10px] text-slate-400 truncate max-w-[200px]" title={ev.entity_id}>
                                  (ID: {ev.entity_id})
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500 flex items-center gap-2 flex-wrap font-mono">
                              <span className="text-slate-700 font-medium">Actor: {ev.user_email}</span>
                              <span>&bull;</span>
                              <span className="text-slate-400">IP: {ev.ip_address}</span>
                            </div>
                          </div>
                          <div className="text-right text-[11px] font-mono text-slate-500 shrink-0">
                            <div className="font-semibold text-slate-700">{new Date(ev.created_at).toLocaleDateString()}</div>
                            <div className="text-[10px] text-slate-400 mt-0.5">{new Date(ev.created_at).toLocaleTimeString()}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center justify-end pt-3 border-t border-slate-100">
              <button
                onClick={() => setSelectedClient(null)}
                className="px-5 py-2 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-semibold cursor-pointer transition-all"
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
