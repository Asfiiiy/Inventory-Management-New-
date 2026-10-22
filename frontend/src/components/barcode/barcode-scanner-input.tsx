"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  ScanLine,
  Barcode,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Volume2,
} from "lucide-react";
import { Product } from "@/lib/inventory-store";
import { playScanBeep, playErrorBuzz } from "@/lib/sound";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

interface BarcodeScannerInputProps {
  products: Product[];
  onProductScan: (product: Product, rawBarcode: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
}

export function BarcodeScannerInput({
  products,
  onProductScan,
  placeholder = "Scan SKU barcode or type and press Enter...",
  autoFocus = true,
  className,
}: BarcodeScannerInputProps) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [val, setVal] = useState("");
  const [scanStatus, setScanStatus] = useState<"idle" | "success" | "error">("idle");
  const [lastScanned, setLastScanned] = useState<{ name: string; sku: string; time: string } | null>(null);

  // Auto-focus input on mount
  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
    }
  }, [autoFocus]);

  const processBarcode = useCallback(
    (barcode: string) => {
      const clean = barcode.trim().toUpperCase();
      if (!clean) return;

      // Match against SKU or Product ID or exact name
      const matched = products.find(
        (p) =>
          p.sku.toUpperCase() === clean ||
          p.id.toUpperCase() === clean ||
          p.sku.toUpperCase().replace(/[^A-Z0-9]/g, "") === clean.replace(/[^A-Z0-9]/g, "")
      );

      if (matched) {
        // Success
        playScanBeep();
        setScanStatus("success");
        setLastScanned({
          name: matched.name,
          sku: matched.sku,
          time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
        });

        onProductScan(matched, clean);

        toast({
          title: "Barcode Scanned",
          description: `Identified: ${matched.name} (${matched.sku})`,
          variant: "success",
          duration: 2500,
        });

        setTimeout(() => setScanStatus("idle"), 1200);
      } else {
        // Failure
        playErrorBuzz();
        setScanStatus("error");

        toast({
          title: "Barcode Not Found",
          description: `No product matching SKU or barcode "${clean}" in catalog.`,
          variant: "destructive",
          duration: 3500,
        });

        setTimeout(() => setScanStatus("idle"), 1500);
      }

      setVal("");
      // Keep input focused for next scan
      if (inputRef.current) {
        inputRef.current.focus();
      }
    },
    [products, onProductScan, toast]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      processBarcode(val);
    }
  };

  return (
    <div
      className={cn(
        "p-4 rounded-2xl border transition-all duration-200",
        scanStatus === "success"
          ? "border-emerald-500 bg-emerald-500/10 shadow-md shadow-emerald-500/10"
          : scanStatus === "error"
          ? "border-rose-500 bg-rose-500/10 shadow-md shadow-rose-500/10"
          : "border-indigo-500/30 bg-indigo-500/5 dark:bg-indigo-950/20",
        className
      )}
    >
      <div className="flex items-center justify-between pb-2 mb-2 border-b border-indigo-500/10 text-xs">
        <div className="flex items-center gap-2">
          <ScanLine className="w-4 h-4 text-indigo-500 animate-pulse" />
          <span className="font-bold text-slate-900 dark:text-white">
            Physical Barcode Scanner Auto-Fill
          </span>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            Keyboard Wedge Active
          </span>
        </div>

        <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
          <Volume2 className="w-3.5 h-3.5" />
          <span>Audio Beep On</span>
        </div>
      </div>

      <div className="relative">
        <Barcode className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          ref={inputRef}
          type="text"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className={cn(
            "w-full pl-11 pr-24 py-2.5 text-xs rounded-xl border font-mono transition-all outline-none",
            "bg-white dark:bg-slate-900 text-slate-900 dark:text-white",
            scanStatus === "success"
              ? "border-emerald-500 ring-2 ring-emerald-500/20"
              : scanStatus === "error"
              ? "border-rose-500 ring-2 ring-rose-500/20"
              : "border-slate-200 dark:border-slate-800 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
          )}
        />

        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => processBarcode(val)}
            disabled={!val.trim()}
            className="px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-40 transition-all cursor-pointer"
          >
            Enter
          </button>
        </div>
      </div>

      {/* Real-time scanner feedback status */}
      <div className="mt-2.5 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
        <div className="flex items-center gap-1.5 truncate">
          {lastScanned ? (
            <>
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              <span>
                Last scanned: <strong className="text-slate-900 dark:text-white">{lastScanned.name}</strong>{" "}
                (<span className="font-mono">{lastScanned.sku}</span>) at {lastScanned.time}
              </span>
            </>
          ) : (
            <span>Aim scanner gun at any printed sticker. USB / Bluetooth input auto-detected.</span>
          )}
        </div>

        {/* Quick simulation chips if no physical scanner connected */}
        {products.length > 0 && (
          <div className="hidden sm:flex items-center gap-1 shrink-0">
            <span className="text-[10px] text-slate-400">Quick Test:</span>
            {products.slice(0, 3).map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => processBarcode(p.sku)}
                className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 font-mono text-[10px] text-indigo-600 dark:text-indigo-400 border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
                title={`Click to simulate scanning ${p.name}`}
              >
                {p.sku}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
