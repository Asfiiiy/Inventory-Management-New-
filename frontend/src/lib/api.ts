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
  email: string;
  name: string;
  role: "admin" | "staff" | string;
  is_active: boolean;
  created_at: string;
}

export interface AuthResponse {
  token: string;
  user: UserProfile;
}

export const DEFAULT_API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
export const DEFAULT_TENANT_ID = "a0000000-0000-0000-0000-000000000001";

let currentTenantId: string = DEFAULT_TENANT_ID;
let currentAuthToken: string | null = null;

export function setTenantId(tenantId: string) {
  currentTenantId = tenantId;
  if (typeof window !== "undefined") {
    localStorage.setItem("whoopit_tenant_id", tenantId);
  }
}

export function getTenantId(): string {
  if (typeof window !== "undefined") {
    const saved = localStorage.getItem("whoopit_tenant_id");
    if (saved) return saved;
  }
  return currentTenantId;
}

export function setAuthToken(token: string) {
  currentAuthToken = token;
  if (typeof window !== "undefined") {
    localStorage.setItem("whoopit_auth_token", token);
    // Persist as cookie for Next.js middleware verification
    document.cookie = `whoopit_auth_token=${encodeURIComponent(token)}; path=/; max-age=604800; SameSite=Lax`;
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
  if (typeof window !== "undefined") {
    localStorage.removeItem("whoopit_auth_token");
    localStorage.removeItem("whoopit_auth_user");
    document.cookie = "whoopit_auth_token=; path=/; max-age=0; SameSite=Lax";
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

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Tenant-ID": tenantId,
    ...(options.headers as Record<string, string>),
  };

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
    // If unauthorized or token invalid on a non-login route, clear token
    if (response.status === 401 && !path.includes("/auth/login")) {
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
    delete: (id: string) =>
      request<{ success: boolean; data: { deleted: boolean; item_id: string } }>(`/api/v1/items/${id}`, {
        method: "DELETE",
      }),
    search: (attributes: Record<string, any> = {}) =>
      request<{ success: boolean; data: any[]; meta: { count: number } }>("/api/v1/items/search", {
        method: "POST",
        body: JSON.stringify({ attributes }),
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
  },

  users: {
    list: () => request<{ success: boolean; data: UserProfile[]; meta?: { count: number } }>("/api/v1/users"),
  },

  custody: {
    getSummary: () =>
      request<{ success: boolean; data: CustodySummary }>("/api/v1/assets/summary"),
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
    }) =>
      request<{
        success: boolean;
        data: {
          assignment: CustodyAssignment;
          move?: any;
          evidence?: any;
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
  },
};

export interface CustodySummary {
  total_assets: number;
  deployed_to_employees: number;
  remaining_in_storage: number;
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
  asset_sku?: string;
  asset_name?: string;
  asset_attributes?: Record<string, any>;
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

