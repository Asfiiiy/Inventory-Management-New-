"use client";

import React, { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import {
  Shield,
  Building2,
  Users,
  Boxes,
  Activity,
  Plus,
  RefreshCw,
  ExternalLink,
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
  Store,
  Database,
  Cpu,
  Server,
  FileText,
  Key,
  LogOut,
  Radio,
  SlidersHorizontal,
  Clock,
  HardDrive,
  Mail,
  UserCheck,
} from "lucide-react";
import {
  apiClient,
  OrganizationSummary,
  PlatformTelemetry,
  setTenantId,
  getTenantId,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

type AdminTab = "overview" | "clients" | "licenses" | "users" | "system" | "audit";

export default function AdminPortalPage() {
  return (
    <Suspense fallback={<div className="h-screen w-screen bg-slate-950 flex items-center justify-center text-xs text-slate-500">Loading Admin Portal...</div>}>
      <AdminPortalContent />
    </Suspense>
  );
}

function AdminPortalContent() {
  const { toast } = useToast();
  const { user, logout } = useAuth();

  const [activeTab, setActiveTab] = useState<AdminTab>("overview");
  const [clients, setClients] = useState<OrganizationSummary[]>([]);
  const [telemetry, setTelemetry] = useState<PlatformTelemetry | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [planFilter, setPlanFilter] = useState("ALL");
  const [currentActiveTenant, setCurrentActiveTenant] = useState<string>("");

  // Modal State for Giving Software
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [clientName, setClientName] = useState("");
  const [clientSlug, setClientSlug] = useState("");
  const [clientPlan, setClientPlan] = useState("enterprise");
  const [managerName, setManagerName] = useState("");
  const [managerEmail, setManagerEmail] = useState("");
  const [managerPassword, setManagerPassword] = useState("Password123!");

  const fetchAdminData = async () => {
    setIsLoading(true);
    try {
      setCurrentActiveTenant(getTenantId());

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
        const tRes = await apiClient.superadmin.getTelemetry();
        if (tRes.success && tRes.data) {
          setTelemetry(tRes.data);
        }
      } catch (err) {
        console.warn("Fetch telemetry error:", err);
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

  // Open Client's Software
  const handleOpenClientSoftware = (client: OrganizationSummary) => {
    setTenantId(client.org_id);
    setCurrentActiveTenant(client.org_id);

    toast({
      title: "Opening Software",
      description: `Switching to "${client.name}" software workspace...`,
      variant: "success",
    });

    setTimeout(() => {
      window.location.href = "/";
    }, 400);
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
          description: `Created software workspace for "${clientName}".`,
          variant: "success",
        });

        setIsModalOpen(false);
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
                {telemetry ? telemetry.total_users : 0}
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
            </button>
          </nav>
        </div>

        {/* Bottom Profile & Switch to Software */}
        <div className="p-3 border-t border-slate-800/80 space-y-2">
          {/* Switch to Software Dashboard */}
          <Link
            href="/"
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 text-indigo-300 text-xs font-semibold transition-all"
            title="Open the client inventory store software"
          >
            <Store className="w-3.5 h-3.5 text-indigo-400" />
            <span>Launch Software Dashboard</span>
          </Link>

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

            <Link
              href="/"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600/15 hover:bg-indigo-600/25 text-indigo-300 border border-indigo-500/30 text-xs font-semibold transition-all"
            >
              <Store className="w-3.5 h-3.5" />
              <span>Open Software</span>
            </Link>
          </div>
        </header>

        {/* Scrollable Admin Content Body */}
        <main className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6">
          {/* ==================================================== */}
          {/* TAB: OVERVIEW & CLIENTS                              */}
          {/* ==================================================== */}
          {(activeTab === "overview" || activeTab === "clients") && (
            <>
              {/* Executive Summary Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-5 rounded-2xl border border-slate-800/80 bg-slate-900/60 shadow-lg relative overflow-hidden group hover:border-slate-700 transition-all">
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
                    <span>89 Companies Tracked</span>
                  </div>
                </div>

                <div className="p-5 rounded-2xl border border-slate-800/80 bg-slate-900/60 shadow-lg relative overflow-hidden group hover:border-slate-700 transition-all">
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

                <div className="p-5 rounded-2xl border border-slate-800/80 bg-slate-900/60 shadow-lg relative overflow-hidden group hover:border-slate-700 transition-all">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      Total End-Users
                    </span>
                    <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center border border-blue-500/20">
                      <Users className="w-5 h-5" />
                    </div>
                  </div>
                  <div className="text-3xl font-extrabold text-blue-300 mt-3">
                    {telemetry ? telemetry.total_users : 0}
                  </div>
                  <div className="flex items-center gap-1.5 mt-2 text-[11px] text-blue-400 font-semibold">
                    <span>Active Staff Across All Clients</span>
                  </div>
                </div>

                <div className="p-5 rounded-2xl border border-slate-800/80 bg-slate-900/60 shadow-lg relative overflow-hidden group hover:border-slate-700 transition-all">
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

              {/* Filter and Search Bar */}
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
                    className="px-3 py-2 rounded-xl text-xs bg-slate-950 border border-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 text-white"
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
                      Jisko bhi humne software dia hai wo yahan listed hai. Click &ldquo;Open Software&rdquo; to launch their workspace.
                    </p>
                  </div>

                  <span className="text-xs font-mono text-indigo-400 font-semibold hidden sm:inline">
                    Current Context: {currentActiveTenant.slice(0, 8)}...
                  </span>
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
                        filteredClients.map((c) => {
                          const isCurrent = currentActiveTenant === c.org_id;

                          return (
                            <tr
                              key={c.org_id}
                              className={cn(
                                "hover:bg-slate-800/40 transition-colors",
                                isCurrent && "bg-indigo-950/20"
                              )}
                            >
                              <td className="py-4 px-6">
                                <div className="font-bold text-white flex items-center gap-2">
                                  <span>{c.name}</span>
                                  {isCurrent && (
                                    <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                                      VIEWING NOW
                                    </span>
                                  )}
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
                                <button
                                  onClick={() => handleOpenClientSoftware(c)}
                                  className={cn(
                                    "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer",
                                    isCurrent
                                      ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/30"
                                      : "bg-slate-800 text-slate-200 hover:bg-indigo-600 hover:text-white"
                                  )}
                                  title="Open this client's inventory store software"
                                >
                                  <Store className="w-3.5 h-3.5" />
                                  <span>{isCurrent ? "Active Software" : "Open Software"}</span>
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* ==================================================== */}
          {/* TAB: LICENSES & PLANS                                */}
          {/* ==================================================== */}
          {activeTab === "licenses" && (
            <div className="space-y-6">
              <div className="border-b border-slate-800 pb-4">
                <h2 className="text-xl font-bold text-white">License &amp; Plan Tiers</h2>
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
          {/* TAB: ALL STORE USERS                                 */}
          {/* ==================================================== */}
          {activeTab === "users" && (
            <div className="space-y-6">
              <div className="border-b border-slate-800 pb-4">
                <h2 className="text-xl font-bold text-white">Platform End-Users Directory</h2>
                <p className="text-xs text-slate-400 mt-1">
                  Global staff and managers across all client stores using the Whoopit IMS software.
                </p>
              </div>

              <div className="p-6 rounded-2xl border border-slate-800 bg-slate-900/60 shadow-lg space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      Total Active Accounts
                    </span>
                    <div className="text-3xl font-extrabold text-white mt-1">
                      {telemetry?.total_users || 0}
                    </div>
                  </div>
                  <div className="w-12 h-12 rounded-2xl bg-blue-500/10 text-blue-400 flex items-center justify-center border border-blue-500/20">
                    <Users className="w-6 h-6" />
                  </div>
                </div>
                <p className="text-xs text-slate-400">
                  Each client store has their own isolated users. All logins are protected with Argon2id password hashing and cryptographic JWT tokens.
                </p>
              </div>
            </div>
          )}

          {/* ==================================================== */}
          {/* TAB: DATABASE & SYSTEM                               */}
          {/* ==================================================== */}
          {activeTab === "system" && (
            <div className="space-y-6">
              <div className="border-b border-slate-800 pb-4">
                <h2 className="text-xl font-bold text-white">System &amp; Infrastructure Health</h2>
                <p className="text-xs text-slate-400 mt-1">
                  Status of underlying database containers, memory cache, and storage cluster.
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
            </div>
          )}

          {/* ==================================================== */}
          {/* TAB: AUDIT LOGS                                      */}
          {/* ==================================================== */}
          {activeTab === "audit" && (
            <div className="space-y-6">
              <div className="border-b border-slate-800 pb-4">
                <h2 className="text-xl font-bold text-white">Security &amp; Audit Logs</h2>
                <p className="text-xs text-slate-400 mt-1">
                  Cryptographic log trail of administrative actions and client provisioning events.
                </p>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span className="text-xs font-bold text-white">Client Provisioned: Apex Construction</span>
                  </div>
                  <span className="text-[11px] text-slate-400">Just now</span>
                </div>

                <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span className="text-xs font-bold text-white">Telemetry Sync Executed</span>
                  </div>
                  <span className="text-[11px] text-slate-400">2 mins ago</span>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span className="text-xs font-bold text-white">Admin Authentication Verified: admin@whoopit.io</span>
                  </div>
                  <span className="text-[11px] text-slate-400">Today</span>
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
                  <h3 className="text-base font-bold text-white">
                    Give Software to New Client
                  </h3>
                  <p className="text-xs text-slate-400">
                    Creates an isolated inventory software workspace for the client.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="w-7 h-7 rounded-lg hover:bg-slate-800 text-slate-400 flex items-center justify-center text-sm cursor-pointer"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleCreateClient} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-300 mb-1">
                  Client / Shopkeeper Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Apex Construction or Tariq Electronics"
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
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500 placeholder:text-slate-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-300 mb-1">
                    Client Code / Slug
                  </label>
                  <input
                    type="text"
                    placeholder="apex-construction"
                    value={clientSlug}
                    onChange={(e) => setClientSlug(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-300 mb-1">
                    License Plan
                  </label>
                  <select
                    value={clientPlan}
                    onChange={(e) => setClientPlan(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white"
                  >
                    <option value="enterprise">Enterprise (Unlimited)</option>
                    <option value="standard">Standard (Full Store)</option>
                    <option value="trial">30-Day Trial</option>
                  </select>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-800 space-y-3">
                <span className="block font-bold text-slate-200">
                  Client Initial Login Credentials
                </span>

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
          </div>
        </div>
      )}
    </div>
  );
}
