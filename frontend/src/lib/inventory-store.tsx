"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { apiClient, ApiError } from "./api";
import { useAuth } from "./auth-context";

export interface Product {
  id: string;
  sku: string;
  name: string;
  category: string;
  cost: number;          // Cost Price
  price: number;         // Selling / Replacement Value
  currentStock: number;  // Available in IT Store (on-hand)
  assignedCount: number; // Handed over / Assigned to Employees
  faultyCount: number;   // Faulty / Damaged in office
  inRepairCount: number; // At Vendor for Repair
  repairedCount: number; // Repaired & Returned from Vendor (Cumulative track record)
  scrappedCount: number; // Permanently scrapped
  totalOwned: number;    // Total Owned (In Store + Assigned + Faulty + In Repair)
  reorderLevel: number;  // Low stock alert threshold
  unit: string;          // unit / pcs / boxes
  barcode?: string;
  attributes?: Record<string, any>;
  updatedAt: string;
}

export interface StockMovement {
  id: string;
  type: "IN" | "OUT" | "ADJUSTMENT";
  productId: string;
  productName: string;
  sku: string;
  quantity: number;
  previousStock: number;
  newStock: number;
  reference: string;
  partyName?: string;
  reason?: string;
  timestamp: string;
}

export interface Contact {
  id: string;
  name: string;
  type: "SUPPLIER" | "CUSTOMER";
  email: string;
  phone: string;
  address: string;
  company?: string;
  employeeCode?: string;
  department?: string;
  deskLocation?: string;
}

interface StandardLocations {
  warehouseId: string;
  vendorId: string;
  customerId: string;
  scrapId: string;
}

interface InventoryContextType {
  products: Product[];
  movements: StockMovement[];
  contacts: Contact[];
  isLoading: boolean;
  isBackendConnected: boolean;
  error: string | null;
  // Metrics
  totalProductsCount: number;
  totalInventoryValuation: number;
  totalOwnedUnits: number;
  totalInStoreUnits: number;
  totalAssignedUnits: number;
  totalFaultyUnits: number;
  totalInRepairUnits: number;
  totalRepairedUnits: number;
  lowStockItems: Product[];
  // Actions connected to Live Go Backend API
  addProduct: (product: {
    sku: string;
    name: string;
    category: string;
    cost: number;
    price: number;
    currentStock: number;
    reorderLevel: number;
    unit?: string;
    barcode?: string;
    attributes?: Record<string, any>;
  }) => Promise<{ success: boolean; error?: string }>;
  updateProduct: (id: string, product: Partial<Product>) => Promise<{ success: boolean; error?: string }>;
  deleteProduct: (id: string) => Promise<{ success: boolean; error?: string }>;
  stockIn: (data: {
    productId: string;
    quantity: number;
    unit?: string;
    supplierName: string;
    reference: string;
    unitCost?: number;
  }) => Promise<{ success: boolean; error?: string }>;
  stockOut: (data: {
    productId: string;
    quantity: number;
    unit?: string;
    customerName: string;
    reference: string;
    unitPrice?: number;
  }) => Promise<{ success: boolean; error?: string }>;
  adjustStock: (data: {
    productId: string;
    newStock: number;
    reason: string;
    reference: string;
  }) => Promise<{ success: boolean; error?: string }>;
  addContact: (contact: Omit<Contact, "id">) => Promise<{ success: boolean; error?: string; notice?: string }>;
  updateContact: (id: string, updated: Partial<Contact>) => Promise<{ success: boolean; error?: string; notice?: string }>;
  deleteContact: (id: string) => Promise<{ success: boolean; error?: string; notice?: string }>;
  refetch: () => Promise<void>;
  resetToDefaults: () => Promise<void>;
}

// Default empty locations; will be resolved dynamically per tenant from PostgreSQL
const DEFAULT_LOCATIONS: StandardLocations = {
  warehouseId: "",
  vendorId: "",
  customerId: "",
  scrapId: "",
};

const STAFF_SIGN_IN_PASSWORD = "Password123!";

const InventoryContext = createContext<InventoryContextType | undefined>(undefined);

function getTenantOrgId(): string {
  if (typeof window === "undefined") return "default";
  try {
    const tenantId = localStorage.getItem("whoopit_tenant_id");
    if (tenantId) return tenantId;
    const userStr = localStorage.getItem("whoopit_auth_user");
    return userStr ? JSON.parse(userStr)?.org_id || "default" : "default";
  } catch {
    return "default";
  }
}

export function InventoryProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const currentTenant = typeof window !== "undefined" ? localStorage.getItem("whoopit_tenant_id") || user?.org_id || getTenantOrgId() : "default";
  const activeOrgId = currentTenant;

  const [products, setProducts] = useState<Product[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [locations, setLocations] = useState<StandardLocations>(DEFAULT_LOCATIONS);
  const [isLoading, setIsLoading] = useState(true);
  const [isBackendConnected, setIsBackendConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDirectory = useCallback(async () => {
    const [supRes, userRes] = await Promise.all([
      apiClient.suppliers.list(),
      apiClient.users.list(),
    ]);
    const vendors: Contact[] = (supRes.data || []).map((supplier) => ({
      id: supplier.supplier_id,
      name: supplier.name,
      type: "SUPPLIER",
      email: supplier.email || "",
      phone: supplier.phone || "",
      address: supplier.address || "",
      company: supplier.notes || "",
    }));
    const staff: Contact[] = (userRes.data || [])
      .filter((account) => account.is_active !== false && String(account.role).toLowerCase() !== "superadmin")
      .map((account) => ({
        id: account.id,
        name: account.name || account.email,
        type: "CUSTOMER" as const,
        email: account.email || "",
        phone: "",
        address: account.desk_location || "",
        company: account.department || "",
        employeeCode: account.employee_code || "",
        department: account.department || "",
        deskLocation: account.desk_location || "",
      }));
    setContacts([...vendors, ...staff]);
    if (typeof window !== "undefined") {
      localStorage.removeItem(`whoopit_contacts_${getTenantOrgId()}`);
    }
  }, []);

  // 1. Resolve standard locations and fetch backend state
  const fetchBackendData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      // A. Check Backend Health
      const health = await apiClient.health.check();
      if (!health || health.data?.status !== "healthy") {
        setIsBackendConnected(false);
        setIsLoading(false);
        return;
      }
      setIsBackendConnected(true);

      // B. Resolve Locations
      let currentLocs = { ...DEFAULT_LOCATIONS };
      try {
        const locRes = await apiClient.locations.list();
        const locList = locRes.data || [];

        const wh =
          locList.find(
            (l: any) =>
              (l.category === "physical_warehouse" || l.category === "physical_office") &&
              (l.name.includes("Main") || l.name.includes("Store") || l.name.includes("Floor"))
          ) ||
          locList.find((l: any) => l.category === "physical_warehouse" || l.category === "physical_office");

        const ven =
          locList.find(
            (l: any) =>
              l.category === "virtual_vendor" &&
              (l.name.includes("External") || l.name.includes("Supply") || l.name.includes("Vendor"))
          ) || locList.find((l: any) => l.category === "virtual_vendor");

        const cust =
          locList.find(
            (l: any) =>
              l.category === "virtual_customer" &&
              (l.name.includes("Delivery") || l.name.includes("Customer"))
          ) || locList.find((l: any) => l.category === "virtual_customer");

        const scr = locList.find((l: any) => l.category === "virtual_scrap");

        if (wh) currentLocs.warehouseId = wh.location_id;
        if (ven) currentLocs.vendorId = ven.location_id;
        if (cust) currentLocs.customerId = cust.location_id;
        if (scr) currentLocs.scrapId = scr.location_id;

        // If any locations are missing in the DB, create them automatically
        if (!wh) {
          const createdWh = await apiClient.locations.create({ name: "Main Floor / Active Store", category: "physical_warehouse" });
          if (createdWh.data?.location_id) currentLocs.warehouseId = createdWh.data.location_id;
        }
        if (!ven) {
          const createdVen = await apiClient.locations.create({ name: "External Vendors (Virtual)", category: "virtual_vendor" });
          if (createdVen.data?.location_id) currentLocs.vendorId = createdVen.data.location_id;
        }
        if (!cust) {
          const createdCust = await apiClient.locations.create({ name: "Customers Virtual Delivery", category: "virtual_customer" });
          if (createdCust.data?.location_id) currentLocs.customerId = createdCust.data.location_id;
        }
        if (!scr) {
          const createdScr = await apiClient.locations.create({ name: "Inventory Scrap & Loss", category: "virtual_scrap" });
          if (createdScr.data?.location_id) currentLocs.scrapId = createdScr.data.location_id;
        }

        setLocations(currentLocs);
      } catch (locErr) {
        console.warn("Could not dynamically resolve locations, using defaults", locErr);
      }

      // C. Fetch Products from GET /api/v1/items
      let itemsList: any[] = [];
      try {
        const itemsRes = await apiClient.items.list();
        itemsList = itemsRes.data || [];
      } catch {
        // Fallback search
        const searchRes = await apiClient.items.search({});
        itemsList = searchRes.data || [];
      }

      // D. Map products with live 6-Bucket Office IT Lifecycle balances from PostgreSQL
      const populatedProducts: Product[] = itemsList.map((item: any) => {
        const attrs = item.attributes || {};
        const onHand = Number(item.total_on_hand !== undefined ? item.total_on_hand : item.current_stock) || 0;
        const assigned = Number(item.assigned_count) || 0;
        const faulty = Number(item.faulty_count) || 0;
        const inRepair = Number(item.in_repair_count) || 0;
        const repaired = Number(item.repaired_count) || 0;
        const scrapped = Number(item.scrapped_count) || 0;
        const totalOwned = Number(item.total_owned !== undefined ? item.total_owned : onHand + assigned + faulty + inRepair) || onHand;

        return {
          id: item.item_id,
          sku: item.sku,
          name: item.name,
          category: item.category_name || attrs.category || "IT Hardware",
          cost: Number(item.cost_price ?? attrs.cost_price) || 0,
          price: Number(item.selling_price ?? attrs.selling_price) || 0,
          currentStock: onHand,
          assignedCount: assigned,
          faultyCount: faulty,
          inRepairCount: inRepair,
          repairedCount: repaired,
          scrappedCount: scrapped,
          totalOwned,
          reorderLevel: Number(item.reorder_level ?? attrs.reorder_level) || 5,
          unit: item.base_uom || "unit",
          barcode: item.barcode || attrs.barcode || item.sku,
          attributes: attrs,
          updatedAt: item.updated_at || item.created_at || new Date().toISOString(),
        };
      });

      setProducts(populatedProducts);

      // E. Fetch Movement Ledger from GET /api/v1/stock/moves
      try {
        const movesRes = await apiClient.stock.listMoves({ limit: 100 });
        const movesList = movesRes.data || [];

        const inTypes = ["INWARD_RECEIPT", "inward", "receipt", "INWARD_PURCHASE", "IN", "RECEIPT"];
        const outTypes = ["RETAIL_SALE", "outward", "RESERVATION_FULFILLMENT", "OUT", "DISPATCH"];

        const parsedMovements: StockMovement[] = movesList.map((m: any) => {
          let type: "IN" | "OUT" | "ADJUSTMENT" = "ADJUSTMENT";
          if (inTypes.includes(m.move_type)) {
            type = "IN";
          } else if (outTypes.includes(m.move_type)) {
            type = "OUT";
          } else {
            type = "ADJUSTMENT";
          }

          const matchedProd = populatedProducts.find((p) => p.id === m.item_id);
          const isNegativeAdj =
            type === "ADJUSTMENT" &&
            (m.to_location_id === currentLocs.scrapId ||
              String(m.move_type).toLowerCase().includes("scrap") ||
              String(m.move_type).toLowerCase().includes("loss"));
          const adjReason = m.usage_target || "Cycle Count Discrepancy";
          const finalQty = isNegativeAdj ? -Math.abs(m.quantity) : m.quantity;

          return {
            id: m.move_id,
            type,
            productId: m.item_id,
            productName: matchedProd?.name || "Product " + m.item_id.slice(0, 8),
            sku: matchedProd?.sku || m.item_id.slice(0, 8),
            quantity: finalQty,
            previousStock: 0,
            newStock: m.quantity,
            reference: m.reference_code || "MOV-" + m.move_id.slice(0, 6),
            partyName: m.usage_target || (type === "IN" ? "Vendor Delivery" : type === "OUT" ? "Customer Order" : "Audit Discrepancy"),
            reason: type === "ADJUSTMENT" ? adjReason : undefined,
            timestamp: m.created_at || new Date().toISOString(),
          };
        });

        setMovements(parsedMovements);
      } catch (moveErr) {
        console.warn("Could not fetch stock moves:", moveErr);
      }

      try {
        await loadDirectory();
      } catch (dirErr) {
        console.warn("Could not fetch staff and vendors:", dirErr);
      }
    } catch (err: any) {
      setError(err?.message || "Failed to connect to Go Backend");
      setIsBackendConnected(false);
    } finally {
      setIsLoading(false);
    }
  }, [loadDirectory]);

  useEffect(() => {
    // Mark loading BEFORE clearing so dashboards never flash a false "empty catalog".
    setIsLoading(true);
    setProducts([]);
    setMovements([]);
    fetchBackendData();
  }, [activeOrgId, fetchBackendData]);

  // Metrics
  const totalProductsCount = products.length;
  const totalOwnedUnits = products.reduce((sum, p) => sum + p.totalOwned, 0);
  const totalInStoreUnits = products.reduce((sum, p) => sum + p.currentStock, 0);
  const totalAssignedUnits = products.reduce((sum, p) => sum + p.assignedCount, 0);
  const totalFaultyUnits = products.reduce((sum, p) => sum + p.faultyCount, 0);
  const totalInRepairUnits = products.reduce((sum, p) => sum + p.inRepairCount, 0);
  const totalRepairedUnits = products.reduce((sum, p) => sum + p.repairedCount, 0);
  const totalInventoryValuation = products.reduce(
    (sum, p) => sum + p.totalOwned * p.cost,
    0
  );
  const lowStockItems = products.filter(
    (p) => p.reorderLevel > 0 && p.currentStock <= p.reorderLevel
  );

  // ---------------------------------------------------------------------------
  // Action 1: Add Product (POST /api/v1/items)
  // ---------------------------------------------------------------------------
  const addProduct = async (productData: {
    sku: string;
    name: string;
    category: string;
    cost: number;
    price: number;
    currentStock: number;
    reorderLevel: number;
    unit?: string;
    barcode?: string;
    attributes?: Record<string, any>;
  }): Promise<{ success: boolean; error?: string }> => {
    try {
      const barcodeValue = productData.barcode?.trim() || productData.sku.trim().toUpperCase();
      const payload: any = {
        sku: productData.sku.trim().toUpperCase(),
        name: productData.name.trim(),
        tracking_mode: "none",
        base_uom: productData.unit || "unit",
        valuation_method: "fifo",
        barcode: barcodeValue,
        cost_price: Number(productData.cost) || 0,
        selling_price: Number(productData.price) || 0,
        reorder_level: Number(productData.reorderLevel) || 5,
        attributes: {
          barcode: barcodeValue,
          cost_price: Number(productData.cost) || 0,
          selling_price: Number(productData.price) || 0,
          reorder_level: Number(productData.reorderLevel) || 5,
          category: productData.category.trim() || "General",
          ...(productData.attributes || {}),
        },
      };

      const res = await apiClient.items.create(payload);
      const createdItem = res.data;

      // If initial stock was provided, execute an inward stock move
      if (productData.currentStock > 0 && createdItem?.item_id) {
        try {
          const fromLoc = locations.vendorId || "00000000-0000-0000-0000-000000000001";
          const toLoc = locations.warehouseId || "00000000-0000-0000-0000-000000000002";
          await apiClient.stock.createMove({
            item_id: createdItem.item_id,
            from_location_id: fromLoc,
            to_location_id: toLoc,
            quantity: productData.currentStock,
            move_type: "INWARD_RECEIPT",
            reference_code: `INIT-${productData.sku}`,
          });
        } catch (stockErr) {
          console.warn("Initial stock allocation move warning (product was created):", stockErr);
        }
      }

      await fetchBackendData();
      return { success: true };
    } catch (err: any) {
      let msg = "Failed to create product";
      if (err instanceof ApiError) {
        if (err.problem?.errors && Array.isArray(err.problem.errors) && err.problem.errors.length > 0) {
          msg = err.problem.errors.map((e: any) => e.message || `${e.field}: invalid`).join("; ");
        } else {
          msg = err.problem?.detail || err.problem?.title || err.message;
        }
      } else if (err?.message) {
        msg = err.message;
      }
      return { success: false, error: msg };
    }
  };

  // ---------------------------------------------------------------------------
  // Action 2: Stock In (POST /api/v1/stock/moves - INWARD_RECEIPT)
  // ---------------------------------------------------------------------------
  const stockIn = async (data: {
    productId: string;
    quantity: number;
    unit?: string;
    supplierName: string;
    reference: string;
    unitCost?: number;
  }): Promise<{ success: boolean; error?: string }> => {
    try {
      const qty = Math.max(0.01, Number(data.quantity) || 1);

      await apiClient.stock.createMove({
        item_id: data.productId,
        from_location_id: locations.vendorId,
        to_location_id: locations.warehouseId,
        quantity: qty,
        unit: data.unit || undefined,
        move_type: "INWARD_RECEIPT",
        reference_code: data.reference,
        idempotency_key: `IN-${data.reference}-${Date.now()}`,
        usage_target: data.supplierName,
        unit_cost: data.unitCost,
      });

      await fetchBackendData();
      return { success: true };
    } catch (err: any) {
      const msg = err instanceof ApiError ? err.problem.detail || err.message : err?.message || "Stock In failed";
      return { success: false, error: msg };
    }
  };

  // ---------------------------------------------------------------------------
  // Action 3: Stock Out (POST /api/v1/stock/moves - RETAIL_SALE)
  // ---------------------------------------------------------------------------
  const stockOut = async (data: {
    productId: string;
    quantity: number;
    unit?: string;
    customerName: string;
    reference: string;
    unitPrice?: number;
  }): Promise<{ success: boolean; error?: string }> => {
    try {
      const qty = Math.max(0.01, Number(data.quantity) || 1);

      await apiClient.stock.createMove({
        item_id: data.productId,
        from_location_id: locations.warehouseId,
        to_location_id: locations.customerId,
        quantity: qty,
        unit: data.unit || undefined,
        move_type: "RETAIL_SALE",
        reference_code: data.reference,
        idempotency_key: `OUT-${data.reference}-${Date.now()}`,
        usage_target: data.customerName,
        unit_cost: data.unitPrice,
      });

      await fetchBackendData();
      return { success: true };
    } catch (err: any) {
      if (err instanceof ApiError && err.status === 422) {
        const detail = err.problem.detail || "Insufficient Stock at warehouse location";
        return {
          success: false,
          error: `HTTP 422 Insufficient Stock: ${detail}`,
        };
      }
      const msg = err instanceof ApiError ? err.problem.detail || err.message : err?.message || "Stock Out failed";
      return { success: false, error: msg };
    }
  };

  // ---------------------------------------------------------------------------
  // Action 4: Stock Adjustments (POST /api/v1/stock/moves - INVENTORY_ADJUSTMENT)
  // ---------------------------------------------------------------------------
  const adjustStock = async (data: {
    productId: string;
    newStock: number;
    reason: string;
    reference: string;
  }): Promise<{ success: boolean; error?: string }> => {
    try {
      const targetStock = Math.max(0, Number(data.newStock) || 0);
      const product = products.find((p) => p.id === data.productId);
      const current = product ? product.currentStock : 0;
      const diff = targetStock - current;

      if (diff === 0) return { success: true };

      if (diff > 0) {
        // Increase stock: Transfer from Virtual Vendor to Warehouse
        await apiClient.stock.createMove({
          item_id: data.productId,
          from_location_id: locations.vendorId,
          to_location_id: locations.warehouseId,
          quantity: diff,
          move_type: "INVENTORY_ADJUSTMENT",
          reference_code: data.reference,
          usage_target: data.reason,
        });
      } else {
        // Decrease stock: Transfer from Warehouse to Virtual Scrap/Loss
        const deductQty = Math.abs(diff);
        await apiClient.stock.createMove({
          item_id: data.productId,
          from_location_id: locations.warehouseId,
          to_location_id: locations.scrapId,
          quantity: deductQty,
          move_type: "INVENTORY_ADJUSTMENT",
          reference_code: data.reference,
          usage_target: data.reason,
        });
      }

      await fetchBackendData();
      return { success: true };
    } catch (err: any) {
      const msg = err instanceof ApiError ? err.problem.detail || err.message : err?.message || "Adjustment failed";
      return { success: false, error: msg };
    }
  };

  const updateProduct = async (
    id: string,
    updated: Partial<Product>
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const payload: any = {};
      if (updated.sku) payload.sku = updated.sku.trim().toUpperCase();
      if (updated.name) payload.name = updated.name.trim();
      if (updated.unit) payload.base_uom = updated.unit.trim();
      if (updated.barcode) payload.barcode = updated.barcode.trim();
      if (updated.cost !== undefined) payload.cost_price = Number(updated.cost) || 0;
      if (updated.price !== undefined) payload.selling_price = Number(updated.price) || 0;
      if (updated.reorderLevel !== undefined) payload.reorder_level = Number(updated.reorderLevel) || 0;
      if (updated.attributes || updated.category) {
        payload.attributes = {
          ...(updated.attributes || {}),
          category: updated.category || "General",
        };
      }

      await apiClient.items.update(id, payload);
      await fetchBackendData();
      return { success: true };
    } catch (err: any) {
      const msg = err instanceof ApiError ? err.problem.detail || err.message : err?.message || "Failed to update product";
      return { success: false, error: msg };
    }
  };

  const deleteProduct = async (id: string): Promise<{ success: boolean; error?: string }> => {
    try {
      await apiClient.items.delete(id);
      await fetchBackendData();
      return { success: true };
    } catch (err: any) {
      const msg = err instanceof ApiError ? err.problem.detail || err.message : err?.message || "Failed to delete product";
      return { success: false, error: msg };
    }
  };

  const directoryError = (err: any, fallback: string) =>
    err instanceof ApiError ? err.problem.detail || err.message : err?.message || fallback;

  const addContact = async (data: Omit<Contact, "id">) => {
    try {
      if (data.type === "CUSTOMER") {
        const email = data.email.trim();
        if (!email) {
          return { success: false, error: "Office staff need an email so they can sign in." };
        }
        const created = await apiClient.users.create({
          name: data.name.trim(),
          email,
          password: STAFF_SIGN_IN_PASSWORD,
          role: "staff",
          employee_code: data.employeeCode || "",
          department: data.department || data.company || "",
          desk_location: data.deskLocation || data.address || "",
          send_invite_mail: true,
        });
        await loadDirectory();
        const mailNote = created.data?.invite_email_sent
          ? " Invite email sent (check Mailpit)."
          : "";
        return {
          success: true,
          notice: `${data.name.trim()} can sign in with ${email} and password ${STAFF_SIGN_IN_PASSWORD}.${mailNote}`,
        };
      }

      await apiClient.suppliers.create({
        name: data.name.trim(),
        phone: data.phone,
        email: data.email,
        address: data.address,
        notes: data.company || "",
      });
      await loadDirectory();
      return { success: true, notice: `${data.name.trim()} is saved in the company vendor list.` };
    } catch (err: any) {
      return { success: false, error: directoryError(err, "Could not save the directory record") };
    }
  };

  const updateContact = async (id: string, updated: Partial<Contact>) => {
    const existing = contacts.find((contact) => contact.id === id);
    if (!existing) {
      return { success: false, error: "That directory record is no longer available." };
    }
    if (updated.type && updated.type !== existing.type) {
      return { success: false, error: "Create a new record to change a vendor into staff, or the other way around." };
    }

    try {
      if (existing.type === "CUSTOMER") {
        const email = (updated.email ?? existing.email).trim();
        const name = (updated.name ?? existing.name).trim();
        if (!email) {
          return { success: false, error: "Office staff need an email so they can sign in." };
        }
        await apiClient.users.update(id, {
          name,
          email,
          is_active: true,
          employee_code: updated.employeeCode ?? existing.employeeCode ?? "",
          department: updated.department ?? updated.company ?? existing.department ?? existing.company ?? "",
          desk_location: updated.deskLocation ?? updated.address ?? existing.deskLocation ?? existing.address ?? "",
        });
        await loadDirectory();
        return { success: true, notice: "Staff directory fields are saved on the sign-in account." };
      }

      await apiClient.suppliers.update(id, {
        name: (updated.name ?? existing.name).trim(),
        phone: updated.phone ?? existing.phone,
        email: updated.email ?? existing.email,
        address: updated.address ?? existing.address,
        notes: updated.company ?? existing.company ?? "",
      });
      await loadDirectory();
      return { success: true, notice: `${updated.name || existing.name} is updated in the vendor list.` };
    } catch (err: any) {
      return { success: false, error: directoryError(err, "Could not update the directory record") };
    }
  };

  const deleteContact = async (id: string) => {
    const existing = contacts.find((contact) => contact.id === id);
    if (!existing) {
      return { success: false, error: "That directory record is no longer available." };
    }
    if (existing.type === "CUSTOMER" && user?.id === id) {
      return { success: false, error: "You cannot deactivate the account you are signed in with." };
    }

    try {
      if (existing.type === "CUSTOMER") {
        await apiClient.users.update(id, { is_active: false });
        await loadDirectory();
        return { success: true, notice: `${existing.name} can no longer sign in. Past custody records stay in place.` };
      }
      await apiClient.suppliers.remove(id);
      await loadDirectory();
      return { success: true, notice: `${existing.name} was removed from the vendor list.` };
    } catch (err: any) {
      return { success: false, error: directoryError(err, "Could not remove the directory record") };
    }
  };


  const resetToDefaults = async () => {
    // Only allow demo sample seeding for the initial demonstration tenant
    if (activeOrgId !== "a0000000-0000-0000-0000-000000000001") {
      console.warn("Seeding demo products is strictly blocked for private client organizations.");
      return;
    }

    // Re-seed standard products into Go backend
    const seedItems = [
      {
        sku: "ELEC-LAP-001",
        name: "Dell Latitude 5540 Laptop",
        category: "Electronics",
        cost: 850,
        price: 1199,
        currentStock: 14,
        reorderLevel: 5,
        unit: "unit",
      },
      {
        sku: "ELEC-MON-002",
        name: "Dell UltraSharp 27\" 4K Monitor",
        category: "Electronics",
        cost: 320,
        price: 499,
        currentStock: 3,
        reorderLevel: 6,
        unit: "unit",
      },
      {
        sku: "NET-ROUT-003",
        name: "Cisco Catalyst Gigabit Router",
        category: "Networking",
        cost: 450,
        price: 680,
        currentStock: 8,
        reorderLevel: 4,
        unit: "unit",
      },
      {
        sku: "ACC-KEY-004",
        name: "Logitech MX Mechanical Keyboard",
        category: "Accessories",
        cost: 95,
        price: 149,
        currentStock: 2,
        reorderLevel: 5,
        unit: "unit",
      },
      {
        sku: "STOR-SSD-007",
        name: "Samsung 990 Pro 2TB NVMe SSD",
        category: "Storage",
        cost: 140,
        price: 199,
        currentStock: 1,
        reorderLevel: 5,
        unit: "unit",
      },
    ];

    for (const item of seedItems) {
      await addProduct(item);
    }
  };

  return (
    <InventoryContext.Provider
      value={{
        products,
        movements,
        contacts,
        isLoading,
        isBackendConnected,
        error,
        totalProductsCount,
        totalInventoryValuation,
        totalOwnedUnits,
        totalInStoreUnits,
        totalAssignedUnits,
        totalFaultyUnits,
        totalInRepairUnits,
        totalRepairedUnits,
        lowStockItems,
        addProduct,
        updateProduct,
        deleteProduct,
        stockIn,
        stockOut,
        adjustStock,
        addContact,
        updateContact,
        deleteContact,
        refetch: fetchBackendData,
        resetToDefaults,
      }}
    >
      {children}
    </InventoryContext.Provider>
  );
}

export function useInventory() {
  const context = useContext(InventoryContext);
  if (!context) {
    throw new Error("useInventory must be used within an InventoryProvider");
  }
  return context;
}
