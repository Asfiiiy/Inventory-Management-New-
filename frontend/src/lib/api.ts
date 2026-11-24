export interface ProblemDetails {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  instance?: string;
  errors?: Array<{ field: string; message: string }>;
}

export interface UserProfile {
  id: string;
  org_id: string;
  org_name?: string;
  org_plan?: string;
  email: string;
  name: string;
  role: "admin" | "staff" | string;
  is_active: boolean;
  employee_code?: string;
  department?: string;
  desk_location?: string;
  invite_email_sent?: boolean;
  created_at: string;
  trial_ends_at?: string;
  trial_days_remaining?: number;
  is_trial_expired?: boolean;
  is_suspended?: boolean;
}

export interface WarrantyAlertItem {
  item_id: string;
  sku: string;
  name: string;
  field_key: string;
  expiry_date: string;
  days_left: number;
  status: "overdue" | "due_soon" | string;
}

export interface LifecycleEvent {
  at: string;
  kind: string;
  label: string;
  detail?: string;
  reference?: string;
  actor?: string;
  serial?: string;
}

export interface AuthResponse {
  token: string;
  user: UserProfile;
}

export interface SupplierRecord {
  supplier_id: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
  is_active: boolean;
}

export interface WorkspaceSettings {
  org_id: string;
  name: string;
  plan: string;
  currency: string;
  time_zone: string;
  alert_email: string;
  allow_negative_stock: boolean;
  approval_threshold?: number;
}

export interface AssetRequest {
  request_id: string;
  org_id: string;
  item_id: string;
  item_sku: string;
  item_name: string;
  requester_user_id: string;
  requester_name: string;
  employee_user_id: string;
  employee_name: string;
  employee_email: string;
  source_location_id?: string;
  quantity: number;
  serial_number: string;
  request_type: string;
  status: string;
  unit_cost: number;
  estimated_value: number;
  reason: string;
  notes: string;
  condition_grade: string;
  expected_return_date?: string;
  decided_by?: string;
  decided_at?: string;
  decision_notes: string;
  assignment_id?: string;
  created_at: string;
  updated_at: string;
}

export interface OnboardingStatus {
  completed: boolean;
  completed_at?: string;
  steps: string[];
}

export interface ServiceProbe {
  ok: boolean;
  latency_ms: number;
  detail: string;
}

export interface InfrastructureDiagnostics {
  postgres: ServiceProbe;
  valkey: ServiceProbe;
  storage: ServiceProbe;
  smtp: ServiceProbe;
}

export const DEFAULT_API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8081";
export const DEFAULT_TENANT_ID = "a0000000-0000-0000-0000-000000000001";

let currentTenantId: string = "";
let currentAuthToken: string | null = null;

export function setTenantId(tenantId: string) {
  currentTenantId = tenantId;
  if (typeof window !== "undefined") {
    if (tenantId) {
      localStorage.setItem("whoopit_tenant_id", tenantId);
    } else {
      localStorage.removeItem("whoopit_tenant_id");
    }
  }
}

export function getTenantId(): string {
  if (typeof window !== "undefined") {
    // 1. Strict Priority: Always derive tenant ID from the active authenticated user profile
    try {
      const userStr = localStorage.getItem("whoopit_auth_user");
      if (userStr) {
        const parsed = JSON.parse(userStr);
        if (parsed?.org_id) {
          currentTenantId = parsed.org_id;
          return parsed.org_id;
        }
      }
    } catch {
      // Ignore JSON parse error
    }

    // 2. Fallback to explicitly saved tenant ID
    const saved = localStorage.getItem("whoopit_tenant_id");
    if (saved) {
      currentTenantId = saved;
      return saved;
    }
  }
  return currentTenantId || DEFAULT_TENANT_ID;
}

export function setAuthToken(token: string, role?: string, rememberMe = true) {
  currentAuthToken = token;
  if (typeof window !== "undefined") {
    localStorage.setItem("whoopit_auth_token", token);
    // Remember me: 7 days; session-ish: 12 hours
    const maxAge = rememberMe ? 604800 : 43200;
    if (role) {
      localStorage.setItem("whoopit_auth_role", role);
      document.cookie = `whoopit_auth_role=${encodeURIComponent(role)}; path=/; max-age=${maxAge}; SameSite=Lax`;
    }
    document.cookie = `whoopit_auth_token=${encodeURIComponent(token)}; path=/; max-age=${maxAge}; SameSite=Lax`;
  }
}

export function getAuthToken(): string | null {
  if (currentAuthToken) return currentAuthToken;
  if (typeof window !== "undefined") {
    const saved = localStorage.getItem("whoopit_auth_token");
    if (saved) {
      currentAuthToken = saved;
      return saved;
    }
    // Fallback: check document.cookie
    const match = document.cookie.match(/(^|;)\s*whoopit_auth_token=([^;]+)/);
    if (match) {
      currentAuthToken = decodeURIComponent(match[2]);
      return currentAuthToken;
    }
  }
  return null;
}

export function clearAuthToken() {
  currentAuthToken = null;
  currentTenantId = "";
  if (typeof window !== "undefined") {
    localStorage.removeItem("whoopit_auth_token");
    localStorage.removeItem("whoopit_auth_user");
    localStorage.removeItem("whoopit_auth_role");
    localStorage.removeItem("whoopit_tenant_id");
    document.cookie = "whoopit_auth_token=; path=/; max-age=0; SameSite=Lax";
    document.cookie = "whoopit_auth_role=; path=/; max-age=0; SameSite=Lax";
  }
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public problem: ProblemDetails
  ) {
    super(problem.detail || problem.title || `API error ${status}`);
    this.name = "ApiError";
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${DEFAULT_API_URL}${path}`;
  const tenantId = getTenantId();
  const token = getAuthToken();

  const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData;

  const headers: Record<string, string> = {
    "X-Tenant-ID": tenantId,
    ...(options.headers as Record<string, string>),
  };

  if (!isFormData && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  // Inject Bearer token automatically if available
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  const text = await response.text();
  let data: any;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!response.ok) {
    // Only clear token if session verification explicitly reports token expiration/invalidation
    if (response.status === 401 && path === "/api/v1/auth/me") {
      clearAuthToken();
    }

    throw new ApiError(response.status, {
      type: data.type || "about:blank",
      title: data.title || response.statusText,
      status: response.status,
      detail: data.detail || (typeof data === "string" ? data : JSON.stringify(data)),
      errors: data.errors,
      instance: data.instance,
    });
  }

  return data as T;
}

export const apiClient = {
  health: {
    check: () => request<{ success: boolean; data: { status: string } }>("/healthz"),
  },

  auth: {
    login: (body: { email: string; password: string }) =>
      request<{ success: boolean; data: AuthResponse }>("/api/v1/auth/login", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    register: (body: { email: string; password: string; name?: string; org_name?: string }) =>
      request<{ success: boolean; data: AuthResponse }>("/api/v1/auth/register", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    me: () => request<{ success: boolean; data: UserProfile }>("/api/v1/auth/me"),
    logout: () =>
      request<{ success: boolean; data: { message: string } }>("/api/v1/auth/logout", {
        method: "POST",
        body: JSON.stringify({}),
      }),
    forgotPassword: (email: string) =>
      request<{ success: boolean; data: { message: string } }>("/api/v1/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email }),
      }),
  },

  locations: {
    list: () => request<{ success: boolean; data: any[]; meta: { count: number } }>("/api/v1/locations"),
    create: (body: { name: string; category: string; parent_id?: string }) =>
      request<{ success: boolean; data: any }>("/api/v1/locations", {
        method: "POST",
        body: JSON.stringify(body),
      }),
  },

  items: {
    list: () => request<{ success: boolean; data: any[]; meta: { count: number } }>("/api/v1/items"),
    create: (body: {
      sku: string;
      name: string;
      tracking_mode?: string;
      base_uom?: string;
      valuation_method?: string;
      attributes?: Record<string, any>;
    }) =>
      request<{ success: boolean; data: any }>("/api/v1/items", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    get: (id: string) => request<{ success: boolean; data: any }>(`/api/v1/items/${id}`),
    update: (
      id: string,
      body: {
        sku?: string;
        name?: string;
        base_uom?: string;
        barcode?: string;
        cost_price?: number;
        selling_price?: number;
        reorder_level?: number;
        buffer_stock?: number;
        category_id?: string;
        supplier_id?: string;
        attributes?: Record<string, any>;
      }
    ) =>
      request<{ success: boolean; data: any }>(`/api/v1/items/${id}`, {
        method: "PUT",
        body: JSON.stringify(body),
      }),
    delete: (id: string) =>
      request<{ success: boolean; data: { deleted: boolean; item_id: string } }>(`/api/v1/items/${id}`, {
        method: "DELETE",
      }),
    search: (attributes: Record<string, any> = {}) =>
      request<{ success: boolean; data: any[]; meta: { count: number } }>("/api/v1/items/search", {
        method: "POST",
        body: JSON.stringify({ attributes }),
      }),
    importCSV: (formData: FormData, dryRun: boolean = false) =>
      request<{
        success: boolean;
        data: CSVImportResult;
      }>(`/api/v1/items/import-csv?dry_run=${dryRun ? "true" : "false"}`, {
        method: "POST",
        body: formData,
      }),
  },

  stock: {
    listMoves: (params?: { limit?: number; offset?: number }) => {
      const qs = params ? `?limit=${params.limit || 50}&offset=${params.offset || 0}` : "";
      return request<{ success: boolean; data: any[]; meta: { count: number } }>(`/api/v1/stock/moves${qs}`);
    },
    createMove: (body: {
      item_id: string;
      from_location_id: string;
      to_location_id: string;
      quantity: number;
      unit?: string;
      move_type: string;
      reference_code?: string;
      idempotency_key?: string;
      usage_target?: string;
      unit_cost?: number;
      batch_number?: string;
    }) =>
      request<{ success: boolean; data: { move: any } }>("/api/v1/stock/moves", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    getBalance: (locationId: string, itemId: string) =>
      request<{ success: boolean; data: { location_id: string; item_id: string; balance: number } }>(
        `/api/v1/stock/locations/${locationId}/balance?item_id=${itemId}`
      ),
    getItemSummary: (itemId: string) =>
      request<{
        success: boolean;
        data: {
          item_id: string;
          sku: string;
          name: string;
          base_uom: string;
          total_on_hand: number;
          total_reserved: number;
          total_available: number;
          total_checked_out: number;
          reorder_level: number;
          buffer_stock: number;
          stock_status: "IN_STOCK" | "LOW_STOCK" | "BUFFER_ALERT" | "OUT_OF_STOCK";
          locations: Array<{
            location_id: string;
            location_name: string;
            is_backup_location: boolean;
            on_hand: number;
            reserved: number;
            available: number;
          }>;
        };
      }>(`/api/v1/stock/items/${itemId}/summary`),
    getAlerts: () =>
      request<{
        success: boolean;
        data: Array<{
          item_id: string;
          sku: string;
          name: string;
          base_uom: string;
          total_on_hand: number;
          reorder_level: number;
          buffer_stock: number;
          alert_type: "OUT_OF_STOCK" | "BUFFER_ALERT" | "LOW_STOCK";
          suggested_reorder: number;
        }>;
      }>("/api/v1/stock/alerts"),
    reconcileItem: (itemId: string) =>
      request<{
        success: boolean;
        data: {
          org_id: string;
          item_id: string;
          discrepancies: number;
          locations: Array<{
            location_id: string;
            location_name: string;
            ledger_sum: number;
            cached_on_hand: number;
            drift: number;
            healed: boolean;
          }>;
        };
      }>(`/api/v1/stock/items/${itemId}/reconcile`, {
        method: "POST",
      }),
    getLifecycle: (itemId: string) =>
      request<{ success: boolean; data: { item_id: string; events: LifecycleEvent[] }; meta?: { count: number } }>(
        `/api/v1/stock/items/${itemId}/lifecycle`
      ),
  },

  users: {
    list: () => request<{ success: boolean; data: UserProfile[]; meta?: { count: number } }>("/api/v1/users"),
    create: (body: {
      email: string;
      password?: string;
      name: string;
      role?: string;
      employee_code?: string;
      department?: string;
      desk_location?: string;
      send_invite_mail?: boolean;
    }) =>
      request<{ success: boolean; data: UserProfile }>("/api/v1/users", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    update: (
      id: string,
      body: {
        role?: string;
        name?: string;
        email?: string;
        is_active: boolean;
        employee_code?: string;
        department?: string;
        desk_location?: string;
      }
    ) =>
      request<{ success: boolean; data: UserProfile }>(`/api/v1/users/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
  },

  suppliers: {
    list: () =>
      request<{ success: boolean; data: SupplierRecord[]; meta?: { count: number } }>("/api/v1/suppliers"),
    create: (body: { name: string; phone?: string; email?: string; address?: string; notes?: string }) =>
      request<{ success: boolean; data: SupplierRecord }>("/api/v1/suppliers", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    update: (
      id: string,
      body: { name: string; phone?: string; email?: string; address?: string; notes?: string }
    ) =>
      request<{ success: boolean; data: SupplierRecord }>(`/api/v1/suppliers/${id}`, {
        method: "PUT",
        body: JSON.stringify(body),
      }),
    remove: (id: string) =>
      request<{ success: boolean; data: { removed: boolean } }>(`/api/v1/suppliers/${id}`, {
        method: "DELETE",
      }),
  },

  settings: {
    get: () => request<{ success: boolean; data: WorkspaceSettings }>("/api/v1/settings"),
    update: (body: {
      name: string;
      currency: string;
      time_zone: string;
      alert_email: string;
      approval_threshold?: number;
    }) =>
      request<{ success: boolean; data: WorkspaceSettings }>("/api/v1/settings", {
        method: "PUT",
        body: JSON.stringify(body),
      }),
  },

  onboarding: {
    status: () => request<{ success: boolean; data: OnboardingStatus }>("/api/v1/onboarding"),
    complete: () =>
      request<{ success: boolean; data: OnboardingStatus }>("/api/v1/onboarding/complete", {
        method: "POST",
        body: JSON.stringify({}),
      }),
  },

  custody: {
    getSummary: () =>
      request<{ success: boolean; data: CustodySummary }>("/api/v1/assets/summary"),
    listAllAssignments: () =>
      request<{ success: boolean; data: CustodyAssignment[]; meta?: { count: number } }>(
        "/api/v1/assets/assignments"
      ),
    listEmployeeCustody: (userId: string) =>
      request<{ success: boolean; data: CustodyAssignment[]; meta?: { count: number } }>(
        `/api/v1/assets/custody/employee/${userId}`
      ),
    checkout: (body: {
      asset_id: string;
      employee_user_id: string;
      source_location_id: string;
      expected_return_date?: string;
      condition_grade?: string;
      quantity?: number;
      employee_code?: string;
      employee_name?: string;
      employee_department?: string;
      employee_email?: string;
      serial_number?: string;
      signature_data?: string;
      notes?: string;
      admin_override?: boolean;
    }) =>
      request<{
        success: boolean;
        data: {
          assignment?: CustodyAssignment;
          move?: any;
          evidence?: any;
          pending_approval?: boolean;
          request?: AssetRequest;
          threshold?: number;
          estimated_value?: number;
          message?: string;
        };
      }>("/api/v1/assets/checkout", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    checkin: (body: {
      assignment_id: string;
      return_to_location_id: string;
      condition_grade?: string;
      notes?: string;
      return_condition?: "GOOD" | "FAULTY" | string;
      issue_description?: string;
      vendor_name?: string;
    }) =>
      request<{
        success: boolean;
        data: {
          assignment: CustodyAssignment;
          move?: any;
        };
      }>("/api/v1/assets/checkin", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    getCertificate: (assignmentId: string) =>
      request<{ success: boolean; data: HandoverCertificate }>(
        `/api/v1/assets/assignments/${assignmentId}/certificate`
      ),
    getApprovalPolicy: () =>
      request<{ success: boolean; data: { approval_threshold: number } }>(
        "/api/v1/assets/requests/policy"
      ),
    listRequests: (status = "PENDING") =>
      request<{ success: boolean; data: AssetRequest[]; meta?: { count: number } }>(
        `/api/v1/assets/requests?status=${encodeURIComponent(status)}`
      ),
    createRequest: (body: {
      asset_id: string;
      employee_user_id?: string;
      source_location_id?: string;
      quantity?: number;
      serial_number?: string;
      request_type?: string;
      reason?: string;
      notes?: string;
      condition_grade?: string;
      expected_return_date?: string;
    }) =>
      request<{ success: boolean; data: AssetRequest }>("/api/v1/assets/requests", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    approveRequest: (id: string, body?: { decision_notes?: string; signature_data?: string }) =>
      request<{ success: boolean; data: AssetRequest }>(`/api/v1/assets/requests/${id}/approve`, {
        method: "POST",
        body: JSON.stringify(body || {}),
      }),
    rejectRequest: (id: string, body?: { decision_notes?: string }) =>
      request<{ success: boolean; data: AssetRequest }>(`/api/v1/assets/requests/${id}/reject`, {
        method: "POST",
        body: JSON.stringify(body || {}),
      }),
  },

  repairs: {
    list: (params?: { item_id?: string; status?: string }) => {
      const sp = new URLSearchParams();
      if (params?.item_id) sp.set("item_id", params.item_id);
      if (params?.status) sp.set("status", params.status);
      const qs = sp.toString() ? `?${sp.toString()}` : "";
      return request<{
        success: boolean;
        data: { records: RepairRecord[]; summary: RepairSummary };
        meta?: { count: number };
      }>(`/api/v1/repairs${qs}`);
    },
    create: (body: {
      item_id: string;
      quantity?: number;
      serial_number?: string;
      status?: "FAULTY" | "AT_VENDOR";
      issue_description: string;
      reported_by?: string;
      vendor_name?: string;
      vendor_contact?: string;
      ticket_reference?: string;
      expected_return_date?: string;
      deduct_from_store?: boolean;
    }) =>
      request<{ success: boolean; data: RepairRecord }>("/api/v1/repairs", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    sendToVendor: (
      id: string,
      body: {
        vendor_name: string;
        vendor_contact?: string;
        ticket_reference?: string;
        expected_return_date?: string;
        notes?: string;
      }
    ) =>
      request<{ success: boolean; data: RepairRecord }>(`/api/v1/repairs/${id}/send-vendor`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    complete: (id: string, body: { repair_cost?: number; resolution_notes?: string }) =>
      request<{ success: boolean; data: RepairRecord }>(`/api/v1/repairs/${id}/complete`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    scrap: (id: string, body: { resolution_notes?: string }) =>
      request<{ success: boolean; data: RepairRecord }>(`/api/v1/repairs/${id}/scrap`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
  },

  reports: {
    getFinanceDossier: () =>
      request<{ success: boolean; data: FinanceAuditDossier }>("/api/v1/reports/finance"),
    sendFinanceEmail: (body: {
      recipient_email: string;
      recipient_name?: string;
      subject?: string;
      notes?: string;
    }) =>
      request<{
        success: boolean;
        data: {
          sent: boolean;
          recipient_email: string;
          recipient_name: string;
          subject: string;
          attachment_name: string;
          smtp_relay: string;
          mailpit_url: string;
          kpis: FinanceReportKPIs;
        };
      }>("/api/v1/reports/finance-email", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    getWarrantyAlerts: (days = 30) =>
      request<{
        success: boolean;
        data: {
          days_window: number;
          count: number;
          items: WarrantyAlertItem[];
          alert_email?: string;
        };
      }>(`/api/v1/reports/warranty-alerts?days=${days}`),
    emailWarrantyAlerts: (body?: { recipient_email?: string; days?: number }) =>
      request<{ success: boolean; data: { sent: boolean; recipient: string; count: number; mailpit_url: string } }>(
        "/api/v1/reports/warranty-alerts/email",
        { method: "POST", body: JSON.stringify(body || {}) }
      ),
    emailLowStockDigest: (body?: { recipient_email?: string }) =>
      request<{ success: boolean; data: { sent: boolean; recipient: string; count: number; mailpit_url: string } }>(
        "/api/v1/reports/low-stock/email",
        { method: "POST", body: JSON.stringify(body || {}) }
      ),
  },

  customFields: {
    list: () =>
      request<{ success: boolean; data: CustomFieldDefinition[]; meta?: { count: number } }>(
        "/api/v1/custom-fields"
      ),
    create: (body: {
      field_name: string;
      field_type: string;
      dropdown_options?: string[];
      is_required: boolean;
    }) =>
      request<{ success: boolean; data: CustomFieldDefinition }>("/api/v1/custom-fields", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    delete: (id: string) =>
      request<{ success: boolean; data: any }>(`/api/v1/custom-fields/${id}`, {
        method: "DELETE",
      }),
  },

  superadmin: {
    listOrganizations: () =>
      request<{ success: boolean; data: OrganizationSummary[]; meta?: { count: number } }>(
        "/api/v1/superadmin/organizations"
      ),
    getTelemetry: () =>
      request<{ success: boolean; data: PlatformTelemetry }>("/api/v1/superadmin/telemetry"),
    getDiagnostics: () =>
      request<{ success: boolean; data: InfrastructureDiagnostics }>("/api/v1/superadmin/diagnostics"),
    provisionOrganization: (body: ProvisionInput) =>
      request<{ success: boolean; data: any }>("/api/v1/superadmin/organizations", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    updateOrganization: (id: string, body: { name?: string; plan?: string }) =>
      request<{ success: boolean; data: any }>(`/api/v1/superadmin/organizations/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    extendTrial: (id: string, days?: number) =>
      request<{ success: boolean; data: any }>(`/api/v1/superadmin/organizations/${id}/extend-trial`, {
        method: "POST",
        body: JSON.stringify({ days: days || 14 }),
      }),
    listUsers: () =>
      request<{ success: boolean; data: GlobalUser[]; meta?: { count: number } }>(
        "/api/v1/superadmin/users"
      ),
    listAuditLogs: () =>
      request<{ success: boolean; data: AuditEvent[]; meta?: { count: number } }>(
        "/api/v1/superadmin/audit"
      ),
    exportAuditLogs: async (params?: { from?: string; to?: string; limit?: number }) => {
      const sp = new URLSearchParams();
      if (params?.from) sp.set("from", params.from);
      if (params?.to) sp.set("to", params.to);
      if (params?.limit) sp.set("limit", String(params.limit));
      const qs = sp.toString() ? `?${sp.toString()}` : "";
      const base = DEFAULT_API_URL.replace(/\/$/, "");
      const headers: Record<string, string> = {};
      if (currentAuthToken) headers.Authorization = `Bearer ${currentAuthToken}`;
      if (currentTenantId) headers["X-Tenant-ID"] = currentTenantId;
      const res = await fetch(`${base}/api/v1/superadmin/audit/export${qs}`, { headers });
      if (!res.ok) {
        throw new ApiError(res.status, {
          title: "Audit export failed",
          detail: await res.text(),
          status: res.status,
        });
      }
      return res.blob();
    },
    getOrgActivity: (orgId: string) =>
      request<{ success: boolean; data: AuditEvent[]; meta?: { count: number } }>(
        `/api/v1/superadmin/organizations/${orgId}/activity`
      ),
  },
};

export interface GlobalUser {
  user_id: string;
  org_id: string;
  org_name: string;
  email: string;
  name: string;
  role: string;
  is_active: boolean;
  created_at: string;
}

export interface AuditEvent {
  audit_id: string;
  org_id: string;
  org_name: string;
  action: string;
  entity_type: string;
  entity_id: string;
  user_email: string;
  created_at: string;
  ip_address: string;
}

export interface CustodySummary {
  total_assets: number;
  deployed_to_employees: number;
  remaining_in_storage: number;
  faulty_units?: number;
  under_repair_units?: number;
  repaired_units?: number;
}

export interface CustodyAssignment {
  assignment_id: string;
  org_id: string;
  asset_id: string;
  assigned_to_user_id: string;
  checkout_date: string;
  expected_return_date?: string | null;
  returned_at?: string | null;
  condition_grade: string;
  quantity?: number;
  employee_code?: string;
  employee_name?: string;
  employee_department?: string;
  employee_email?: string;
  serial_number?: string;
  signature_data?: string;
  notes?: string;
  asset_sku?: string;
  asset_name?: string;
  asset_attributes?: Record<string, any>;
}

export interface RepairRecord {
  repair_id: string;
  org_id: string;
  item_id: string;
  item_sku: string;
  item_name: string;
  quantity: number;
  serial_number: string;
  status: "FAULTY" | "AT_VENDOR" | "REPAIRED" | "SCRAPPED" | string;
  issue_description: string;
  reported_by: string;
  vendor_name: string;
  vendor_contact: string;
  ticket_reference: string;
  sent_date?: string | null;
  expected_return_date?: string | null;
  repaired_date?: string | null;
  repair_cost: number;
  resolution_notes: string;
  created_at: string;
  updated_at: string;
}

export interface RepairSummary {
  total_faulty: number;
  total_at_vendor: number;
  total_repaired: number;
  total_scrapped: number;
  total_repair_spend: number;
}

export interface FinanceReportKPIs {
  total_skus: number;
  total_units_owned: number;
  total_in_store: number;
  total_assigned: number;
  total_faulty: number;
  total_at_vendor: number;
  total_repaired_count: number;
  total_scrapped_count: number;
  total_asset_valuation: number;
  total_accumulated_depreciation?: number;
  total_net_book_value?: number;
  in_store_valuation: number;
  assigned_valuation: number;
  total_repair_spend: number;
  depreciation_months?: number;
}

export interface FinanceItemBreakdown {
  item_id: string;
  sku: string;
  name: string;
  category: string;
  cost_center?: string;
  base_uom: string;
  unit_cost: number;
  total_owned: number;
  in_store: number;
  assigned: number;
  faulty: number;
  at_vendor: number;
  repaired_count: number;
  scrapped_count: number;
  total_valuation: number;
  months_in_service?: number;
  accumulated_depreciation?: number;
  net_book_value?: number;
  repair_spend: number;
}

export interface FinanceCustodyRow {
  assignment_id: string;
  item_sku: string;
  item_name: string;
  employee_code: string;
  employee_name: string;
  employee_department: string;
  serial_number: string;
  quantity: number;
  condition_grade: string;
  has_signature: boolean;
  checkout_date: string;
  returned_at?: string | null;
}

export interface FinanceAuditDossier {
  generated_at: string;
  organization_name: string;
  kpis: FinanceReportKPIs;
  items: FinanceItemBreakdown[];
  custody_records: FinanceCustodyRow[];
  repair_records: RepairRecord[];
}

export interface HandoverCertificate {
  assignment: CustodyAssignment;
  evidence: {
    evidence_id: string;
    org_id: string;
    assignment_id: string;
    pdf_sha256: string;
    record_hash: string;
    previous_hash: string;
    created_at: string;
  };
  is_valid: boolean;
  tamper_detected: boolean;
  computed_hash: string;
  stored_hash: string;
}

export interface CustomFieldDefinition {
  field_id: string;
  org_id: string;
  field_name: string;
  field_type: "text" | "number" | "decimal" | "date" | "dropdown" | "boolean" | "barcode" | string;
  dropdown_options: string[];
  is_required: boolean;
  created_at: string;
}

export interface CSVImportResult {
  total_rows: number;
  imported: number;
  dry_run: boolean;
  errors?: Array<{ row: number; field: string; error: string }>;
}

export interface OrganizationSummary {
  org_id: string;
  name: string;
  slug: string;
  plan: string;
  created_at: string;
  trial_ends_at?: string;
  trial_days_remaining?: number;
  is_trial_expired?: boolean;
  user_count: number;
  item_count: number;
  movement_count: number;
  status: "active" | "suspended" | "trial" | "expired" | string;
}

export interface PlatformTelemetry {
  total_organizations: number;
  total_users: number;
  total_items: number;
  total_movements: number;
  active_enterprises: number;
  active_standards: number;
  active_trials: number;
}

export interface ProvisionInput {
  name: string;
  slug?: string;
  plan?: string;
  admin_name: string;
  admin_email: string;
  admin_password?: string;
}

