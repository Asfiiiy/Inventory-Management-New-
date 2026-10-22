"use client";

import React, { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import {
  Building2,
  Users,
  Boxes,
  Plus,
  RefreshCw,
  Search,
  CheckCircle2,
  Briefcase,
  Store,
  Shield,
  ArrowRight,
  LogOut,
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

export default function AdminDashboardPage() {
  return (
    <Suspense fallback={<div className="p-8 text-xs text-slate-400">Loading Admin Dashboard...</div>}>
      <AdminContent />
    </Suspense>
  );
}

function AdminContent() {
  const { toast } = useToast();
  const { logout } = useAuth();

  const [clients, setClients] = useState<OrganizationSummary[]>([]);
  const [telemetry, setTelemetry] = useState<PlatformTelemetry | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [planFilter, setPlanFilter] = useState("ALL");
  const [currentActiveTenant, setCurrentActiveTenant] = useState<string>("");

  // New Client Modal
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
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* Top Banner / Hero */}
      <div className="p-8 rounded-3xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white border border-indigo-500/30 shadow-2xl relative overflow-hidden">
        <div className="absolute right-0 top-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 relative z-10">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-indigo-400 uppercase tracking-widest mb-1.5">
              <Shield className="w-4 h-4 text-indigo-400" />
              <span>Admin Portal &bull; Humara Master Dashboard</span>
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight text-white">
              Admin Dashboard
            </h1>
            <p className="text-sm text-indigo-200/80 mt-1 max-w-2xl">
              Track karein k humne kis kis ko software dia hai, kitnay clients/companies active hain, aur naye client ko 1-click me software assign karein.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-white/20 bg-white/10 hover:bg-white/15 text-xs font-semibold text-white transition-all shadow-xs"
            >
              <Store className="w-4 h-4 text-indigo-300" />
              <span>Go to Software Dashboard</span>
            </Link>

            <button
              onClick={() => setIsModalOpen(true)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white text-xs font-bold shadow-lg transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>+ Give Software to New Client</span>
            </button>
          </div>
        </div>
      </div>

      {/* 4 Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-slate-500">Total Clients Given Software</span>
            <div className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
              {telemetry ? telemetry.total_organizations : clients.length}
            </div>
            <span className="text-[11px] text-slate-400">Active Companies / Stores</span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
            <Building2 className="w-6 h-6" />
          </div>
        </div>

        <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-slate-500">Enterprise Clients</span>
            <div className="text-2xl font-bold text-purple-600 dark:text-purple-400 mt-1">
              {telemetry ? telemetry.active_enterprises : 0}
            </div>
            <span className="text-[11px] text-slate-400">Full Access Clients</span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-purple-500/10 text-purple-500 flex items-center justify-center">
            <Briefcase className="w-6 h-6" />
          </div>
        </div>

        <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-slate-500">Total Users in Software</span>
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400 mt-1">
              {telemetry ? telemetry.total_users : 0}
            </div>
            <span className="text-[11px] text-slate-400">Staff Using Software</span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-blue-500/10 text-blue-500 flex items-center justify-center">
            <Users className="w-6 h-6" />
          </div>
        </div>

        <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-slate-500">Total Items in Stores</span>
            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
              {telemetry ? telemetry.total_items.toLocaleString() : 0}
            </div>
            <span className="text-[11px] text-slate-400">Total Catalog Products</span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
            <Boxes className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/50 shadow-xs flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="relative w-full md:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search client by name or ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 text-slate-900 dark:text-white placeholder:text-slate-400"
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <button
            onClick={fetchAdminData}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold shadow-xs transition-all cursor-pointer"
            title="Refresh"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", isLoading && "animate-spin")} />
            <span>Refresh</span>
          </button>

          <select
            value={planFilter}
            onChange={(e) => setPlanFilter(e.target.value)}
            className="px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 text-slate-900 dark:text-white"
          >
            <option value="ALL">All Plans</option>
            <option value="enterprise">Enterprise</option>
            <option value="standard">Standard</option>
            <option value="trial">30-Day Trial</option>
          </select>
        </div>
      </div>

      {/* Clients List Table */}
      <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/50 shadow-xs overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <span>Clients / Companies Who Received Software</span>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                {filteredClients.length}
              </span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Click &ldquo;Open Software&rdquo; to open and inspect that client&apos;s inventory software.
            </p>
          </div>

          <span className="text-xs font-mono text-indigo-500 font-semibold hidden sm:inline">
            Active Context: {currentActiveTenant.slice(0, 8)}...
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/75 dark:bg-slate-900 text-slate-500 border-b border-slate-200/80 dark:border-slate-800">
              <tr>
                <th className="py-3 px-6 font-semibold">Client / Company Name</th>
                <th className="py-3 px-6 font-semibold">License Plan</th>
                <th className="py-3 px-6 font-semibold text-center">Status</th>
                <th className="py-3 px-6 font-semibold text-center">Staff Count</th>
                <th className="py-3 px-6 font-semibold text-center">Store Items</th>
                <th className="py-3 px-6 font-semibold text-center">Stock Ledger Moves</th>
                <th className="py-3 px-6 font-semibold">Date Given</th>
                <th className="py-3 px-6 font-semibold text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
              {filteredClients.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    <Building2 className="w-8 h-8 mx-auto mb-2 text-slate-300 dark:text-slate-700 stroke-1" />
                    <p className="font-medium text-slate-600 dark:text-slate-400">
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
                        "hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors",
                        isCurrent && "bg-indigo-50/30 dark:bg-indigo-950/20"
                      )}
                    >
                      <td className="py-4 px-6">
                        <div className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                          <span>{c.name}</span>
                          {isCurrent && (
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                              CURRENT
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
                              ? "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20"
                              : c.plan.toLowerCase() === "standard"
                              ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20"
                              : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
                          )}
                        >
                          {c.plan}
                        </span>
                      </td>

                      <td className="py-4 px-6 text-center">
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Active</span>
                        </span>
                      </td>

                      <td className="py-4 px-6 text-center font-mono font-medium">
                        {c.user_count}
                      </td>

                      <td className="py-4 px-6 text-center font-mono font-medium">
                        {c.item_count}
                      </td>

                      <td className="py-4 px-6 text-center font-mono font-medium text-slate-500">
                        {c.movement_count}
                      </td>

                      <td className="py-4 px-6 text-slate-500 text-[11px]">
                        {new Date(c.created_at).toLocaleDateString()}
                      </td>

                      <td className="py-4 px-6 text-right">
                        <button
                          onClick={() => handleOpenClientSoftware(c)}
                          className={cn(
                            "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer",
                            isCurrent
                              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20"
                              : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-indigo-600 hover:text-white dark:hover:bg-indigo-600"
                          )}
                          title="Open this client's software dashboard"
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

      {/* Give Software to New Client Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center">
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Give Software to New Client
                  </h3>
                  <p className="text-xs text-slate-400">
                    Creates an isolated inventory software workspace for the client.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="w-7 h-7 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 flex items-center justify-center text-sm cursor-pointer"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleCreateClient} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Client / Company Name *
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
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Client Code / Slug
                  </label>
                  <input
                    type="text"
                    placeholder="apex-construction"
                    value={clientSlug}
                    onChange={(e) => setClientSlug(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    License Plan
                  </label>
                  <select
                    value={clientPlan}
                    onChange={(e) => setClientPlan(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white"
                  >
                    <option value="enterprise">Enterprise (Unlimited)</option>
                    <option value="standard">Standard (Full Store)</option>
                    <option value="trial">30-Day Trial</option>
                  </select>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-3">
                <span className="block font-bold text-slate-800 dark:text-slate-200">
                  Client Login Credentials
                </span>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Manager Name
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Asif Khan"
                      value={managerName}
                      onChange={(e) => setManagerName(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="block font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Email Address *
                    </label>
                    <input
                      type="email"
                      required
                      placeholder="asif@apex.com"
                      value={managerEmail}
                      onChange={(e) => setManagerEmail(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-medium text-slate-600 dark:text-slate-400 mb-1">
                    Initial Password
                  </label>
                  <input
                    type="text"
                    value={managerPassword}
                    onChange={(e) => setManagerPassword(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold transition-all shadow-md shadow-indigo-600/25 cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? "Creating Software..." : "Create & Give Software"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
