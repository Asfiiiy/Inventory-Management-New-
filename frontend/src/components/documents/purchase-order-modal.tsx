"use client";

import React, { useState } from "react";
import {
  Printer,
  X,
  Truck,
  Building2,
  Calendar,
  CheckCircle2,
  FileCheck,
} from "lucide-react";
import { QRCodeView } from "../barcode/barcode-view";

export interface POItem {
  sku: string;
  name: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
}

export interface PurchaseOrderData {
  poNumber: string;
  supplierName: string;
  supplierAddress?: string;
  supplierPhone?: string;
  supplierEmail?: string;
  date: string;
  warehouseName?: string;
  items: POItem[];
  grandTotal: number;
  status?: string;
  notes?: string;
}

interface PurchaseOrderModalProps {
  order: PurchaseOrderData | null;
  isOpen: boolean;
  onClose: () => void;
}

export function PurchaseOrderModal({ order, isOpen, onClose }: PurchaseOrderModalProps) {
  const [companyName, setCompanyName] = useState("WHOOPIT ENTERPRISE SYSTEMS");
  const [warehouseAddress, setWarehouseAddress] = useState("Central Distribution Warehouse #4, Tech Logistics Hub");

  if (!isOpen || !order) return null;

  const handlePrint = () => {
    window.print();
  };

  const orderDate = order.date ? new Date(order.date) : new Date();
  const formattedDate = orderDate.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  const formattedTime = orderDate.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <>
      {/* Interactive Modal UI (Hidden during window.print) */}
      <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150 no-print">
        <div className="w-full max-w-4xl bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
                <Truck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <span>Inward Purchase Order / Goods Receipt</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                    {order.poNumber}
                  </span>
                </h3>
                <p className="text-[11px] text-slate-400">
                  Supplier: <strong>{order.supplierName}</strong> &bull; {formattedDate}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handlePrint}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs shadow-xs transition-all cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>Print Purchase Order</span>
              </button>
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Body: Live A4 Document Preview */}
          <div className="p-6 overflow-y-auto flex-1 bg-slate-100 dark:bg-slate-950/60 flex justify-center">
            <div className="w-full max-w-3xl bg-white text-slate-900 p-8 sm:p-10 rounded-2xl border border-slate-200 shadow-sm space-y-8 font-sans">
              {/* Document Header */}
              <div className="flex flex-col sm:flex-row justify-between items-start gap-4 pb-6 border-b border-slate-200">
                <div>
                  <h1 className="text-xl font-extrabold tracking-tight text-slate-900 uppercase">
                    {companyName}
                  </h1>
                  <p className="text-xs text-slate-500 mt-1">Procurement & Inventory Receiving Dept.</p>
                  <p className="text-xs text-slate-500 font-mono">Ledger Node: Primary PostgreSQL Ledger</p>
                </div>

                <div className="text-left sm:text-right space-y-1">
                  <span className="inline-block px-3 py-1 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-300 text-xs font-bold tracking-wider uppercase">
                    Goods Inward / PO
                  </span>
                  <div className="text-base font-extrabold font-mono text-slate-900">
                    {order.poNumber}
                  </div>
                  <div className="text-xs text-slate-500 flex items-center gap-1 sm:justify-end">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                    <span>{formattedDate} &bull; {formattedTime}</span>
                  </div>
                </div>
              </div>

              {/* Vendor & Ship To Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-xs">
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1.5">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Vendor / Supplier
                  </div>
                  <div className="text-sm font-bold text-slate-900">{order.supplierName}</div>
                  {order.supplierPhone && (
                    <div className="text-slate-600">Contact: {order.supplierPhone}</div>
                  )}
                  {order.supplierEmail && (
                    <div className="text-slate-600">Email: {order.supplierEmail}</div>
                  )}
                  <div className="text-[11px] text-slate-400">
                    Source: Virtual Vendor Ledger Account
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1.5">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Receiving Location / Warehouse
                  </div>
                  <div className="text-sm font-bold text-slate-900">
                    {order.warehouseName || "Main Central Storage Warehouse"}
                  </div>
                  <div className="text-slate-600">{warehouseAddress}</div>
                  <div className="text-[11px] text-emerald-600 font-semibold">
                    Status: Received & Added to On-Hand Inventory
                  </div>
                </div>
              </div>

              {/* Items Table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-4 w-10">#</th>
                      <th className="py-2.5 px-4">Item SKU & Description</th>
                      <th className="py-2.5 px-4 text-center w-24">Qty Received</th>
                      <th className="py-2.5 px-4 text-right w-28">Unit Cost</th>
                      <th className="py-2.5 px-4 text-right w-28">Total Valuation</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {order.items.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/50">
                        <td className="py-3 px-4 font-mono text-slate-400">{idx + 1}</td>
                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-900">{item.name}</div>
                          <div className="font-mono text-[11px] text-slate-500">{item.sku}</div>
                        </td>
                        <td className="py-3 px-4 text-center font-bold text-emerald-700">
                          +{item.quantity}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-slate-700">
                          ${item.unitCost.toFixed(2)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                          ${item.totalCost.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Financial Totals & QR Validation */}
              <div className="flex flex-col sm:flex-row items-end sm:items-center justify-between gap-6 pt-2">
                <div className="flex items-center gap-3">
                  <div className="p-1 border border-slate-200 rounded-lg bg-white">
                    <QRCodeView value={order.poNumber} size={64} />
                  </div>
                  <div className="text-[11px] text-slate-400 leading-tight">
                    <div className="font-bold text-slate-600">PO Verification Code</div>
                    <div>Ledger entry: INWARD_RECEIPT</div>
                    <div className="font-mono text-[10px] text-slate-400">{order.poNumber}</div>
                  </div>
                </div>

                <div className="w-full sm:w-64 space-y-1.5 text-xs">
                  <div className="flex justify-between text-slate-600">
                    <span>Order Subtotal:</span>
                    <span className="font-mono">${order.grandTotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Inward Freight:</span>
                    <span className="font-mono">$0.00</span>
                  </div>
                  <div className="flex justify-between text-sm font-extrabold text-slate-900 pt-2 border-t border-slate-200">
                    <span>Total Procurement Value:</span>
                    <span className="font-mono text-emerald-600">${order.grandTotal.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {/* Signatures & Confirmation */}
              <div className="pt-8 border-t border-slate-200 flex flex-col sm:flex-row justify-between gap-8 text-xs text-slate-500">
                <div>
                  <div className="font-bold text-slate-700">Receiving Certification:</div>
                  <p className="text-[11px] text-slate-500 mt-1 max-w-sm">
                    I hereby certify that the items listed above have been physically inspected, counted,
                    and permanently accepted into the inventory ledger at the specified location.
                  </p>
                </div>

                <div className="flex gap-8 sm:gap-12 shrink-0">
                  <div className="text-center">
                    <div className="w-36 border-b border-slate-300 mb-1 h-10 flex items-end justify-center pb-1">
                      <span className="font-serif italic text-emerald-600 text-xs">Verified Inward</span>
                    </div>
                    <span className="text-[10px] uppercase font-bold text-slate-400">
                      Receiving Officer Sign
                    </span>
                  </div>
                  <div className="text-center">
                    <div className="w-36 border-b border-slate-300 mb-1 h-10 flex items-end justify-center pb-1">
                      <span className="font-serif italic text-slate-700 text-xs">Approved</span>
                    </div>
                    <span className="text-[10px] uppercase font-bold text-slate-400">
                      Procurement Manager
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* =========================================================================
          PRINT ONLY CONTAINER (#printable-document-area)
          This area is made visible only during window.print() via @media print in globals.css.
          ========================================================================= */}
      <div id="printable-document-area" className="hidden print:block font-sans text-black bg-white p-8">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "1.5pt solid #000", paddingBottom: "12pt", marginBottom: "16pt" }}>
          <div>
            <h1 style={{ fontSize: "16pt", fontWeight: "bold", textTransform: "uppercase", margin: 0 }}>
              {companyName}
            </h1>
            <p style={{ fontSize: "9pt", color: "#444", margin: "2pt 0 0 0" }}>Procurement & Inventory Receiving Department</p>
          </div>

          <div style={{ textAlign: "right" }}>
            <span style={{ display: "inline-block", padding: "2pt 8pt", border: "1pt solid #000", fontSize: "9pt", fontWeight: "bold", textTransform: "uppercase" }}>
              Goods Inward / PO
            </span>
            <div style={{ fontSize: "13pt", fontWeight: "bold", fontFamily: "monospace", marginTop: "4pt" }}>
              {order.poNumber}
            </div>
            <div style={{ fontSize: "9pt", color: "#444" }}>
              {formattedDate} &bull; {formattedTime}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", gap: "20pt", marginBottom: "16pt", fontSize: "9pt" }}>
          <div style={{ flex: 1, padding: "8pt", border: "1pt solid #ddd" }}>
            <div style={{ fontSize: "8pt", fontWeight: "bold", color: "#666", textTransform: "uppercase" }}>
              Vendor / Supplier
            </div>
            <div style={{ fontSize: "11pt", fontWeight: "bold", marginTop: "2pt" }}>{order.supplierName}</div>
            {order.supplierPhone && <div>Phone: {order.supplierPhone}</div>}
            {order.supplierEmail && <div>Email: {order.supplierEmail}</div>}
          </div>

          <div style={{ flex: 1, padding: "8pt", border: "1pt solid #ddd" }}>
            <div style={{ fontSize: "8pt", fontWeight: "bold", color: "#666", textTransform: "uppercase" }}>
              Receiving Destination
            </div>
            <div style={{ fontSize: "10pt", fontWeight: "bold", marginTop: "2pt" }}>
              {order.warehouseName || "Main Central Storage Warehouse"}
            </div>
            <div style={{ fontSize: "8.5pt", color: "#555" }}>{warehouseAddress}</div>
            <div style={{ fontSize: "8pt", color: "#000", marginTop: "2pt", fontWeight: "bold" }}>
              Status: Received & Posted to On-Hand Ledger
            </div>
          </div>
        </div>

        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "16pt", fontSize: "9pt" }}>
          <thead>
            <tr style={{ backgroundColor: "#f0f0f0", borderTop: "1pt solid #000", borderBottom: "1pt solid #000" }}>
              <th style={{ padding: "6pt", textAlign: "left", width: "20pt" }}>#</th>
              <th style={{ padding: "6pt", textAlign: "left" }}>Item SKU & Description</th>
              <th style={{ padding: "6pt", textAlign: "center", width: "50pt" }}>Qty In</th>
              <th style={{ padding: "6pt", textAlign: "right", width: "70pt" }}>Unit Cost</th>
              <th style={{ padding: "6pt", textAlign: "right", width: "70pt" }}>Total Valuation</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((item, idx) => (
              <tr key={idx} style={{ borderBottom: "0.5pt solid #ddd" }}>
                <td style={{ padding: "6pt", color: "#666", fontFamily: "monospace" }}>{idx + 1}</td>
                <td style={{ padding: "6pt" }}>
                  <div style={{ fontWeight: "bold" }}>{item.name}</div>
                  <div style={{ fontSize: "8pt", color: "#666", fontFamily: "monospace" }}>{item.sku}</div>
                </td>
                <td style={{ padding: "6pt", textAlign: "center", fontWeight: "bold" }}>+{item.quantity}</td>
                <td style={{ padding: "6pt", textAlign: "right", fontFamily: "monospace" }}>${item.unitCost.toFixed(2)}</td>
                <td style={{ padding: "6pt", textAlign: "right", fontWeight: "bold", fontFamily: "monospace" }}>${item.totalCost.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24pt" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8pt" }}>
            <QRCodeView value={order.poNumber} size={50} />
            <div style={{ fontSize: "8pt", color: "#555" }}>
              <div><strong>Verification Code: {order.poNumber}</strong></div>
              <div>Transaction Type: INWARD_RECEIPT</div>
            </div>
          </div>

          <div style={{ width: "160pt", fontSize: "9pt" }}>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "4pt 0", borderTop: "1pt solid #000", fontWeight: "bold", fontSize: "11pt" }}>
              <span>Total Value:</span>
              <span style={{ fontFamily: "monospace" }}>${order.grandTotal.toFixed(2)}</span>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1pt solid #000", paddingTop: "16pt", fontSize: "8.5pt" }}>
          <div style={{ width: "55%" }}>
            <div style={{ fontWeight: "bold" }}>Receiving Certification:</div>
            <div>Certified physical receipt and ledger entry into on-hand stock.</div>
          </div>

          <div style={{ display: "flex", gap: "24pt" }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ width: "95pt", borderBottom: "0.5pt solid #000", height: "30pt", lineHeight: "40pt", fontStyle: "italic" }}>Verified</div>
              <div style={{ fontSize: "7.5pt", textTransform: "uppercase", marginTop: "2pt" }}>Receiving Officer</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ width: "95pt", borderBottom: "0.5pt solid #000", height: "30pt", lineHeight: "40pt", fontStyle: "italic" }}>Approved</div>
              <div style={{ fontSize: "7.5pt", textTransform: "uppercase", marginTop: "2pt" }}>Procurement Manager</div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
