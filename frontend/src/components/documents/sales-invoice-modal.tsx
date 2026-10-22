"use client";

import React, { useState } from "react";
import {
  Printer,
  X,
  FileText,
  Building2,
  Calendar,
  CheckCircle2,
  DollarSign,
  Download,
} from "lucide-react";
import { QRCodeView } from "../barcode/barcode-view";

export interface InvoiceItem {
  sku: string;
  name: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface InvoiceData {
  invoiceNumber: string;
  customerName: string;
  customerPhone?: string;
  customerEmail?: string;
  customerAddress?: string;
  date: string;
  items: InvoiceItem[];
  grandTotal: number;
  paymentStatus?: "PAID" | "PENDING";
  paymentMethod?: string;
  notes?: string;
}

interface SalesInvoiceModalProps {
  invoice: InvoiceData | null;
  isOpen: boolean;
  onClose: () => void;
}

export function SalesInvoiceModal({ invoice, isOpen, onClose }: SalesInvoiceModalProps) {
  const [companyName, setCompanyName] = useState("WHOOPIT ENTERPRISE SYSTEMS");
  const [companyAddress, setCompanyAddress] = useState("Technology Park, Suite 400, Industrial Avenue");
  const [taxId, setTaxId] = useState("TAX-REG-9874102-K");

  if (!isOpen || !invoice) return null;

  const handlePrint = () => {
    window.print();
  };

  const invoiceDate = invoice.date ? new Date(invoice.date) : new Date();
  const formattedDate = invoiceDate.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  const formattedTime = invoiceDate.toLocaleTimeString("en-US", {
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
              <div className="w-9 h-9 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <span>Sales Invoice / Receipt</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                    {invoice.invoiceNumber}
                  </span>
                </h3>
                <p className="text-[11px] text-slate-400">
                  Customer: <strong>{invoice.customerName}</strong> &bull; {formattedDate}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handlePrint}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs shadow-xs transition-all cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>Print Invoice</span>
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
                  <p className="text-xs text-slate-500 mt-1">{companyAddress}</p>
                  <p className="text-xs text-slate-500 font-mono">Tax / NTN ID: {taxId}</p>
                </div>

                <div className="text-left sm:text-right space-y-1">
                  <span className="inline-block px-3 py-1 rounded-md bg-blue-50 text-blue-700 border border-blue-200 text-xs font-bold tracking-wider uppercase">
                    Tax Invoice / Receipt
                  </span>
                  <div className="text-base font-extrabold font-mono text-slate-900">
                    {invoice.invoiceNumber}
                  </div>
                  <div className="text-xs text-slate-500 flex items-center gap-1 sm:justify-end">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                    <span>{formattedDate} &bull; {formattedTime}</span>
                  </div>
                </div>
              </div>

              {/* Bill To & Details Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-xs">
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1.5">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Customer / Billed To
                  </div>
                  <div className="text-sm font-bold text-slate-900">{invoice.customerName}</div>
                  {invoice.customerPhone && (
                    <div className="text-slate-600">Phone: {invoice.customerPhone}</div>
                  )}
                  {invoice.customerEmail && (
                    <div className="text-slate-600">Email: {invoice.customerEmail}</div>
                  )}
                  {invoice.customerAddress && (
                    <div className="text-slate-600">{invoice.customerAddress}</div>
                  )}
                </div>

                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1.5 flex flex-col justify-between">
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Payment & Settlement
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="px-2 py-0.5 rounded text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                        {invoice.paymentStatus || "PAID"}
                      </span>
                      <span className="text-xs text-slate-600 font-medium">
                        Method: {invoice.paymentMethod || "Electronic / Ledger Move"}
                      </span>
                    </div>
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Inventory Move: Physical Warehouse &rarr; Virtual Customer
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
                      <th className="py-2.5 px-4 text-center w-20">Qty</th>
                      <th className="py-2.5 px-4 text-right w-28">Unit Price</th>
                      <th className="py-2.5 px-4 text-right w-28">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {invoice.items.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/50">
                        <td className="py-3 px-4 font-mono text-slate-400">{idx + 1}</td>
                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-900">{item.name}</div>
                          <div className="font-mono text-[11px] text-slate-500">{item.sku}</div>
                        </td>
                        <td className="py-3 px-4 text-center font-bold text-slate-900">
                          {item.quantity}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-slate-700">
                          ${item.unitPrice.toFixed(2)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                          ${item.total.toFixed(2)}
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
                    <QRCodeView value={invoice.invoiceNumber} size={64} />
                  </div>
                  <div className="text-[11px] text-slate-400 leading-tight">
                    <div className="font-bold text-slate-600">Digital Verification QR</div>
                    <div>Scan to verify authenticity</div>
                    <div className="font-mono text-[10px] text-slate-400">{invoice.invoiceNumber}</div>
                  </div>
                </div>

                <div className="w-full sm:w-64 space-y-1.5 text-xs">
                  <div className="flex justify-between text-slate-600">
                    <span>Subtotal:</span>
                    <span className="font-mono">${invoice.grandTotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Tax (0% Standard):</span>
                    <span className="font-mono">$0.00</span>
                  </div>
                  <div className="flex justify-between text-sm font-extrabold text-slate-900 pt-2 border-t border-slate-200">
                    <span>Grand Total:</span>
                    <span className="font-mono text-blue-600">${invoice.grandTotal.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {/* Signatures & Terms */}
              <div className="pt-8 border-t border-slate-200 flex flex-col sm:flex-row justify-between gap-8 text-xs text-slate-500">
                <div>
                  <div className="font-bold text-slate-700">Terms & Conditions:</div>
                  <ul className="list-disc list-inside text-[11px] text-slate-500 mt-1 space-y-0.5">
                    <li>Goods received in sound condition.</li>
                    <li>Stock deducted permanently via two-sided inventory ledger.</li>
                    <li>Valid warranty claims must reference Invoice #{invoice.invoiceNumber}.</li>
                  </ul>
                </div>

                <div className="flex gap-8 sm:gap-12 shrink-0">
                  <div className="text-center">
                    <div className="w-32 border-b border-slate-300 mb-1 h-10"></div>
                    <span className="text-[10px] uppercase font-bold text-slate-400">
                      Customer Signature
                    </span>
                  </div>
                  <div className="text-center">
                    <div className="w-32 border-b border-slate-300 mb-1 h-10 flex items-end justify-center pb-1">
                      <span className="font-serif italic text-blue-600 text-xs">Authorized</span>
                    </div>
                    <span className="text-[10px] uppercase font-bold text-slate-400">
                      Authorized Signatory
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
        {/* Document Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "1.5pt solid #000", paddingBottom: "12pt", marginBottom: "16pt" }}>
          <div>
            <h1 style={{ fontSize: "16pt", fontWeight: "bold", textTransform: "uppercase", margin: 0 }}>
              {companyName}
            </h1>
            <p style={{ fontSize: "9pt", color: "#444", margin: "2pt 0 0 0" }}>{companyAddress}</p>
            <p style={{ fontSize: "9pt", color: "#444", margin: "2pt 0 0 0", fontFamily: "monospace" }}>Tax ID: {taxId}</p>
          </div>

          <div style={{ textAlign: "right" }}>
            <span style={{ display: "inline-block", padding: "2pt 8pt", border: "1pt solid #000", fontSize: "9pt", fontWeight: "bold", textTransform: "uppercase" }}>
              Tax Invoice / Receipt
            </span>
            <div style={{ fontSize: "13pt", fontWeight: "bold", fontFamily: "monospace", marginTop: "4pt" }}>
              {invoice.invoiceNumber}
            </div>
            <div style={{ fontSize: "9pt", color: "#444" }}>
              {formattedDate} &bull; {formattedTime}
            </div>
          </div>
        </div>

        {/* Bill To Grid */}
        <div style={{ display: "flex", justifyContent: "space-between", gap: "20pt", marginBottom: "16pt", fontSize: "9pt" }}>
          <div style={{ flex: 1, padding: "8pt", border: "1pt solid #ddd" }}>
            <div style={{ fontSize: "8pt", fontWeight: "bold", color: "#666", textTransform: "uppercase" }}>
              Customer Details
            </div>
            <div style={{ fontSize: "11pt", fontWeight: "bold", marginTop: "2pt" }}>{invoice.customerName}</div>
            {invoice.customerPhone && <div>Phone: {invoice.customerPhone}</div>}
            {invoice.customerEmail && <div>Email: {invoice.customerEmail}</div>}
            {invoice.customerAddress && <div>Address: {invoice.customerAddress}</div>}
          </div>

          <div style={{ width: "200pt", padding: "8pt", border: "1pt solid #ddd" }}>
            <div style={{ fontSize: "8pt", fontWeight: "bold", color: "#666", textTransform: "uppercase" }}>
              Payment Information
            </div>
            <div style={{ fontSize: "10pt", fontWeight: "bold", marginTop: "2pt" }}>
              Status: {invoice.paymentStatus || "PAID"}
            </div>
            <div>Payment: {invoice.paymentMethod || "Electronic / Ledger Movement"}</div>
            <div style={{ fontSize: "8pt", color: "#666", marginTop: "4pt" }}>
              Stock Deduction: Physical Warehouse &rarr; Virtual Customer
            </div>
          </div>
        </div>

        {/* Table */}
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "16pt", fontSize: "9pt" }}>
          <thead>
            <tr style={{ backgroundColor: "#f0f0f0", borderTop: "1pt solid #000", borderBottom: "1pt solid #000" }}>
              <th style={{ padding: "6pt", textAlign: "left", width: "20pt" }}>#</th>
              <th style={{ padding: "6pt", textAlign: "left" }}>SKU & Description</th>
              <th style={{ padding: "6pt", textAlign: "center", width: "40pt" }}>Qty</th>
              <th style={{ padding: "6pt", textAlign: "right", width: "70pt" }}>Unit Price</th>
              <th style={{ padding: "6pt", textAlign: "right", width: "70pt" }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {invoice.items.map((item, idx) => (
              <tr key={idx} style={{ borderBottom: "0.5pt solid #ddd" }}>
                <td style={{ padding: "6pt", color: "#666", fontFamily: "monospace" }}>{idx + 1}</td>
                <td style={{ padding: "6pt" }}>
                  <div style={{ fontWeight: "bold" }}>{item.name}</div>
                  <div style={{ fontSize: "8pt", color: "#666", fontFamily: "monospace" }}>{item.sku}</div>
                </td>
                <td style={{ padding: "6pt", textAlign: "center", fontWeight: "bold" }}>{item.quantity}</td>
                <td style={{ padding: "6pt", textAlign: "right", fontFamily: "monospace" }}>${item.unitPrice.toFixed(2)}</td>
                <td style={{ padding: "6pt", textAlign: "right", fontWeight: "bold", fontFamily: "monospace" }}>${item.total.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Financial Summary */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24pt" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8pt" }}>
            <QRCodeView value={invoice.invoiceNumber} size={50} />
            <div style={{ fontSize: "8pt", color: "#555" }}>
              <div><strong>Digital Verification QR</strong></div>
              <div>Scan to verify invoice in ledger</div>
              <div style={{ fontFamily: "monospace" }}>{invoice.invoiceNumber}</div>
            </div>
          </div>

          <div style={{ width: "160pt", fontSize: "9pt" }}>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "2pt 0" }}>
              <span>Subtotal:</span>
              <span style={{ fontFamily: "monospace" }}>${invoice.grandTotal.toFixed(2)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "2pt 0" }}>
              <span>Tax (0%):</span>
              <span style={{ fontFamily: "monospace" }}>$0.00</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "4pt 0", borderTop: "1pt solid #000", fontWeight: "bold", fontSize: "11pt" }}>
              <span>Grand Total:</span>
              <span style={{ fontFamily: "monospace" }}>${invoice.grandTotal.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Signatures */}
        <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1pt solid #000", paddingTop: "16pt", fontSize: "8.5pt" }}>
          <div style={{ width: "60%" }}>
            <div style={{ fontWeight: "bold" }}>Terms & Conditions:</div>
            <div>1. Received in sound condition. 2. Stock recorded in PostgreSQL two-sided ledger.</div>
          </div>

          <div style={{ display: "flex", gap: "24pt" }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ width: "90pt", borderBottom: "0.5pt solid #000", height: "30pt" }}></div>
              <div style={{ fontSize: "7.5pt", textTransform: "uppercase", marginTop: "2pt" }}>Customer Signature</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ width: "90pt", borderBottom: "0.5pt solid #000", height: "30pt", lineHeight: "40pt", fontStyle: "italic" }}>Authorized</div>
              <div style={{ fontSize: "7.5pt", textTransform: "uppercase", marginTop: "2pt" }}>Authorized Signatory</div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
