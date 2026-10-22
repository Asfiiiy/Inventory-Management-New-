"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  ArrowUpRight,
  ShoppingBag,
  AlertCircle,
  CheckCircle2,
  Users,
  Minus,
  Loader2,
  Database,
  Barcode,
  FileText,
  Printer,
  Sparkles,
} from "lucide-react";
import { useInventory, Product } from "@/lib/inventory-store";
import { useToast } from "@/components/ui/toast";
import { BarcodeScannerInput } from "@/components/barcode/barcode-scanner-input";
import { SalesInvoiceModal, InvoiceData } from "@/components/documents/sales-invoice-modal";
import { cn } from "@/lib/utils";

export default function StockOutSalesPage() {
  return (
    <Suspense fallback={<div className="p-8 text-xs text-slate-400">Loading Stock Out...</div>}>
      <StockOutContent />
    </Suspense>
  );
}

function StockOutContent() {
  const searchParams = useSearchParams();
  const { products, movements, contacts, stockOut, isBackendConnected } = useInventory();
  const { toast } = useToast();

  const [selectedProductId, setSelectedProductId] = useState(products[0]?.id || "");
  const [quantity, setQuantity] = useState("1");
  const [customerName, setCustomerName] = useState("");
  const [reference, setReference] = useState("SO-1001");
  const [unitPrice, setUnitPrice] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Invoice & Success State
  const [activeInvoice, setActiveInvoice] = useState<InvoiceData | null>(null);
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [lastCompletedSale, setLastCompletedSale] = useState<InvoiceData | null>(null);


  // If redirected with ?productId=...
  useEffect(() => {
    const pId = searchParams.get("productId");
    if (pId) {
      setSelectedProductId(pId);
    } else if (!selectedProductId && products.length > 0) {
      setSelectedProductId(products[0].id);
    }
  }, [searchParams, products, selectedProductId]);

  const selectedProduct = products.find((p) => p.id === selectedProductId);
  const customers = contacts.filter((c) => c.type === "CUSTOMER");

  useEffect(() => {
    if (customers.length > 0 && !customerName) {
      setCustomerName(customers[0].name);
    }
  }, [customers, customerName]);

  const qtyNum = parseInt(quantity, 10) || 0;
  const isOverStock = selectedProduct ? qtyNum > selectedProduct.currentStock : false;

  const handleBarcodeScan = (scannedProduct: Product) => {
    if (scannedProduct.id === selectedProductId) {
      const currentQty = parseInt(quantity, 10) || 0;
      if (currentQty + 1 > scannedProduct.currentStock) {
        toast({
          title: "Insufficient Stock",
          description: `Cannot exceed ${scannedProduct.currentStock} units in warehouse!`,
          variant: "destructive",
        });
        return;
      }
      setQuantity((currentQty + 1).toString());
    } else {
      setSelectedProductId(scannedProduct.id);
      setQuantity("1");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedProductId || !quantity) return;
    if (qtyNum <= 0) {
      toast({
        title: "Invalid Quantity",
        description: "Quantity must be greater than 0.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const refCode = reference.trim() || `SO-${Date.now().toString().slice(-4)}`;
      const res = await stockOut({
        productId: selectedProductId,
        quantity: qtyNum,
        customerName: customerName.trim() || "Walk-in Customer",
        reference: refCode,
        unitPrice: unitPrice ? parseFloat(unitPrice) : undefined,
      });

      if (!res.success) {
        toast({
          title: "Stock Out Rejected",
          description: res.error || "HTTP 422: Insufficient stock at warehouse.",
          variant: "destructive",
        });
      } else {
        const custName = customerName.trim() || "Walk-in Customer";
        const unitSellingPrice = unitPrice ? parseFloat(unitPrice) : selectedProduct?.price || 0;
        const totalAmt = qtyNum * unitSellingPrice;

        const invoiceObj: InvoiceData = {
          invoiceNumber: `INV-${refCode.replace(/^SO-?/, "") || Date.now().toString().slice(-4)}`,
          customerName: custName,
          date: new Date().toISOString(),
          items: [
            {
              sku: selectedProduct?.sku || "SKU-PROD",
              name: selectedProduct?.name || "Inventory Item",
              quantity: qtyNum,
              unitPrice: unitSellingPrice,
              total: totalAmt,
            },
          ],
          grandTotal: totalAmt,
          paymentStatus: "PAID",
          paymentMethod: "Immediate Cash / Ledger Movement",
        };

        setLastCompletedSale(invoiceObj);
        setShowSuccessDialog(true);

        toast({
          title: "Stock Dispatched",
          description: `Dispatched ${qtyNum} ${selectedProduct?.unit || "units"} of "${selectedProduct?.name}" (${refCode}) with two-sided RETAIL_SALE entry.`,
          variant: "success",
        });
        setQuantity("1");
        setReference(`SO-${Date.now().toString().slice(-4)}`);
        setUnitPrice("");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const outMovements = movements.filter((m) => m.type === "OUT");

  return (
    <div className="space-y-8">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white flex items-center gap-2.5">
              <ArrowUpRight className="w-6 h-6 text-blue-500" />
              <span>Stock Out / Sales</span>
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold flex items-center gap-1.5 border bg-blue-500/10 border-blue-500/20 text-blue-600 dark:text-blue-400">
              <Database className="w-3 h-3" />
              <span>Two-Sided Outward Ledger</span>
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Dispatch outward customer orders and stock deductions. Transfers stock from Warehouse to Virtual Customer with RETAIL_SALE move type in PostgreSQL.
          </p>
        </div>

        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-blue-500/20 bg-blue-500/5 text-blue-600 dark:text-blue-400 text-xs font-semibold">
          <ShoppingBag className="w-4 h-4" />
          <span>Outward Deductions: {outMovements.length}</span>
        </div>
      </div>

      {/* Main Grid: Outward Form + Outward History */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Entry Form */}
        <div className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 shadow-xs space-y-5 h-fit">
          <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Minus className="w-4 h-4 text-blue-500" />
            <span>Dispatch / Stock Out</span>
          </h2>

          {/* Barcode Scanner Input */}
          <BarcodeScannerInput
            products={products}
            onProductScan={handleBarcodeScan}
            placeholder="Scan barcode sticker or type SKU and hit Enter..."
          />

          <form onSubmit={handleSubmit} className="space-y-4 text-xs">
            <div className="space-y-1">
              <label className="font-semibold text-slate-700 dark:text-slate-300">
                Select Product *
              </label>
              <select
                disabled={isSubmitting || products.length === 0}
                value={selectedProductId}
                onChange={(e) => setSelectedProductId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 focus:border-blue-500 outline-none text-slate-900 dark:text-white"
              >
                {products.length === 0 ? (
                  <option value="">No products available. Please add a product first.</option>
                ) : (
                  products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.sku}) &mdash; Stock: {p.currentStock} {p.unit}
                    </option>
                  ))
                )}
              </select>
              {selectedProduct && (
                <div className="text-[11px] text-slate-400 mt-1 flex justify-between">
                  <span>Available: <strong className="text-slate-900 dark:text-white">{selectedProduct.currentStock} {selectedProduct.unit}</strong></span>
                  <span>Selling Price: ${selectedProduct.price.toFixed(2)}</span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="font-semibold text-slate-700 dark:text-slate-300">
                  Quantity Out *
                </label>
                <input
                  type="number"
                  min="1"
                  required
                  disabled={isSubmitting}
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className={cn(
                    "w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border font-mono outline-none",
                    isOverStock
                      ? "border-rose-500 text-rose-600 dark:text-rose-400 focus:border-rose-500"
                      : "border-slate-200 dark:border-slate-800 focus:border-blue-500"
                  )}
                  placeholder="e.g. 1"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700 dark:text-slate-300">
                  Sale Price (Optional)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  disabled={isSubmitting}
                  value={unitPrice}
                  onChange={(e) => setUnitPrice(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 font-mono focus:border-blue-500 outline-none"
                  placeholder={selectedProduct ? selectedProduct.price.toString() : "0.00"}
                />
              </div>
            </div>

            {isOverStock && (
              <p className="text-[11px] font-semibold text-rose-500 flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>Quantity exceeds available stock ({selectedProduct?.currentStock}). The backend will reject with HTTP 422.</span>
              </p>
            )}

            <div className="space-y-1">
              <label className="font-semibold text-slate-700 dark:text-slate-300">
                Customer Name / Account
              </label>
              <input
                type="text"
                disabled={isSubmitting}
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 focus:border-blue-500 outline-none"
                placeholder="e.g. Apex Dynamics Corp"
                list="customers-list"
              />
              <datalist id="customers-list">
                {customers.map((c) => (
                  <option key={c.id} value={c.name} />
                ))}
              </datalist>
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-slate-700 dark:text-slate-300">
                Invoice / Reference Number
              </label>
              <input
                type="text"
                disabled={isSubmitting}
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 font-mono focus:border-blue-500 outline-none"
                placeholder="SO-2026-001"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting || products.length === 0}
              className={cn(
                "w-full py-2.5 rounded-xl text-white font-semibold shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50",
                "bg-blue-600 hover:bg-blue-500"
              )}
            >
              {isSubmitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <ArrowUpRight className="w-4 h-4" />
              )}
              <span>{isSubmitting ? "Processing Dispatch..." : "Confirm Stock Out"}</span>
            </button>
          </form>
        </div>

        {/* Outward History Table */}
        <div className="lg:col-span-2 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 shadow-xs space-y-4">
          <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <ShoppingBag className="w-4 h-4 text-blue-500" />
            <span>Sales & Outward Deductions Log</span>
          </h2>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-slate-500 uppercase font-semibold text-[11px]">
                <tr>
                  <th className="px-4 py-2.5">Reference</th>
                  <th className="px-4 py-2.5">Product</th>
                  <th className="px-4 py-2.5">Customer</th>
                  <th className="px-4 py-2.5 text-center">Qty Out</th>
                  <th className="px-4 py-2.5 text-center">Move Type</th>
                  <th className="px-4 py-2.5 text-right">Time</th>
                  <th className="px-4 py-2.5 text-right">Invoice</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {outMovements.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                      No outward sales transactions recorded yet.
                    </td>
                  </tr>
                ) : (
                  outMovements.map((m) => {
                    const matchedProd = products.find((p) => p.sku === m.sku || p.name === m.productName);
                    const unitP = matchedProd?.price || 0;

                    return (
                      <tr key={m.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/50">
                        <td className="px-4 py-3 font-mono font-bold text-slate-900 dark:text-white">
                          {m.reference}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-semibold text-slate-900 dark:text-white">
                            {m.productName}
                          </div>
                          <div className="text-[11px] font-mono text-slate-400">{m.sku}</div>
                        </td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                          {m.partyName || "N/A"}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-blue-500/10 text-blue-600 dark:text-blue-400">
                            -{m.quantity}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center font-mono text-slate-400 text-[11px]">
                          <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-900 text-blue-600 dark:text-blue-400 font-semibold">
                            RETAIL_SALE
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-slate-400 font-mono text-[11px]">
                          {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => {
                              setActiveInvoice({
                                invoiceNumber: `INV-${m.reference.replace(/^SO-?/, "") || m.id.slice(0, 6)}`,
                                customerName: m.partyName || "Walk-in Customer",
                                date: m.timestamp,
                                items: [
                                  {
                                    sku: m.sku,
                                    name: m.productName,
                                    quantity: m.quantity,
                                    unitPrice: unitP,
                                    total: m.quantity * unitP,
                                  },
                                ],
                                grandTotal: m.quantity * unitP,
                                paymentStatus: "PAID",
                              });
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-blue-50 dark:hover:bg-blue-950/40 text-blue-600 dark:text-blue-400 font-semibold text-[11px] transition-all cursor-pointer"
                            title="Print Sales Invoice"
                          >
                            <FileText className="w-3 h-3" />
                            <span>Invoice</span>
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
      </div>

      {/* Instant Post-Sale Success & Print Prompt Modal */}
      {showSuccessDialog && lastCompletedSale && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150 no-print">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Sale Dispatched Successfully!
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Stock deducted from PostgreSQL two-sided ledger.
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400">Invoice Number:</span>
                <span className="font-mono font-bold text-slate-900 dark:text-white">
                  {lastCompletedSale.invoiceNumber}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Customer:</span>
                <span className="font-semibold text-slate-900 dark:text-white">
                  {lastCompletedSale.customerName}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Total Sale Amount:</span>
                <span className="font-mono font-bold text-blue-600 dark:text-blue-400">
                  ${lastCompletedSale.grandTotal.toFixed(2)}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setShowSuccessDialog(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold text-xs cursor-pointer"
              >
                Done
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveInvoice(lastCompletedSale);
                  setShowSuccessDialog(false);
                }}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs shadow-xs transition-all cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>Print Invoice / Receipt</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Printable Sales Invoice Modal */}
      <SalesInvoiceModal
        invoice={activeInvoice}
        isOpen={!!activeInvoice}
        onClose={() => setActiveInvoice(null)}
      />

    </div>
  );
}
