"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { apiClient, ApiError } from "./api";

export interface Product {
  id: string;
  sku: string;
  name: string;
  category: string;
  cost: number;         // Cost Price
  price: number;        // Selling Price
  currentStock: number; // Available on-hand quantity from PostgreSQL
  reorderLevel: number; // Low stock alert threshold
  unit: string;         // unit / pcs / boxes
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
  }) => Promise<{ success: boolean; error?: string }>;
  updateProduct: (id: string, product: Partial<Product>) => void;
  deleteProduct: (id: string) => void;
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
  addContact: (contact: Omit<Contact, "id">) => void;
  deleteContact: (id: string) => void;
  refetch: () => Promise<void>;
  resetToDefaults: () => Promise<void>;
}

// Fallback known location IDs for default tenant
const DEFAULT_LOCATIONS: StandardLocations = {
  warehouseId: "574ee1f1-aa2c-4697-95d8-f313973a18ee",
  vendorId: "24597885-2c75-40ab-8212-f8fd693b9cdd",
  customerId: "e50c1844-01ae-4227-bd8d-89bc94c67383",
  scrapId: "b842cb0d-3ab7-4232-86b1-4f6d8a897278",
};

const defaultContacts: Contact[] = [
  {
    id: "cont-1",
    name: "Dell Commercial Direct",
    type: "SUPPLIER",
    email: "enterprise-orders@dell.com",
    phone: "+1 (800) 456-3355",
    address: "One Dell Way, Round Rock, TX",
    company: "Dell Technologies",
  },
  {
    id: "cont-2",
    name: "Tech Distributor Pro",
    type: "SUPPLIER",
    email: "supply@techdistributor.com",
    phone: "+1 (555) 019-2834",
    address: "742 Evergreen Terrace, Springfield, IL",
    company: "Tech Distribution Alliance",
  },
  {
    id: "cont-3",
    name: "Apex Dynamics Corp",
    type: "CUSTOMER",
    email: "procurement@apexdynamics.io",
    phone: "+1 (555) 782-9901",
    address: "100 Innovation Way, Boston, MA",
    company: "Apex Dynamics",
  },
  {
    id: "cont-4",
    name: "Starlight Digital Labs",
    type: "CUSTOMER",
    email: "it-ops@starlightlabs.net",
    phone: "+1 (555) 341-8890",
    address: "450 Silicon Avenue, San Jose, CA",
    company: "Starlight Media Inc.",
  },
];

const InventoryContext = createContext<InventoryContextType | undefined>(undefined);

function getTenantOrgId(): string {
  if (typeof window === "undefined") return "default";
  try {
    const userStr = localStorage.getItem("whoopit_auth_user");
    return userStr ? JSON.parse(userStr)?.org_id || "default" : "default";
  } catch {
    return "default";
  }
}

export function InventoryProvider({ children }: { children: React.ReactNode }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [contacts, setContacts] = useState<Contact[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const orgId = getTenantOrgId();
      const saved = localStorage.getItem(`whoopit_contacts_${orgId}`);
      if (saved) return JSON.parse(saved);
      // Only demo tenant gets initial sample contacts
      if (orgId === "a0000000-0000-0000-0000-000000000001") {
        return defaultContacts;
      }
      return [];
    } catch {
      return [];
    }
  });
  const [locations, setLocations] = useState<StandardLocations>(DEFAULT_LOCATIONS);
  const [isLoading, setIsLoading] = useState(true);
  const [isBackendConnected, setIsBackendConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

        const wh = locList.find((l: any) => l.category === "physical_warehouse" || l.category === "physical_office");
        const ven = locList.find((l: any) => l.category === "virtual_vendor");
        const cust = locList.find((l: any) => l.category === "virtual_customer");
        const scr = locList.find((l: any) => l.category === "virtual_scrap");

        if (wh) currentLocs.warehouseId = wh.location_id;
        if (ven) currentLocs.vendorId = ven.location_id;
        if (cust) currentLocs.customerId = cust.location_id;
        if (scr) currentLocs.scrapId = scr.location_id;

        // If any locations are missing in the DB, create them automatically
        if (!wh) {
          const createdWh = await apiClient.locations.create({ name: "Main Storage Warehouse", category: "physical_warehouse" });
          if (createdWh.data?.location_id) currentLocs.warehouseId = createdWh.data.location_id;
        }
        if (!ven) {
          const createdVen = await apiClient.locations.create({ name: "Vendors Virtual Supply", category: "virtual_vendor" });
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

      // D. For each product, fetch live on-hand balance from PostgreSQL Two-Sided Ledger
      const populatedProducts: Product[] = await Promise.all(
        itemsList.map(async (item: any) => {
          let balance = 0;
          try {
            const balRes = await apiClient.stock.getBalance(currentLocs.warehouseId, item.item_id);
            balance = balRes.data?.balance || 0;
          } catch {
            balance = 0;
          }

          const attrs = item.attributes || {};
          return {
            id: item.item_id,
            sku: item.sku,
            name: item.name,
            category: item.category_name || attrs.category || "General",
            cost: Number(item.cost_price ?? attrs.cost_price) || 0,
            price: Number(item.selling_price ?? attrs.selling_price) || 0,
            currentStock: balance,
            reorderLevel: Number(item.reorder_level ?? attrs.reorder_level) || 5,
            unit: item.base_uom || "unit",
            updatedAt: item.updated_at || item.created_at || new Date().toISOString(),
          };
        })
      );

      setProducts(populatedProducts);

      // E. Fetch Movement Ledger from GET /api/v1/stock/moves
      try {
        const movesRes = await apiClient.stock.listMoves({ limit: 100 });
        const movesList = movesRes.data || [];

        const parsedMovements: StockMovement[] = movesList.map((m: any) => {
          let type: "IN" | "OUT" | "ADJUSTMENT" = "IN";
          if (m.move_type === "INWARD_RECEIPT") {
            type = "IN";
          } else if (m.move_type === "RETAIL_SALE") {
            type = "OUT";
          } else {
            type = "ADJUSTMENT";
          }

          const matchedProd = populatedProducts.find((p) => p.id === m.item_id);

          return {
            id: m.move_id,
            type,
            productId: m.item_id,
            productName: matchedProd?.name || "Product " + m.item_id.slice(0, 8),
            sku: matchedProd?.sku || m.item_id.slice(0, 8),
            quantity: m.quantity,
            previousStock: 0,
            newStock: m.quantity,
            reference: m.reference_code || "MOV-" + m.move_id.slice(0, 6),
            partyName: type === "IN" ? "Vendor Delivery" : type === "OUT" ? "Customer Order" : "Audit Discrepancy",
            timestamp: m.created_at || new Date().toISOString(),
          };
        });

        setMovements(parsedMovements);
      } catch (moveErr) {
        console.warn("Could not fetch stock moves:", moveErr);
      }
    } catch (err: any) {
      setError(err?.message || "Failed to connect to Go Backend");
      setIsBackendConnected(false);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBackendData();
  }, [fetchBackendData]);

  // Metrics
  const totalProductsCount = products.length;
  const totalInventoryValuation = products.reduce(
    (sum, p) => sum + p.currentStock * p.cost,
    0
  );
  const lowStockItems = products.filter((p) => p.currentStock <= p.reorderLevel);

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
  }): Promise<{ success: boolean; error?: string }> => {
    try {
      const payload = {
        sku: productData.sku.trim().toUpperCase(),
        name: productData.name.trim(),
        tracking_mode: "none",
        base_uom: productData.unit || "unit",
        valuation_method: "fifo",
        attributes: {
          cost_price: Number(productData.cost) || 0,
          selling_price: Number(productData.price) || 0,
          reorder_level: Number(productData.reorderLevel) || 5,
          category: productData.category.trim() || "General",
        },
      };

      const res = await apiClient.items.create(payload);
      const createdItem = res.data;

      // If initial stock was provided, immediately execute a two-sided INWARD_RECEIPT move
      if (productData.currentStock > 0 && createdItem?.item_id) {
        await apiClient.stock.createMove({
          item_id: createdItem.item_id,
          from_location_id: locations.vendorId,
          to_location_id: locations.warehouseId,
          quantity: productData.currentStock,
          move_type: "INWARD_RECEIPT",
          reference_code: `INIT-${productData.sku}`,
        });
      }

      await fetchBackendData();
      return { success: true };
    } catch (err: any) {
      const msg = err instanceof ApiError ? err.problem.detail || err.message : err?.message || "Failed to create product";
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
        });
      }

      await fetchBackendData();
      return { success: true };
    } catch (err: any) {
      const msg = err instanceof ApiError ? err.problem.detail || err.message : err?.message || "Adjustment failed";
      return { success: false, error: msg };
    }
  };

  const updateProduct = (id: string, updated: Partial<Product>) => {
    setProducts((prev) =>
      prev.map((p) => (p.id === id ? { ...p, ...updated, updatedAt: new Date().toISOString() } : p))
    );
  };

  const deleteProduct = (id: string) => {
    setProducts((prev) => prev.filter((p) => p.id !== id));
  };

  const addContact = (data: Omit<Contact, "id">) => {
    const newContact: Contact = { ...data, id: "cont-" + Date.now() };
    setContacts((prev) => {
      const next = [newContact, ...prev];
      if (typeof window !== "undefined") {
        localStorage.setItem(`whoopit_contacts_${getTenantOrgId()}`, JSON.stringify(next));
      }
      return next;
    });
  };

  const deleteContact = (id: string) => {
    setContacts((prev) => {
      const next = prev.filter((c) => c.id !== id);
      if (typeof window !== "undefined") {
        localStorage.setItem(`whoopit_contacts_${getTenantOrgId()}`, JSON.stringify(next));
      }
      return next;
    });
  };


  const resetToDefaults = async () => {
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
        lowStockItems,
        addProduct,
        updateProduct,
        deleteProduct,
        stockIn,
        stockOut,
        adjustStock,
        addContact,
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
