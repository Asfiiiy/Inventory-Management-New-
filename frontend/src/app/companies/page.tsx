"use client";

import React, { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import {
  ShieldCheck,
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
} from "lucide-react";
import {
  apiClient,
  OrganizationSummary,
  PlatformTelemetry,
  setTenantId,
  getTenantId,
} from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

export default function CompaniesPage() {
  return (
    <Suspense fallback={<div className="p-8 text-xs text-slate-400">Loading Companies...</div>}>
      <CompaniesContent />
    </Suspense>
  );
}

function CompaniesContent() {
  const { toast } = useToast();

  const [organizations, setOrganizations] = useState<OrganizationSummary[]>([]);
  const [telemetry, setTelemetry] = useState<PlatformTelemetry | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [planFilter, setPlanFilter] = useState("ALL");
  const [currentActiveTenant, setCurrentActiveTenant] = useState<string>("");

  // Provisioning Modal State
  const [isProvisionOpen, setIsProvisionOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newCompanyName, setNewCompanyName] = useState("");
  const [newCompanySlug, setNewCompanySlug] = useState("");
  const [newCompanyPlan, setNewCompanyPlan] = useState("enterprise");
  const [newAdminName, setNewAdminName] = useState("");
  const [newAdminEmail, setNewAdminEmail] = useState("");
  const [newAdminPassword, setNewAdminPassword] = useState("Password123!");

  const fetchCompaniesData = async () => {
    setIsLoading(true);
    try {
      setCurrentActiveTenant(getTenantId());

      // 1. Fetch Organizations
      try {
        const orgsRes = await apiClient.superadmin.listOrganizations();
        if (orgsRes.success && orgsRes.data) {
          setOrganizations(orgsRes.data);
        }
      } catch (err) {
        console.warn("Companies orgs error:", err);
      }

      // 2. Fetch Telemetry
      try {
        const telemRes = await apiClient.superadmin.getTelemetry();
        if (telemRes.success && telemRes.data) {
          setTelemetry(telemRes.data);
        }
      } catch (err) {
        console.warn("Companies telemetry error:", err);
      }
    } catch (err: any) {
      toast({
        title: "Load Error",
        description: err?.message || "Failed to load companies data",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCompaniesData();
  }, []);

  // Filter organizations
  const filteredOrgs = organizations.filter((org) => {
    const matchesPlan = planFilter === "ALL" || org.plan.toLowerCase() === planFilter.toLowerCase();
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch =
      !q ||
      org.name.toLowerCase().includes(q) ||
      org.slug.toLowerCase().includes(q) ||
      org.org_id.toLowerCase().includes(q);
    return matchesPlan && matchesSearch;
  });

  // Switch Active Company Store Context
  const handleSwitchTenant = (org: OrganizationSummary) => {
    setTenantId(org.org_id);
    setCurrentActiveTenant(org.org_id);

    toast({
      title: "Switched Company Store",
      description: `Active context set to "${org.name}". Opening store dashboard...`,
      variant: "success",
    });

    setTimeout(() => {
      window.location.href = "/";
    }, 400);
  };

  // Submit Provisioning Form
  const handleProvisionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCompanyName || !newAdminEmail) {
      toast({
        title: "Missing Information",
        description: "Please specify company name and client email address.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await apiClient.superadmin.provisionOrganization({
        name: newCompanyName,
        slug: newCompanySlug,
        plan: newCompanyPlan,
        admin_name: newAdminName || "Store Manager",
        admin_email: newAdminEmail,
        admin_password: newAdminPassword,
      });

      if (res.success && res.data) {
        toast({
          title: "New Company Registered!",
          description: `Created software workspace for "${newCompanyName}".`,
          variant: "success",
        });

        setIsProvisionOpen(false);
        setNewCompanyName("");
        setNewCompanySlug("");
        setNewAdminName("");
        setNewAdminEmail("");
        setNewAdminPassword("Password123!");
        await fetchCompaniesData();
      }
    } catch (err: any) {
      toast({
        title: "Registration Failed",
        description: err?.problem?.detail || err.message || "Could not register company",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white flex items-center gap-2.5">
              <Building2 className="w-7 h-7 text-indigo-500" />
              <span>Companies Tracked</span>
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 dark:text-indigo-400">
              {organizations.length} Companies Given Software
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Track which client companies have been given Whoopit IMS, their software status, and view their stores.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchCompaniesData}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold shadow-xs transition-all cursor-pointer"
            title="Refresh list"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", isLoading && "animate-spin")} />
            <span>Refresh</span>
          </button>

          <button
            onClick={() => setIsProvisionOpen(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-md shadow-indigo-600/20 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Give Software to New Company</span>
          </button>
        </div>
      </div>

      {/* Global Telemetry KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Total Companies */}
        <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-slate-500">Total Companies</span>
            <div className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
              {telemetry ? telemetry.total_organizations : organizations.length}
            </div>
            <span className="text-[11px] text-slate-400">Software Deployments</span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
            <Building2 className="w-6 h-6" />
          </div>
        </div>

        {/* Metric 2: Enterprise Licenses */}
        <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-slate-500">Enterprise Clients</span>
            <div className="text-2xl font-bold text-purple-600 dark:text-purple-400 mt-1">
              {telemetry ? telemetry.active_enterprises : 0}
            </div>
            <span className="text-[11px] text-slate-400">Active Paid Clients</span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-purple-500/10 text-purple-500 flex items-center justify-center">
            <Briefcase className="w-6 h-6" />
          </div>
        </div>

        {/* Metric 3: Total End-Users */}
        <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-slate-500">Total Company Users</span>
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400 mt-1">
              {telemetry ? telemetry.total_users : 0}
            </div>
            <span className="text-[11px] text-slate-400">Staff Using Software</span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-blue-500/10 text-blue-500 flex items-center justify-center">
            <Users className="w-6 h-6" />
          </div>
        </div>

        {/* Metric 4: Total Inventory Items Tracked */}
        <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-slate-500">Total Items in Stores</span>
            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
              {telemetry ? telemetry.total_items.toLocaleString() : 0}
            </div>
            <span className="text-[11px] text-slate-400">SKUs Managed Across All</span>
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
            placeholder="Search company by name, slug, or ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 text-slate-900 dark:text-white placeholder:text-slate-400"
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <span className="text-xs text-slate-500 shrink-0">Plan Filter:</span>
          <select
            value={planFilter}
            onChange={(e) => setPlanFilter(e.target.value)}
            className="px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 text-slate-900 dark:text-white"
          >
            <option value="ALL">All License Plans</option>
            <option value="enterprise">Enterprise</option>
            <option value="standard">Standard</option>
            <option value="trial">30-Day Trial</option>
          </select>
        </div>
      </div>

      {/* Companies Directory Table */}
      <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/50 shadow-xs overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <span>Client Companies Directory</span>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                {filteredOrgs.length}
              </span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Click &ldquo;View Company Store&rdquo; on any company to inspect their inventory and stock ledger directly.
            </p>
          </div>

          <span className="text-xs font-mono text-indigo-500 font-semibold hidden sm:inline">
            Active Store Context: {currentActiveTenant.slice(0, 8)}...
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-left text-xs">
            <thead className="bg-slate-50/75 dark:bg-slate-900 text-slate-500 border-b border-slate-200/80 dark:border-slate-800">
              <tr>
                <th className="py-3 px-6 font-semibold min-w-[220px]">Company Name</th>
                <th className="py-3 px-6 font-semibold min-w-[110px]">Plan</th>
                <th className="py-3 px-6 font-semibold text-center min-w-[90px]">Status</th>
                <th className="py-3 px-6 font-semibold text-center min-w-[90px]">Staff Count</th>
                <th className="py-3 px-6 font-semibold text-center min-w-[90px]">Catalog SKUs</th>
                <th className="py-3 px-6 font-semibold text-center min-w-[100px]">Stock Movements</th>
                <th className="py-3 px-6 font-semibold min-w-[110px]">Given On</th>
                <th className="py-3 px-6 font-semibold text-right min-w-[140px] whitespace-nowrap">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
              {filteredOrgs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    <Building2 className="w-8 h-8 mx-auto mb-2 text-slate-300 dark:text-slate-700 stroke-1" />
                    <p className="font-medium text-slate-600 dark:text-slate-400">
                      No matching companies found.
                    </p>
                  </td>
                </tr>
              ) : (
                filteredOrgs.map((org) => {
                  const isCurrent = currentActiveTenant === org.org_id;

                  return (
                    <tr
                      key={org.org_id}
                      className={cn(
                        "hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors",
                        isCurrent && "bg-indigo-50/30 dark:bg-indigo-950/20"
                      )}
                    >
                      <td className="py-4 px-6">
                        <div className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                          <span>{org.name}</span>
                          {isCurrent && (
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                              VIEWING NOW
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] font-mono text-slate-400 mt-0.5 flex items-center gap-1.5">
                          <span>slug: {org.slug}</span>
                          <span>&bull;</span>
                          <span className="text-[10px] text-slate-500">{org.org_id.slice(0, 8)}...</span>
                        </div>
                      </td>

                      <td className="py-4 px-6">
                        <span
                          className={cn(
                            "px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border",
                            org.plan.toLowerCase() === "enterprise"
                              ? "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20"
                              : org.plan.toLowerCase() === "standard"
                              ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20"
                              : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
                          )}
                        >
                          {org.plan}
                        </span>
                      </td>

                      <td className="py-4 px-6 text-center">
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Active</span>
                        </span>
                      </td>

                      <td className="py-4 px-6 text-center font-mono font-medium">
                        {org.user_count}
                      </td>

                      <td className="py-4 px-6 text-center font-mono font-medium">
                        {org.item_count}
                      </td>

                      <td className="py-4 px-6 text-center font-mono font-medium text-slate-500">
                        {org.movement_count}
                      </td>

                      <td className="py-4 px-6 text-slate-500 text-[11px]">
                        {new Date(org.created_at).toLocaleDateString()}
                      </td>

                      <td className="py-4 px-6 text-right">
                        <button
                          onClick={() => handleSwitchTenant(org)}
                          className={cn(
                            "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer",
                            isCurrent
                              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20"
                              : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-indigo-600 hover:text-white dark:hover:bg-indigo-600"
                          )}
                          title="Open this company's inventory store"
                        >
                          <Store className="w-3.5 h-3.5" />
                          <span>{isCurrent ? "Active Store" : "Open Store"}</span>
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

      {/* Give Software to New Company Modal */}
      {isProvisionOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center">
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Give Software to New Company
                  </h3>
                  <p className="text-xs text-slate-400">
                    Creates an isolated company store with default warehouses and login credentials.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsProvisionOpen(false)}
                className="w-7 h-7 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 flex items-center justify-center text-sm cursor-pointer"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleProvisionSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Company / Client Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Apex Construction Pvt Ltd"
                  value={newCompanyName}
                  onChange={(e) => {
                    setNewCompanyName(e.target.value);
                    if (!newCompanySlug) {
                      setNewCompanySlug(
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
                    Company Code / Slug
                  </label>
                  <input
                    type="text"
                    placeholder="apex-construction"
                    value={newCompanySlug}
                    onChange={(e) => setNewCompanySlug(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Software License Plan
                  </label>
                  <select
                    value={newCompanyPlan}
                    onChange={(e) => setNewCompanyPlan(e.target.value)}
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
                  Client Primary Contact Login
                </span>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Manager Name
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Asif Khan"
                      value={newAdminName}
                      onChange={(e) => setNewAdminName(e.target.value)}
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
                      value={newAdminEmail}
                      onChange={(e) => setNewAdminEmail(e.target.value)}
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
                    value={newAdminPassword}
                    onChange={(e) => setNewAdminPassword(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsProvisionOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold transition-all shadow-md shadow-indigo-600/25 cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? "Creating Company..." : "Register Company"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
