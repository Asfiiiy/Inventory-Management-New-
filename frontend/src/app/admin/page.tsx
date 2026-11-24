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
  Search,
  CheckCircle2,
  Lock,
  TrendingUp,
  Sliders,
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
  Store,
  PanelLeftClose,
  PanelLeftOpen,
  Loader2,
  Laptop,
  LayoutGrid,
  List,
  ExternalLink,
  Clock,
  ChevronLeft,
  Globe,
  AlertTriangle,
  AlertCircle,
  ArrowLeft,
  Check,
  X,
  SlidersHorizontal,
  ToggleLeft,
  ToggleRight,
  Radio,
  Download,
  Printer,
  Command,
  Ban,
  Play,
  Sparkles,
} from "lucide-react";
import { downloadCSV, sanitizeCSVCell } from "@/lib/export-csv";
import {
  apiClient,
  OrganizationSummary,
  PlatformTelemetry,
  InfrastructureDiagnostics,
  GlobalUser,
  AuditEvent,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

type AdminTab = "overview" | "clients" | "licenses" | "users" | "system" | "audit";

function serviceStatusLabel(
  ping: { ok: boolean; latency: string } | undefined,
  onlineWord: string
) {
  if (!ping) return "CHECKING";
  return ping.ok ? `${onlineWord} (${ping.latency})` : `OFFLINE (${ping.latency})`;
}

function ServiceStatusBadge({
  ping,
  onlineWord,
  tone,
}: {
  ping?: { ok: boolean; latency: string };
  onlineWord: string;
  tone: "emerald" | "indigo" | "blue" | "purple";
}) {
  const offline = Boolean(ping && !ping.ok);
  const toneClass = offline
    ? "bg-rose-50 text-rose-700 border-rose-200"
    : tone === "emerald"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : tone === "indigo"
        ? "bg-indigo-50 text-indigo-700 border-indigo-200"
        : tone === "blue"
          ? "bg-blue-50 text-blue-700 border-blue-200"
          : "bg-purple-50 text-purple-700 border-purple-200";
  const dot = offline
    ? "bg-rose-500"
    : tone === "emerald"
      ? "bg-emerald-500"
      : tone === "indigo"
        ? "bg-indigo-500"
        : tone === "blue"
          ? "bg-blue-500"
          : "bg-purple-500";
  return (
    <span className={cn("px-2.5 py-0.5 rounded-full border text-[10px] font-bold flex items-center gap-1.5", toneClass)}>
      <span className={cn("w-1.5 h-1.5 rounded-full", dot, !offline && "animate-pulse")} />
      {serviceStatusLabel(ping, onlineWord)}
    </span>
  );
}

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
  const { user, isStaff, isSuperAdmin, isLoading: isAuthLoading, logout } = useAuth();

  // Guard: Verify user is superadmin; redirect unauthenticated users to /login, staff to /dashboard
  useEffect(() => {
    if (!isAuthLoading) {
      if (!user) {
        window.location.href = "/login";
      } else if (isStaff || (!isSuperAdmin && user?.email !== "admin@whoopit.io")) {
        window.location.href = isStaff ? "/my-assets" : "/dashboard";
      }
    }
  }, [isAuthLoading, isStaff, isSuperAdmin, user]);

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
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
  const [viewMode, setViewMode] = useState<"table" | "cards">("table");

  // Pagination states (15 items per page)
  const [overviewPage, setOverviewPage] = useState(1);
  const [clientsTabPage, setClientsTabPage] = useState(1);
  const [usersPage, setUsersPage] = useState(1);
  const [auditPage, setAuditPage] = useState(1);
  /** Drill-down: null = primary IT managers list; org_id = that company's full roster */
  const [selectedUsersOrgId, setSelectedUsersOrgId] = useState<string | null>(null);
  const PAGE_SIZE = 15;

  // Reset pagination to page 1 on search or filter change
  useEffect(() => {
    setOverviewPage(1);
    setClientsTabPage(1);
  }, [searchQuery, planFilter]);

  useEffect(() => {
    setUsersPage(1);
  }, [userSearchQuery, userRoleFilter, selectedUsersOrgId]);

  useEffect(() => {
    setAuditPage(1);
  }, [auditSearchQuery, auditActionFilter]);

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
    if (tab !== "users") {
      setSelectedUsersOrgId(null);
      setUserRoleFilter("ALL");
      setUserSearchQuery("");
    }
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

  // Enhancement 1: Client Welcome Kit Modal State
  const [welcomeKitClient, setWelcomeKitClient] = useState<{
    name: string;
    slug: string;
    org_id?: string;
    plan: string;
    email: string;
    password?: string;
  } | null>(null);

  // Enhancement 5: Global Command Search Palette (Ctrl+K or /)
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [commandSearch, setCommandSearch] = useState("");

  // Keyboard shortcut listener for Ctrl+K and /
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
      } else if (
        e.key === "/" &&
        !["INPUT", "TEXTAREA", "SELECT"].includes((e.target as HTMLElement)?.tagName)
      ) {
        e.preventDefault();
        setIsCommandPaletteOpen(true);
      } else if (e.key === "Escape") {
        setIsCommandPaletteOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Selected Client for Details & Activity Modal
  const [selectedClient, setSelectedClient] = useState<OrganizationSummary | null>(null);
  const [modalTab, setModalTab] = useState<"details" | "features" | "activity">("details");
  const [editPlan, setEditPlan] = useState<string>("enterprise");
  const [isSavingPlan, setIsSavingPlan] = useState<boolean>(false);
  const [clientActivity, setClientActivity] = useState<AuditEvent[]>([]);
  const [isLoadingActivity, setIsLoadingActivity] = useState(false);

  // Diagnostics test connection state
  const [pingingService, setPingingService] = useState<string | null>(null);
  const [servicePings, setServicePings] = useState<Record<string, { ok: boolean; latency: string }>>({});
  /** Remember plan before suspend so reactivate can restore it (session memory). */
  const [preSuspendPlan, setPreSuspendPlan] = useState<Record<string, string>>({});

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

      // 2. Fetch Telemetry & measure live database latency
      try {
        const res = await apiClient.superadmin.getTelemetry();
        if (res.success && res.data) {
          setTelemetry(res.data);
        }
      } catch (err) {
        console.warn("Fetch telemetry error:", err);
      }

      try {
        const diag = await apiClient.superadmin.getDiagnostics();
        if (diag.success && diag.data) {
          applyProbeResults(diag.data);
        }
      } catch (err) {
        console.warn("Fetch diagnostics error:", err);
        setServicePings({
          postgres: { ok: false, latency: "check failed" },
          valkey: { ok: false, latency: "check failed" },
          storage: { ok: false, latency: "check failed" },
          smtp: { ok: false, latency: "check failed" },
        });
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
    if (!isAuthLoading && user && (isSuperAdmin || user?.email === "admin@whoopit.io")) {
      fetchAdminData();
    }
  }, [isAuthLoading, user, isSuperAdmin]);

  // Fetch client specific activity when modal tab switches to activity
  const openClientModal = async (client: OrganizationSummary, tab: "details" | "features" | "activity" = "details") => {
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

  // Suspend or Reactivate Client Workspace (restore prior plan when known)
  const handleToggleSuspend = async () => {
    if (!selectedClient) return;
    const isCurrentlySuspended = selectedClient.plan.toLowerCase() === "suspended" || selectedClient.status === "suspended";
    let newPlan: string;
    if (isCurrentlySuspended) {
      const remembered = preSuspendPlan[selectedClient.org_id];
      const fromEdit =
        editPlan && editPlan.toLowerCase() !== "suspended" ? editPlan.toLowerCase() : null;
      newPlan = remembered || fromEdit || "standard";
    } else {
      setPreSuspendPlan((prev) => ({
        ...prev,
        [selectedClient.org_id]: selectedClient.plan.toLowerCase() === "suspended" ? "standard" : selectedClient.plan.toLowerCase(),
      }));
      newPlan = "suspended";
    }
    setIsSavingPlan(true);
    try {
      const res = await apiClient.superadmin.updateOrganization(selectedClient.org_id, { plan: newPlan });
      if (res.success) {
        toast({
          title: isCurrentlySuspended ? "Workspace Reactivated" : "Workspace Suspended",
          description: isCurrentlySuspended
            ? `${selectedClient.name} restored to ${newPlan} plan.`
            : `${selectedClient.name} has been placed on commercial billing hold.`,
          variant: isCurrentlySuspended ? "success" : "destructive",
        });
        if (isCurrentlySuspended) {
          setPreSuspendPlan((prev) => {
            const next = { ...prev };
            delete next[selectedClient.org_id];
            return next;
          });
        }
        setSelectedClient({
          ...selectedClient,
          plan: newPlan,
          status: isCurrentlySuspended ? "active" : "suspended",
        });
        setEditPlan(newPlan);
        await fetchAdminData();
      }
    } catch (err: any) {
      toast({
        title: "Operation Failed",
        description: err?.message || "Could not change workspace state",
        variant: "destructive",
      });
    } finally {
      setIsSavingPlan(false);
    }
  };

  // Extend 30-Day Trial
  const handleExtendTrial = async () => {
    if (!selectedClient) return;
    setIsSavingPlan(true);
    try {
      const res = await apiClient.superadmin.extendTrial(selectedClient.org_id, 14);
      if (res.success) {
        toast({
          title: "Evaluation Period Extended",
          description: `Added +14 days trial extension for ${selectedClient.name}.`,
          variant: "success",
        });
        await fetchAdminData();
        setSelectedClient({
          ...selectedClient,
          status: "trial",
          is_trial_expired: false,
          trial_days_remaining: (selectedClient.trial_days_remaining || 0) + 14,
        });
      }
    } catch (err: any) {
      toast({
        title: "Extension Failed",
        description: err?.message || "Could not extend trial period",
        variant: "destructive",
      });
    } finally {
      setIsSavingPlan(false);
    }
  };


  const applyProbeResults = (data: InfrastructureDiagnostics) => {
    const format = (probe?: { ok: boolean; latency_ms: number; detail: string }) => {
      if (!probe) return { ok: false, latency: "no result" };
      return {
        ok: probe.ok,
        latency: probe.ok ? `${probe.latency_ms} ms` : probe.detail || "unreachable",
      };
    };
    setServicePings({
      postgres: format(data.postgres),
      valkey: format(data.valkey),
      storage: format(data.storage),
      smtp: format(data.smtp),
    });
  };

  const handleTestService = async (svcKey: string, svcName: string) => {
    setPingingService(svcKey);
    try {
      const res = await apiClient.superadmin.getDiagnostics();
      if (!res.success || !res.data) {
        throw new Error("Diagnostics did not return a result");
      }
      applyProbeResults(res.data);
      const probe = res.data[svcKey as keyof InfrastructureDiagnostics];
      toast({
        title: probe?.ok ? `${svcName} reachable` : `${svcName} unreachable`,
        description: probe?.ok
          ? `Round-trip ${probe.latency_ms} ms from the API.`
          : probe?.detail || "The API could not reach this service.",
        variant: probe?.ok ? "success" : "destructive",
      });
    } catch (err: any) {
      setServicePings((prev) => ({
        ...prev,
        [svcKey]: { ok: false, latency: "check failed" },
      }));
      toast({
        title: `${svcName} check failed`,
        description: err?.message || "The diagnostic request did not complete.",
        variant: "destructive",
      });
    } finally {
      setPingingService(null);
    }
  };

  // Enhancement 3: Export Master Client Directory to CSV
  const handleExportClientsCSV = () => {
    if (!clients || clients.length === 0) {
      toast({
        title: "No Clients",
        description: "No client organizations available to export.",
        variant: "destructive",
      });
      return;
    }

    const headers = [
      "Company Name",
      "Organization ID",
      "Slug",
      "Plan Tier",
      "Status",
      "Primary IT Lead",
      "Lead Email",
      "Total Users",
      "Hardware Models",
      "Stock Movements",
      "Provisioned Date",
    ];

    const rows = filteredClients.map((c) => {
      const lead =
        usersList.find((u) => u.org_id === c.org_id && (u.role === "admin" || u.role === "owner")) ||
        usersList.find((u) => u.org_id === c.org_id);
      return [
        sanitizeCSVCell(c.name),
        sanitizeCSVCell(c.org_id),
        sanitizeCSVCell(c.slug),
        sanitizeCSVCell(c.plan.toUpperCase()),
        sanitizeCSVCell(c.plan.toLowerCase() === "suspended" || c.status === "suspended" ? "SUSPENDED" : "ACTIVE"),
        sanitizeCSVCell(lead?.name || "IT Admin"),
        sanitizeCSVCell(lead?.email || "N/A"),
        sanitizeCSVCell(c.user_count || 1),
        sanitizeCSVCell(c.item_count || 0),
        sanitizeCSVCell(c.movement_count || 0),
        sanitizeCSVCell(new Date(c.created_at).toLocaleDateString()),
      ].join(",");
    });

    const csvContent = [headers.join(","), ...rows].join("\r\n");
    const today = new Date().toISOString().split("T")[0];
    downloadCSV(csvContent, `Whoopit_Master_Client_Directory_${today}.csv`);

    toast({
      title: "Master Directory Exported",
      description: `Downloaded audit record of ${filteredClients.length} client companies to CSV.`,
      variant: "success",
    });
  };

  // 1-Click Quick Reactivate — restore prior plan when known, else Standard
  const handleQuickReactivate = async (client: OrganizationSummary) => {
    const restorePlan = preSuspendPlan[client.org_id] || "standard";
    try {
      const res = await apiClient.superadmin.updateOrganization(client.org_id, { plan: restorePlan });
      if (res.success) {
        toast({
          title: "Workspace Reactivated",
          description: `${client.name} restored to ${restorePlan} plan.`,
          variant: "success",
        });
        setPreSuspendPlan((prev) => {
          const next = { ...prev };
          delete next[client.org_id];
          return next;
        });
        await fetchAdminData();
      }
    } catch (err: any) {
      toast({
        title: "Reactivation Failed",
        description: err?.message || "Could not reactivate workspace",
        variant: "destructive",
      });
    }
  };

  // Submit Give Software Form
  const handleCreateClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientName || !managerEmail) {
      toast({
        title: "Missing Information",
        description: "Please specify client company name and manager email.",
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
        admin_name: managerName || "IT Manager",
        admin_email: managerEmail,
        admin_password: managerPassword,
      });

      if (res.success && res.data) {
        const emailNote = res.data.welcome_email_sent
          ? " Welcome email sent — check Mailpit at http://localhost:8025."
          : res.data.welcome_email_error
            ? ` Workspace created, but welcome email failed: ${res.data.welcome_email_error}`
            : "";
        toast({
          title: "Software Given Successfully!",
          description: `Created clean software workspace for "${clientName}".${emailNote}`,
          variant: res.data.welcome_email_sent || !res.data.welcome_email_error ? "success" : "warning",
        });

        setIsModalOpen(false);
        setCreatedCredentials(null);

        // Open Welcome Kit Onboarding Dossier
        setWelcomeKitClient({
          name: clientName,
          slug: clientSlug || res.data.slug || clientName.toLowerCase().replace(/\s+/g, "-"),
          org_id: res.data?.org_id,
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

  // Whoopit SuperAdmin = software vendor, never a client company / IT manager
  const isPlatformOwnerUser = (u: GlobalUser) => {
    const role = (u.role || "").toLowerCase();
    const email = (u.email || "").toLowerCase();
    return (
      role === "superadmin" ||
      role === "platform_admin" ||
      email === "admin@whoopit.io" ||
      u.org_id === "a0000000-0000-0000-0000-000000000001"
    );
  };
  const clientUsers = usersList.filter((u) => !isPlatformOwnerUser(u));
  const clientCompanies = clients.filter(
    (c) =>
      c.org_id !== "a0000000-0000-0000-0000-000000000001" &&
      (c.slug || "").toLowerCase() !== "whoopit-store"
  );

  /** One primary credential holder per client company (owner → admin → first user). */
  const pickPrimaryLead = (orgUsers: GlobalUser[]): GlobalUser | undefined => {
    if (orgUsers.length === 0) return undefined;
    const rank = (role: string) => {
      const r = (role || "").toLowerCase();
      if (r === "owner") return 0;
      if (r === "admin") return 1;
      if (r === "manager") return 2;
      return 9;
    };
    return [...orgUsers].sort(
      (a, b) =>
        rank(a.role) - rank(b.role) ||
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    )[0];
  };

  const primaryITManagers: GlobalUser[] = (() => {
    const byOrg = new Map<string, GlobalUser[]>();
    for (const u of clientUsers) {
      const list = byOrg.get(u.org_id) || [];
      list.push(u);
      byOrg.set(u.org_id, list);
    }
    const leads: GlobalUser[] = [];
    for (const orgUsers of byOrg.values()) {
      const lead = pickPrimaryLead(orgUsers);
      if (lead) leads.push(lead);
    }
    return leads.sort((a, b) => a.org_name.localeCompare(b.org_name));
  })();

  const selectedCompanyUsers = selectedUsersOrgId
    ? clientUsers.filter((u) => u.org_id === selectedUsersOrgId)
    : [];
  const selectedCompanyName =
    selectedCompanyUsers[0]?.org_name ||
    clientCompanies.find((c) => c.org_id === selectedUsersOrgId)?.name ||
    "Company";
  const selectedCompanyStaffCount = selectedCompanyUsers.filter((u) => {
    const r = (u.role || "").toLowerCase();
    return r !== "owner" && r !== "admin";
  }).length;

  const filteredClients = clientCompanies.filter((c) => {
    const isSuspended = c.plan.toLowerCase() === "suspended" || c.status === "suspended";
    let matchesPlan = true;
    if (planFilter === "suspended") {
      matchesPlan = isSuspended;
    } else if (planFilter !== "ALL") {
      matchesPlan = c.plan.toLowerCase() === planFilter.toLowerCase() && !isSuspended;
    }

    const q = searchQuery.toLowerCase().trim();
    const lead = clientUsers.find((u) => u.org_id === c.org_id && (u.role === "admin" || u.role === "owner")) || clientUsers.find((u) => u.org_id === c.org_id);
    const matchesSearch =
      !q ||
      c.name.toLowerCase().includes(q) ||
      c.slug.toLowerCase().includes(q) ||
      c.org_id.toLowerCase().includes(q) ||
      (lead?.name && lead.name.toLowerCase().includes(q)) ||
      (lead?.email && lead.email.toLowerCase().includes(q));
    return matchesPlan && matchesSearch;
  });

  // Paginated clients (15 items per page)
  const totalOverviewPages = Math.ceil(filteredClients.length / PAGE_SIZE) || 1;
  const paginatedOverviewClients = filteredClients.slice(
    (overviewPage - 1) * PAGE_SIZE,
    overviewPage * PAGE_SIZE
  );

  const totalClientsTabPages = Math.ceil(filteredClients.length / PAGE_SIZE) || 1;
  const paginatedClientsTab = filteredClients.slice(
    (clientsTabPage - 1) * PAGE_SIZE,
    clientsTabPage * PAGE_SIZE
  );

  const usersListForTab = selectedUsersOrgId ? selectedCompanyUsers : primaryITManagers;

  const filteredUsers = usersListForTab.filter((u) => {
    const matchesRole =
      selectedUsersOrgId == null
        ? true // main page = credential holders only; role filter applies in drill-down
        : userRoleFilter === "ALL" || u.role.toLowerCase() === userRoleFilter.toLowerCase();
    const q = userSearchQuery.toLowerCase().trim();
    const matchesSearch =
      !q ||
      u.email.toLowerCase().includes(q) ||
      u.name.toLowerCase().includes(q) ||
      u.org_name.toLowerCase().includes(q);
    return matchesRole && matchesSearch;
  });

  const totalUserPages = Math.ceil(filteredUsers.length / PAGE_SIZE) || 1;
  const paginatedUsers = filteredUsers.slice(
    (usersPage - 1) * PAGE_SIZE,
    usersPage * PAGE_SIZE
  );

  // Filter audit logs
  const filteredAuditLogs = auditLogs.filter((ev) => {
    const matchesAction = auditActionFilter === "ALL" || ev.action.toLowerCase().includes(auditActionFilter.toLowerCase());
    const q = auditSearchQuery.toLowerCase().trim();
    const matchesSearch =
      !q ||
      ev.action.toLowerCase().includes(q) ||
      ev.entity_type.toLowerCase().includes(q) ||
      ev.entity_id.toLowerCase().includes(q) ||
      ev.org_name.toLowerCase().includes(q) ||
      ev.user_email.toLowerCase().includes(q) ||
      ev.ip_address.toLowerCase().includes(q);
    return matchesAction && matchesSearch;
  });

  const totalAuditPages = Math.ceil(filteredAuditLogs.length / PAGE_SIZE) || 1;
  const paginatedAuditLogs = filteredAuditLogs.slice(
    (auditPage - 1) * PAGE_SIZE,
    auditPage * PAGE_SIZE
  );

  if (isAuthLoading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[#0c3843] text-white">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
          <span className="text-xs font-semibold tracking-wide text-cyan-200">
            Verifying Admin Authorization...
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#f4f7f9] text-slate-800 font-sans selection:bg-[#0c3843] selection:text-white">
      {/* ======================================================== */}
      {/* 1. DEDICATED ADMIN SIDEBAR (GEMINI COLLAPSIBLE TEAL)      */}
      {/* ======================================================== */}
      <aside
        className={cn(
          "relative flex flex-col justify-between border-r border-[#082931] bg-[#0c3843] text-white transition-all duration-300 ease-in-out z-30 select-none shadow-2xl shrink-0 overflow-visible",
          sidebarCollapsed ? "w-[68px]" : "w-72"
        )}
      >
        <div className="flex flex-col min-h-0 flex-1">
          {/* Gemini-Style Top Bar */}
          <div
            className={cn(
              "flex items-center h-16 shrink-0 transition-all px-3",
              sidebarCollapsed ? "justify-center" : "justify-between border-b border-white/10"
            )}
          >
            {sidebarCollapsed ? (
              /* COLLAPSED STATE: Default App Logo; on hover swaps to PanelLeftOpen with 'Open sidebar' tooltip */
              <div className="relative group flex items-center justify-center">
                <button
                  onClick={() => setSidebarCollapsed(false)}
                  className="flex items-center justify-center w-11 h-11 rounded-2xl hover:bg-white/10 transition-all cursor-pointer relative"
                  aria-label="Open sidebar"
                >
                  {/* Default: App Logo */}
                  <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-cyan-500/20 text-cyan-300 border border-cyan-400/30 transition-all duration-200 group-hover:opacity-0 group-hover:scale-75 absolute">
                    <Boxes className="w-5 h-5 text-cyan-300" />
                  </div>

                  {/* On Hover: Gemini Open Sidebar Icon */}
                  <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-white/15 text-white transition-all duration-200 opacity-0 scale-75 group-hover:opacity-100 group-hover:scale-100">
                    <PanelLeftOpen className="w-5 h-5 text-white" />
                  </div>
                </button>

                {/* Gemini Floating Pill Tooltip */}
                <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 px-3.5 py-1.5 rounded-xl bg-[#e3e3e3] text-zinc-900 text-xs font-semibold whitespace-nowrap shadow-xl pointer-events-none opacity-0 group-hover:opacity-100 transition-all duration-150 z-50">
                  Open sidebar
                </div>
              </div>
            ) : (
              /* EXPANDED STATE: Brand Header + Close Sidebar Button */
              <>
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-cyan-500/20 flex items-center justify-center text-cyan-300 border border-cyan-400/30 shadow-sm shrink-0">
                    <Boxes className="w-5 h-5 text-cyan-300" />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="font-extrabold text-[13px] tracking-tight text-white whitespace-nowrap">
                      WHOOPIT MASTER ADMIN
                    </span>
                    <span className="text-[10px] text-cyan-200/70 font-medium whitespace-nowrap">
                      Software Distribution &amp; Licensing
                    </span>
                  </div>
                </div>

                {/* Close sidebar button with Gemini icon & tooltip */}
                <div className="relative group shrink-0">
                  <button
                    onClick={() => setSidebarCollapsed(true)}
                    className="flex items-center justify-center w-9 h-9 rounded-xl text-slate-300 hover:text-white hover:bg-white/10 transition-all cursor-pointer"
                    aria-label="Close sidebar"
                  >
                    <PanelLeftClose className="w-5 h-5 text-slate-300 group-hover:text-white" />
                  </button>
                  <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 px-3.5 py-1.5 rounded-xl bg-[#e3e3e3] text-zinc-900 text-xs font-semibold whitespace-nowrap shadow-xl pointer-events-none opacity-0 group-hover:opacity-100 transition-all duration-150 z-50">
                    Close sidebar
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Primary Navigation Tabs */}
          <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-1 scrollbar-none">
            {!sidebarCollapsed && (
              <h4 className="px-3 mb-2 text-[10px] font-bold uppercase tracking-wider text-cyan-200/60">
                Platform Console
              </h4>
            )}

            {[
              { id: "overview", label: "Software Overview", icon: Activity },
              { id: "clients", label: "Client Companies", icon: Building2 },
              { id: "licenses", label: "License Plans", icon: Key },
              { id: "users", label: "Client IT Managers", icon: Users },
              { id: "system", label: "Database & SMTP Health", icon: Database },
              { id: "audit", label: "Platform Activity Logs", icon: FileText },
            ].map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;

              return (
                <div key={item.id} className="relative group">
                  <button
                    onClick={() => handleTabChange(item.id as AdminTab)}
                    className={cn(
                      "flex items-center rounded-xl text-xs font-semibold transition-all duration-200 relative cursor-pointer",
                      sidebarCollapsed
                        ? "justify-center w-11 h-11 mx-auto my-1"
                        : "w-full px-3.5 py-2.5 my-0.5",
                      isActive
                        ? sidebarCollapsed
                          ? "bg-white/20 text-cyan-300 border border-cyan-400/50 shadow-sm"
                          : "bg-white/15 text-white font-bold border-l-4 border-cyan-400 shadow-2xs translate-x-0.5"
                        : "text-slate-300 hover:bg-white/10 hover:text-white hover:translate-x-1"
                    )}
                  >
                    <div className={cn("flex items-center gap-2.5", sidebarCollapsed && "justify-center")}>
                      <Icon
                        className={cn(
                          "shrink-0 transition-colors",
                          sidebarCollapsed ? "w-5 h-5" : "w-4 h-4",
                          isActive ? "text-cyan-300" : "text-slate-300 group-hover:text-cyan-300"
                        )}
                      />
                      {!sidebarCollapsed && <span>{item.label}</span>}
                    </div>
                  </button>

                  {sidebarCollapsed && (
                    <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 px-3.5 py-1.5 rounded-xl bg-[#e3e3e3] text-zinc-900 text-xs font-semibold whitespace-nowrap shadow-xl pointer-events-none opacity-0 group-hover:opacity-100 transition-all duration-150 z-50">
                      {item.label}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>
        </div>

        {/* Bottom Profile & Privacy Shield */}
        <div className="shrink-0 p-2 border-t border-white/10">
          {/* Tenant RLS note */}
          {!sidebarCollapsed ? (
            <div className="p-2.5 mx-1 mb-2 rounded-xl bg-white/5 border border-white/10 flex items-center gap-2">
              <Lock className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span className="text-[10px] text-slate-300 leading-tight">
                Client office privacy enforced via PostgreSQL RLS.
              </span>
            </div>
          ) : (
            <div className="relative group mb-1 flex justify-center">
              <div className="w-11 h-11 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center cursor-default">
                <Lock className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 px-3.5 py-1.5 rounded-xl bg-[#e3e3e3] text-zinc-900 text-xs font-semibold whitespace-nowrap shadow-xl pointer-events-none opacity-0 group-hover:opacity-100 transition-all duration-150 z-50">
                RLS Privacy Active
              </div>
            </div>
          )}

          {/* Admin User Card & Sign Out */}
          {!sidebarCollapsed ? (
            <div className="flex items-center justify-between p-2 rounded-xl bg-white/10 border border-white/10 mx-1">
              <div className="flex items-center gap-2.5 truncate">
                <div className="w-8 h-8 rounded-full bg-[#4CAF50] text-white font-bold text-xs flex items-center justify-center shadow-xs shrink-0">
                  AD
                </div>
                <div className="flex flex-col truncate leading-tight">
                  <span className="text-xs font-bold text-white truncate">
                    {user?.name || "Master Admin"}
                  </span>
                  <span className="text-[10px] text-cyan-200/70 truncate">
                    {user?.email || "admin@whoopit.io"}
                  </span>
                </div>
              </div>

              <button
                onClick={() => logout()}
                className="w-7 h-7 rounded-lg hover:bg-rose-500/20 text-slate-300 hover:text-rose-300 flex items-center justify-center transition-colors cursor-pointer shrink-0"
                title="Sign Out"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1.5">
              <div className="relative group">
                <div className="w-10 h-10 rounded-full bg-[#4CAF50] text-white font-bold text-sm flex items-center justify-center shadow-xs cursor-default">
                  AD
                </div>
                <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 px-3.5 py-1.5 rounded-xl bg-[#e3e3e3] text-zinc-900 text-xs font-semibold whitespace-nowrap shadow-xl pointer-events-none opacity-0 group-hover:opacity-100 transition-all duration-150 z-50">
                  {user?.name || "Master Admin"} ({user?.email || "admin@whoopit.io"})
                </div>
              </div>

              <div className="relative group">
                <button
                  onClick={() => logout()}
                  className="w-11 h-11 rounded-xl hover:bg-rose-500/20 text-slate-300 hover:text-rose-300 flex items-center justify-center transition-all cursor-pointer"
                  aria-label="Sign Out"
                >
                  <LogOut className="w-4 h-4" />
                </button>
                <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 px-3.5 py-1.5 rounded-xl bg-[#e3e3e3] text-zinc-900 text-xs font-semibold whitespace-nowrap shadow-xl pointer-events-none opacity-0 group-hover:opacity-100 transition-all duration-150 z-50">
                  Sign Out
                </div>
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* ======================================================== */}
      {/* 2. ADMIN MAIN VIEWPORT (CLEAN LIGHT THEME)                */}
      {/* ======================================================== */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-gradient-to-br from-[#eef5f6] via-[#f4f7f9] to-[#eef2f7]">
        {/* Top Header Bar — title + actions only */}
        <header className="h-14 border-b border-slate-200/80 bg-white/90 backdrop-blur-sm px-5 sm:px-7 flex items-center justify-between shrink-0 z-20">
          <h1 className="text-sm font-bold text-slate-900 tracking-tight">
            {activeTab === "overview" && "Software Overview"}
            {activeTab === "clients" && "Client Companies"}
            {activeTab === "licenses" && "License Plans"}
            {activeTab === "users" && (selectedUsersOrgId ? selectedCompanyName : "Client IT Managers")}
            {activeTab === "system" && "Database & SMTP Health"}
            {activeTab === "audit" && "Platform Activity Logs"}
          </h1>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsCommandPaletteOpen(true)}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 text-xs font-medium transition-colors cursor-pointer"
              title="Search (⌘K)"
            >
              <Search className="w-3.5 h-3.5 text-slate-400" />
              <span className="hidden md:inline">Search</span>
            </button>

            <button
              onClick={fetchAdminData}
              disabled={isLoading}
              className="flex items-center justify-center w-8 h-8 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 transition-colors cursor-pointer disabled:opacity-50"
              title="Refresh"
            >
              <RefreshCw className={cn("w-3.5 h-3.5 text-[#0c3843]", isLoading && "animate-spin")} />
            </button>

            {(activeTab === "overview" || activeTab === "clients") && (
              <button
                type="button"
                onClick={() => setIsModalOpen(true)}
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0c3843] hover:bg-[#082931] text-white text-xs font-bold transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Give Software</span>
              </button>
            )}
          </div>
        </header>

        {/* Scrollable Admin Content Body */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-5 lg:p-6 space-y-6">
          {/* ==================================================== */}
          {/* TAB 1: OVERVIEW & STATS                              */}
          {/* ==================================================== */}
          {activeTab === "overview" && (
            <div className="space-y-5">
              <p className="text-xs text-slate-500">
                Companies, licenses, and platform health at a glance.
              </p>

              {/* KPI cards — soft color accents */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <button
                  type="button"
                  onClick={() => handleTabChange("clients", "ALL")}
                  className="p-4 rounded-2xl border border-teal-200/80 bg-gradient-to-br from-teal-50 to-white text-left space-y-2 hover:shadow-md hover:border-teal-300 transition-all cursor-pointer"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-teal-800 uppercase tracking-wide">Companies</span>
                    <div className="w-8 h-8 rounded-xl bg-teal-100 text-teal-700 flex items-center justify-center border border-teal-200">
                      <Building2 className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="text-2xl font-extrabold text-slate-900 font-mono">{clientCompanies.length}</div>
                  <div className="text-[11px] text-teal-700/80 font-medium">
                    {
                      clientCompanies.filter(
                        (c) => c.plan.toLowerCase() !== "suspended" && c.status !== "suspended"
                      ).length
                    }{" "}
                    active
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => handleTabChange("clients", "enterprise")}
                  className="p-4 rounded-2xl border border-[#0c3843]/20 bg-gradient-to-br from-[#0c3843]/8 to-white text-left space-y-2 hover:shadow-md hover:border-[#0c3843]/40 transition-all cursor-pointer"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-[#0c3843] uppercase tracking-wide">Enterprise</span>
                    <div className="w-8 h-8 rounded-xl bg-[#0c3843]/10 text-[#0c3843] flex items-center justify-center border border-[#0c3843]/20">
                      <Briefcase className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="text-2xl font-extrabold text-slate-900 font-mono">
                    {telemetry ? telemetry.active_enterprises : clients.filter((c) => c.plan.toLowerCase() === "enterprise").length}
                  </div>
                  <div className="text-[11px] text-[#0c3843]/80 font-medium">Full feature tier</div>
                </button>

                <button
                  type="button"
                  onClick={() => handleTabChange("users")}
                  className="p-4 rounded-2xl border border-sky-200/80 bg-gradient-to-br from-sky-50 to-white text-left space-y-2 hover:shadow-md hover:border-sky-300 transition-all cursor-pointer"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-sky-800 uppercase tracking-wide">IT Managers</span>
                    <div className="w-8 h-8 rounded-xl bg-sky-100 text-sky-700 flex items-center justify-center border border-sky-200">
                      <Users className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="text-2xl font-extrabold text-slate-900 font-mono">
                    {primaryITManagers.length}
                  </div>
                  <div className="text-[11px] text-sky-700/80 font-medium">{clientUsers.length} total accounts</div>
                </button>

                <button
                  type="button"
                  onClick={() => handleTabChange("system")}
                  className={cn(
                    "p-4 rounded-2xl border text-left space-y-2 hover:shadow-md transition-all cursor-pointer bg-gradient-to-br to-white",
                    servicePings.postgres && !servicePings.postgres.ok
                      ? "border-rose-200 from-rose-50 hover:border-rose-300"
                      : !servicePings.postgres
                        ? "border-amber-200 from-amber-50 hover:border-amber-300"
                        : "border-emerald-200/80 from-emerald-50 hover:border-emerald-300"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={cn(
                        "text-[11px] font-bold uppercase tracking-wide",
                        servicePings.postgres && !servicePings.postgres.ok
                          ? "text-rose-800"
                          : !servicePings.postgres
                            ? "text-amber-800"
                            : "text-emerald-800"
                      )}
                    >
                      Health
                    </span>
                    <div
                      className={cn(
                        "w-8 h-8 rounded-xl flex items-center justify-center border",
                        servicePings.postgres && !servicePings.postgres.ok
                          ? "bg-rose-100 text-rose-700 border-rose-200"
                          : !servicePings.postgres
                            ? "bg-amber-100 text-amber-700 border-amber-200"
                            : "bg-emerald-100 text-emerald-700 border-emerald-200"
                      )}
                    >
                      <Database className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="text-2xl font-extrabold text-slate-900 font-mono flex items-center gap-2">
                    <span
                      className={cn(
                        "w-2.5 h-2.5 rounded-full",
                        servicePings.postgres && !servicePings.postgres.ok
                          ? "bg-rose-500"
                          : !servicePings.postgres
                            ? "bg-amber-500"
                            : "bg-emerald-500 animate-pulse"
                      )}
                    />
                    {servicePings.postgres && !servicePings.postgres.ok
                      ? "Offline"
                      : !servicePings.postgres
                        ? "…"
                        : "Online"}
                  </div>
                  <div
                    className={cn(
                      "text-[11px] font-medium",
                      servicePings.postgres && !servicePings.postgres.ok
                        ? "text-rose-700/80"
                        : !servicePings.postgres
                          ? "text-amber-700/80"
                          : "text-emerald-700/80"
                    )}
                  >
                    {servicePings.postgres?.latency || "Postgres probe"}
                  </div>
                </button>
              </div>

              {/* License distribution */}
              <div className="p-5 rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-white to-slate-50 space-y-4 shadow-xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <span className="w-7 h-7 rounded-lg bg-amber-100 text-amber-700 border border-amber-200 flex items-center justify-center">
                        <Key className="w-3.5 h-3.5" />
                      </span>
                      License distribution
                    </h3>
                    <p className="text-xs text-slate-500 mt-1">
                      Across {clientCompanies.length} client {clientCompanies.length === 1 ? "company" : "companies"}.
                    </p>
                  </div>
                  <button
                    onClick={() => handleTabChange("licenses")}
                    className="text-xs font-bold text-[#0c3843] hover:underline flex items-center gap-1 self-start sm:self-auto cursor-pointer"
                  >
                    <span>Plans</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                {(() => {
                  const pool = clientCompanies;
                  const entCount = telemetry?.active_enterprises ?? pool.filter((c) => c.plan.toLowerCase() === "enterprise").length;
                  const stdCount = telemetry?.active_standards ?? pool.filter((c) => c.plan.toLowerCase() === "standard").length;
                  const trialCount = telemetry?.active_trials ?? pool.filter((c) => c.plan.toLowerCase() === "trial").length;
                  const suspendedCount = pool.filter(
                    (c) => c.plan.toLowerCase() === "suspended" || c.status === "suspended"
                  ).length;
                  const licensedTotal = Math.max(1, entCount + stdCount + trialCount + suspendedCount);
                  const entPct = Math.round((entCount / licensedTotal) * 100);
                  const stdPct = Math.round((stdCount / licensedTotal) * 100);
                  const trialPct = Math.round((trialCount / licensedTotal) * 100);
                  const suspendedPct = Math.max(0, 100 - entPct - stdPct - trialPct);

                  return (
                    <div className="space-y-3">
                      <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden flex shadow-inner">
                        <div
                          style={{ width: `${entPct}%` }}
                          className="bg-[#0c3843] h-full transition-all duration-500"
                          title={`Enterprise: ${entCount} (${entPct}%)`}
                        />
                        <div
                          style={{ width: `${stdPct}%` }}
                          className="bg-blue-500 h-full transition-all duration-500"
                          title={`Standard: ${stdCount} (${stdPct}%)`}
                        />
                        <div
                          style={{ width: `${trialPct}%` }}
                          className="bg-amber-400 h-full transition-all duration-500"
                          title={`30-Day Trial: ${trialCount} (${trialPct}%)`}
                        />
                        {suspendedPct > 0 && (
                          <div
                            style={{ width: `${suspendedPct}%` }}
                            className="bg-slate-400 h-full transition-all duration-500"
                            title={`Suspended: ${suspendedCount} (${suspendedPct}%)`}
                          />
                        )}
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-3 text-xs pt-1">
                        <button
                          onClick={() => handleTabChange("clients", "enterprise")}
                          className="flex items-center gap-2 group cursor-pointer hover:opacity-80 transition-opacity"
                        >
                          <span className="w-2.5 h-2.5 rounded-full bg-[#0c3843] shrink-0" />
                          <span className="font-semibold text-slate-700">Enterprise:</span>
                          <span className="font-bold text-[#0c3843] font-mono group-hover:underline">
                            {entCount} Clients &rarr;
                          </span>
                        </button>

                        <button
                          onClick={() => handleTabChange("clients", "standard")}
                          className="flex items-center gap-2 group cursor-pointer hover:opacity-80 transition-opacity"
                        >
                          <span className="w-2.5 h-2.5 rounded-full bg-blue-500 shrink-0" />
                          <span className="font-semibold text-slate-700">Standard:</span>
                          <span className="font-bold text-blue-700 font-mono group-hover:underline">
                            {stdCount} Clients &rarr;
                          </span>
                        </button>

                        <button
                          onClick={() => handleTabChange("clients", "trial")}
                          className="flex items-center gap-2 group cursor-pointer hover:opacity-80 transition-opacity"
                        >
                          <span className="w-2.5 h-2.5 rounded-full bg-amber-400 shrink-0" />
                          <span className="font-semibold text-slate-700">30-Day Trial:</span>
                          <span className="font-bold text-amber-700 font-mono group-hover:underline">
                            {trialCount} Clients &rarr;
                          </span>
                        </button>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* 2-Column Section: Top 5 Recent Clients & Live Security Telemetry */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Column 1: Top 5 Recently Given Software */}
                <div className="rounded-3xl border border-slate-200/80 bg-white shadow-xs p-6 space-y-4 flex flex-col justify-between">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                      <div>
                        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                          <Building2 className="w-4 h-4 text-[#0c3843]" />
                          <span>Recent Companies Given Software</span>
                        </h3>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Latest 5 client company workspaces provisioned on the platform.
                        </p>
                      </div>
                      <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                        {clients.length} Total
                      </span>
                    </div>

                    <div className="space-y-2">
                      {clients.slice(0, 5).map((client) => {
                        const isEnterprise = client.plan.toLowerCase() === "enterprise";
                        const isStandard = client.plan.toLowerCase() === "standard";
                        const isSuspended = client.plan.toLowerCase() === "suspended" || client.status === "suspended";
                        const lead = usersList.find((u) => u.org_id === client.org_id);

                        return (
                          <div
                            key={client.org_id}
                            className="p-3 rounded-2xl bg-slate-50/70 border border-slate-200/80 hover:bg-white hover:border-[#0c3843]/30 hover:shadow-xs transition-all flex items-center justify-between gap-3 text-xs"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-8 h-8 rounded-xl bg-[#0c3843] text-cyan-300 font-bold text-xs flex items-center justify-center shrink-0">
                                {client.name.substring(0, 2).toUpperCase()}
                              </div>
                              <div className="min-w-0">
                                <div className="font-bold text-slate-900 truncate">{client.name}</div>
                                <div className="text-[11px] text-slate-500 font-mono truncate">
                                  {lead?.email || `${client.slug}@whoopit.io`}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <span
                                className={cn(
                                  "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border",
                                  isSuspended
                                    ? "bg-rose-50 text-rose-700 border-rose-200"
                                    : isEnterprise
                                    ? "bg-purple-50 text-purple-700 border-purple-200"
                                    : isStandard
                                    ? "bg-blue-50 text-blue-700 border-blue-200"
                                    : "bg-amber-50 text-amber-700 border-amber-200"
                                )}
                              >
                                {isSuspended ? "SUSPENDED" : client.plan}
                              </span>

                              <button
                                onClick={() => openClientModal(client, "details")}
                                className="p-1.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 hover:text-[#0c3843] transition-colors cursor-pointer"
                                title="Manage Client"
                              >
                                <Sliders className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <button
                    onClick={() => handleTabChange("clients", "ALL")}
                    className="w-full mt-4 py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-[#0c3843] text-slate-700 hover:text-white font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-2xs group"
                  >
                    <span>View All {clients.length} Client Companies</span>
                    <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                  </button>
                </div>

                {/* Column 2: Live Security & Platform Audit Stream */}
                <div className="rounded-3xl border border-slate-200/80 bg-white shadow-xs p-6 space-y-4 flex flex-col justify-between">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                      <div>
                        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                          <FileText className="w-4 h-4 text-[#0c3843]" />
                          <span>Recent Platform Audit Events</span>
                        </h3>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Real-time security telemetry showing network IP addresses and actor logins.
                        </p>
                      </div>
                      <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        Live Stream
                      </span>
                    </div>

                    <div className="space-y-2">
                      {auditLogs.slice(0, 5).map((log) => {
                        const isProvision = log.action.includes("PROVISION");
                        const isPlan = log.action.includes("PLAN");
                        const isLogin = log.action.includes("LOGIN") || log.action.includes("AUTH");

                        return (
                          <div
                            key={log.audit_id}
                            className="p-3 rounded-2xl bg-slate-50/70 border border-slate-200/80 hover:bg-white hover:border-[#0c3843]/30 hover:shadow-xs transition-all flex items-center justify-between gap-3 text-xs"
                          >
                            <div className="space-y-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span
                                  className={cn(
                                    "px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border",
                                    isProvision
                                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                      : isPlan
                                      ? "bg-purple-50 text-purple-700 border-purple-200"
                                      : isLogin
                                      ? "bg-blue-50 text-blue-700 border-blue-200"
                                      : "bg-slate-100 text-slate-700 border-slate-200"
                                  )}
                                >
                                  {log.action}
                                </span>
                                <span className="font-semibold text-slate-900 truncate">
                                  {log.org_name || log.entity_type}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 text-[10px] text-slate-500 font-mono flex-wrap">
                                <span className="truncate">{log.user_email}</span>
                                <span>&bull;</span>
                                <span className="px-1.5 py-0.2 rounded-md bg-cyan-50 text-cyan-800 border border-cyan-200 font-bold flex items-center gap-1">
                                  <Globe className="w-2.5 h-2.5 text-cyan-700" />
                                  IP: {log.ip_address}
                                </span>
                              </div>
                            </div>

                            <span className="text-[10px] text-slate-400 font-mono shrink-0">
                              {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <button
                    onClick={() => handleTabChange("audit")}
                    className="w-full mt-4 py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-[#0c3843] text-slate-700 hover:text-white font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-2xs group"
                  >
                    <span>View All {auditLogs.length} Security Logs</span>
                    <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ==================================================== */}
          {/* TAB 2: CLIENTS & COMPANIES DIRECTORY                 */}
          {/* ==================================================== */}
          {activeTab === "clients" && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <p className="text-xs text-slate-500">
                  {filteredClients.length === clientCompanies.length
                    ? `${clientCompanies.length} provisioned ${clientCompanies.length === 1 ? "company" : "companies"}`
                    : `${filteredClients.length} of ${clientCompanies.length} shown`}
                </p>
                <button
                  type="button"
                  onClick={handleExportClientsCSV}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors cursor-pointer self-start sm:self-auto"
                  title="Export directory CSV"
                >
                  <Download className="w-3.5 h-3.5 text-slate-500" />
                  <span>Export CSV</span>
                </button>
              </div>

              {(() => {
                const enterpriseCount = clientCompanies.filter((c) => c.plan.toLowerCase() === "enterprise" && c.status !== "suspended").length;
                const standardCount = clientCompanies.filter((c) => c.plan.toLowerCase() === "standard" && c.status !== "suspended").length;
                const trialCount = clientCompanies.filter((c) => c.plan.toLowerCase() === "trial" && c.status !== "suspended").length;
                const suspendedCount = clientCompanies.filter((c) => c.plan.toLowerCase() === "suspended" || c.status === "suspended").length;

                return (
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setPlanFilter("ALL")}
                      className={cn(
                        "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold",
                        planFilter === "ALL"
                          ? "bg-[#0c3843] border-[#0c3843] text-white"
                          : "bg-white border-slate-200 text-slate-700"
                      )}
                    >
                      All <span className="font-mono font-bold">{clientCompanies.length}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setPlanFilter("enterprise")}
                      className={cn(
                        "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold",
                        planFilter === "enterprise"
                          ? "bg-[#0c3843] border-[#0c3843] text-white"
                          : "bg-white border-slate-200 text-slate-700"
                      )}
                    >
                      Enterprise <span className="font-mono font-bold">{enterpriseCount}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setPlanFilter("standard")}
                      className={cn(
                        "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold",
                        planFilter === "standard"
                          ? "bg-[#0c3843] border-[#0c3843] text-white"
                          : "bg-white border-slate-200 text-slate-700"
                      )}
                    >
                      Standard <span className="font-mono font-bold">{standardCount}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setPlanFilter("trial")}
                      className={cn(
                        "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold",
                        planFilter === "trial"
                          ? "bg-amber-600 border-amber-600 text-white"
                          : "bg-white border-amber-200 text-amber-800"
                      )}
                    >
                      Trial <span className="font-mono font-bold">{trialCount}</span>
                    </button>
                    {suspendedCount > 0 && (
                      <button
                        type="button"
                        onClick={() => setPlanFilter("suspended")}
                        className={cn(
                          "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold",
                          planFilter === "suspended"
                            ? "bg-rose-700 border-rose-700 text-white"
                            : "bg-white border-rose-200 text-rose-700"
                        )}
                      >
                        Suspended <span className="font-mono font-bold">{suspendedCount}</span>
                      </button>
                    )}
                  </div>
                );
              })()}

              <div className="rounded-2xl border border-slate-200/80 bg-white overflow-hidden">
                {/* Unified Card Toolbar: Search, Filters & View Toggle */}
                <div className="p-4 border-b border-slate-100 bg-white flex flex-col md:flex-row md:items-center justify-between gap-3">
                  {/* Left: Search Bar */}
                  <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search by company name, slug, ID, or IT lead..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-10 pr-9 py-2 rounded-xl text-xs bg-slate-50 border border-slate-200 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-[#0c3843]/20 focus:border-[#0c3843] text-slate-900 placeholder:text-slate-400 transition-all"
                    />
                    {searchQuery && (
                      <button
                        onClick={() => setSearchQuery("")}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
                        title="Clear search"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Right: Active Filter Badge & View Switcher */}
                  <div className="flex items-center gap-3 self-end md:self-auto shrink-0">
                    {/* Active Filter Indicator */}
                    <div className="text-xs text-slate-500 font-medium hidden sm:flex items-center gap-1.5">
                      <span>Plan:</span>
                      <span className="font-bold text-[#0c3843] uppercase px-2 py-0.5 rounded-md bg-[#0c3843]/5 border border-[#0c3843]/15">
                        {planFilter === "ALL" ? "All Plans" : planFilter}
                      </span>
                    </div>

                    {/* View Switcher: Table vs Cards */}
                    <div className="flex items-center p-1 bg-slate-100 rounded-xl border border-slate-200">
                      <button
                        onClick={() => setViewMode("table")}
                        className={cn(
                          "p-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1",
                          viewMode === "table"
                            ? "bg-white text-[#0c3843] shadow-xs font-bold"
                            : "text-slate-500 hover:text-slate-900"
                        )}
                        title="Table View"
                      >
                        <List className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Table</span>
                      </button>
                      <button
                        onClick={() => setViewMode("cards")}
                        className={cn(
                          "p-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1",
                          viewMode === "cards"
                            ? "bg-white text-[#0c3843] shadow-xs font-bold"
                            : "text-slate-500 hover:text-slate-900"
                        )}
                        title="Executive Cards View"
                      >
                        <LayoutGrid className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Cards</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* 4. Active Filters Reset Bar (if filtered) */}
                {(planFilter !== "ALL" || searchQuery) && (
                  <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 flex items-center justify-between text-xs text-slate-700 animate-in fade-in">
                    <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#0c3843] animate-pulse" />
                      <span>
                        Showing {filteredClients.length} of {clients.length} client companies
                        {planFilter !== "ALL" && (
                          <span> &bull; Plan: <strong className="uppercase">{planFilter}</strong></span>
                        )}
                        {searchQuery && (
                          <span> &bull; Query: &quot;<strong>{searchQuery}</strong>&quot;</span>
                        )}
                      </span>
                    </div>

                    <button
                      onClick={() => {
                        setPlanFilter("ALL");
                        setSearchQuery("");
                      }}
                      className="text-xs font-bold text-[#0c3843] hover:underline cursor-pointer flex items-center gap-1"
                    >
                      <span>Reset Filters</span>
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                )}

                {/* 5. Directory Content: Table View vs. Cards View */}
                {viewMode === "table" ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-slate-50/90 text-slate-600 border-b border-slate-200">
                        <tr>
                          <th className="py-3 px-3 font-bold uppercase tracking-wider text-[11px] w-12 text-center">
                            S.No
                          </th>
                          <th className="py-3 px-4 font-bold uppercase tracking-wider text-[11px] min-w-[220px]">
                            Client Company
                          </th>
                          <th className="py-3 px-4 font-bold uppercase tracking-wider text-[11px] min-w-[200px]">
                            Primary IT Lead
                          </th>
                          <th className="py-3 px-3 font-bold uppercase tracking-wider text-[11px] text-center w-28 whitespace-nowrap">
                            Software License
                          </th>
                          <th className="py-3 px-3 font-bold uppercase tracking-wider text-[11px] text-center w-36 whitespace-nowrap">
                            Office Hardware Fleet
                          </th>
                          <th className="py-3 px-3 font-bold uppercase tracking-wider text-[11px] text-center w-24 whitespace-nowrap">
                            Status
                          </th>
                          <th className="py-3 px-3 font-bold uppercase tracking-wider text-[11px] text-center w-28 whitespace-nowrap">
                            Given On
                          </th>
                          <th className="py-3 px-4 font-bold uppercase tracking-wider text-[11px] text-center w-32 whitespace-nowrap">
                            Action
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-slate-700">
                        {paginatedClientsTab.length === 0 ? (
                          <tr>
                            <td colSpan={8} className="py-16 text-center text-slate-400">
                              <Building2 className="w-10 h-10 mx-auto mb-2 text-slate-300 stroke-1" />
                              <p className="font-semibold text-slate-600 text-sm">No client companies found</p>
                              <p className="text-xs text-slate-400 mt-0.5">Try adjusting your search query or plan filter.</p>
                            </td>
                          </tr>
                        ) : (
                          paginatedClientsTab.map((client, idx) => {
                            const isEnterprise = client.plan.toLowerCase() === "enterprise";
                            const isStandard = client.plan.toLowerCase() === "standard";
                            const isSuspended = client.plan.toLowerCase() === "suspended" || client.status === "suspended";
                            const lead = usersList.find((u) => u.org_id === client.org_id && (u.role === "admin" || u.role === "owner")) || usersList.find((u) => u.org_id === client.org_id);
                            const serialNumber = (clientsTabPage - 1) * PAGE_SIZE + idx + 1;

                            return (
                              <tr
                                key={client.org_id}
                                className="hover:bg-slate-50/80 transition-colors duration-150 group"
                              >
                                {/* S.No */}
                                <td className="py-3 px-3 text-center font-mono text-[11px] text-slate-400 font-semibold">
                                  #{serialNumber < 10 ? `0${serialNumber}` : serialNumber}
                                </td>

                                {/* Client Company */}
                                <td className="py-3 px-4">
                                  <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 rounded-xl bg-[#0c3843] text-cyan-300 font-bold text-xs flex items-center justify-center shrink-0 shadow-2xs group-hover:scale-105 transition-transform">
                                      {client.name.substring(0, 2).toUpperCase()}
                                    </div>
                                    <div className="min-w-0">
                                      <div className="font-bold text-slate-900 text-xs truncate max-w-[200px]">
                                        {client.name}
                                      </div>
                                      <div className="flex items-center gap-1.5 text-[10px] text-slate-500 font-mono mt-0.5">
                                        <span className="truncate max-w-[130px]">{client.slug}</span>
                                        <span>&bull;</span>
                                        <span className="text-slate-400" title={client.org_id}>
                                          ID: {client.org_id.substring(0, 6)}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                </td>

                                {/* Primary IT Lead */}
                                <td className="py-3 px-4">
                                  <div className="space-y-0.5">
                                    <div className="flex items-center gap-1.5">
                                      <span className="font-bold text-slate-900 text-xs">
                                        {lead?.name || "IT Administrator"}
                                      </span>
                                      <span className="px-1.5 py-0.2 rounded-md bg-slate-100 text-slate-600 text-[9px] font-bold uppercase tracking-wider border border-slate-200">
                                        {lead?.role || "LEAD"}
                                      </span>
                                    </div>
                                    <div className="text-[11px] font-mono text-slate-500 flex items-center gap-1">
                                      <span className="truncate max-w-[150px]">{lead?.email || `${client.slug}@whoopit.io`}</span>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          navigator.clipboard.writeText(lead?.email || `${client.slug}@whoopit.io`);
                                          toast({ title: "Copied", description: "Email copied to clipboard", variant: "success" });
                                        }}
                                        className="text-slate-400 hover:text-[#0c3843] transition-colors cursor-pointer"
                                        title="Copy email address"
                                      >
                                        <Copy className="w-3 h-3" />
                                      </button>
                                    </div>
                                  </div>
                                </td>

                                {/* Software License */}
                                <td className="py-3 px-3 text-center whitespace-nowrap">
                                  <span
                                    className={cn(
                                      "px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border inline-flex items-center gap-1 shadow-2xs",
                                      isSuspended
                                        ? "bg-rose-50 text-rose-700 border-rose-200"
                                        : isEnterprise
                                        ? "bg-purple-50 text-purple-700 border-purple-200"
                                        : isStandard
                                        ? "bg-blue-50 text-blue-700 border-blue-200"
                                        : "bg-amber-50 text-amber-700 border-amber-200"
                                    )}
                                  >
                                    <Key className="w-3 h-3" />
                                    <span>{isSuspended ? "SUSPENDED" : client.plan}</span>
                                  </span>
                                </td>

                                {/* Office Hardware Fleet */}
                                <td className="py-3 px-3 text-center whitespace-nowrap">
                                  <div className="inline-flex flex-col items-center">
                                    <span className="font-mono font-bold text-slate-900 text-xs flex items-center gap-1">
                                      <Laptop className="w-3 h-3 text-[#0c3843]" />
                                      {client.item_count} IT Assets
                                    </span>
                                    <span className="text-[10px] text-slate-400 font-mono">
                                      {client.user_count} Staff &bull; {client.movement_count} Moves
                                    </span>
                                  </div>
                                </td>

                                {/* Status */}
                                <td className="py-3 px-3 text-center whitespace-nowrap">
                                  {isSuspended ? (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
                                      <AlertTriangle className="w-3 h-3 text-rose-600" />
                                      <span>Suspended</span>
                                    </span>
                                  ) : client.plan.toLowerCase() === "trial" ? (
                                    client.is_trial_expired ? (
                                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
                                        <AlertTriangle className="w-3 h-3 text-rose-600" />
                                        <span>Expired</span>
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                                        <Clock className="w-3 h-3 text-amber-600" />
                                        <span>{client.trial_days_remaining ?? 30}d Left</span>
                                      </span>
                                    )
                                  ) : (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                      <span>Active</span>
                                    </span>
                                  )}
                                </td>

                                {/* Given On */}
                                <td className="py-3 px-3 text-center text-[11px] font-mono text-slate-500 whitespace-nowrap">
                                  {new Date(client.created_at).toLocaleDateString()}
                                </td>

                                {/* Action */}
                                <td className="py-3 px-4 text-center whitespace-nowrap">
                                  <div className="flex items-center justify-center gap-1.5">
                                    <button
                                      onClick={() => openClientModal(client, "details")}
                                      className="inline-flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-[#0c3843] text-slate-700 hover:text-white border border-slate-200/80 hover:border-[#0c3843] text-xs font-bold transition-all duration-200 cursor-pointer shadow-2xs group/btn"
                                      title="Manage software license, IT manager, and operational trail"
                                    >
                                      <Sliders className="w-3.5 h-3.5 text-slate-500 group-hover/btn:text-cyan-300 transition-colors" />
                                      <span>Manage</span>
                                    </button>

                                    {/* Welcome Kit — email + login URL only (no invented password) */}
                                    <button
                                      onClick={() => {
                                        setWelcomeKitClient({
                                          name: client.name,
                                          slug: client.slug,
                                          org_id: client.org_id,
                                          plan: client.plan,
                                          email: lead?.email || `${client.slug}@whoopit.io`,
                                        });
                                      }}
                                      className="inline-flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-xl bg-teal-50 hover:bg-teal-600 text-teal-700 hover:text-white border border-teal-200 hover:border-teal-600 text-xs font-bold transition-all duration-200 cursor-pointer shadow-2xs"
                                      title="Open Client Welcome Kit & Onboarding Dossier"
                                    >
                                      <FileText className="w-3.5 h-3.5" />
                                      <span className="hidden xl:inline">Welcome Kit</span>
                                    </button>

                                    {/* Enhancement 2: Quick Reactivate button if suspended */}
                                    {isSuspended && (
                                      <button
                                        onClick={() => handleQuickReactivate(client)}
                                        className="inline-flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-600 text-emerald-700 hover:text-white border border-emerald-200 text-xs font-bold transition-all duration-200 cursor-pointer shadow-2xs"
                                        title="Reactivate Client Workspace"
                                      >
                                        <Play className="w-3 h-3" />
                                        <span>Reactivate</span>
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
                ) : (
                  /* Cards Grid View */
                  <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {paginatedClientsTab.length === 0 ? (
                      <div className="col-span-full py-16 text-center text-slate-400">
                        <Building2 className="w-10 h-10 mx-auto mb-2 text-slate-300 stroke-1" />
                        <p className="font-semibold text-slate-600 text-sm">No client companies found</p>
                      </div>
                    ) : (
                      paginatedClientsTab.map((client, idx) => {
                        const isEnterprise = client.plan.toLowerCase() === "enterprise";
                        const isStandard = client.plan.toLowerCase() === "standard";
                        const isSuspended = client.plan.toLowerCase() === "suspended" || client.status === "suspended";
                        const lead = usersList.find((u) => u.org_id === client.org_id);
                        const serialNumber = (clientsTabPage - 1) * PAGE_SIZE + idx + 1;

                        return (
                          <div
                            key={client.org_id}
                            className="p-5 rounded-2xl border border-slate-200/80 bg-white hover:border-[#0c3843]/40 hover:shadow-lg transition-all duration-300 flex flex-col justify-between space-y-4 group"
                          >
                            <div className="space-y-3">
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <div className="w-10 h-10 rounded-xl bg-[#0c3843] text-cyan-300 font-bold text-sm flex items-center justify-center shrink-0 shadow-sm">
                                    {client.name.substring(0, 2).toUpperCase()}
                                  </div>
                                  <div className="min-w-0">
                                    <h4 className="font-bold text-slate-900 text-sm truncate">{client.name}</h4>
                                    <span className="text-[10px] text-slate-400 font-mono block truncate">
                                      #{serialNumber < 10 ? `0${serialNumber}` : serialNumber} &bull; {client.slug}
                                    </span>
                                  </div>
                                </div>

                                <span
                                  className={cn(
                                    "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border shrink-0",
                                    isSuspended
                                      ? "bg-rose-50 text-rose-700 border-rose-200"
                                      : isEnterprise
                                      ? "bg-purple-50 text-purple-700 border-purple-200"
                                      : isStandard
                                      ? "bg-blue-50 text-blue-700 border-blue-200"
                                      : "bg-amber-50 text-amber-700 border-amber-200"
                                  )}
                                >
                                  {isSuspended ? "SUSPENDED" : client.plan}
                                </span>
                              </div>

                              <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 space-y-1">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                                  IT Lead Contact
                                </span>
                                <div className="font-semibold text-slate-800 text-xs truncate">
                                  {lead?.name || "IT Administrator"}
                                </div>
                                <div className="text-[11px] font-mono text-[#0c3843] truncate">
                                  {lead?.email || `${client.slug}@whoopit.io`}
                                </div>
                              </div>

                              <div className="grid grid-cols-3 gap-2 text-center">
                                <div className="p-2 rounded-lg bg-slate-50 border border-slate-100">
                                  <span className="text-[9px] uppercase font-bold text-slate-400 block">Assets</span>
                                  <span className="font-bold font-mono text-slate-800 text-xs">{client.item_count}</span>
                                </div>
                                <div className="p-2 rounded-lg bg-slate-50 border border-slate-100">
                                  <span className="text-[9px] uppercase font-bold text-slate-400 block">Staff</span>
                                  <span className="font-bold font-mono text-slate-800 text-xs">{client.user_count}</span>
                                </div>
                                <div className="p-2 rounded-lg bg-slate-50 border border-slate-100">
                                  <span className="text-[9px] uppercase font-bold text-slate-400 block">Moves</span>
                                  <span className="font-bold font-mono text-slate-800 text-xs">{client.movement_count}</span>
                                </div>
                              </div>
                            </div>

                            <button
                              onClick={() => openClientModal(client, "details")}
                              className="w-full py-2 px-3 rounded-xl bg-slate-100 hover:bg-[#0c3843] text-slate-700 hover:text-white text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 group/btn"
                            >
                              <Sliders className="w-3.5 h-3.5 text-slate-500 group-hover/btn:text-cyan-300 transition-colors" />
                              <span>Manage Client Workspace</span>
                              <ChevronRight className="w-3.5 h-3.5 group-hover/btn:translate-x-1 transition-transform" />
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}

                {/* 6. Pagination Toolbar (15 items per page) */}
                <div className="p-4 border-t border-slate-100 bg-white flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
                  <div className="font-medium">
                    Showing{" "}
                    <strong className="text-slate-800">
                      {filteredClients.length === 0 ? 0 : (clientsTabPage - 1) * PAGE_SIZE + 1}
                    </strong>{" "}
                    to{" "}
                    <strong className="text-slate-800">
                      {Math.min(clientsTabPage * PAGE_SIZE, filteredClients.length)}
                    </strong>{" "}
                    of <strong className="text-slate-800">{filteredClients.length}</strong> total clients
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setClientsTabPage((p) => Math.max(1, p - 1))}
                      disabled={clientsTabPage === 1}
                      className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors shadow-2xs flex items-center gap-1"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                      <span>Prev</span>
                    </button>

                    <div className="flex items-center gap-1">
                      {Array.from({ length: totalClientsTabPages }, (_, i) => i + 1).map((pageNum) => (
                        <button
                          key={pageNum}
                          onClick={() => setClientsTabPage(pageNum)}
                          className={cn(
                            "w-8 h-8 rounded-xl font-mono text-xs font-bold transition-all cursor-pointer",
                            clientsTabPage === pageNum
                              ? "bg-[#0c3843] text-white shadow-xs"
                              : "hover:bg-slate-100 text-slate-700"
                          )}
                        >
                          {pageNum}
                        </button>
                      ))}
                    </div>

                    <button
                      onClick={() => setClientsTabPage((p) => Math.min(totalClientsTabPages, p + 1))}
                      disabled={clientsTabPage >= totalClientsTabPages}
                      className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors shadow-2xs flex items-center gap-1"
                    >
                      <span>Next</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>

            </div>
          )}

          {/* ==================================================== */}
          {/* TAB 3: LICENSES & PLANS                              */}
          {/* ==================================================== */}
          {activeTab === "licenses" && (
            <div className="space-y-5">
              <p className="text-xs text-slate-500">
                Three commercial packages. Click a plan to filter matching companies.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Enterprise Tier */}
                <div
                  onClick={() => handleTabChange("clients", "enterprise")}
                  className="relative overflow-hidden p-5 rounded-2xl border border-[#0c3843]/25 bg-gradient-to-br from-[#0c3843]/10 via-white to-white space-y-4 hover:-translate-y-1 hover:shadow-lg hover:border-[#0c3843]/50 transition-all duration-300 cursor-pointer group flex flex-col justify-between"
                >
                  <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-[#0c3843] to-teal-500" />
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[#0c3843] text-white shadow-sm">
                        Enterprise
                      </span>
                      <span className="text-2xl font-extrabold text-[#0c3843] font-mono group-hover:scale-105 transition-transform">
                        {telemetry?.active_enterprises || 0}
                      </span>
                    </div>
                    <h3 className="text-base font-bold text-slate-900">Enterprise Office IT</h3>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      Unlimited offices, e-Sign handovers, repairs, and finance reporting.
                    </p>
                    <ul className="text-xs text-slate-700 space-y-2 pt-2 border-t border-[#0c3843]/10">
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="w-3.5 h-3.5 text-[#0c3843]" />
                        <span>Unlimited items &amp; movements</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="w-3.5 h-3.5 text-[#0c3843]" />
                        <span>Custom fields builder</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="w-3.5 h-3.5 text-[#0c3843]" />
                        <span>Priority support</span>
                      </li>
                    </ul>
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleTabChange("clients", "enterprise");
                    }}
                    className="w-full mt-2 py-2.5 px-3 rounded-xl bg-[#0c3843] hover:bg-[#082931] text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-sm shadow-[#0c3843]/25"
                  >
                    <span>View companies</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Standard Tier */}
                <div
                  onClick={() => handleTabChange("clients", "standard")}
                  className="relative overflow-hidden p-5 rounded-2xl border border-sky-200 bg-gradient-to-br from-sky-50 via-white to-white space-y-4 hover:-translate-y-1 hover:shadow-lg hover:border-sky-400 transition-all duration-300 cursor-pointer group flex flex-col justify-between"
                >
                  <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-sky-500 to-blue-500" />
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-sky-100 text-sky-800 border border-sky-200">
                        Standard
                      </span>
                      <span className="text-2xl font-extrabold text-sky-700 font-mono group-hover:scale-105 transition-transform">
                        {telemetry?.active_standards || 0}
                      </span>
                    </div>
                    <h3 className="text-base font-bold text-slate-900">Standard Office IT</h3>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      Single office, custody handovers, CSV reporting, and hardware lifecycle tracking.
                    </p>
                    <ul className="text-xs text-slate-700 space-y-2 pt-2 border-t border-sky-100">
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="w-3.5 h-3.5 text-sky-600" />
                        <span>Up to 5,000 office SKUs</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="w-3.5 h-3.5 text-sky-600" />
                        <span>CSV audit reports</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="w-3.5 h-3.5 text-sky-600" />
                        <span>Barcode tag printing</span>
                      </li>
                    </ul>
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleTabChange("clients", "standard");
                    }}
                    className="w-full mt-2 py-2.5 px-3 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-sm shadow-sky-600/20"
                  >
                    <span>View companies</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* 30-Day Trial Tier */}
                <div
                  onClick={() => handleTabChange("clients", "trial")}
                  className="relative overflow-hidden p-5 rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 via-white to-white space-y-4 hover:-translate-y-1 hover:shadow-lg hover:border-amber-400 transition-all duration-300 cursor-pointer group flex flex-col justify-between"
                >
                  <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-amber-400 to-orange-500" />
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-900 border border-amber-200">
                        Trial
                      </span>
                      <span className="text-2xl font-extrabold text-amber-700 font-mono group-hover:scale-105 transition-transform">
                        {telemetry?.active_trials || 0}
                      </span>
                    </div>
                    <h3 className="text-base font-bold text-slate-900">30-Day evaluation</h3>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      Full-feature trial for companies evaluating Whoopit.
                    </p>
                    <ul className="text-xs text-slate-700 space-y-2 pt-2 border-t border-amber-100">
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="w-3.5 h-3.5 text-amber-600" />
                        <span>30 days access</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="w-3.5 h-3.5 text-amber-600" />
                        <span>e-Sign handovers</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="w-3.5 h-3.5 text-amber-600" />
                        <span>Upgrade to paid plan</span>
                      </li>
                    </ul>
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleTabChange("clients", "trial");
                    }}
                    className="w-full mt-2 py-2.5 px-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-sm shadow-amber-500/25"
                  >
                    <span>View companies</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Feature matrix */}
              <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-xs">
                <div className="px-5 py-3.5 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white">
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-[#0c3843]" />
                    Feature matrix
                  </h3>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50/90 text-slate-600 border-b border-slate-200">
                      <tr>
                        <th className="py-2.5 px-3 font-bold uppercase tracking-wider text-[11px]">Capability</th>
                        <th className="py-2.5 px-3 font-bold uppercase tracking-wider text-[11px] text-[#0c3843]">Enterprise</th>
                        <th className="py-2.5 px-3 font-bold uppercase tracking-wider text-[11px] text-sky-700">Standard</th>
                        <th className="py-2.5 px-3 font-bold uppercase tracking-wider text-[11px] text-amber-700">Trial</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-600">
                      <tr className="hover:bg-slate-50/50">
                        <td className="py-2.5 px-3 font-bold text-slate-800">6-Bucket Office IT Asset Matrix (Owned, In Store, Assigned, Faulty, Vendor, Repaired)</td>
                        <td className="py-2.5 px-3 text-purple-700 font-bold">✓ Full Real-Time Matrix</td>
                        <td className="py-2.5 px-3 text-emerald-600 font-bold">✓ Included</td>
                        <td className="py-2.5 px-3 text-emerald-600 font-bold">✓ Included</td>
                      </tr>
                      <tr className="hover:bg-slate-50/50">
                        <td className="py-2.5 px-3 font-bold text-slate-800">Employee Asset Handover + Employee ID + Online Digital Signature Pad</td>
                        <td className="py-2.5 px-3 text-emerald-600 font-bold">✓ Unlimited Handovers &amp; e-Sign</td>
                        <td className="py-2.5 px-3 text-emerald-600 font-bold">✓ Included</td>
                        <td className="py-2.5 px-3 text-emerald-600 font-bold">✓ Included</td>
                      </tr>
                      <tr className="hover:bg-slate-50/50">
                        <td className="py-2.5 px-3 font-bold text-slate-800">Faulty IT Equipment &amp; Vendor Repair Tracker (Log Faulty &rarr; Send to Vendor &rarr; Repaired)</td>
                        <td className="py-2.5 px-3 text-emerald-600 font-bold">✓ Full Vendor Repair Lifecycle</td>
                        <td className="py-2.5 px-3 text-emerald-600 font-bold">✓ Included</td>
                        <td className="py-2.5 px-3 text-emerald-600 font-bold">✓ Included</td>
                      </tr>
                      <tr className="hover:bg-slate-50/50">
                        <td className="py-2.5 px-3 font-bold text-slate-800">Finance Manager Report (4-Section Audit CSV Download + Direct Email Attachment)</td>
                        <td className="py-2.5 px-3 text-emerald-600 font-bold">✓ CSV + PDF + Direct SMTP Email</td>
                        <td className="py-2.5 px-3 text-emerald-600 font-bold">✓ CSV Download</td>
                        <td className="py-2.5 px-3 text-emerald-600 font-bold">✓ Preview Mode</td>
                      </tr>
                      <tr className="hover:bg-slate-50/50">
                        <td className="py-2.5 px-3 font-bold text-slate-800">Custom Office Products &amp; Dynamic Specs (Laptops, LCDs, Mice, Keyboards, Routers)</td>
                        <td className="py-2.5 px-3 text-emerald-600 font-bold">✓ Unlimited Custom Categories</td>
                        <td className="py-2.5 px-3 text-slate-700 font-semibold">Up to 5,000 SKUs</td>
                        <td className="py-2.5 px-3 text-slate-500">200 Evaluation SKUs</td>
                      </tr>
                      <tr className="hover:bg-slate-50/50">
                        <td className="py-2.5 px-3 font-bold text-slate-800">Barcode Asset Tag Stickers (Code 128 Thermal &amp; A4 Sheets)</td>
                        <td className="py-2.5 px-3 text-emerald-600 font-bold">✓ Thermal &amp; A4 Print</td>
                        <td className="py-2.5 px-3 text-emerald-600 font-bold">✓ Standard Print</td>
                        <td className="py-2.5 px-3 text-emerald-600 font-bold">✓ Standard Print</td>
                      </tr>
                      <tr className="hover:bg-slate-50/50">
                        <td className="py-2.5 px-3 font-bold text-slate-800">Row-Level Security (RLS) Multi-Office Isolation</td>
                        <td className="py-2.5 px-3 text-emerald-600 font-bold">✓ Enforced</td>
                        <td className="py-2.5 px-3 text-emerald-600 font-bold">✓ Enforced</td>
                        <td className="py-2.5 px-3 text-emerald-600 font-bold">✓ Enforced</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ==================================================== */}
          {/* TAB 4: CLIENT IT MANAGERS                            */}
          {/* ==================================================== */}
          {activeTab === "users" && (
            <div className="space-y-6">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  {selectedUsersOrgId ? (
                    <div className="flex flex-col gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedUsersOrgId(null);
                          setUserSearchQuery("");
                          setUserRoleFilter("ALL");
                        }}
                        className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-500 hover:text-[#0c3843] cursor-pointer w-fit"
                      >
                        <ArrowLeft className="w-3.5 h-3.5" />
                        Back
                      </button>
                      <p className="text-sm font-bold text-slate-900 truncate">{selectedCompanyName}</p>
                      <p className="text-xs text-slate-500">
                        {selectedCompanyUsers.length} accounts · {selectedCompanyStaffCount} staff
                      </p>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500">
                      Credentials you issued. Click a row for that company&apos;s staff.
                    </p>
                  )}
                </div>
              </div>

              {/* Users Filter Bar */}
              <div className="p-4 rounded-2xl border border-slate-200/80 bg-white shadow-xs flex flex-col md:flex-row items-center justify-between gap-3">
                <div className="relative w-full md:w-96">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder={
                      selectedUsersOrgId
                        ? "Search staff by name or email..."
                        : "Search by manager email, name, or company..."
                    }
                    value={userSearchQuery}
                    onChange={(e) => setUserSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-9 py-2 rounded-xl text-xs bg-slate-50 border border-slate-200 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-[#0c3843]/20 focus:border-[#0c3843] text-slate-900 placeholder:text-slate-400 transition-all"
                  />
                  {userSearchQuery && (
                    <button
                      onClick={() => setUserSearchQuery("")}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
                      title="Clear search"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {selectedUsersOrgId && (
                  <div className="flex items-center gap-3 w-full md:w-auto">
                    <span className="text-xs text-slate-500 shrink-0 font-medium">Role Filter:</span>
                    <select
                      value={userRoleFilter}
                      onChange={(e) => setUserRoleFilter(e.target.value)}
                      className="px-3 py-2 rounded-xl text-xs bg-slate-50 border border-slate-200 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-[#0c3843]/20 focus:border-[#0c3843] text-slate-900 cursor-pointer font-medium"
                    >
                      <option value="ALL">All Roles</option>
                      <option value="owner">Owner / IT Lead</option>
                      <option value="admin">Administrator</option>
                      <option value="staff">Staff</option>
                      <option value="employee">Employee</option>
                    </select>
                  </div>
                )}
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
                      <span className="text-slate-500 font-semibold ml-1">({filteredUsers.length} matching)</span>
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
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50/90 text-slate-600 border-b border-slate-200">
                      <tr>
                        <th className="py-2.5 px-3 font-bold uppercase tracking-wider text-[11px] w-12 text-center">S.No</th>
                        <th className="py-2.5 px-4 font-bold uppercase tracking-wider text-[11px] min-w-[220px]">
                          {selectedUsersOrgId ? "User Account" : "Credentials Issued To"}
                        </th>
                        {!selectedUsersOrgId && (
                          <th className="py-2.5 px-3 font-bold uppercase tracking-wider text-[11px] min-w-[180px]">Client Company</th>
                        )}
                        <th className="py-2.5 px-2 font-bold uppercase tracking-wider text-[11px] text-center w-28 whitespace-nowrap">Role</th>
                        {!selectedUsersOrgId && (
                          <th className="py-2.5 px-2 font-bold uppercase tracking-wider text-[11px] text-center w-28 whitespace-nowrap">Staff</th>
                        )}
                        <th className="py-2.5 px-2 font-bold uppercase tracking-wider text-[11px] text-center w-24 whitespace-nowrap">Status</th>
                        <th className="py-2.5 px-2 font-bold uppercase tracking-wider text-[11px] text-center w-28 whitespace-nowrap">Joined</th>
                        <th className="py-2.5 px-4 font-bold uppercase tracking-wider text-[11px] text-right w-40 whitespace-nowrap">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {paginatedUsers.length === 0 ? (
                        <tr>
                          <td colSpan={selectedUsersOrgId ? 6 : 8} className="py-12 text-center text-slate-400">
                            <Users className="w-8 h-8 mx-auto mb-2 text-slate-300 stroke-1" />
                            <p className="font-semibold text-slate-500">
                              {selectedUsersOrgId ? "No matching users in this company." : "No client IT managers found."}
                            </p>
                          </td>
                        </tr>
                      ) : (
                        paginatedUsers.map((u, idx) => {
                          const serialNumber = (usersPage - 1) * PAGE_SIZE + idx + 1;
                          const orgStaffCount = clientUsers.filter((x) => {
                            if (x.org_id !== u.org_id) return false;
                            const r = (x.role || "").toLowerCase();
                            return r !== "owner" && r !== "admin";
                          }).length;
                          const isLead = (u.role || "").toLowerCase() === "owner" || (u.role || "").toLowerCase() === "admin";
                          return (
                            <tr
                              key={u.user_id}
                              className={cn(
                                "hover:bg-slate-50/70 transition-colors",
                                !selectedUsersOrgId && "cursor-pointer"
                              )}
                              onClick={() => {
                                if (!selectedUsersOrgId) {
                                  setSelectedUsersOrgId(u.org_id);
                                  setUserSearchQuery("");
                                  setUserRoleFilter("ALL");
                                }
                              }}
                            >
                              <td className="py-2.5 px-3 text-center font-mono text-[11px] text-slate-400 font-semibold">
                                #{serialNumber < 10 ? `0${serialNumber}` : serialNumber}
                              </td>

                              <td className="py-2.5 px-4">
                                <div className="flex items-center gap-2.5">
                                  <div className="w-8 h-8 rounded-xl bg-slate-100 text-slate-700 font-bold font-mono text-xs flex items-center justify-center shrink-0 border border-slate-200">
                                    {(u.name || u.email).substring(0, 2).toUpperCase()}
                                  </div>
                                  <div className="min-w-0">
                                    <div className="font-bold text-slate-900 truncate">{u.name || "User"}</div>
                                    <div className="text-[11px] font-mono text-slate-500 flex items-center gap-1">
                                      <span className="truncate max-w-[160px]">{u.email}</span>
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          navigator.clipboard.writeText(u.email);
                                          toast({ title: "Copied", description: "Email copied to clipboard", variant: "success" });
                                        }}
                                        className="text-slate-400 hover:text-[#0c3843] cursor-pointer"
                                        title="Copy email address"
                                      >
                                        <Copy className="w-3 h-3" />
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              </td>

                              {!selectedUsersOrgId && (
                                <td className="py-2.5 px-3 text-slate-700 font-semibold">
                                  <span className="font-semibold text-slate-800 flex items-center gap-1 truncate max-w-[170px]">
                                    <span className="truncate">{u.org_name}</span>
                                    <ChevronRight className="w-3 h-3 text-slate-300 shrink-0" />
                                  </span>
                                </td>
                              )}

                              <td className="py-2.5 px-2 text-center">
                                <span
                                  className={cn(
                                    "px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase border",
                                    isLead
                                      ? "bg-[#0c3843]/10 text-[#0c3843] border-[#0c3843]/20"
                                      : "bg-slate-100 text-slate-700 border-slate-200"
                                  )}
                                >
                                  {u.role}
                                </span>
                              </td>

                              {!selectedUsersOrgId && (
                                <td className="py-2.5 px-2 text-center">
                                  <span className="inline-flex items-center justify-center min-w-[2rem] px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                                    {orgStaffCount}
                                  </span>
                                </td>
                              )}

                              <td className="py-2.5 px-2 text-center">
                                {u.is_active !== false ? (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                    <span>Active</span>
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
                                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                                    <span>Inactive</span>
                                  </span>
                                )}
                              </td>

                              <td className="py-2.5 px-2 text-center text-slate-500 text-[11px] whitespace-nowrap font-mono">
                                {new Date(u.created_at).toLocaleDateString()}
                              </td>

                              <td className="py-2.5 px-4 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                                <div className="inline-flex items-center gap-1.5">
                                  {!selectedUsersOrgId && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setSelectedUsersOrgId(u.org_id);
                                        setUserSearchQuery("");
                                        setUserRoleFilter("ALL");
                                      }}
                                      className="px-2 py-1 rounded-lg bg-[#0c3843]/10 hover:bg-[#0c3843]/15 text-[#0c3843] border border-[#0c3843]/20 text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1"
                                      title="View company staff"
                                    >
                                      <Users className="w-3 h-3" />
                                      <span>Staff</span>
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

                <div className="p-4 border-t border-slate-100 bg-white flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
                  <div className="font-medium">
                    Showing{" "}
                    <strong className="text-slate-800">
                      {filteredUsers.length === 0 ? 0 : (usersPage - 1) * PAGE_SIZE + 1}
                    </strong>{" "}
                    to{" "}
                    <strong className="text-slate-800">
                      {Math.min(usersPage * PAGE_SIZE, filteredUsers.length)}
                    </strong>{" "}
                    of{" "}
                    <strong className="text-slate-800">{filteredUsers.length}</strong>{" "}
                    {selectedUsersOrgId ? "company users" : "IT managers"}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setUsersPage((p) => Math.max(1, p - 1))}
                      disabled={usersPage === 1}
                      className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors shadow-2xs flex items-center gap-1"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                      <span>Prev</span>
                    </button>

                    <div className="flex items-center gap-1">
                      {Array.from({ length: totalUserPages }, (_, i) => i + 1).map((pageNum) => (
                        <button
                          key={pageNum}
                          onClick={() => setUsersPage(pageNum)}
                          className={cn(
                            "w-8 h-8 rounded-xl font-mono text-xs font-bold transition-all cursor-pointer",
                            usersPage === pageNum
                              ? "bg-[#0c3843] text-white shadow-xs"
                              : "hover:bg-slate-100 text-slate-700"
                          )}
                        >
                          {pageNum}
                        </button>
                      ))}
                    </div>

                    <button
                      onClick={() => setUsersPage((p) => Math.min(totalUserPages, p + 1))}
                      disabled={usersPage >= totalUserPages}
                      className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors shadow-2xs flex items-center gap-1"
                    >
                      <span>Next</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ==================================================== */}
          {/* TAB 5: DATABASE & SYSTEM                             */}
          {/* ==================================================== */}
          {activeTab === "system" && (
            <div className="space-y-5">
              <p className="text-xs text-slate-500">Live probes for database, cache, storage, and mail.</p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* 1. PostgreSQL 18 */}
                <div className="p-5 rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white space-y-3 hover:shadow-md hover:border-emerald-300 transition-all">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-slate-900 flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 border border-emerald-200 flex items-center justify-center">
                        <Database className="w-4 h-4" />
                      </div>
                      PostgreSQL
                    </span>
                    <ServiceStatusBadge ping={servicePings.postgres} onlineWord="ONLINE" tone="emerald" />
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Port 5432 · multi-tenant RLS isolation
                  </p>
                  <div className="pt-2 border-t border-emerald-100 flex items-center justify-between text-xs">
                    <span className="text-emerald-700/70 text-[11px] font-mono">Database</span>
                    <button
                      onClick={() => handleTestService("postgres", "PostgreSQL 18 Engine")}
                      disabled={pingingService === "postgres"}
                      className="px-2.5 py-1 rounded-lg bg-emerald-100 hover:bg-emerald-200 text-emerald-900 text-[11px] font-bold border border-emerald-200 transition-colors cursor-pointer flex items-center gap-1"
                    >
                      <RefreshCw className={cn("w-3 h-3", pingingService === "postgres" && "animate-spin")} />
                      <span>Ping</span>
                    </button>
                  </div>
                </div>

                {/* 2. Valkey */}
                <div className="p-5 rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50 to-white space-y-3 hover:shadow-md hover:border-indigo-300 transition-all">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-slate-900 flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl bg-indigo-100 text-indigo-700 border border-indigo-200 flex items-center justify-center">
                        <Cpu className="w-4 h-4" />
                      </div>
                      Valkey
                    </span>
                    <ServiceStatusBadge ping={servicePings.valkey} onlineWord="CONNECTED" tone="indigo" />
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Port 6379 · cache and session tokens
                  </p>
                  <div className="pt-2 border-t border-indigo-100 flex items-center justify-between text-xs">
                    <span className="text-indigo-700/70 text-[11px] font-mono">Cache</span>
                    <button
                      onClick={() => handleTestService("valkey", "Valkey In-Memory Cache")}
                      disabled={pingingService === "valkey"}
                      className="px-2.5 py-1 rounded-lg bg-indigo-100 hover:bg-indigo-200 text-indigo-900 text-[11px] font-bold border border-indigo-200 transition-colors cursor-pointer flex items-center gap-1"
                    >
                      <RefreshCw className={cn("w-3 h-3", pingingService === "valkey" && "animate-spin")} />
                      <span>Ping</span>
                    </button>
                  </div>
                </div>

                {/* 3. SeaweedFS */}
                <div className="p-5 rounded-2xl border border-sky-200 bg-gradient-to-br from-sky-50 to-white space-y-3 hover:shadow-md hover:border-sky-300 transition-all">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-slate-900 flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl bg-sky-100 text-sky-700 border border-sky-200 flex items-center justify-center">
                        <HardDrive className="w-4 h-4" />
                      </div>
                      Object storage
                    </span>
                    <ServiceStatusBadge ping={servicePings.storage} onlineWord="READY" tone="blue" />
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Ports 8888 / 9000 · labels and documents
                  </p>
                  <div className="pt-2 border-t border-sky-100 flex items-center justify-between text-xs">
                    <span className="text-sky-700/70 text-[11px] font-mono">S3-compatible</span>
                    <button
                      onClick={() => handleTestService("storage", "SeaweedFS Storage")}
                      disabled={pingingService === "storage"}
                      className="px-2.5 py-1 rounded-lg bg-sky-100 hover:bg-sky-200 text-sky-900 text-[11px] font-bold border border-sky-200 transition-colors cursor-pointer flex items-center gap-1"
                    >
                      <RefreshCw className={cn("w-3 h-3", pingingService === "storage" && "animate-spin")} />
                      <span>Ping</span>
                    </button>
                  </div>
                </div>

                {/* 4. Mailpit SMTP */}
                <div className="p-5 rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 to-white space-y-3 hover:shadow-md hover:border-violet-300 transition-all">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-slate-900 flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl bg-violet-100 text-violet-700 border border-violet-200 flex items-center justify-center">
                        <Mail className="w-4 h-4" />
                      </div>
                      SMTP
                    </span>
                    <ServiceStatusBadge ping={servicePings.smtp} onlineWord="READY" tone="purple" />
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Ports 1025 / 8025 · outbound mail
                  </p>
                  <div className="pt-2 border-t border-violet-100 flex items-center justify-between text-xs">
                    <span className="text-violet-700/70 text-[11px] font-mono">Mail</span>
                    <button
                      onClick={() => handleTestService("smtp", "Mailpit SMTP")}
                      disabled={pingingService === "smtp"}
                      className="px-2.5 py-1 rounded-lg bg-violet-100 hover:bg-violet-200 text-violet-900 text-[11px] font-bold border border-violet-200 transition-colors cursor-pointer flex items-center gap-1"
                    >
                      <RefreshCw className={cn("w-3 h-3", pingingService === "smtp" && "animate-spin")} />
                      <span>Ping</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ==================================================== */}
          {/* TAB 6: AUDIT & SECURITY LOGS                         */}
          {/* ==================================================== */}
          {activeTab === "audit" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-slate-500">
                  {filteredAuditLogs.length} events
                </p>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const blob = await apiClient.superadmin.exportAuditLogs({ limit: 5000 });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = `whoopit_audit_export_${new Date().toISOString().slice(0, 10)}.csv`;
                      a.click();
                      URL.revokeObjectURL(url);
                      toast({
                        title: "Audit pack exported",
                        description: "Compliance CSV downloaded (up to 5,000 events).",
                        variant: "success",
                      });
                    } catch (err: any) {
                      toast({
                        title: "Export failed",
                        description: err?.message || "Could not export audit logs.",
                        variant: "destructive",
                      });
                    }
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0c3843] text-white text-xs font-bold shrink-0"
                >
                  <Download className="w-3.5 h-3.5" />
                  Export CSV
                </button>
              </div>

              {/* Audit Search & Filter Bar */}
              <div className="p-4 rounded-2xl border border-slate-200/80 bg-white shadow-xs flex flex-col md:flex-row items-center justify-between gap-3">
                <div className="relative w-full md:w-96">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search by action, actor email, company, or IP..."
                    value={auditSearchQuery}
                    onChange={(e) => setAuditSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-9 py-2 rounded-xl text-xs bg-slate-50 border border-slate-200 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-[#0c3843]/20 focus:border-[#0c3843] text-slate-900 placeholder:text-slate-400 transition-all"
                  />
                  {auditSearchQuery && (
                    <button
                      onClick={() => setAuditSearchQuery("")}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
                      title="Clear search"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
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
                    <option value="PLAN">Plan Updates</option>
                    <option value="LOGIN">Auth &amp; Login</option>
                    <option value="SECURITY">Security / Suspensions</option>
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
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50/90 text-slate-600 border-b border-slate-200">
                      <tr>
                        <th className="py-2.5 px-3 font-bold uppercase tracking-wider text-[11px] w-12 text-center">S.No</th>
                        <th className="py-2.5 px-3 font-bold uppercase tracking-wider text-[11px] whitespace-nowrap">Timestamp</th>
                        <th className="py-2.5 px-3 font-bold uppercase tracking-wider text-[11px] whitespace-nowrap">Action / Event</th>
                        <th className="py-2.5 px-3 font-bold uppercase tracking-wider text-[11px]">Entity</th>
                        <th className="py-2.5 px-3 font-bold uppercase tracking-wider text-[11px]">Client Company</th>
                        <th className="py-2.5 px-3 font-bold uppercase tracking-wider text-[11px]">Actor / User</th>
                        <th className="py-2.5 px-4 font-bold uppercase tracking-wider text-[11px] text-right whitespace-nowrap">Origin IP Address</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {paginatedAuditLogs.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="py-12 text-center text-slate-400">
                            <FileText className="w-8 h-8 mx-auto mb-2 text-slate-300 stroke-1" />
                            <p className="font-semibold text-slate-500">No matching audit logs found.</p>
                          </td>
                        </tr>
                      ) : (
                        paginatedAuditLogs.map((ev, idx) => {
                          const isProvision = ev.action.includes("PROVISION");
                          const isPlan = ev.action.includes("PLAN");
                          const isLogin = ev.action.includes("LOGIN") || ev.action.includes("AUTH");
                          const isSuspend = ev.action.includes("SUSPEND");
                          const serialNumber = (auditPage - 1) * PAGE_SIZE + idx + 1;

                          return (
                            <tr key={ev.audit_id} className="hover:bg-slate-50/70 transition-colors">
                              {/* S.No */}
                              <td className="py-2.5 px-3 text-center font-mono text-[11px] text-slate-400 font-semibold">
                                #{serialNumber < 10 ? `0${serialNumber}` : serialNumber}
                              </td>

                              <td className="py-2.5 px-3 font-mono text-slate-500 text-[11px] whitespace-nowrap">
                                <div>{new Date(ev.created_at).toLocaleDateString()}</div>
                                <div className="text-[10px] text-slate-400">{new Date(ev.created_at).toLocaleTimeString()}</div>
                              </td>

                              <td className="py-2.5 px-3 whitespace-nowrap">
                                <span
                                  className={cn(
                                    "px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border",
                                    isSuspend
                                      ? "bg-rose-50 text-rose-700 border-rose-200"
                                      : isProvision
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
                              </td>

                              <td className="py-2.5 px-3">
                                <div className="font-bold text-slate-900 capitalize text-xs">{ev.entity_type}</div>
                                {ev.entity_id && (
                                  <div className="font-mono text-[10px] text-slate-400 truncate max-w-[120px]" title={ev.entity_id}>
                                    ID: {ev.entity_id}
                                  </div>
                                )}
                              </td>

                              <td className="py-2.5 px-3">
                                {ev.org_name ? (
                                  <button
                                    onClick={() => handleTabChange("clients", undefined, ev.org_name)}
                                    className="font-semibold text-slate-800 hover:text-[#0c3843] hover:underline cursor-pointer flex items-center gap-1 group text-left"
                                    title="View client workspace"
                                  >
                                    <span className="truncate max-w-[140px]">{ev.org_name}</span>
                                    <ChevronRight className="w-3 h-3 text-slate-300 group-hover:text-[#0c3843] group-hover:translate-x-0.5 transition-all shrink-0" />
                                  </button>
                                ) : (
                                  <span className="text-slate-400 font-mono text-[11px]">System Platform</span>
                                )}
                              </td>

                              <td className="py-2.5 px-3 font-mono text-slate-600 text-[11px] truncate max-w-[150px]">
                                {ev.user_email || "system-kernel"}
                              </td>

                              <td className="py-2.5 px-4 text-right whitespace-nowrap">
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-cyan-50 border border-cyan-200 text-cyan-800 text-[11px] font-mono font-bold shadow-2xs">
                                  <Globe className="w-3 h-3 text-cyan-700" />
                                  <span>IP: {ev.ip_address}</span>
                                </span>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Audit Pagination */}
                <div className="p-4 border-t border-slate-100 bg-white flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
                  <div className="font-medium">
                    Showing{" "}
                    <strong className="text-slate-800">
                      {filteredAuditLogs.length === 0 ? 0 : (auditPage - 1) * PAGE_SIZE + 1}
                    </strong>{" "}
                    to{" "}
                    <strong className="text-slate-800">
                      {Math.min(auditPage * PAGE_SIZE, filteredAuditLogs.length)}
                    </strong>{" "}
                    of <strong className="text-slate-800">{filteredAuditLogs.length}</strong> audit events
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setAuditPage((p) => Math.max(1, p - 1))}
                      disabled={auditPage === 1}
                      className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors shadow-2xs flex items-center gap-1"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                      <span>Prev</span>
                    </button>

                    <div className="flex items-center gap-1">
                      {Array.from({ length: totalAuditPages }, (_, i) => i + 1).map((pageNum) => (
                        <button
                          key={pageNum}
                          onClick={() => setAuditPage(pageNum)}
                          className={cn(
                            "w-8 h-8 rounded-xl font-mono text-xs font-bold transition-all cursor-pointer",
                            auditPage === pageNum
                              ? "bg-[#0c3843] text-white shadow-xs"
                              : "hover:bg-slate-100 text-slate-700"
                          )}
                        >
                          {pageNum}
                        </button>
                      ))}
                    </div>

                    <button
                      onClick={() => setAuditPage((p) => Math.min(totalAuditPages, p + 1))}
                      disabled={auditPage >= totalAuditPages}
                      className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors shadow-2xs flex items-center gap-1"
                    >
                      <span>Next</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
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
                  <h3 className="font-bold text-slate-900 text-base">Provision Office IT Portal for New Company</h3>
                  <p className="text-xs text-slate-500">
                    Creates an isolated Office IT Inventory workspace &amp; IT Manager login credentials.
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
                      <span className="text-slate-500">Client IT Manager Email:</span>
                      <span className="text-[#0c3843] font-bold">{createdCredentials.email}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Initial Password:</span>
                      <span className="text-emerald-700 font-bold">{createdCredentials.password}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Initial State:</span>
                      <span className="text-emerald-700 font-bold flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                        0 Assets &bull; Fresh Clean IT Workspace
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Isolation:</span>
                      <span className="text-slate-700 font-semibold">PostgreSQL 18 RLS Enforced</span>
                    </div>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-slate-100 border border-slate-200 text-[11px] text-slate-600 leading-relaxed">
                  <strong>System Information:</strong> Give these credentials to the client. When they log in, they will be taken directly to their own Office IT Asset Portal (<code className="text-[#0c3843] font-bold">/dashboard</code>) with <strong>zero existing data</strong> so they can start fresh.
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => {
                      const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:3100";
                      const text = `=== WHOOPIT OFFICE IT SOFTWARE ACCESS ===\nCompany: ${createdCredentials.name}\nPlan: ${createdCredentials.plan.toUpperCase()}\nLogin Email: ${createdCredentials.email}\nPassword: ${createdCredentials.password}\nSoftware Portal: ${origin}/login\nStatus: 100% Fresh Start (0 Assets)\n=========================================`;
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
              <form onSubmit={handleCreateClient} autoComplete="off" className="space-y-4 text-xs">
                {/* 0-Data Guarantee Banner */}
                <div className="p-3.5 rounded-2xl bg-indigo-50 border border-indigo-100 text-indigo-900 text-xs flex items-start gap-2.5">
                  <ShieldCheck className="w-4 h-4 text-indigo-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-indigo-950 block font-bold">Clean Workspace Guarantee:</strong>
                    <span className="text-[11px] text-indigo-700">
                      When this company logs in, their workspace will be <strong>100% clean with 0 data</strong> (0 products, 0 valuation, 0 movements) under isolated database Row Security.
                    </span>
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      Office / Company Name *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Systems Ltd Lahore HQ"
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
                        Office Code / Slug
                      </label>
                      <input
                        type="text"
                        placeholder="systems-lahore-hq"
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
                        <option value="enterprise">Enterprise Office Tier</option>
                        <option value="standard">Standard Office Tier</option>
                        <option value="trial">30-Day Free Trial</option>
                      </select>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-100">
                    <span className="text-[11px] font-bold text-[#0c3843] uppercase tracking-wider block mb-2">
                      Initial Office IT Manager Account
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">
                        IT Manager Name
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Asif Khan (IT Lead)"
                        value={managerName}
                        onChange={(e) => setManagerName(e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 focus:bg-white focus:border-[#0c3843] focus:ring-2 focus:ring-[#0c3843]/10 outline-none transition-all"
                      />
                    </div>

                    <div>
                      <label className="block font-bold text-slate-700 mb-1">
                        IT Manager Email *
                      </label>
                      <input
                        type="email"
                        name="client_company_admin_email"
                        autoComplete="new-password"
                        required
                        placeholder="it.admin@company.com"
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
                      name="client_company_admin_password"
                      autoComplete="new-password"
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
      {/* 4. MODAL: MANAGE CLIENT, FEATURES & ACTIVITY TRAILS       */}
      {/* ======================================================== */}
      {selectedClient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="w-full max-w-3xl rounded-3xl bg-white border border-slate-200 shadow-2xl p-6 md:p-8 space-y-6 max-h-[90vh] overflow-y-auto text-slate-900">
            {/* Modal Header */}
            <div className="flex items-start justify-between">
              <div>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[#0c3843]/10 text-[#0c3843] border border-[#0c3843]/20">
                  Master Workspace Console
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

            {/* Modal 3-Tab Navigator */}
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
                <span>Details &amp; Lifecycle</span>
              </button>

              <button
                onClick={() => setModalTab("features")}
                className={cn(
                  "flex-1 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-2",
                  modalTab === "features"
                    ? "bg-[#0c3843] text-white shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                )}
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span>Feature Flags &amp; Add-ons</span>
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

            {/* Modal Tab 1: Details & Lifecycle */}
            {modalTab === "details" && (
              <div className="space-y-5">
                {/* Metrics cards */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200">
                    <span className="text-[10px] text-slate-500 font-bold uppercase">IT Staff Members</span>
                    <p className="text-lg font-bold text-slate-900 mt-1 font-mono">{selectedClient.user_count}</p>
                  </div>
                  <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200">
                    <span className="text-[10px] text-slate-500 font-bold uppercase">Office IT Assets</span>
                    <p className="text-lg font-bold text-emerald-600 mt-1 font-mono">{selectedClient.item_count}</p>
                  </div>
                  <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200">
                    <span className="text-[10px] text-slate-500 font-bold uppercase">Audit Movements</span>
                    <p className="text-lg font-bold text-purple-600 mt-1 font-mono">{selectedClient.movement_count}</p>
                  </div>
                </div>

                {/* Primary IT Contact & Credentials Box */}
                {(() => {
                  const lead = usersList.find((u) => u.org_id === selectedClient.org_id && (u.role === "admin" || u.role === "owner")) || usersList.find((u) => u.org_id === selectedClient.org_id);
                  return (
                    <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-[#0c3843] text-cyan-300 font-bold text-sm flex items-center justify-center shrink-0">
                          {selectedClient.name.substring(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-500 font-bold uppercase block">Primary IT Lead / Manager</span>
                          <span className="text-xs font-bold text-slate-900 block">{lead?.name || "IT Administrator"}</span>
                          <span className="text-[11px] font-mono text-[#0c3843]">{lead?.email || `${selectedClient.slug}@whoopit.io`}</span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:3100";
                          const text = `=== WHOOPIT CLIENT ACCESS ===\nCompany: ${selectedClient.name}\nPlan: ${selectedClient.plan.toUpperCase()}\nPortal: ${origin}/login\nIT Manager: ${lead?.email || "Check registered account"}\n=============================`;
                          navigator.clipboard.writeText(text);
                          toast({ title: "Client Info Copied", description: "Ready to share with client IT lead.", variant: "success" });
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-semibold cursor-pointer transition-colors shadow-2xs self-start sm:self-center"
                      >
                        <Copy className="w-3.5 h-3.5 text-[#0c3843]" />
                        <span>Copy Access Details</span>
                      </button>
                    </div>
                  );
                })()}

                {/* License Tier Upgrade/Downgrade */}
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-800 flex items-center gap-2">
                      <Key className="w-4 h-4 text-amber-500" />
                      <span>Commercial License Tier</span>
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
                      <option value="enterprise">ENTERPRISE (Full Office IT Suite, e-Signatures &amp; Repairs)</option>
                      <option value="standard">STANDARD (Single Office IT Procurement &amp; Inventory)</option>
                      <option value="trial">30-DAY TRIAL (Free Evaluation Package)</option>
                      <option value="suspended">SUSPENDED (Billing Hold / Deactivated)</option>
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

                {/* Tenant Lifecycle Control Card (Suspend / Reactivate / Extend Trial) */}
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                        <Activity className="w-4 h-4 text-[#0c3843]" />
                        <span>Workspace Lifecycle Management</span>
                      </h4>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Manage commercial access status, bill holds, or trial evaluation windows.
                      </p>
                    </div>

                    {selectedClient.plan.toLowerCase() === "suspended" || selectedClient.status === "suspended" ? (
                      <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3 text-rose-600" />
                        <span>SUSPENDED</span>
                      </span>
                    ) : selectedClient.plan.toLowerCase() === "trial" ? (
                      selectedClient.is_trial_expired ? (
                        <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3 text-rose-600" />
                          <span>TRIAL EXPIRED (0 DAYS)</span>
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1">
                          <Clock className="w-3 h-3 text-amber-600" />
                          <span>TRIAL ({selectedClient.trial_days_remaining ?? 30} DAYS LEFT)</span>
                        </span>
                      )
                    ) : (
                      <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        <span>ACTIVE LICENSE</span>
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-200/60">
                    {selectedClient.plan.toLowerCase() === "suspended" || selectedClient.status === "suspended" ? (
                      <button
                        onClick={handleToggleSuspend}
                        disabled={isSavingPlan}
                        className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-xs"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Reactivate Workspace (Enterprise)</span>
                      </button>
                    ) : (
                      <button
                        onClick={handleToggleSuspend}
                        disabled={isSavingPlan}
                        className="px-3.5 py-2 rounded-xl bg-white hover:bg-rose-50 text-rose-700 border border-rose-200 text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-2xs"
                      >
                        <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                        <span>Suspend Workspace (Billing Hold)</span>
                      </button>
                    )}

                    {selectedClient.plan.toLowerCase() === "trial" && (
                      <button
                        onClick={handleExtendTrial}
                        className="px-3.5 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-2xs"
                      >
                        <Clock className="w-3.5 h-3.5 text-amber-600" />
                        <span>Extend Trial (+14 Days)</span>
                      </button>
                    )}
                  </div>
                </div>



                {/* Privacy Guarantee Note */}
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex items-start gap-3">
                  <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-slate-900">Client Data Privacy Enforced</p>
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      As platform administrator, your role is tracking license packages and operational telemetry. Client internal equipment records, serial numbers, and employee digital signatures are securely protected and isolated via PostgreSQL Row-Level Security.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Modal Tab 2: Feature Flags & Add-ons */}
            {modalTab === "features" && (
              <div className="space-y-5">
                <div className="border-b border-slate-100 pb-3">
                  <h4 className="text-xs font-bold text-slate-900 flex items-center gap-2">
                    <SlidersHorizontal className="w-4 h-4 text-[#0c3843]" />
                    <span>License entitlements for {selectedClient.name}</span>
                  </h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    These follow the commercial plan. Changing the license tier updates them. They are not separate switches.
                  </p>
                </div>

                {(() => {
                  const plan = selectedClient.plan.toLowerCase();
                  const rows = [
                    { name: "Workspace access", detail: plan === "trial" ? "30 days, then sign-in and API access stop" : plan === "suspended" ? "Closed until reactivated" : "Open while the license stays active" },
                    { name: "Hardware items", detail: plan === "enterprise" ? "Unlimited" : plan === "standard" ? "Up to 5,000" : plan === "trial" ? "Up to 200" : "Blocked" },
                    { name: "Handover and e-signature", detail: plan === "suspended" ? "Blocked" : "Included" },
                    { name: "Vendor repair tracker", detail: plan === "suspended" ? "Blocked" : "Included" },
                    { name: "Finance report", detail: plan === "enterprise" ? "Preview, CSV, PDF, and direct email" : plan === "standard" ? "Preview and CSV download" : plan === "trial" ? "On-screen preview only" : "Blocked" },
                    { name: "Barcode labels", detail: plan === "enterprise" ? "Thermal roll and A4 sheets" : plan === "suspended" ? "Blocked" : "A4 sheets" },
                    { name: "Custom specs", detail: plan === "suspended" ? "Blocked" : "Included, inside the item limit" },
                  ];
                  return (
                    <div className="space-y-2">
                      {rows.map((row) => (
                        <div key={row.name} className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-3">
                          <div>
                            <span className="font-bold text-xs text-slate-900 block">{row.name}</span>
                            <p className="text-[11px] text-slate-500">{row.detail}</p>
                          </div>
                          <span className="px-2 py-1 rounded-full text-[10px] font-bold uppercase bg-white border border-slate-200 text-slate-700 shrink-0">
                            {plan}
                          </span>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Modal Tab 3: Activity Logs */}
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
                              <span className="px-1.5 py-0.2 rounded-md bg-cyan-50 text-cyan-800 border border-cyan-200 font-bold flex items-center gap-1">
                                <Globe className="w-2.5 h-2.5 text-cyan-700" />
                                IP: {ev.ip_address}
                              </span>
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

      {/* ======================================================== */}
      {/* ENHANCEMENT 1: CLIENT ONBOARDING WELCOME KIT MODAL       */}
      {/* ======================================================== */}
      {welcomeKitClient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-200 font-sans">
            {/* Header */}
            <div className="p-6 bg-gradient-to-r from-[#0c3843] via-[#0e4452] to-[#125363] text-white flex items-center justify-between border-b border-cyan-400/20">
              <div className="flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-2xl bg-cyan-400/20 text-cyan-300 border border-cyan-300/30 flex items-center justify-center shrink-0 shadow-inner">
                  <FileText className="w-6 h-6 text-cyan-300" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-extrabold text-white tracking-tight">
                      Client Welcome Kit &amp; Onboarding Dossier
                    </h3>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-400/20 text-cyan-200 border border-cyan-400/30 font-mono">
                      {welcomeKitClient.plan.toUpperCase()}
                    </span>
                  </div>
                  <p className="text-xs text-cyan-200/80 mt-0.5">
                    Official corporate credentials &amp; 3-step provisioning instructions for {welcomeKitClient.name}.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setWelcomeKitClient(null)}
                className="p-1.5 rounded-xl hover:bg-white/10 text-white/80 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
              {/* Credentials Box */}
              <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-3.5">
                <div className="flex items-center justify-between border-b border-slate-200/60 pb-2">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    Corporate Software Credentials
                  </span>
                  <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                    PostgreSQL 18 Isolated
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-slate-400 text-[10px] uppercase font-bold block">Company Name</span>
                    <span className="font-bold text-slate-900 text-sm">{welcomeKitClient.name}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[10px] uppercase font-bold block">Workspace Slug</span>
                    <span className="font-mono font-bold text-slate-700">{welcomeKitClient.slug}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[10px] uppercase font-bold block">Login URL</span>
                    <span className="font-mono text-cyan-700 font-semibold truncate block">
                      {typeof window !== "undefined" ? window.location.origin : "http://localhost:3100"}/login
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[10px] uppercase font-bold block">Designated IT Lead</span>
                    <span className="font-mono font-bold text-slate-900">{welcomeKitClient.email}</span>
                  </div>
                </div>

                {welcomeKitClient.password && (
                  <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between">
                    <div>
                      <span className="text-slate-400 text-[10px] uppercase font-bold block">Initial Access Password</span>
                      <span className="font-mono font-extrabold text-slate-900 text-sm tracking-wider">
                        {welcomeKitClient.password}
                      </span>
                    </div>
                    <span className="text-[10px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200 font-medium">
                      One-time reset upon login
                    </span>
                  </div>
                )}
              </div>

              {/* 3-Step Quick Start Onboarding Guide */}
              <div className="space-y-2.5">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                  3-Step Client Quick-Start Guide
                </span>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                  <div className="p-3 rounded-xl bg-cyan-50/50 border border-cyan-200/60 space-y-1">
                    <div className="flex items-center gap-1.5 font-bold text-xs text-[#0c3843]">
                      <span className="w-4 h-4 rounded-full bg-[#0c3843] text-cyan-300 text-[10px] flex items-center justify-center">1</span>
                      <span>Initial Sign-In</span>
                    </div>
                    <p className="text-[11px] text-slate-600 leading-snug">
                      Access portal at login URL with the designated lead credentials.
                    </p>
                  </div>

                  <div className="p-3 rounded-xl bg-teal-50/50 border border-teal-200/60 space-y-1">
                    <div className="flex items-center gap-1.5 font-bold text-xs text-teal-800">
                      <span className="w-4 h-4 rounded-full bg-teal-800 text-teal-200 text-[10px] flex items-center justify-center">2</span>
                      <span>Custom Specs</span>
                    </div>
                    <p className="text-[11px] text-slate-600 leading-snug">
                      Configure corporate asset specifications (RAM, SSD, Warranty).
                    </p>
                  </div>

                  <div className="p-3 rounded-xl bg-purple-50/50 border border-purple-200/60 space-y-1">
                    <div className="flex items-center gap-1.5 font-bold text-xs text-purple-800">
                      <span className="w-4 h-4 rounded-full bg-purple-800 text-purple-200 text-[10px] flex items-center justify-center">3</span>
                      <span>e-Sign Handover</span>
                    </div>
                    <p className="text-[11px] text-slate-600 leading-snug">
                      Register first equipment and issue to employee with digital signature.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer Action Buttons */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2.5">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:3100";
                    const passwordLine = welcomeKitClient.password
                      ? `Initial Password: ${welcomeKitClient.password}\n`
                      : `Password: (set at provisioning — reset from company login if forgotten)\n`;
                    const message = `=========================================\nWHOOPIT OFFICE IT SOFTWARE ACCESS\n=========================================\nCompany: ${welcomeKitClient.name}\nPlan: ${welcomeKitClient.plan.toUpperCase()}\nLogin Portal: ${origin}/login\nIT Manager Email: ${welcomeKitClient.email}\n${passwordLine}\nQUICK START:\n1. Open ${origin}/login and sign in.\n2. Configure custom asset specs under Settings.\n3. Add office hardware & issue with digital e-Sign.\n=========================================`;
                    navigator.clipboard.writeText(message);
                    toast({
                      title: "Welcome Kit Copied!",
                      description: "Formatted onboarding text copied to clipboard (ready for Email/WhatsApp/Slack).",
                      variant: "success",
                    });
                  }}
                  className="px-3.5 py-2 rounded-xl bg-[#0c3843] hover:bg-[#082931] text-white text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
                >
                  <Copy className="w-3.5 h-3.5 text-cyan-300" />
                  <span>Copy Onboarding Message</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:3100";
                    const passwordLine = welcomeKitClient.password
                      ? `Initial Password: ${welcomeKitClient.password}\n`
                      : `Password: provided only at first provision (not stored for re-download)\n`;
                    const content = `WHOOPIT OFFICE IT - CLIENT WELCOME KIT\n\nCompany Name: ${welcomeKitClient.name}\nWorkspace Slug: ${welcomeKitClient.slug}\nLicense Plan: ${welcomeKitClient.plan.toUpperCase()}\nLogin URL: ${origin}/login\nDesignated Lead: ${welcomeKitClient.email}\n${passwordLine}Date Issued: ${new Date().toLocaleDateString()}\n\nONBOARDING CHECKLIST:\n[ ] Step 1: Login with credentials\n[ ] Step 2: Set up custom equipment attributes\n[ ] Step 3: Register hardware & issue digital handovers\n\nSupport: admin@whoopit.io`;
                    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
                    const url = URL.createObjectURL(blob);
                    const link = document.createElement("a");
                    link.href = url;
                    link.download = `Welcome_Kit_${welcomeKitClient.slug}.txt`;
                    link.click();
                    URL.revokeObjectURL(url);
                    toast({ title: "Downloaded", description: "Welcome kit file saved to downloads.", variant: "success" });
                  }}
                  className="px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
                >
                  <Download className="w-3.5 h-3.5 text-slate-500" />
                  <span>Download (.txt)</span>
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
                >
                  <Printer className="w-3.5 h-3.5 text-slate-500" />
                  <span>Print</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setWelcomeKitClient(null);
                    setIsModalOpen(false);
                    setCreatedCredentials(null);
                  }}
                  className="px-4 py-2 rounded-xl border border-slate-300 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all cursor-pointer"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* ENHANCEMENT 5: GLOBAL COMMAND PALETTE (CTRL+K / /)       */}
      {/* ======================================================== */}
      {isCommandPaletteOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center pt-20 p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => setIsCommandPaletteOpen(false)}
        >
          <div
            className="relative w-full max-w-xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-150 font-sans"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Search Input */}
            <div className="flex items-center gap-3 p-4 border-b border-slate-200 bg-slate-50">
              <Search className="w-5 h-5 text-slate-400 shrink-0" />
              <input
                autoFocus
                type="text"
                placeholder="Search any client company or jump to tab..."
                value={commandSearch}
                onChange={(e) => setCommandSearch(e.target.value)}
                className="w-full bg-transparent text-sm text-slate-900 placeholder:text-slate-400 font-semibold outline-none"
              />
              <kbd className="px-2 py-0.5 rounded bg-slate-200 text-slate-600 text-[10px] font-mono font-bold">
                ESC
              </kbd>
            </div>

            {/* Quick Suggestions / Commands */}
            <div className="max-h-80 overflow-y-auto p-3 space-y-1">
              {/* Navigation Shortcuts */}
              {!commandSearch && (
                <>
                  <div className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Quick Navigation
                  </div>
                  {[
                    { label: "Software Overview", tab: "overview", icon: Activity },
                    { label: "Client Companies Directory", tab: "clients", icon: Building2 },
                    { label: "License Plans", tab: "licenses", icon: Key },
                    { label: "Client IT Managers", tab: "users", icon: Users },
                    { label: "Database & SMTP Health", tab: "system", icon: Database },
                    { label: "Platform Activity Logs", tab: "audit", icon: FileText },
                  ].map((navItem) => {
                    const Icon = navItem.icon;
                    return (
                      <button
                        key={navItem.tab}
                        type="button"
                        onClick={() => {
                          handleTabChange(navItem.tab as AdminTab);
                          setIsCommandPaletteOpen(false);
                          setCommandSearch("");
                        }}
                        className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-[#0c3843]/10 text-slate-700 hover:text-[#0c3843] text-xs font-semibold transition-colors cursor-pointer text-left"
                      >
                        <div className="flex items-center gap-2.5">
                          <Icon className="w-4 h-4 text-[#0c3843]" />
                          <span>{navItem.label}</span>
                        </div>
                        <span className="text-[10px] text-slate-400 font-mono">Jump &rarr;</span>
                      </button>
                    );
                  })}

                  <div className="pt-2 px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-t border-slate-100">
                    Primary Actions
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setIsCommandPaletteOpen(false);
                      setIsModalOpen(true);
                      setCommandSearch("");
                    }}
                    className="w-full flex items-center gap-2.5 p-2.5 rounded-xl bg-teal-50 hover:bg-teal-100 text-teal-800 text-xs font-bold transition-colors cursor-pointer text-left"
                  >
                    <Plus className="w-4 h-4 text-teal-600" />
                    <span>Give Software to New Company</span>
                  </button>
                </>
              )}

              {/* Matching Companies Results */}
              {commandSearch && (
                <>
                  <div className="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Matching Client Workspaces
                  </div>
                  {(() => {
                    const q = commandSearch.toLowerCase().trim();
                    const matched = clients.filter(
                      (c) =>
                        c.name.toLowerCase().includes(q) ||
                        c.slug.toLowerCase().includes(q) ||
                        c.org_id.toLowerCase().includes(q)
                    );

                    if (matched.length === 0) {
                      return (
                        <div className="py-6 text-center text-xs text-slate-400">
                          No company found matching &quot;{commandSearch}&quot;
                        </div>
                      );
                    }

                    return matched.slice(0, 8).map((client) => (
                      <button
                        key={client.org_id}
                        type="button"
                        onClick={() => {
                          setIsCommandPaletteOpen(false);
                          setCommandSearch("");
                          openClientModal(client, "details");
                        }}
                        className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-slate-100 text-slate-900 text-xs font-semibold transition-colors cursor-pointer text-left group"
                      >
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-lg bg-[#0c3843] text-cyan-300 font-bold text-[10px] flex items-center justify-center">
                            {client.name.substring(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <span className="font-bold text-slate-900 block">{client.name}</span>
                            <span className="text-[10px] text-slate-400 font-mono">{client.slug}</span>
                          </div>
                        </div>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-100 text-slate-600 group-hover:bg-[#0c3843] group-hover:text-white transition-colors">
                          {client.plan}
                        </span>
                      </button>
                    ));
                  })()}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
