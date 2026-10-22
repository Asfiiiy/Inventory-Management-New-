"use client";

import React, { useState, useRef, Suspense } from "react";
import Link from "next/link";
import {
  FileSpreadsheet,
  Upload,
  Download,
  CheckCircle2,
  AlertCircle,
  Loader2,
  FileText,
  ArrowRight,
  RefreshCw,
  Sparkles,
  Info,
} from "lucide-react";
import { apiClient, CSVImportResult } from "@/lib/api";
import { useInventory } from "@/lib/inventory-store";
import { useToast } from "@/components/ui/toast";
import { downloadCSV } from "@/lib/export-csv";
import { cn } from "@/lib/utils";

export default function CSVImportPage() {
  return (
    <Suspense fallback={<div className="p-8 text-xs text-slate-400">Loading CSV Import Bridge...</div>}>
      <CSVImportContent />
    </Suspense>
  );
}

function CSVImportContent() {
  const { refetch } = useInventory();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDryRunning, setIsDryRunning] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [dryRunResult, setDryRunResult] = useState<CSVImportResult | null>(null);
  const [finalImportResult, setFinalImportResult] = useState<CSVImportResult | null>(null);

  // Template generator
  const handleDownloadTemplate = () => {
    const templateContent = [
      "sku,name,base_uom,cost_price,reorder_level,buffer_stock",
      "SKU-DEMO-001,Enterprise Laptop i7 16GB,pcs,850.00,5,2",
      "SKU-DEMO-002,Mechanical USB Keyboard,pcs,45.00,10,5",
      "SKU-DEMO-003,Cat6 Ethernet Cable 10m,pcs,8.50,20,10",
      "SKU-DEMO-004,27-inch 4K IPS Monitor,pcs,280.00,4,2",
    ].join("\r\n");

    downloadCSV(templateContent, "whoopit_products_import_template.csv");
    toast({
      title: "Template Downloaded",
      description: "Sample CSV template with UTF-8 BOM downloaded to your computer.",
      variant: "success",
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setSelectedFile(e.target.files[0]);
      setDryRunResult(null);
      setFinalImportResult(null);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      if (file.name.endsWith(".csv")) {
        setSelectedFile(file);
        setDryRunResult(null);
        setFinalImportResult(null);
      } else {
        toast({
          title: "Invalid File Type",
          description: "Please upload a valid .csv spreadsheet file.",
          variant: "destructive",
        });
      }
    }
  };

  // Perform Dry Run Validation
  const handleDryRun = async () => {
    if (!selectedFile) return;

    setIsDryRunning(true);
    setDryRunResult(null);
    setFinalImportResult(null);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);

      const res = await apiClient.items.importCSV(formData, true);
      if (res.success && res.data) {
        setDryRunResult(res.data);
        if (res.data.errors && res.data.errors.length > 0) {
          toast({
            title: "Validation Issues Found",
            description: `Found ${res.data.errors.length} errors across ${res.data.total_rows} rows. Review the report below.`,
            variant: "destructive",
          });
        } else {
          toast({
            title: "Validation Successful",
            description: `All ${res.data.total_rows} rows passed schema checks with 0 errors!`,
            variant: "success",
          });
        }
      }
    } catch (err: any) {
      toast({
        title: "Validation Request Failed",
        description: err?.problem?.detail || err.message || "Could not validate CSV file",
        variant: "destructive",
      });
    } finally {
      setIsDryRunning(false);
    }
  };

  // Perform Live Batch Import
  const handleExecuteImport = async () => {
    if (!selectedFile) return;

    setIsImporting(true);
    try {
      const formData = new FormData();
      formData.append("file", selectedFile);

      const res = await apiClient.items.importCSV(formData, false);
      if (res.success && res.data) {
        setFinalImportResult(res.data);
        toast({
          title: "Batch Import Completed",
          description: `Successfully imported ${res.data.imported} products into PostgreSQL catalog!`,
          variant: "success",
        });
        await refetch();
      }
    } catch (err: any) {
      toast({
        title: "Import Failed",
        description: err?.problem?.detail || err.message || "Failed to commit items to database",
        variant: "destructive",
      });
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider mb-1">
            <FileSpreadsheet className="w-4 h-4" />
            <span>Bulk Data Synchronization</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Excel & CSV Catalog Bridge
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Two-stage batch importer with syntax validation, dry-run error preview, and PostgreSQL upsert.
          </p>
        </div>

        <button
          onClick={handleDownloadTemplate}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/80 transition-colors shadow-xs cursor-pointer"
        >
          <Download className="w-4 h-4 text-emerald-600" />
          <span>Download Sample CSV</span>
        </button>
      </div>

      {/* Upload Dropzone */}
      <div
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={cn(
          "p-8 rounded-3xl border-2 border-dashed transition-all cursor-pointer text-center flex flex-col items-center justify-center space-y-3",
          selectedFile
            ? "border-indigo-500 bg-indigo-50/20 dark:bg-indigo-950/20"
            : "border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900/50 hover:border-slate-400 dark:hover:border-slate-600"
        )}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          onChange={handleFileChange}
          className="hidden"
        />

        <div className="w-14 h-14 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shadow-xs">
          <Upload className="w-7 h-7" />
        </div>

        {selectedFile ? (
          <div>
            <p className="font-bold text-slate-900 dark:text-white text-base">
              {selectedFile.name}
            </p>
            <p className="text-xs text-slate-400 mt-0.5">
              {(selectedFile.size / 1024).toFixed(1)} KB &bull; Click or drop another file to replace
            </p>
          </div>
        ) : (
          <div>
            <p className="font-bold text-slate-900 dark:text-white text-base">
              Choose a CSV file or drag &amp; drop it here
            </p>
            <p className="text-xs text-slate-400 mt-1 max-w-sm">
              Supports standard CSV format with headers: <code className="text-[11px] font-mono bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">sku</code>, <code className="text-[11px] font-mono bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">name</code>, <code className="text-[11px] font-mono bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">base_uom</code>, <code className="text-[11px] font-mono bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">cost_price</code>
            </p>
          </div>
        )}
      </div>

      {/* Action Buttons */}
      {selectedFile && !finalImportResult && (
        <div className="flex items-center justify-end gap-3">
          <button
            onClick={handleDryRun}
            disabled={isDryRunning || isImporting}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors shadow-xs disabled:opacity-50 cursor-pointer"
          >
            {isDryRunning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            <span>Step 1: Validate / Dry-Run</span>
          </button>

          <button
            onClick={handleExecuteImport}
            disabled={isDryRunning || isImporting || (dryRunResult?.errors && dryRunResult.errors.length > 0)}
            className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-xs transition-colors disabled:opacity-50 cursor-pointer"
          >
            {isImporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            <span>Step 2: Commit Batch Import</span>
          </button>
        </div>
      )}

      {/* Validation Dry-Run Results */}
      {dryRunResult && (
        <div className="space-y-4 animate-in fade-in duration-200">
          <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span>Validation Summary</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                  DRY RUN
                </span>
              </h3>
              <span className="text-xs text-slate-400">Total Rows: {dryRunResult.total_rows}</span>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs">
                <span className="text-slate-500 block">Valid Rows</span>
                <span className="text-xl font-bold text-emerald-600">
                  {dryRunResult.total_rows - (dryRunResult.errors?.length || 0)}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs">
                <span className="text-slate-500 block">Syntax / Schema Errors</span>
                <span className="text-xl font-bold text-rose-600">
                  {dryRunResult.errors?.length || 0}
                </span>
              </div>
            </div>

            {dryRunResult.errors && dryRunResult.errors.length > 0 ? (
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-rose-600 flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>Row Errors Detected:</span>
                </h4>
                <div className="max-h-48 overflow-y-auto rounded-xl border border-rose-200 dark:border-rose-900/40 divide-y divide-rose-100 dark:divide-rose-900/20 text-xs">
                  {dryRunResult.errors.map((err, i) => (
                    <div key={i} className="p-2.5 flex items-center justify-between">
                      <span className="font-mono text-slate-500">Row {err.row}</span>
                      <span className="font-bold text-rose-600 dark:text-rose-400">{err.field}</span>
                      <span className="text-slate-600 dark:text-slate-300">{err.error}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-xs font-semibold text-emerald-600 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>All rows are syntactically valid! Ready to commit batch import to PostgreSQL.</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Final Success State */}
      {finalImportResult && (
        <div className="p-6 rounded-3xl bg-emerald-500/10 border border-emerald-500/20 text-center space-y-4 animate-in fade-in duration-200">
          <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center mx-auto shadow-xs">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-emerald-900 dark:text-emerald-200">
              Import Completed Successfully!
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
              Inserted and synchronized <strong className="font-bold text-emerald-600">{finalImportResult.imported}</strong> items into the master inventory catalog.
            </p>
          </div>

          <div className="flex items-center justify-center gap-3 pt-2">
            <button
              onClick={() => {
                setSelectedFile(null);
                setDryRunResult(null);
                setFinalImportResult(null);
              }}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors"
            >
              Import Another File
            </button>
            <Link
              href="/products"
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-xs transition-colors"
            >
              <span>View Product Catalog</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
