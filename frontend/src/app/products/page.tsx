"use client";

import React, { useState, useEffect, Suspense, useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Package,
  Plus,
  Search,
  Filter,
  Edit2,
  Trash2,
  AlertTriangle,
  X,
  CheckCircle2,
  Loader2,
  Database,
  RefreshCw,
  Printer,
  Barcode as BarcodeIcon,
  Download,
  Eye,
  Laptop,
  Monitor,
  Mouse,
  Printer as PrinterIcon,
  Network,
  Cable,
  ShieldCheck,
  Wrench,
  UserCheck,
  LayoutGrid,
  List,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  Sparkles,
  Boxes,
  Tag,
  SlidersHorizontal,
  FolderPlus,
  PlusCircle,
} from "lucide-react";
import { useInventory, Product } from "@/lib/inventory-store";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/components/ui/toast";
import { ModalPortal } from "@/components/ui/modal-portal";
import { PrintLabelModal } from "@/components/barcode/print-label-modal";
import { exportProductsToCSV } from "@/lib/export-csv";
import { apiClient } from "@/lib/api";
import { cn } from "@/lib/utils";

const PRESET_CATEGORIES = [
  { id: "ALL", label: "All Fleet", icon: Package, badgeColor: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700" },
  { id: "Laptops", label: "Laptops & MacBooks", icon: Laptop, badgeColor: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800" },
  { id: "Monitors", label: "Monitors & Displays", icon: Monitor, badgeColor: "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-400 dark:border-purple-800" },
  { id: "Peripherals", label: "Keyboards & Mice", icon: Mouse, badgeColor: "bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-950/40 dark:text-cyan-400 dark:border-cyan-800" },
  { id: "Printers", label: "Printers & Scanners", icon: PrinterIcon, badgeColor: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800" },
  { id: "Networking", label: "Routers & Switches", icon: Network, badgeColor: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800" },
  { id: "Cables", label: "Cables & Adapters", icon: Cable, badgeColor: "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700" },
];

const PRESET_CATEGORY_IDS = new Set(
  PRESET_CATEGORIES.filter((c) => c.id !== "ALL").map((c) => c.id.toLowerCase())
);

/** Map product category + name → fleet bucket (so "IT HARDWARE" + MacBook counts as Laptops). */
function resolveCategorySchema(categoryName?: string, productName?: string) {
  const haystack = `${categoryName || ""} ${productName || ""}`.toLowerCase();
  if (
    haystack.includes("laptop") ||
    haystack.includes("macbook") ||
    haystack.includes("notebook") ||
    haystack.includes("chromebook") ||
    haystack.includes("latitude") ||
    haystack.includes("thinkpad") ||
    haystack.includes("desktop") ||
    haystack.includes("workstation") ||
    haystack.includes("imac") ||
    haystack.includes("computer")
  ) {
    return { name: "Laptops", icon: Laptop, badgeColor: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800" };
  }
  if (
    haystack.includes("monitor") ||
    haystack.includes("display") ||
    haystack.includes("ultrasharp") ||
    haystack.includes("screen") ||
    haystack.includes("lcd") ||
    haystack.includes("led panel")
  ) {
    return { name: "Monitors", icon: Monitor, badgeColor: "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-400 dark:border-purple-800" };
  }
  if (
    haystack.includes("keyboard") ||
    haystack.includes("mouse") ||
    haystack.includes("peripheral") ||
    haystack.includes("headset") ||
    haystack.includes("webcam") ||
    haystack.includes("dock")
  ) {
    return { name: "Peripherals", icon: Mouse, badgeColor: "bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-950/40 dark:text-cyan-400 dark:border-cyan-800" };
  }
  if (haystack.includes("printer") || haystack.includes("scanner") || haystack.includes("mfp")) {
    return { name: "Printers", icon: PrinterIcon, badgeColor: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800" };
  }
  if (
    haystack.includes("network") ||
    haystack.includes("router") ||
    haystack.includes("switch") ||
    haystack.includes("access point") ||
    haystack.includes("wifi") ||
    haystack.includes("firewall")
  ) {
    return { name: "Networking", icon: Network, badgeColor: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800" };
  }
  if (
    haystack.includes("cable") ||
    haystack.includes("adapter") ||
    haystack.includes("charger") ||
    haystack.includes("hdmi") ||
    haystack.includes("usb-c") ||
    haystack.includes("power brick")
  ) {
    return { name: "Cables", icon: Cable, badgeColor: "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700" };
  }
  // Exact preset id stored on the product
  const exact = (categoryName || "").trim();
  if (exact && PRESET_CATEGORY_IDS.has(exact.toLowerCase())) {
    const preset = PRESET_CATEGORIES.find((c) => c.id.toLowerCase() === exact.toLowerCase())!;
    return { name: preset.id, icon: preset.icon, badgeColor: preset.badgeColor };
  }
  return {
    name: categoryName || "Custom Item",
    icon: Boxes,
    badgeColor: "bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/40 dark:text-teal-400 dark:border-teal-800",
  };
}

function productBucketId(p: { category?: string; name?: string }) {
  return resolveCategorySchema(p.category, p.name).name;
}

function productMatchesCategory(
  p: { category?: string; name?: string },
  categoryId: string
) {
  if (categoryId === "ALL") return true;
  const bucket = productBucketId(p);
  if (PRESET_CATEGORY_IDS.has(categoryId.toLowerCase())) {
    return bucket.toLowerCase() === categoryId.toLowerCase();
  }
  // Custom tab: only items that stay in that raw category (not remapped to a preset)
  return (
    (p.category || "").toLowerCase() === categoryId.toLowerCase() &&
    bucket.toLowerCase() === categoryId.toLowerCase()
  );
}

export default function ProductsMasterPage() {
  return (
    <Suspense fallback={<div className="p-8 text-xs text-slate-400">Loading Hardware Catalog...</div>}>
      <ProductsMasterContent />
    </Suspense>
  );
}

function ProductsMasterContent() {
  const searchParams = useSearchParams();
  const { products, addProduct, updateProduct, deleteProduct, isLoading, isBackendConnected, refetch } = useInventory();
  const { toast } = useToast();
  const { isAdmin, isStaff } = useAuth();
  const canManage = isAdmin || !isStaff;

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("ALL");
  const [showLowStockOnly, setShowLowStockOnly] = useState(false);
  const [viewMode, setViewMode] = useState<"GRID" | "TABLE">("GRID");

  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [printingProduct, setPrintingProduct] = useState<Product | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Custom Category & Custom Specs State
  const [isCustomCategory, setIsCustomCategory] = useState(false);
  const [customCategoryInput, setCustomCategoryInput] = useState("");
  const [customFieldDefs, setCustomFieldDefs] = useState<any[]>([]);
  const [customAttributes, setCustomAttributes] = useState<Array<{ key: string; value: string }>>([
    { key: "Brand / Maker", value: "" },
    { key: "Model / Specs", value: "" },
  ]);

  // Load active custom field definitions for this tenant
  useEffect(() => {
    apiClient.customFields
      .list()
      .then((res) => {
        if (res.data) setCustomFieldDefs(res.data);
      })
      .catch(() => {});
  }, []);

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);

  // Form State
  const [formData, setFormData] = useState({
    sku: "",
    name: "",
    category: "Laptops",
    cost: "",
    price: "0",
    currentStock: "1",
    reorderLevel: "2",
    unit: "pcs",
    barcode: "",
  });

  // Handle URL query parameters
  useEffect(() => {
    const action = searchParams.get("action");
    const filter = searchParams.get("filter");
    const query = searchParams.get("search");

    if (action === "new") {
      handleOpenAdd();
    }
    if (filter === "low_stock") {
      setShowLowStockOnly(true);
    }
    if (query) {
      setSearchTerm(query);
    }
  }, [searchParams]);

  // Reset pagination on filter change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedCategory, showLowStockOnly]);

  // Dynamic Category Tabs: presets + custom categories that still have unmatched items
  const dynamicCategories = useMemo(() => {
    const existingCategories = Array.from(new Set(products.map((p) => p.category).filter(Boolean)));

    const customCats = existingCategories
      .filter((cat) => !PRESET_CATEGORY_IDS.has(cat.toLowerCase()) && cat.toLowerCase() !== "all")
      .filter((cat) => products.some((p) => productMatchesCategory(p, cat)))
      .map((cat) => ({
        id: cat,
        label: cat,
        icon: Boxes,
        badgeColor: "bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/40 dark:text-teal-400 dark:border-teal-800",
      }));

    return [...PRESET_CATEGORIES, ...customCats];
  }, [products]);

  const handleOpenAdd = () => {
    setEditingProduct(null);
    setIsCustomCategory(false);
    setCustomCategoryInput("");
    setFormData({
      sku: `IT-${Date.now().toString().slice(-6)}`,
      name: "",
      category: "Laptops",
      cost: "",
      price: "0",
      currentStock: "1",
      reorderLevel: "2",
      unit: "pcs",
      barcode: "",
    });
    const initialSpecs: Array<{ key: string; value: string }> = [
      { key: "Brand / Maker", value: "" },
      { key: "Model / Specs", value: "" },
    ];
    customFieldDefs.forEach((f) => {
      const cleanName = f.field_name.replace(/_/g, " ");
      const formattedKey = cleanName.charAt(0).toUpperCase() + cleanName.slice(1);
      if (
        f.is_required &&
        !initialSpecs.some((s) => s.key.toLowerCase().replace(/\s+/g, "_") === f.field_name.toLowerCase())
      ) {
        initialSpecs.push({
          key: formattedKey,
          value: f.field_type === "number" ? "24" : (f.options?.[0] || ""),
        });
      }
    });
    setCustomAttributes(initialSpecs);
    setModalOpen(true);
  };

  const handleOpenEdit = (p: Product) => {
    setEditingProduct(p);
    const isPreset = PRESET_CATEGORIES.some((c) => c.id !== "ALL" && c.id.toLowerCase() === p.category.toLowerCase());
    setIsCustomCategory(!isPreset);
    setCustomCategoryInput(!isPreset ? p.category : "");
    setFormData({
      sku: p.sku,
      name: p.name,
      category: isPreset ? p.category : "Custom",
      cost: p.cost.toString(),
      price: p.price.toString(),
      currentStock: p.currentStock.toString(),
      reorderLevel: p.reorderLevel.toString(),
      unit: p.unit || "pcs",
      barcode: p.barcode || "",
    });

    // Populate custom specs
    const rawAttrs = p.attributes || {};
    const loadedAttrs: Array<{ key: string; value: string }> = [];
    Object.entries(rawAttrs).forEach(([k, v]) => {
      if (!["barcode", "category", "cost_price", "selling_price", "reorder_level"].includes(k)) {
        loadedAttrs.push({
          key: k.replace(/_/g, " "),
          value: String(v),
        });
      }
    });

    setCustomAttributes(
      loadedAttrs.length > 0
        ? loadedAttrs
        : [
            { key: "Brand / Maker", value: "" },
            { key: "Model / Specs", value: "" },
          ]
    );
    setModalOpen(true);
  };

  // Helper: Add custom spec field
  const handleAddCustomSpec = (suggestedKey?: string) => {
    setCustomAttributes((prev) => [...prev, { key: suggestedKey || "", value: "" }]);
  };

  // Helper: Remove custom spec field
  const handleRemoveCustomSpec = (index: number) => {
    setCustomAttributes((prev) => prev.filter((_, i) => i !== index));
  };

  // Helper: Auto-generate SKU
  const handleGenerateSKU = () => {
    const prefix = (isCustomCategory ? customCategoryInput : formData.category)
      .slice(0, 4)
      .toUpperCase()
      .replace(/[^A-Z]/g, "") || "ITEM";
    setFormData((prev) => ({
      ...prev,
      sku: `${prefix}-${Math.floor(100000 + Math.random() * 900000)}`,
    }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.sku.trim()) {
      toast({
        title: "Missing Name or SKU",
        description: "Please enter product name and SKU code.",
        variant: "destructive",
      });
      return;
    }

    const finalCategory = (isCustomCategory ? customCategoryInput.trim() : formData.category.trim()) || "General Hardware";

    // Build custom attributes object
    const attributesObj: Record<string, any> = {};
    customAttributes.forEach((attr) => {
      const k = attr.key.trim().toLowerCase().replace(/\s+/g, "_");
      const v = attr.value.trim();
      if (k && v) {
        const num = Number(v);
        attributesObj[k] =
          !isNaN(num) && v !== "" && (k.includes("month") || k.includes("year") || k.includes("qty") || k.includes("count"))
            ? num
            : v;
      }
    });

    // Ensure all required schema fields from customFieldDefs are satisfied
    customFieldDefs.forEach((f) => {
      const k = f.field_name.toLowerCase();
      if (f.is_required && (attributesObj[k] === undefined || attributesObj[k] === "")) {
        attributesObj[k] = f.field_type === "number" ? 24 : (f.options?.[0] || "Standard");
      }
      if (f.field_type === "number" && attributesObj[k] !== undefined) {
        attributesObj[k] = Number(attributesObj[k]) || 0;
      }
    });

    const trimmedName = formData.name.trim();
    if (!trimmedName) {
      toast({ title: "Name required", description: "Enter an equipment name before saving.", variant: "destructive" });
      return;
    }
    if (/<[^>]*>|javascript:|onerror\s*=/i.test(trimmedName) || /[<>]/.test(trimmedName)) {
      toast({
        title: "Invalid name",
        description: "Equipment name cannot include HTML or script markup.",
        variant: "destructive",
      });
      return;
    }
    const costNum = parseFloat(formData.cost);
    if (Number.isNaN(costNum) || costNum < 0) {
      toast({
        title: "Invalid cost",
        description: "Unit purchase cost must be zero or greater.",
        variant: "destructive",
      });
      return;
    }

    const payload = {
      sku: formData.sku.trim().toUpperCase(),
      name: trimmedName,
      category: finalCategory,
      cost: costNum,
      price: costNum, // Internal asset valuation equals purchase cost
      currentStock: parseInt(formData.currentStock, 10) || 0,
      reorderLevel: parseInt(formData.reorderLevel, 10) || 0,
      unit: formData.unit.trim() || "pcs",
      barcode: formData.barcode?.trim() || formData.sku.trim().toUpperCase(),
      attributes: attributesObj,
    };

    setIsSubmitting(true);
    try {
      if (editingProduct) {
        updateProduct(editingProduct.id, payload);
        toast({
          title: "Product Updated",
          description: `Updated "${payload.name}" under category "${finalCategory}".`,
          variant: "success",
        });
        setModalOpen(false);
      } else {
        const res = await addProduct(payload);
        if (res.success) {
          toast({
            title: "Custom Product Registered!",
            description: `Saved "${payload.name}" (${payload.sku}) in category "${finalCategory}".`,
            variant: "success",
          });
          setModalOpen(false);
        } else {
          toast({
            title: "Registration Failed",
            description: res.error || "Could not register product.",
            variant: "destructive",
          });
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = (p: Product) => {
    if (confirm(`Are you sure you want to remove "${p.name}" (${p.sku}) from catalog?`)) {
      deleteProduct(p.id);
      toast({
        title: "Equipment Removed",
        description: `Removed "${p.name}" from catalog view.`,
        variant: "default",
      });
    }
  };

  // Filtered Products
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const q = searchTerm.toLowerCase();
      const matchesSearch =
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        (p.barcode && p.barcode.toLowerCase().includes(q));

      const matchesCategory = productMatchesCategory(p, selectedCategory);

      const inStore = p.currentStock || 0;
      const matchesLowStock = !showLowStockOnly || inStore <= (p.reorderLevel || 0);

      return matchesSearch && matchesCategory && matchesLowStock;
    });
  }, [products, searchTerm, selectedCategory, showLowStockOnly]);

  // Aggregate Fleet Metrics
  const metrics = useMemo(() => {
    let totalFleet = 0;
    let totalInStore = 0;
    let totalAssigned = 0;
    let totalRepairs = 0;
    let totalFaulty = 0;
    let totalValue = 0;

    products.forEach((p) => {
      const assigned = p.assignedCount || 0;
      const faulty = p.faultyCount || 0;
      const inRepair = p.inRepairCount || 0;
      const inStore = p.currentStock || 0;
      const owned = p.totalOwned || (inStore + assigned + faulty + inRepair);
      const unitCost = p.cost || p.price || 0;

      totalFleet += owned;
      totalInStore += inStore;
      totalAssigned += assigned;
      totalRepairs += inRepair;
      totalFaulty += faulty;
      totalValue += owned * unitCost;
    });

    return { totalFleet, totalInStore, totalAssigned, totalRepairs, totalFaulty, totalValue };
  }, [products]);

  // Pagination Calculations
  const totalPages = Math.ceil(filteredProducts.length / pageSize) || 1;
  const validCurrentPage = Math.min(Math.max(currentPage, 1), totalPages);
  const startIndex = (validCurrentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, filteredProducts.length);
  const paginatedProducts = filteredProducts.slice(startIndex, endIndex);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12 page-enter">
      {/* 1. Page Header & Actions Toolbar (2-Tier Spacious Architecture) */}
      <div className="page-hero space-y-2.5">
        {/* Tier 1: Full-Width Title & Primary CTA */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-[#0c3843]/10 text-[#0c3843] dark:text-teal-400 flex items-center justify-center shrink-0 border border-[#0c3843]/20 shadow-xs transition-transform duration-300 hover:scale-105">
              <Package className="w-5 h-5" />
            </div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 dark:text-white whitespace-nowrap">
                All equipment
              </h1>
              <span
                className={cn(
                  "px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase flex items-center gap-1.5 border shadow-2xs whitespace-nowrap",
                  isBackendConnected
                    ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-400"
                    : "bg-amber-500/10 border-amber-500/20 text-amber-700 dark:text-amber-400"
                )}
              >
                <CheckCircle2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                <span>{isBackendConnected ? `${products.length} models` : "Connecting..."}</span>
              </span>
            </div>
          </div>

          {canManage && (
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleOpenAdd}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#0c3843] hover:bg-[#082931] text-white text-xs font-bold shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all cursor-pointer whitespace-nowrap"
                title="Add equipment to the office inventory"
              >
                <Plus className="w-4 h-4 text-cyan-300" />
                <span>Add equipment</span>
              </button>
            </div>
          )}
        </div>

        {/* Tier 2: Subtitle & Secondary Utility Toolbar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pt-0.5">
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-3xl leading-relaxed">
            Every office item in one place — laptops, monitors, cables, and custom gear — with counts by type.
          </p>

          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <button
              type="button"
              onClick={() => {
                exportProductsToCSV(products);
                toast({
                  title: "Finance Report Exported",
                  description: `Generated comprehensive inventory CSV for finance audits.`,
                  variant: "success",
                });
              }}
              disabled={isLoading || products.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold shadow-2xs hover:shadow transition-all disabled:opacity-40 cursor-pointer whitespace-nowrap"
              title="Export complete equipment audit data to CSV for Finance"
            >
              <Download className="w-3.5 h-3.5 text-slate-500" />
              <span>Finance Report (CSV)</span>
            </button>

            {canManage && (
              <Link
                href="/import"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold shadow-2xs hover:shadow transition-all whitespace-nowrap"
                title="Bulk import products via Excel / CSV"
              >
                <Database className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                <span>Bulk Import</span>
              </Link>
            )}

            <button
              type="button"
              onClick={() => refetch()}
              disabled={isLoading}
              className="p-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 shadow-2xs transition-all cursor-pointer disabled:opacity-40"
              title="Refresh catalog from backend"
            >
              <RefreshCw className={cn("w-3.5 h-3.5", isLoading && "animate-spin")} />
            </button>
          </div>
        </div>
      </div>

      {/* 2. Fleet Overview Status KPI Cards with Hover Lift */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-2xs hover:shadow-md hover:-translate-y-0.5 transition-all">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span className="font-semibold">Total Fleet</span>
            <Package className="w-4 h-4 text-slate-600 dark:text-slate-300" />
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white font-mono">
            {metrics.totalFleet}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Across {products.length} models</p>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-emerald-500/30 shadow-2xs hover:shadow-md hover:-translate-y-0.5 transition-all">
          <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400 text-xs font-bold mb-1">
            <span>In Store (Buffer)</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 font-mono">
            {metrics.totalInStore}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Ready for deployment</p>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-indigo-500/30 shadow-2xs hover:shadow-md hover:-translate-y-0.5 transition-all">
          <div className="flex items-center justify-between text-indigo-600 dark:text-indigo-400 text-xs font-bold mb-1">
            <span>Assigned to Staff</span>
            <ShieldCheck className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="text-2xl font-black text-indigo-600 dark:text-indigo-400 font-mono">
            {metrics.totalAssigned}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Under custody with sign</p>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-amber-500/30 shadow-2xs hover:shadow-md hover:-translate-y-0.5 transition-all">
          <div className="flex items-center justify-between text-amber-600 dark:text-amber-400 text-xs font-bold mb-1">
            <span>Vendor Repairs</span>
            <Wrench className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-black text-amber-600 dark:text-amber-400 font-mono">
            {metrics.totalRepairs}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">At repair centers</p>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-rose-500/30 shadow-2xs hover:shadow-md hover:-translate-y-0.5 transition-all">
          <div className="flex items-center justify-between text-rose-600 dark:text-rose-400 text-xs font-bold mb-1">
            <span>Defective Units</span>
            <AlertTriangle className="w-4 h-4 text-rose-500" />
          </div>
          <div className="text-2xl font-black text-rose-600 dark:text-rose-400 font-mono">
            {metrics.totalFaulty}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Awaiting inspection</p>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-[#0c3843]/30 dark:border-teal-500/30 shadow-2xs hover:shadow-md hover:-translate-y-0.5 transition-all">
          <div className="flex items-center justify-between text-[#0c3843] dark:text-teal-400 text-xs font-bold mb-1">
            <span>Fleet Book Value</span>
            <Sparkles className="w-4 h-4" />
          </div>
          <div className="text-xl font-black text-slate-900 dark:text-white font-mono truncate">
            ${metrics.totalValue.toLocaleString("en-US", { maximumFractionDigits: 0 })}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Original capital cost</p>
        </div>
      </div>

      {/* 3. Category Quick Filter Bar (Dynamically populated from your products) */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
        {dynamicCategories.map((cat) => {
          const Icon = cat.icon;
          const isSelected = selectedCategory.toLowerCase() === cat.id.toLowerCase();
          const count =
            cat.id === "ALL"
              ? products.length
              : products.filter((p) => productMatchesCategory(p, cat.id)).length;

          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => setSelectedCategory(cat.id)}
              className={cn(
                "flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 border",
                isSelected
                  ? "bg-[#0c3843] text-white border-[#0c3843] shadow-md scale-[1.02]"
                  : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 hover:border-slate-300"
              )}
            >
              <Icon className={cn("w-4 h-4", isSelected ? "text-cyan-300" : "text-slate-400")} />
              <span>{cat.label}</span>
              <span
                className={cn(
                  "px-1.5 py-0.2 rounded-full text-[10px] font-mono",
                  isSelected ? "bg-white/20 text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-500"
                )}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* 4. Search, Safety Buffer Toggle & View Switcher (Cards vs Table) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-2xs">
        <div className="flex items-center gap-2 flex-1 max-w-md">
          <div className="relative w-full">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search by product name, custom category, SKU, barcode, or specs..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-8 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:bg-white dark:focus:bg-slate-900 focus:border-[#0c3843] focus:ring-2 focus:ring-[#0c3843]/15 outline-none text-slate-900 dark:text-white transition-all"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setShowLowStockOnly((prev) => !prev)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer whitespace-nowrap",
              showLowStockOnly
                ? "bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-400 shadow-xs"
                : "bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100"
            )}
            title="Filter equipment with store buffer below safety reorder level"
          >
            <AlertTriangle className={cn("w-3.5 h-3.5", showLowStockOnly ? "text-amber-600 dark:text-amber-400" : "text-slate-400")} />
            <span>Buffer Breaches</span>
          </button>

          {/* Dual View Switcher */}
          <div className="flex items-center p-0.5 rounded-xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setViewMode("GRID")}
              className={cn(
                "flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer",
                viewMode === "GRID"
                  ? "bg-white dark:bg-slate-800 text-[#0c3843] dark:text-teal-400 shadow-2xs"
                  : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
              )}
              title="Visual Equipment Cards Grid View"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Cards</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("TABLE")}
              className={cn(
                "flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer",
                viewMode === "TABLE"
                  ? "bg-white dark:bg-slate-800 text-[#0c3843] dark:text-teal-400 shadow-2xs"
                  : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
              )}
              title="Dense Spreadsheet Table View"
            >
              <List className="w-3.5 h-3.5" />
              <span>Table</span>
            </button>
          </div>
        </div>
      </div>

      {/* 5. Main Equipment Presentation: Cards Grid or Table View */}
      {viewMode === "GRID" ? (
        /* Visual Cards Grid View with Hover Lift & Glow */
        <div className="space-y-6">
          {isLoading ? (
            <div className="p-12 text-center rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-400">
              <div className="flex items-center justify-center gap-2">
                <Loader2 className="w-5 h-5 animate-spin text-[#0c3843]" />
                <span>Loading products catalog from PostgreSQL...</span>
              </div>
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="p-12 text-center rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-400">
              <div className="max-w-md mx-auto space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-[#0c3843]/10 text-[#0c3843] flex items-center justify-center mx-auto border border-[#0c3843]/20">
                  <Package className="w-6 h-6" />
                </div>
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                  {products.length === 0 ? "Your Inventory Catalog is Empty" : "No matching products found"}
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {products.length === 0
                    ? "Click below to add your first custom product or hardware asset."
                    : "Try clearing filters or search terms to see all catalog items."}
                </p>
                {canManage && (
                  <div className="flex items-center justify-center gap-2 pt-2">
                    <button
                      onClick={handleOpenAdd}
                      className="px-4 py-2 rounded-xl bg-[#0c3843] hover:bg-[#082931] text-white text-xs font-semibold shadow-md shadow-[#0c3843]/20 transition-all cursor-pointer"
                    >
                      Add Custom Product
                    </button>
                    <Link
                      href="/import"
                      className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold transition-all"
                    >
                      Bulk Import CSV
                    </Link>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {paginatedProducts.map((p) => {
                  const assigned = p.assignedCount || 0;
                  const faulty = p.faultyCount || 0;
                  const inRepair = p.inRepairCount || 0;
                  const inStore = p.currentStock || 0;
                  const totalOwned = p.totalOwned || (inStore + assigned + faulty + inRepair);
                  const unitCost = p.cost || p.price || 0;
                  const totalModelValue = totalOwned * unitCost;
                  const schema = resolveCategorySchema(p.category, p.name);
                  const SchemaIcon = schema.icon;

                  return (
                    <div
                      key={p.id}
                      className="group rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-[#0c3843]/50 dark:hover:border-teal-500/50 p-5 shadow-2xs hover:shadow-xl hover:-translate-y-1 transition-all duration-300 flex flex-col justify-between"
                    >
                      <div>
                        {/* Top Meta: Category Badge & Total Fleet */}
                        <div className="flex items-center justify-between gap-2 mb-3">
                          <span className={cn("px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 border shadow-2xs", schema.badgeColor)}>
                            <SchemaIcon className="w-3.5 h-3.5" />
                            <span>{p.category || "General"}</span>
                          </span>
                          <span className="text-xs font-bold font-mono px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                            Fleet: {totalOwned}
                          </span>
                        </div>

                        {/* Title & SKU */}
                        <div className="space-y-1 mb-4">
                          <Link
                            href={`/products/${p.id}`}
                            className="text-sm font-bold text-slate-900 dark:text-white group-hover:text-[#0c3843] dark:group-hover:text-teal-400 transition-colors line-clamp-1 hover:underline"
                          >
                            {p.name}
                          </Link>
                          <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono">
                            <span>SKU: {p.sku}</span>
                            {p.barcode && (
                              <>
                                <span>&bull;</span>
                                <span className="truncate max-w-[120px]">BC: {p.barcode}</span>
                              </>
                            )}
                          </div>
                        </div>

                        {/* 4-Pill Live Status Matrix & Proportional Fleet Bar */}
                        <div className="p-3 rounded-2xl bg-slate-50/80 dark:bg-slate-950/80 border border-slate-200/70 dark:border-slate-800 mb-4">
                          {totalOwned > 0 && (
                            <div className="w-full h-2 rounded-full overflow-hidden flex bg-slate-200 dark:bg-slate-800 mb-2.5 shadow-2xs">
                              {inStore > 0 && (
                                <div
                                  style={{ width: `${(inStore / totalOwned) * 100}%` }}
                                  className="bg-emerald-500 h-full transition-all duration-300"
                                  title={`In Store: ${inStore}`}
                                />
                              )}
                              {assigned > 0 && (
                                <div
                                  style={{ width: `${(assigned / totalOwned) * 100}%` }}
                                  className="bg-indigo-500 h-full transition-all duration-300"
                                  title={`Assigned: ${assigned}`}
                                />
                              )}
                              {inRepair > 0 && (
                                <div
                                  style={{ width: `${(inRepair / totalOwned) * 100}%` }}
                                  className="bg-amber-500 h-full transition-all duration-300"
                                  title={`At Vendor: ${inRepair}`}
                                />
                              )}
                              {faulty > 0 && (
                                <div
                                  style={{ width: `${(faulty / totalOwned) * 100}%` }}
                                  className="bg-rose-500 h-full transition-all duration-300"
                                  title={`Faulty: ${faulty}`}
                                />
                              )}
                            </div>
                          )}

                          <div className="grid grid-cols-2 gap-2">
                            <div className="flex items-center justify-between text-xs px-2.5 py-1.5 rounded-xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 font-semibold shadow-2xs">
                              <span className="text-[10px] uppercase font-bold">In Store</span>
                              <span className="font-mono font-black">{inStore}</span>
                            </div>
                            <div className="flex items-center justify-between text-xs px-2.5 py-1.5 rounded-xl bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border border-indigo-500/20 font-semibold shadow-2xs">
                              <span className="text-[10px] uppercase font-bold">Assigned</span>
                              <span className="font-mono font-black">{assigned}</span>
                            </div>
                            <div className="flex items-center justify-between text-xs px-2.5 py-1.5 rounded-xl bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20 font-semibold shadow-2xs">
                              <span className="text-[10px] uppercase font-bold">Repairs</span>
                              <span className="font-mono font-black">{inRepair}</span>
                            </div>
                            <div className="flex items-center justify-between text-xs px-2.5 py-1.5 rounded-xl bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/20 font-semibold shadow-2xs">
                              <span className="text-[10px] uppercase font-bold">Faulty</span>
                              <span className="font-mono font-black">{faulty}</span>
                            </div>
                          </div>
                        </div>

                        {/* Financials */}
                        <div className="flex items-center justify-between text-xs pt-1 pb-3 border-t border-slate-100 dark:border-slate-800 text-slate-500">
                          <div>
                            <span className="text-[10px] uppercase tracking-wider block text-slate-400 font-semibold">Unit Cost</span>
                            <span className="font-mono font-bold text-slate-900 dark:text-white">${unitCost.toFixed(2)}</span>
                          </div>
                          <div className="text-right">
                            <span className="text-[10px] uppercase tracking-wider block text-slate-400 font-semibold">Fleet Valuation</span>
                            <span className="font-mono font-black text-slate-900 dark:text-white">
                              ${totalModelValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Card Actions */}
                      <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                        <Link
                          href={`/products/${p.id}`}
                          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-gradient-to-r from-[#0c3843] to-[#145365] hover:from-[#092931] hover:to-[#0f3f4d] text-white text-xs font-black shadow-sm hover:shadow-md hover:scale-[1.01] active:scale-[0.99] transition-all"
                        >
                          <Eye className="w-3.5 h-3.5 text-cyan-300" />
                          <span>View 360° Dossier &rarr;</span>
                        </Link>
                        {canManage && (
                          <div className="grid grid-cols-4 gap-1.5">
                            <Link
                              href={`/custody?assetId=${p.id}`}
                              className="flex items-center justify-center gap-1 py-1.5 rounded-lg bg-indigo-500/10 hover:bg-indigo-600 text-indigo-700 dark:text-indigo-300 hover:text-white font-bold text-[11px] transition-all"
                              title="Assign to staff with digital signature"
                            >
                              <UserCheck className="w-3 h-3" />
                              <span>Issue</span>
                            </Link>
                            <Link
                              href={`/adjustments?productId=${p.id}`}
                              className="flex items-center justify-center gap-1 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-600 text-amber-700 dark:text-amber-300 hover:text-white font-bold text-[11px] transition-all"
                              title="Report faulty or route to vendor repair"
                            >
                              <Wrench className="w-3 h-3" />
                              <span>Repair</span>
                            </Link>
                            <button
                              type="button"
                              onClick={() => handleOpenEdit(p)}
                              className="flex items-center justify-center gap-1 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-[11px] transition-all cursor-pointer"
                              title="Edit product details or custom specs"
                            >
                              <Edit2 className="w-3 h-3" />
                              <span>Edit</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setPrintingProduct(p)}
                              className="flex items-center justify-center gap-1 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-[11px] transition-all cursor-pointer"
                              title="Print asset tag barcode sticker"
                            >
                              <Printer className="w-3 h-3" />
                              <span>Tag</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Grid Pagination */}
              <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
                <span className="text-slate-500">
                  Showing <strong className="text-slate-900 dark:text-white">{startIndex + 1}</strong> to <strong className="text-slate-900 dark:text-white">{endIndex}</strong> of <strong className="text-slate-900 dark:text-white">{filteredProducts.length}</strong> items
                </span>
                {totalPages > 1 && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                      disabled={validCurrentPage === 1}
                      className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 disabled:opacity-40 cursor-pointer"
                    >
                      Previous
                    </button>
                    <span className="font-bold text-slate-700 dark:text-slate-300">
                      Page {validCurrentPage} of {totalPages}
                    </span>
                    <button
                      type="button"
                      onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                      disabled={validCurrentPage === totalPages}
                      className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 disabled:opacity-40 cursor-pointer"
                    >
                      Next
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      ) : (
        /* Dense Table View */
        <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-900/80 border-b border-slate-200 dark:border-slate-800 text-slate-500 uppercase font-semibold text-[10px] tracking-wider">
                <tr>
                  <th className="w-12 px-3 py-3.5 text-center">#</th>
                  <th className="px-4 py-3.5">Product / Hardware Model</th>
                  <th className="px-3 py-3.5 text-center whitespace-nowrap">Total Fleet</th>
                  <th className="px-3 py-3.5 text-center whitespace-nowrap text-emerald-600 dark:text-emerald-400">In Store</th>
                  <th className="px-3 py-3.5 text-center whitespace-nowrap text-indigo-600 dark:text-indigo-400">Assigned</th>
                  <th className="px-3 py-3.5 text-center whitespace-nowrap text-rose-600 dark:text-rose-400">Defective</th>
                  <th className="px-3 py-3.5 text-center whitespace-nowrap text-amber-600 dark:text-amber-400">Repairs</th>
                  <th className="px-3 py-3.5 text-right whitespace-nowrap">Unit Cost</th>
                  <th className="px-3 py-3.5 text-right whitespace-nowrap">Fleet Value</th>
                  <th className="px-4 py-3.5 text-right whitespace-nowrap">Quick Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {isLoading ? (
                  <tr>
                    <td colSpan={10} className="px-5 py-12 text-center text-slate-400">
                      <div className="flex items-center justify-center gap-2">
                        <Loader2 className="w-5 h-5 animate-spin text-[#0c3843]" />
                        <span>Loading catalog from PostgreSQL...</span>
                      </div>
                    </td>
                  </tr>
                ) : filteredProducts.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-5 py-12 text-center text-slate-400">
                      <p className="text-xs">No products found matching criteria.</p>
                    </td>
                  </tr>
                ) : (
                  paginatedProducts.map((p, idx) => {
                    const assigned = p.assignedCount || 0;
                    const faulty = p.faultyCount || 0;
                    const inRepair = p.inRepairCount || 0;
                    const inStore = p.currentStock || 0;
                    const totalOwned = p.totalOwned || (inStore + assigned + faulty + inRepair);
                    const unitCost = p.cost || p.price || 0;
                    const totalModelValue = totalOwned * unitCost;
                    const sNo = String(startIndex + idx + 1).padStart(2, "0");
                    const schema = resolveCategorySchema(p.category, p.name);
                    const SchemaIcon = schema.icon;

                    return (
                      <tr
                        key={p.id}
                        className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors group"
                      >
                        <td className="w-12 px-3 py-3.5 text-center whitespace-nowrap">
                          <span className="font-mono text-[11px] font-bold text-slate-400">#{sNo}</span>
                        </td>

                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-3">
                            <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border", schema.badgeColor)}>
                              <SchemaIcon className="w-4 h-4" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <Link
                                  href={`/products/${p.id}`}
                                  className="font-bold text-slate-900 dark:text-white group-hover:text-[#0c3843] dark:group-hover:text-teal-400 hover:underline transition-colors"
                                >
                                  {p.name}
                                </Link>
                                <span className={cn("px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border", schema.badgeColor)}>
                                  {p.category || "General"}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono mt-0.5">
                                <span>SKU: {p.sku}</span>
                                {p.barcode && <span>&bull; BC: {p.barcode}</span>}
                              </div>
                            </div>
                          </div>
                        </td>

                        <td className="px-3 py-3.5 text-center whitespace-nowrap">
                          <span className="font-mono font-black text-xs text-slate-900 dark:text-white">{totalOwned}</span>
                        </td>

                        <td className="px-3 py-3.5 text-center whitespace-nowrap">
                          <span className="px-2.5 py-1 rounded-full text-xs font-bold font-mono bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-400 dark:border-emerald-800">
                            {inStore}
                          </span>
                        </td>

                        <td className="px-3 py-3.5 text-center whitespace-nowrap">
                          <span className="px-2.5 py-1 rounded-lg font-mono font-bold bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-500/20">
                            {assigned}
                          </span>
                        </td>

                        <td className="px-3 py-3.5 text-center whitespace-nowrap">
                          <span className="px-2.5 py-1 rounded-lg font-mono font-bold bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/20">
                            {faulty}
                          </span>
                        </td>

                        <td className="px-3 py-3.5 text-center whitespace-nowrap">
                          <span className="px-2.5 py-1 rounded-lg font-mono font-bold bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20">
                            {inRepair}
                          </span>
                        </td>

                        <td className="px-3 py-3.5 text-right whitespace-nowrap font-mono font-bold text-xs text-slate-700 dark:text-slate-300">
                          ${unitCost.toFixed(2)}
                        </td>

                        <td className="px-3 py-3.5 text-right whitespace-nowrap font-mono font-extrabold text-xs text-slate-900 dark:text-white">
                          ${totalModelValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>

                        <td className="px-4 py-3.5 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5">
                            {canManage && (
                              <>
                                <Link
                                  href={`/custody?assetId=${p.id}`}
                                  className="px-2.5 py-1.5 rounded-lg bg-indigo-500/10 hover:bg-indigo-600 text-indigo-700 dark:text-indigo-300 hover:text-white font-bold text-[11px] transition-all"
                                  title="Assign to staff"
                                >
                                  Issue
                                </Link>
                                <Link
                                  href={`/adjustments?productId=${p.id}`}
                                  className="px-2.5 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-600 text-amber-700 dark:text-amber-300 hover:text-white font-bold text-[11px] transition-all"
                                  title="Repair"
                                >
                                  Repair
                                </Link>
                                <button
                                  type="button"
                                  onClick={() => handleOpenEdit(p)}
                                  className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[11px] transition-all cursor-pointer"
                                  title="Edit product"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setPrintingProduct(p)}
                                  className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[11px] transition-all cursor-pointer"
                                  title="Print barcode"
                                >
                                  <Printer className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}
                            <Link
                              href={`/products/${p.id}`}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#0c3843] hover:bg-[#082931] text-white font-bold text-[11px] shadow-xs transition-all"
                              title="View complete 360° dossier"
                            >
                              <Eye className="w-3.5 h-3.5 text-cyan-300" />
                              <span>Dossier</span>
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Table Pagination Bar */}
          <div className="px-5 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/60 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
            <span className="text-slate-500">
              Showing <strong className="text-slate-900 dark:text-white">{startIndex + 1}</strong> to <strong className="text-slate-900 dark:text-white">{endIndex}</strong> of <strong className="text-slate-900 dark:text-white">{filteredProducts.length}</strong> items
            </span>
            {totalPages > 1 && (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                  disabled={validCurrentPage === 1}
                  className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 disabled:opacity-40 cursor-pointer"
                >
                  Previous
                </button>
                <span className="font-bold text-slate-700 dark:text-slate-300">
                  Page {validCurrentPage} of {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                  disabled={validCurrentPage === totalPages}
                  className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 disabled:opacity-40 cursor-pointer"
                >
                  Next
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 6. Unrestricted Custom Product Creator / Editor Modal */}
      {modalOpen && (
        <ModalPortal>
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 max-w-2xl w-full p-6 sm:p-7 shadow-2xl space-y-5 animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-[#0c3843] to-teal-700 text-white flex items-center justify-center shadow-md">
                  <Package className="w-5 h-5 text-cyan-300" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-white">
                    {editingProduct ? "Edit Product & Custom Specs" : "Add Any Custom Product / Equipment"}
                  </h3>
                  <p className="text-xs text-slate-400">
                    Zero restrictions. Add laptops, monitors, office chairs, cameras, servers, or any custom category.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 cursor-pointer transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-5 text-xs">
              {/* Product Name */}
              <div className="space-y-1.5">
                <label className="font-bold text-slate-800 dark:text-slate-200 flex items-center justify-between">
                  <span>Product / Equipment Name *</span>
                  <span className="text-[11px] font-normal text-slate-400">Any model or item name</span>
                </label>
                <input
                  type="text"
                  required
                  disabled={isSubmitting}
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. MacBook Pro M3 Max 16-inch, Herman Miller Ergonomic Chair, Hikvision 4K CCTV..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white text-xs font-semibold focus:border-[#0c3843] focus:ring-2 focus:ring-[#0c3843]/15 outline-none transition-all placeholder:text-slate-400"
                />
              </div>

              {/* Category: Presets + Unrestricted Custom Category Option */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-slate-800 dark:text-slate-200">
                    Category (Choose Preset or Type Your Own) *
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setIsCustomCategory((prev) => !prev);
                      if (!isCustomCategory) {
                        setCustomCategoryInput("");
                      }
                    }}
                    className="text-[11px] font-bold text-teal-600 dark:text-teal-400 hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <FolderPlus className="w-3.5 h-3.5" />
                    <span>{isCustomCategory ? "Switch to Preset Categories" : "Create New Custom Category"}</span>
                  </button>
                </div>

                {isCustomCategory ? (
                  <div className="p-3 rounded-2xl bg-teal-500/10 border border-teal-500/30 space-y-1.5 animate-in fade-in duration-150">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-teal-800 dark:text-teal-300 block">
                      Custom Category Name:
                    </span>
                    <input
                      type="text"
                      required={isCustomCategory}
                      value={customCategoryInput}
                      onChange={(e) => setCustomCategoryInput(e.target.value)}
                      placeholder="e.g. Office Furniture, CCTV & Security, Audio/Visual, Power Backup / UPS..."
                      className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-teal-500/40 text-slate-900 dark:text-white font-bold text-xs focus:ring-2 focus:ring-teal-500/20 outline-none"
                    />
                    <p className="text-[10px] text-teal-700/80 dark:text-teal-300/80">
                      This custom category will automatically become a filter tab on your hardware catalog!
                    </p>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {["Laptops", "Monitors", "Peripherals", "Printers", "Networking", "Cables", "General"].map((catName) => {
                      const isSelected = formData.category.toLowerCase() === catName.toLowerCase();
                      return (
                        <button
                          key={catName}
                          type="button"
                          onClick={() => setFormData({ ...formData, category: catName })}
                          className={cn(
                            "px-3 py-1.5 rounded-xl font-bold text-xs border transition-all cursor-pointer",
                            isSelected
                              ? "bg-[#0c3843] text-white border-[#0c3843] shadow-xs scale-[1.02]"
                              : "bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:bg-slate-100"
                          )}
                        >
                          {catName}
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      onClick={() => setIsCustomCategory(true)}
                      className="px-3 py-1.5 rounded-xl font-bold text-xs border border-dashed border-teal-500/50 bg-teal-500/10 text-teal-700 dark:text-teal-300 hover:bg-teal-500/20 transition-all cursor-pointer flex items-center gap-1"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Custom Category</span>
                    </button>
                  </div>
                )}
              </div>

              {/* SKU & Barcode Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="font-bold text-slate-800 dark:text-slate-200">
                      Asset SKU / Model Code *
                    </label>
                    <button
                      type="button"
                      onClick={handleGenerateSKU}
                      className="text-[10px] font-bold text-[#0c3843] dark:text-teal-400 hover:underline cursor-pointer flex items-center gap-1"
                    >
                      <Sparkles className="w-3 h-3" />
                      <span>Auto-Generate</span>
                    </button>
                  </div>
                  <input
                    type="text"
                    required
                    disabled={isSubmitting}
                    value={formData.sku}
                    onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                    placeholder="e.g. LAP-DELL-5540"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono uppercase font-bold text-xs focus:border-[#0c3843] outline-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="font-bold text-slate-800 dark:text-slate-200">
                    Physical Barcode / Serial Prefix (Optional)
                  </label>
                  <input
                    type="text"
                    disabled={isSubmitting}
                    value={formData.barcode}
                    onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
                    placeholder="e.g. 100298412 or scan barcode gun"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono text-xs focus:border-[#0c3843] outline-none"
                  />
                </div>
              </div>

              {/* Financials & Stock Quantities */}
              <div className="grid grid-cols-3 gap-3 p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800">
                <div className="space-y-1">
                  <label className="font-bold text-slate-700 dark:text-slate-300 block">
                    Unit Purchase Cost ($) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    disabled={isSubmitting}
                    value={formData.cost}
                    onChange={(e) => setFormData({ ...formData, cost: e.target.value })}
                    placeholder="1200.00"
                    className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 font-mono font-bold text-xs focus:border-[#0c3843] outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700 dark:text-slate-300 block">
                    Store Buffer Qty
                  </label>
                  <input
                    type="number"
                    min="0"
                    disabled={isSubmitting}
                    value={formData.currentStock}
                    onChange={(e) => setFormData({ ...formData, currentStock: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 font-mono font-bold text-xs focus:border-[#0c3843] outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700 dark:text-slate-300 block">
                    Unit of Measure
                  </label>
                  <input
                    type="text"
                    disabled={isSubmitting}
                    value={formData.unit}
                    onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                    placeholder="pcs / units / sets"
                    className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 font-bold text-xs focus:border-[#0c3843] outline-none"
                  />
                </div>
              </div>

              {/* Dynamic Custom Specifications Builder (Unrestricted Key-Value Specs) */}
              <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                      <SlidersHorizontal className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                      <span>Custom Hardware Specifications &amp; Attributes</span>
                    </h4>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Add any specs of your own choice (RAM, Storage, Color, Screen Size, Processor, Room Location, etc.)
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleAddCustomSpec()}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold transition-all cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                    <span>Add Spec</span>
                  </button>
                </div>

                {/* Quick Suggestion Chips */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] text-slate-400 font-semibold">Quick add:</span>
                  {["Processor", "RAM", "SSD Storage", "Screen Size", "Color", "Brand", "Room Location", "Warranty Expiry"].map(
                    (suggested) => (
                      <button
                        key={suggested}
                        type="button"
                        onClick={() => handleAddCustomSpec(suggested)}
                        className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-teal-500/10 hover:text-teal-700 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer border border-slate-200/60 dark:border-slate-700"
                      >
                        + {suggested}
                      </button>
                    )
                  )}
                </div>

                {/* Dynamic Attributes Inputs */}
                <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                  {customAttributes.map((attr, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={attr.key}
                        onChange={(e) => {
                          const val = e.target.value;
                          setCustomAttributes((prev) =>
                            prev.map((item, i) => (i === idx ? { ...item, key: val } : item))
                          );
                        }}
                        placeholder="Spec Name (e.g. RAM)"
                        className="w-1/2 px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-semibold text-xs focus:border-[#0c3843] outline-none"
                      />
                      <input
                        type="text"
                        value={attr.value}
                        onChange={(e) => {
                          const val = e.target.value;
                          setCustomAttributes((prev) =>
                            prev.map((item, i) => (i === idx ? { ...item, value: val } : item))
                          );
                        }}
                        placeholder="Value (e.g. 32GB DDR5)"
                        className="w-1/2 px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono text-xs focus:border-[#0c3843] outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveCustomSpec(idx)}
                        className="p-2 rounded-xl hover:bg-rose-50 hover:text-rose-600 text-slate-400 transition-colors cursor-pointer"
                        title="Remove spec"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Modal Buttons */}
              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-6 py-2.5 rounded-xl bg-[#0c3843] hover:bg-[#082931] text-white font-bold shadow-md shadow-[#0c3843]/20 flex items-center gap-2 cursor-pointer disabled:opacity-50 hover:shadow-lg transition-all"
                >
                  {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>{editingProduct ? "Save Changes" : "Register Product"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
        </ModalPortal>
      )}

      {/* Print Barcode Label Modal */}
      <PrintLabelModal
        product={printingProduct}
        isOpen={!!printingProduct}
        onClose={() => setPrintingProduct(null)}
      />
    </div>
  );
}
