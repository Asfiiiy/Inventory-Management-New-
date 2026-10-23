"use client";

import React, { useState, useEffect, Suspense } from "react";
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
  ArrowDownLeft,
  X,
  CheckCircle2,
  DollarSign,
  Loader2,
  Database,
  RefreshCw,
  Printer,
  Barcode,
  Download,
  Lock,
  Eye,
} from "lucide-react";
import { useInventory, Product } from "@/lib/inventory-store";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/components/ui/toast";
import { PrintLabelModal } from "@/components/barcode/print-label-modal";
import { exportProductsToCSV } from "@/lib/export-csv";
import { cn } from "@/lib/utils";



export default function ProductsMasterPage() {
  return (
    <Suspense fallback={<div className="p-8 text-xs text-slate-400">Loading Products Master...</div>}>
      <ProductsMasterContent />
    </Suspense>
  );
}

function ProductsMasterContent() {
  const searchParams = useSearchParams();
  const { products, addProduct, updateProduct, deleteProduct, isLoading, isBackendConnected, refetch } = useInventory();
  const { toast } = useToast();
  const { isAdmin, isStaff } = useAuth();

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("ALL");
  const [showLowStockOnly, setShowLowStockOnly] = useState(false);

  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [printingProduct, setPrintingProduct] = useState<Product | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    sku: "",
    name: "",
    category: "Electronics",
    cost: "",
    price: "",
    currentStock: "",
    reorderLevel: "5",
    unit: "pcs",
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

  const categories = ["ALL", ...Array.from(new Set(products.map((p) => p.category)))];

  const handleOpenAdd = () => {
    setEditingProduct(null);
    setFormData({
      sku: `SKU-${Date.now().toString().slice(-6)}`,
      name: "",
      category: "Electronics",
      cost: "",
      price: "",
      currentStock: "0",
      reorderLevel: "5",
      unit: "pcs",
    });
    setModalOpen(true);
  };

  const handleOpenEdit = (p: Product) => {
    setEditingProduct(p);
    setFormData({
      sku: p.sku,
      name: p.name,
      category: p.category,
      cost: p.cost.toString(),
      price: p.price.toString(),
      currentStock: p.currentStock.toString(),
      reorderLevel: p.reorderLevel.toString(),
      unit: p.unit,
    });
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.sku.trim()) return;

    const payload = {
      sku: formData.sku.trim().toUpperCase(),
      name: formData.name.trim(),
      category: formData.category.trim() || "General",
      cost: parseFloat(formData.cost) || 0,
      price: parseFloat(formData.price) || 0,
      currentStock: parseInt(formData.currentStock, 10) || 0,
      reorderLevel: parseInt(formData.reorderLevel, 10) || 0,
      unit: formData.unit.trim() || "pcs",
    };

    setIsSubmitting(true);
    try {
      if (editingProduct) {
        updateProduct(editingProduct.id, payload);
        toast({
          title: "Product Updated",
          description: `Updated "${payload.name}" locally.`,
          variant: "success",
        });
        setModalOpen(false);
      } else {
        const res = await addProduct(payload);
        if (res.success) {
          toast({
            title: "Product Created",
            description: `Saved "${payload.name}" (${payload.sku}) to PostgreSQL catalog.`,
            variant: "success",
          });
          setModalOpen(false);
        } else {
          toast({
            title: "Failed to Create Product",
            description: res.error || "The Go Backend rejected this product creation.",
            variant: "destructive",
          });
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = (p: Product) => {
    if (confirm(`Are you sure you want to delete product "${p.name}" (${p.sku})?`)) {
      deleteProduct(p.id);
      toast({
        title: "Product Removed",
        description: `Removed "${p.name}" from current view.`,
        variant: "default",
      });
    }
  };

  // Filtered Products
  const filteredProducts = products.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.category.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === "ALL" || p.category === selectedCategory;
    const matchesLowStock = !showLowStockOnly || p.currentStock <= p.reorderLevel;

    return matchesSearch && matchesCategory && matchesLowStock;
  });

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white flex items-center gap-2.5">
              <Package className="w-6 h-6 text-indigo-500" />
              <span>Products / Items Master</span>
            </h1>
            <span
              className={cn(
                "px-2.5 py-0.5 rounded-full text-[11px] font-semibold flex items-center gap-1.5 border",
                isBackendConnected
                  ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                  : "bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400"
              )}
            >
              <Database className="w-3 h-3" />
              <span>{isBackendConnected ? "PostgreSQL Connected" : "Connecting..."}</span>
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Create, update, and manage your inventory catalog, pricing, and stock alert levels stored directly in PostgreSQL.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              exportProductsToCSV(products);
              toast({
                title: "Catalog Exported",
                description: `Exported ${products.length} products to inventory CSV spreadsheet.`,
                variant: "success",
              });
            }}
            disabled={isLoading || products.length === 0}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold shadow-xs transition-all cursor-pointer disabled:opacity-40"
            title="Export Product Catalog to CSV"
          >
            <Download className="w-3.5 h-3.5 text-indigo-500" />
            <span>Export CSV</span>
          </button>

          <button
            onClick={() => refetch()}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold shadow-xs transition-all cursor-pointer"
            title="Refresh from Backend"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", isLoading && "animate-spin")} />
            <span>Refresh</span>
          </button>
          {isAdmin ? (
            <button
              onClick={handleOpenAdd}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-xs transition-all w-fit cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Add New Product</span>
            </button>
          ) : (
            <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[11px] text-slate-400 font-medium">
              <Lock className="w-3.5 h-3.5 text-amber-500" />
              <span>Catalog View Only (Staff)</span>
            </div>
          )}
        </div>

      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by product name or SKU..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-xs rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 focus:border-indigo-500 outline-none text-slate-900 dark:text-white"
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="px-3 py-2 text-xs rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 focus:border-indigo-500 outline-none text-slate-900 dark:text-white"
          >
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat === "ALL" ? "All Categories" : cat}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => setShowLowStockOnly(!showLowStockOnly)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 text-xs rounded-xl border transition-all cursor-pointer",
              showLowStockOnly
                ? "bg-amber-500/15 border-amber-500/30 text-amber-600 dark:text-amber-400 font-semibold"
                : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400"
            )}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Low Stock Only</span>
          </button>
        </div>
      </div>

      {/* Products Table */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-slate-500 uppercase font-semibold text-[11px]">
              <tr>
                <th className="px-5 py-3 min-w-[120px]">SKU</th>
                <th className="px-5 py-3 min-w-[200px]">Product Name</th>
                <th className="px-5 py-3 min-w-[120px]">Category</th>
                <th className="px-5 py-3 text-right min-w-[90px]">Cost Price</th>
                <th className="px-5 py-3 text-right min-w-[90px]">Selling Price</th>
                <th className="px-5 py-3 text-center min-w-[110px]">Current Stock</th>
                <th className="px-5 py-3 text-center min-w-[100px]">Reorder Level</th>
                <th className="px-5 py-3 text-right min-w-[130px] whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="px-5 py-12 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
                      <span className="font-medium text-xs">Fetching live inventory catalog from Go backend...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-12 text-center text-slate-400">
                    <div className="max-w-md mx-auto space-y-3">
                      <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center mx-auto border border-indigo-500/20">
                        <Package className="w-6 h-6" />
                      </div>
                      <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                        {products.length === 0 ? "Your Inventory Catalog is Fresh & Empty (0 SKUs)" : "No matching products found"}
                      </h4>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {products.length === 0
                          ? "This company starts with a completely clean database. Click below to add your first product or import your existing catalog via CSV."
                          : "Try adjusting your search query or category filters to find the item."}
                      </p>
                      {products.length === 0 && isAdmin && (
                        <div className="flex items-center justify-center gap-2 pt-2">
                          <button
                            onClick={handleOpenAdd}
                            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-xs transition-all cursor-pointer"
                          >
                            + Add First Product
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
                  </td>
                </tr>
              ) : (
                filteredProducts.map((p) => {
                  const isLow = p.currentStock <= p.reorderLevel;

                  return (
                    <tr key={p.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-900/50">
                      <td className="px-5 py-3 font-mono font-bold">
                        <Link
                          href={`/products/${p.id}`}
                          className="text-indigo-600 dark:text-indigo-400 hover:underline inline-flex items-center gap-1"
                        >
                          <span>{p.sku}</span>
                        </Link>
                      </td>
                      <td className="px-5 py-3 font-medium text-slate-900 dark:text-white">
                        <Link
                          href={`/products/${p.id}`}
                          className="hover:text-indigo-500 hover:underline"
                        >
                          {p.name}
                        </Link>
                      </td>
                      <td className="px-5 py-3 text-slate-500">
                        <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-900 text-[11px]">
                          {p.category}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right font-mono text-slate-700 dark:text-slate-300">
                        {isStaff ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-amber-500/90 bg-amber-500/10 px-1.5 py-0.5 rounded font-medium">
                            <Lock className="w-2.5 h-2.5" />
                            Masked
                          </span>
                        ) : (
                          `$${p.cost.toFixed(2)}`
                        )}
                      </td>
                      <td className="px-5 py-3 text-right font-mono font-semibold text-slate-900 dark:text-white">
                        ${p.price.toFixed(2)}
                      </td>
                      <td className="px-5 py-3 text-center">
                        <span
                          className={cn(
                            "px-2.5 py-0.5 rounded-full text-xs font-bold inline-flex items-center gap-1",
                            isLow
                              ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30"
                              : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                          )}
                        >
                          {isLow && <AlertTriangle className="w-3 h-3" />}
                          <span>{p.currentStock} {p.unit}</span>
                        </span>
                      </td>
                      <td className="px-5 py-3 text-center font-mono text-slate-400">
                        {p.reorderLevel} {p.unit}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Link
                            href={`/products/${p.id}`}
                            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors cursor-pointer"
                            title="View Product 360° Dossier"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </Link>
                          <button
                            onClick={() => setPrintingProduct(p)}
                            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors cursor-pointer"
                            title="Print Barcode Label"
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </button>
                          {isAdmin && (
                            <>
                              <button
                                onClick={() => handleOpenEdit(p)}
                                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
                                title="Edit Product"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDelete(p)}
                                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 transition-colors cursor-pointer"
                                title="Delete Product"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
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
      </div>

      {/* Add / Edit Product Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-slate-950/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Package className="w-4 h-4 text-indigo-500" />
                <span>{editingProduct ? "Edit Product" : "Add New Product"}</span>
              </h3>
              <button
                onClick={() => setModalOpen(false)}
                disabled={isSubmitting}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-semibold text-slate-700 dark:text-slate-300">
                    SKU Code *
                  </label>
                  <input
                    type="text"
                    required
                    disabled={isSubmitting}
                    value={formData.sku}
                    onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono focus:border-indigo-500 outline-none"
                    placeholder="e.g. ELEC-LAP-001"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-slate-700 dark:text-slate-300">
                    Category *
                  </label>
                  <input
                    type="text"
                    required
                    disabled={isSubmitting}
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-indigo-500 outline-none"
                    placeholder="e.g. Electronics"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700 dark:text-slate-300">
                  Product Name *
                </label>
                <input
                  type="text"
                  required
                  disabled={isSubmitting}
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-indigo-500 outline-none"
                  placeholder="e.g. Dell Latitude 5540 Laptop"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-semibold text-slate-700 dark:text-slate-300">
                    Cost Price ($) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    disabled={isSubmitting}
                    value={formData.cost}
                    onChange={(e) => setFormData({ ...formData, cost: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono focus:border-indigo-500 outline-none"
                    placeholder="0.00"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-slate-700 dark:text-slate-300">
                    Selling Price ($) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    disabled={isSubmitting}
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono focus:border-indigo-500 outline-none"
                    placeholder="0.00"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="font-semibold text-slate-700 dark:text-slate-300">
                    Initial Stock
                  </label>
                  <input
                    type="number"
                    min="0"
                    disabled={isSubmitting}
                    value={formData.currentStock}
                    onChange={(e) => setFormData({ ...formData, currentStock: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono focus:border-indigo-500 outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-slate-700 dark:text-slate-300">
                    Reorder Level
                  </label>
                  <input
                    type="number"
                    min="0"
                    disabled={isSubmitting}
                    value={formData.reorderLevel}
                    onChange={(e) => setFormData({ ...formData, reorderLevel: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono focus:border-indigo-500 outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-slate-700 dark:text-slate-300">
                    Unit
                  </label>
                  <input
                    type="text"
                    disabled={isSubmitting}
                    value={formData.unit}
                    onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-indigo-500 outline-none"
                    placeholder="pcs"
                  />
                </div>
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold shadow-xs flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>{editingProduct ? "Save Changes" : "Create Product"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
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
