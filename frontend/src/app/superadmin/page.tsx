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
  Crown,
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

export default function SuperAdminPage() {
  return (
    <Suspense fallback={<div className="p-8 text-xs text-slate-400">Loading SuperAdmin HQ...</div>}>
      <SuperAdminContent />
    </Suspense>
  );
}

function SuperAdminContent() {
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

  const fetchSuperAdminData = async () => {
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
        console.warn("SuperAdmin orgs error:", err);
      }

      // 2. Fetch Telemetry
      try {
        const telemRes = await apiClient.superadmin.getTelemetry();
        if (telemRes.success && telemRes.data) {
          setTelemetry(telemRes.data);
        }
      } catch (err) {
        console.warn("SuperAdmin telemetry error:", err);
      }
    } catch (err: any) {
      toast({
        title: "Load Error",
        description: err?.message || "Failed to load platform data",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSuperAdminData();
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

  // 1-Click Tenant Switcher / Impersonation
  const handleSwitchTenant = (org: OrganizationSummary) => {
    setTenantId(org.org_id);
    setCurrentActiveTenant(org.org_id);

    toast({
      title: "Switched Client Workspace",
      description: `Active context shifted to "${org.name}". Opening client workspace...`,
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
        description: "Please specify company name and client administrator email.",
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
        admin_name: newAdminName || "Administrator",
        admin_email: newAdminEmail,
        admin_password: newAdminPassword,
      });

      if (res.success && res.data) {
        toast({
          title: "Client Company Provisioned!",
          description: `Created "${newCompanyName}" with admin credentials. Ready for immediate deployment.`,
          variant: "success",
        });

        setIsProvisionOpen(false);
        setNewCompanyName("");
        setNewCompanySlug("");
        setNewAdminName("");
        setNewAdminEmail("");
        setNewAdminPassword("Password123!");
        await fetchSuperAdminData();
      }
    } catch (err: any) {
      toast({
        title: "Provisioning Failed",
        description: err?.problem?.detail || err.message || "Could not onboard company",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-16">
      {/* SuperAdmin Header */}
      <div className="p-8 rounded-3xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white border border-indigo-500/30 shadow-2xl relative overflow-hidden">
        <div className="absolute right-0 top-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 relative z-10">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-indigo-400 uppercase tracking-widest mb-1.5">
              <Crown className="w-4 h-4 text-amber-400" />
              <span>Whoopit SaaS HQ Control Room &bull; Platform Owner</span>
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight text-white">
              SuperAdmin Client Directory
            </h1>
            <p className="text-sm text-indigo-200/80 mt-1 max-w-2xl">
              Track, provision, and monitor every client company deployed on Whoopit IMS. Switch into any client tenant with 1-click administrative impersonation.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={fetchSuperAdminData}
              disabled={isLoading}
              className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-white/20 bg-white/10 hover:bg-white/15 text-xs font-semibold text-white transition-all shadow-xs cursor-pointer"
            >
              <RefreshCw className={cn("w-3.5 h-3.5", isLoading && "animate-spin")} />
              <span>Refresh</span>
            </button>

            <button
              onClick={() => setIsProvisionOpen(true)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white text-xs font-bold shadow-lg transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Provision New Company</span>
            </button>
          </div>
        </div>
      </div>

      {/* Global Telemetry KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Total Companies */}
        <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-slate-500">Registered Companies</span>
            <div className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
              {telemetry ? telemetry.total_organizations : organizations.length}
            </div>
            <span className="text-[11px] text-slate-400">Total Client Workspaces</span>
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
            <span className="text-[11px] text-slate-400">Paid Tier Licenses</span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-purple-500/10 text-purple-500 flex items-center justify-center">
            <Crown className="w-6 h-6" />
          </div>
        </div>

        {/* Metric 3: Total End-Users */}
        <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-slate-500">Platform Users</span>
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400 mt-1">
              {telemetry ? telemetry.total_users : 0}
            </div>
            <span className="text-[11px] text-slate-400">Staff Across All Clients</span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-blue-500/10 text-blue-500 flex items-center justify-center">
            <Users className="w-6 h-6" />
          </div>
        </div>

        {/* Metric 4: Platform Stock Ledger Activity */}
        <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-slate-500">Global Ledger Volume</span>
            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
              {telemetry ? telemetry.total_movements : 0}
            </div>
            <span className="text-[11px] text-slate-400">Two-Sided Move Entries</span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
            <Activity className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/50 shadow-xs flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="relative w-full md:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search company by name, slug, or UUID..."
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

      {/* Client Companies Directory Table */}
      <div className="rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/50 shadow-xs overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <span>Client Organizations &amp; Workspaces</span>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                {filteredOrgs.length}
              </span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Click &ldquo;Jump to Workspace&rdquo; on any company to inspect their operational data directly.
            </p>
          </div>

          <span className="text-xs font-mono text-indigo-500 font-semibold hidden sm:inline">
            Active Tenant ID: {currentActiveTenant.slice(0, 8)}...
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/75 dark:bg-slate-900 text-slate-500 border-b border-slate-200/80 dark:border-slate-800">
              <tr>
                <th className="py-3 px-6 font-semibold">Client Company</th>
                <th className="py-3 px-6 font-semibold">License Plan</th>
                <th className="py-3 px-6 font-semibold text-center">Status</th>
                <th className="py-3 px-6 font-semibold text-center">Staff Users</th>
                <th className="py-3 px-6 font-semibold text-center">Catalog SKUs</th>
                <th className="py-3 px-6 font-semibold text-center">Ledger Moves</th>
                <th className="py-3 px-6 font-semibold">Onboarded</th>
                <th className="py-3 px-6 font-semibold text-right">Administrative Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
              {filteredOrgs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    <Building2 className="w-8 h-8 mx-auto mb-2 text-slate-300 dark:text-slate-700 stroke-1" />
                    <p className="font-medium text-slate-600 dark:text-slate-400">
                      No matching client companies found.
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
                              CURRENT ACTIVE
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
                            "px-2.5 py-0.5 rounded-full font-bold text-[10px] uppercase",
                            org.plan === "enterprise"
                              ? "bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20"
                              : org.plan === "standard"
                              ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20"
                              : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                          )}
                        >
                          {org.plan}
                        </span>
                      </td>

                      <td className="py-4 px-6 text-center">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          <span>Active</span>
                        </span>
                      </td>

                      <td className="py-4 px-6 text-center font-bold text-slate-900 dark:text-white">
                        {org.user_count}
                      </td>

                      <td className="py-4 px-6 text-center font-bold text-slate-900 dark:text-white">
                        {org.item_count}
                      </td>

                      <td className="py-4 px-6 text-center font-mono text-slate-500">
                        {org.movement_count}
                      </td>

                      <td className="py-4 px-6 text-slate-500 text-[11px]">
                        {new Date(org.created_at).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </td>

                      <td className="py-4 px-6 text-right">
                        <button
                          onClick={() => handleSwitchTenant(org)}
                          className={cn(
                            "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold shadow-xs transition-all cursor-pointer",
                            isCurrent
                              ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-700"
                              : "bg-indigo-600 hover:bg-indigo-700 text-white"
                          )}
                          title={`Switch context to ${org.name}`}
                        >
                          <span>{isCurrent ? "Open Workspace" : "Jump to Workspace"}</span>
                          <ArrowRight className="w-3.5 h-3.5" />
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

      {/* Provision New Company Modal */}
      {isProvisionOpen && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-purple-500/10 text-purple-600 flex items-center justify-center">
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Onboard New Client Company
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Provisions isolated PostgreSQL RLS workspace, storage depot, and Owner login.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsProvisionOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-xs cursor-pointer"
              >
                Cancel
              </button>
            </div>

            <form onSubmit={handleProvisionSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Company Name *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Apex Construction &amp; Engineering"
                  value={newCompanyName}
                  onChange={(e) => setNewCompanyName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Subdomain / Slug
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. apex-construction"
                    value={newCompanySlug}
                    onChange={(e) => setNewCompanySlug(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Subscription Tier
                  </label>
                  <select
                    value={newCompanyPlan}
                    onChange={(e) => setNewCompanyPlan(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white"
                  >
                    <option value="enterprise">Enterprise (Unlimited SKUs + RBAC)</option>
                    <option value="standard">Standard (Core Warehousing)</option>
                    <option value="trial">30-Day Evaluation Trial</option>
                  </select>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 mb-2">
                  Initial Client Administrator Account
                </h4>

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                      Admin Full Name
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Engr. Farhan Tariq"
                      value={newAdminName}
                      onChange={(e) => setNewAdminName(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                        Admin Email Address *
                      </label>
                      <input
                        type="email"
                        placeholder="farhan@apex.pk"
                        value={newAdminEmail}
                        onChange={(e) => setNewAdminEmail(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                        Initial Password
                      </label>
                      <input
                        type="password"
                        value={newAdminPassword}
                        onChange={(e) => setNewAdminPassword(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsProvisionOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white text-xs font-bold shadow-md transition-all disabled:opacity-50 cursor-pointer"
                >
                  {isSubmitting ? "Provisioning..." : "Onboard Company & Generate Workspace"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
