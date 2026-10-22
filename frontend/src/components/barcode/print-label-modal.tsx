"use client";

import React, { useState } from "react";
import {
  Printer,
  X,
  Layers,
  Tag,
  Check,
  Settings2,
  Maximize2,
  FileText,
} from "lucide-react";
import { Product } from "@/lib/inventory-store";
import { BarcodeView, QRCodeView } from "./barcode-view";
import { cn } from "@/lib/utils";

interface PrintLabelModalProps {
  product: Product | null;
  isOpen: boolean;
  onClose: () => void;
}

export function PrintLabelModal({ product, isOpen, onClose }: PrintLabelModalProps) {
  const [labelFormat, setLabelFormat] = useState<"thermal" | "a4-24" | "a4-30">("thermal");
  const [copies, setCopies] = useState<number>(1);
  const [companyName, setCompanyName] = useState<string>("WHOOPIT IMS");
  const [showPrice, setShowPrice] = useState<boolean>(true);
  const [showQr, setShowQr] = useState<boolean>(false);

  if (!isOpen || !product) return null;

  const handlePrint = () => {
    window.print();
  };

  const copiesCount = Math.max(1, Math.min(copies, labelFormat === "thermal" ? 100 : 60));
  const printArray = Array.from({ length: copiesCount }, (_, i) => i);

  return (
    <>
      {/* Interactive Modal UI (Hidden during window.print) */}
      <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150 no-print">
        <div className="w-full max-w-3xl bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
          {/* Modal Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center">
                <Printer className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Print Barcode Labels
                </h3>
                <p className="text-[11px] text-slate-400">
                  {product.name} &bull; <span className="font-mono">{product.sku}</span>
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Modal Body */}
          <div className="grid grid-cols-1 md:grid-cols-5 divide-y md:divide-y-0 md:divide-x divide-slate-100 dark:divide-slate-800 overflow-y-auto flex-1">
            {/* Left Controls Column (2 Cols) */}
            <div className="p-6 md:col-span-2 space-y-5 text-xs">
              {/* Option 1: Format Selector */}
              <div className="space-y-1.5">
                <label className="font-semibold text-slate-700 dark:text-slate-300">
                  Label Sheet Format
                </label>
                <div className="grid grid-cols-1 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setLabelFormat("thermal")}
                    className={cn(
                      "flex items-center justify-between p-2.5 rounded-xl border text-left transition-all",
                      labelFormat === "thermal"
                        ? "border-indigo-500 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-semibold"
                        : "border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 text-slate-600 dark:text-slate-400"
                    )}
                  >
                    <div>
                      <div className="font-bold">Single Thermal Sticker</div>
                      <div className="text-[10px] text-slate-400 font-normal">50mm x 30mm (Roll Printer)</div>
                    </div>
                    {labelFormat === "thermal" && <Check className="w-4 h-4 text-indigo-500" />}
                  </button>

                  <button
                    type="button"
                    onClick={() => setLabelFormat("a4-24")}
                    className={cn(
                      "flex items-center justify-between p-2.5 rounded-xl border text-left transition-all",
                      labelFormat === "a4-24"
                        ? "border-indigo-500 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-semibold"
                        : "border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 text-slate-600 dark:text-slate-400"
                    )}
                  >
                    <div>
                      <div className="font-bold">A4 Sheet (24 Labels)</div>
                      <div className="text-[10px] text-slate-400 font-normal">3 x 8 grid (70mm x 37mm)</div>
                    </div>
                    {labelFormat === "a4-24" && <Check className="w-4 h-4 text-indigo-500" />}
                  </button>

                  <button
                    type="button"
                    onClick={() => setLabelFormat("a4-30")}
                    className={cn(
                      "flex items-center justify-between p-2.5 rounded-xl border text-left transition-all",
                      labelFormat === "a4-30"
                        ? "border-indigo-500 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-semibold"
                        : "border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 text-slate-600 dark:text-slate-400"
                    )}
                  >
                    <div>
                      <div className="font-bold">A4 Sheet (30 Labels)</div>
                      <div className="text-[10px] text-slate-400 font-normal">3 x 10 grid (70mm x 29.7mm)</div>
                    </div>
                    {labelFormat === "a4-30" && <Check className="w-4 h-4 text-indigo-500" />}
                  </button>
                </div>
              </div>

              {/* Option 2: Copies Count */}
              <div className="space-y-1">
                <label className="font-semibold text-slate-700 dark:text-slate-300">
                  Label Copies
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    max={labelFormat === "thermal" ? 100 : 60}
                    value={copies}
                    onChange={(e) => setCopies(parseInt(e.target.value, 10) || 1)}
                    className="w-24 px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono text-center outline-none focus:border-indigo-500"
                  />
                  <div className="flex items-center gap-1">
                    {[1, 5, 10, labelFormat === "thermal" ? 20 : 24].map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setCopies(n)}
                        className={cn(
                          "px-2 py-1 rounded-lg border text-[11px] font-semibold transition-all",
                          copies === n
                            ? "bg-indigo-600 text-white border-indigo-600"
                            : "border-slate-200 dark:border-slate-800 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                        )}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Option 3: Header Company Name */}
              <div className="space-y-1">
                <label className="font-semibold text-slate-700 dark:text-slate-300">
                  Store / Company Header
                </label>
                <input
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 outline-none focus:border-indigo-500"
                  placeholder="e.g. WHOOPIT IMS"
                />
              </div>

              {/* Option 4: Toggles */}
              <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showPrice}
                    onChange={(e) => setShowPrice(e.target.checked)}
                    className="rounded text-indigo-600 focus:ring-0"
                  />
                  <span className="text-slate-700 dark:text-slate-300">
                    Include Selling Price (${product.price.toFixed(2)})
                  </span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showQr}
                    onChange={(e) => setShowQr(e.target.checked)}
                    className="rounded text-indigo-600 focus:ring-0"
                  />
                  <span className="text-slate-700 dark:text-slate-300">
                    Include 2D QR Code alongside Barcode
                  </span>
                </label>
              </div>
            </div>

            {/* Right Preview Column (3 Cols) */}
            <div className="p-6 md:col-span-3 bg-slate-100/50 dark:bg-slate-950/40 flex flex-col items-center justify-center space-y-4">
              <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Maximize2 className="w-3.5 h-3.5" />
                <span>Live Sticker Preview ({labelFormat === "thermal" ? "50mm x 30mm" : "A4 Grid Item"})</span>
              </div>

              {/* Sticker Preview Box */}
              <div className="w-[280px] p-3.5 bg-white text-black rounded-xl border border-slate-300 shadow-md flex flex-col items-center justify-between text-center select-none">
                {/* Top: Header & Product Name */}
                <div className="w-full border-b border-black/10 pb-1">
                  <div className="text-[9px] font-extrabold uppercase tracking-widest text-black/70">
                    {companyName || "WHOOPIT IMS"}
                  </div>
                  <div className="text-xs font-bold text-black truncate max-w-[260px]">
                    {product.name}
                  </div>
                </div>

                {/* Center: Barcode & QR Code */}
                <div className="my-1.5 flex items-center justify-center gap-2 w-full">
                  <div className="flex-1 flex flex-col items-center">
                    <BarcodeView
                      value={product.sku}
                      width={1.4}
                      height={34}
                      fontSize={11}
                      displayValue={true}
                    />
                  </div>
                  {showQr && (
                    <div className="shrink-0 p-1 bg-white border border-black/10 rounded">
                      <QRCodeView value={product.sku} size={42} />
                    </div>
                  )}
                </div>

                {/* Bottom: SKU & Price */}
                <div className="w-full flex items-center justify-between pt-1 border-t border-black/10 text-[11px] font-mono">
                  <span className="text-black/60 font-semibold">{product.category}</span>
                  {showPrice && (
                    <span className="font-extrabold text-black text-xs">
                      ${product.price.toFixed(2)}
                    </span>
                  )}
                </div>
              </div>

              <p className="text-[11px] text-slate-400 text-center max-w-xs">
                Rendered with standard Code 128 barcode format. Compatible with all handheld USB/Bluetooth optical scanners.
              </p>
            </div>
          </div>

          {/* Modal Footer */}
          <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex items-center justify-between">
            <div className="text-xs text-slate-500">
              Total Labels to Print: <strong className="text-slate-900 dark:text-white">{copiesCount}</strong>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold text-xs"
              >
                Close
              </button>

              <button
                type="button"
                onClick={handlePrint}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs shadow-xs transition-all cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>Print Labels</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* =========================================================================
          PRINT ONLY CONTAINER (#printable-labels-area)
          This area is made visible only during window.print() via @media print in globals.css.
          ========================================================================= */}
      <div id="printable-labels-area" className="hidden print:block">
        {labelFormat === "thermal" ? (
          /* Single Thermal Label Flow (50mm x 30mm) */
          <div className="thermal-print-wrapper">
            {printArray.map((idx) => (
              <div
                key={idx}
                className="thermal-label-item"
                style={{
                  width: "50mm",
                  height: "30mm",
                  padding: "1.5mm 2mm",
                  boxSizing: "border-box",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "space-between",
                  textAlign: "center",
                  pageBreakAfter: "always",
                  fontFamily: "monospace, sans-serif",
                  color: "#000",
                  backgroundColor: "#fff",
                }}
              >
                {/* Header */}
                <div style={{ width: "100%", lineHeight: 1.1 }}>
                  <div style={{ fontSize: "7pt", fontWeight: "bold", textTransform: "uppercase" }}>
                    {companyName || "WHOOPIT IMS"}
                  </div>
                  <div
                    style={{
                      fontSize: "8pt",
                      fontWeight: "bold",
                      overflow: "hidden",
                      whiteSpace: "nowrap",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {product.name}
                  </div>
                </div>

                {/* Barcode & optional QR */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "2mm",
                    width: "100%",
                  }}
                >
                  <BarcodeView
                    value={product.sku}
                    width={1.2}
                    height={28}
                    fontSize={9}
                    displayValue={true}
                  />
                  {showQr && <QRCodeView value={product.sku} size={32} />}
                </div>

                {/* Footer */}
                <div
                  style={{
                    width: "100%",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    fontSize: "7pt",
                  }}
                >
                  <span>{product.sku}</span>
                  {showPrice && (
                    <span style={{ fontWeight: "bold", fontSize: "8pt" }}>
                      ${product.price.toFixed(2)}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* A4 Sheet Grid Flow */
          <div
            style={{
              width: "210mm",
              minHeight: "297mm",
              padding: "10mm 8mm",
              boxSizing: "border-box",
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: labelFormat === "a4-24" ? "4mm" : "2.5mm",
              backgroundColor: "#fff",
              color: "#000",
              fontFamily: "monospace, sans-serif",
            }}
          >
            {printArray.map((idx) => (
              <div
                key={idx}
                style={{
                  height: labelFormat === "a4-24" ? "35mm" : "26.5mm",
                  border: "0.5pt dashed #ccc",
                  padding: "1.5mm 2mm",
                  boxSizing: "border-box",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "space-between",
                  textAlign: "center",
                }}
              >
                <div style={{ width: "100%", lineHeight: 1.1 }}>
                  <div style={{ fontSize: "6.5pt", fontWeight: "bold", textTransform: "uppercase" }}>
                    {companyName || "WHOOPIT IMS"}
                  </div>
                  <div
                    style={{
                      fontSize: "7.5pt",
                      fontWeight: "bold",
                      overflow: "hidden",
                      whiteSpace: "nowrap",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {product.name}
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "2mm",
                    width: "100%",
                  }}
                >
                  <BarcodeView
                    value={product.sku}
                    width={1.1}
                    height={labelFormat === "a4-24" ? 26 : 20}
                    fontSize={8}
                    displayValue={true}
                  />
                  {showQr && <QRCodeView value={product.sku} size={28} />}
                </div>

                <div
                  style={{
                    width: "100%",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    fontSize: "6.5pt",
                  }}
                >
                  <span>{product.sku}</span>
                  {showPrice && (
                    <span style={{ fontWeight: "bold", fontSize: "7.5pt" }}>
                      ${product.price.toFixed(2)}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
