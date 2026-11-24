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
  Info,
  X,
  FileCheck,
  Eye,
  Layers,
  Table,
  HelpCircle,
  PackagePlus,
  Check,
} from "lucide-react";
import { apiClient, CSVImportResult } from "@/lib/api";
import { useInventory } from "@/lib/inventory-store";
import { useToast } from "@/components/ui/toast";
import { downloadCSV } from "@/lib/export-csv";
import { cn } from "@/lib/utils";
import { useRequireCompanyAdmin } from "@/lib/use-require-company-admin";

export default function CSVImportPage() {
  return (
    <Suspense fallback={<div className="p-8 text-xs text-slate-400">Loading CSV Import Bridge...</div>}>
      <CSVImportContent />
    </Suspense>
  );
}

interface PreviewRecord {
  rowNum: number;
  data: Record<string, string>;
}

function CSVImportContent() {
  useRequireCompanyAdmin();
  const { refetch, products } = useInventory();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDryRunning, setIsDryRunning] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [dryRunResult, setDryRunResult] = useState<CSVImportResult | null>(null);
  const [finalImportResult, setFinalImportResult] = useState<CSVImportResult | null>(null);
  const [showGuide, setShowGuide] = useState(false);
  const [showSpecSheet, setShowSpecSheet] = useState(false);

  // Client-side instant preview state
  const [previewHeaders, setPreviewHeaders] = useState<string[]>([]);
  const [previewRows, setPreviewRows] = useState<PreviewRecord[]>([]);
  const [totalDetectedRows, setTotalDetectedRows] = useState<number>(0);

  // Template generator with comprehensive real-world sample data
  const handleDownloadTemplate = () => {
    const templateContent = [
      "sku,name,base_uom,cost_price,reorder_level,buffer_stock",
      "SKU-LP-0101,Dell Latitude 5420 i7 16GB 512GB SSD,pcs,850.00,5,2",
      "SKU-KB-0202,Logitech MX Mechanical Wireless Keyboard,pcs,120.00,10,5",
      "SKU-MO-0303,Dell UltraSharp 27-inch 4K IPS Monitor,pcs,380.00,4,2",
      "SKU-CB-0404,Cat6 Shielded Patch Cable 10-Meter,pcs,12.50,25,10",
      "SKU-HD-0505,Seagate IronWolf 4TB NAS Hard Drive,pcs,95.00,8,3",
    ].join("\r\n");

    downloadCSV(templateContent, "whoopit_products_import_template.csv");
    toast({
      title: "Template Downloaded",
      description: "Sample CSV template with UTF-8 BOM downloaded to your computer.",
      variant: "success",
    });
  };

  // Helper to parse CSV client-side for immediate inspection
  const parseCSVPreview = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (!text) return;

      // Clean BOM if present
      const cleanText = text.replace(/^\uFEFF/, "");
      const lines = cleanText.split(/\r?\n/).filter((l) => l.trim().length > 0);

      if (lines.length > 0) {
        // Parse header
        const headers = lines[0].split(",").map((h) => h.trim().replace(/^["']|["']$/g, ""));
        setPreviewHeaders(headers);

        // Parse first 6 preview rows
        const rows: PreviewRecord[] = [];
        const maxPreview = Math.min(lines.length - 1, 6);

        for (let i = 1; i <= maxPreview; i++) {
          const cells = lines[i].split(",").map((c) => c.trim().replace(/^["']|["']$/g, ""));
          const rowObj: Record<string, string> = {};
          headers.forEach((h, idx) => {
            rowObj[h] = cells[idx] || "";
          });
          rows.push({
            rowNum: i,
            data: rowObj,
          });
        }

        setPreviewRows(rows);
        setTotalDetectedRows(lines.length - 1);
      }
    };
    reader.readAsText(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      setSelectedFile(file);
      setDryRunResult(null);
      setFinalImportResult(null);
      parseCSVPreview(file);
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
        parseCSVPreview(file);
      } else {
        toast({
          title: "Invalid File Type",
          description: "Please upload a valid .csv spreadsheet file.",
          variant: "destructive",
        });
      }
    }
  };

  const handleClearFile = () => {
    setSelectedFile(null);
    setDryRunResult(null);
    setFinalImportResult(null);
    setPreviewHeaders([]);
    setPreviewRows([]);
    setTotalDetectedRows(0);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
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
            description: `Found ${res.data.errors.length} schema errors across ${res.data.total_rows} rows. Review the breakdown below.`,
            variant: "destructive",
          });
        } else {
          toast({
            title: "Validation Successful",
            description: `All ${res.data.total_rows} rows passed syntax and schema checks with 0 errors!`,
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
          description: `Successfully imported ${res.data.imported} products into your master catalog!`,
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
    <div className="space-y-6 max-w-7xl mx-auto pb-16 page-enter">
      {/* 1. Header Toolbar (2-Tier Spacious Architecture) */}
      <div className="page-hero space-y-2.5">
        {/* Tier 1: Title & Primary CTA */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-500/20 shadow-2xs">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 dark:text-white whitespace-nowrap">
                Bulk Excel/CSV Import
              </h1>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60 shadow-2xs whitespace-nowrap">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                Data Migration Engine
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleDownloadTemplate}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm hover:shadow transition-all cursor-pointer whitespace-nowrap"
              title="Download sample Excel/CSV template with pre-formatted headers"
            >
              <Download className="w-4 h-4 text-white" />
              <span>Download Sample CSV</span>
            </button>
          </div>
        </div>

        {/* Tier 2: Subtitle & Secondary Controls */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pt-0.5">
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-3xl leading-relaxed">
            Batch import corporate laptops, monitors, peripherals, and custom office hardware into the IT inventory in seconds using standardized spreadsheets.
          </p>

          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <button
              type="button"
              onClick={() => setShowSpecSheet(!showSpecSheet)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold shadow-2xs transition-all cursor-pointer whitespace-nowrap",
                showSpecSheet
                  ? "bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"
                  : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
              )}
              title="View CSV Column Schema & Specifications"
            >
              <Table className="w-3.5 h-3.5 text-slate-500" />
              <span>CSV Specs</span>
            </button>

            <button
              type="button"
              onClick={() => setShowGuide(!showGuide)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold shadow-2xs transition-all cursor-pointer whitespace-nowrap",
                showGuide
                  ? "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300"
                  : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
              )}
              title="Toggle Workflow Guide"
            >
              <Info className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>Guide</span>
            </button>

            <Link
              href="/products"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold shadow-2xs transition-all whitespace-nowrap"
              title="Go to Master Products Catalog"
            >
              <Layers className="w-3.5 h-3.5 text-slate-500" />
              <span>Catalog ({products.length})</span>
            </Link>
          </div>
        </div>
      </div>

      {/* 2. Collapsible Workflow Guide Banner */}
      {showGuide && (
        <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-emerald-500/10 via-teal-500/5 to-emerald-500/10 border border-emerald-500/20 relative animate-in fade-in duration-200">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 flex items-center justify-center shrink-0">
                <Info className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
                  3-Step Bulk Data Import Workflow
                </h3>
                <p className="text-[11px] text-slate-600 dark:text-slate-400">
                  Follow this straightforward sequence to safely migrate your product lists into Whoopit without data entry errors:
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowGuide(false)}
              className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg cursor-pointer"
              title="Dismiss guide"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4 pt-3 border-t border-emerald-500/15">
            <div className="p-3.5 rounded-xl bg-white/70 dark:bg-slate-900/70 border border-emerald-500/10 space-y-1">
              <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                <span className="w-4 h-4 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px] font-extrabold">1</span>
                <span>Download Sample Template</span>
              </span>
              <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                Download the official pre-formatted CSV template containing required columns and sample product rows.
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-white/70 dark:bg-slate-900/70 border border-emerald-500/10 space-y-1">
              <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider flex items-center gap-1.5">
                <span className="w-4 h-4 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px] font-extrabold">2</span>
                <span>Copy-Paste In Excel / Sheets</span>
              </span>
              <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                Paste your existing inventory into the sheet. Save as standard CSV (Comma Delimited) format.
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-white/70 dark:bg-slate-900/70 border border-emerald-500/10 space-y-1">
              <span className="text-[10px] font-bold text-purple-600 dark:text-purple-400 uppercase tracking-wider flex items-center gap-1.5">
                <span className="w-4 h-4 rounded-full bg-purple-600 text-white flex items-center justify-center text-[10px] font-extrabold">3</span>
                <span>Dry-Run Verify &amp; Commit</span>
              </span>
              <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                Upload below. First test with zero-risk Dry-Run validation, then commit all products in 1 click.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 3. Collapsible CSV Specification Sheet */}
      {showSpecSheet && (
        <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm animate-in fade-in duration-200 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Table className="w-4 h-4 text-emerald-600" />
              <span>Supported CSV Column Headers &amp; Data Types</span>
            </h3>
            <button
              onClick={() => setShowSpecSheet(false)}
              className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
            >
              Hide Specs
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-2.5 px-3">Column Header</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Data Type</th>
                  <th className="py-2.5 px-3">Sample Value</th>
                  <th className="py-2.5 px-3">Description</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                <tr>
                  <td className="py-2.5 px-3 font-mono font-bold text-emerald-700 dark:text-emerald-400">sku</td>
                  <td className="py-2.5 px-3">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800">
                      Required
                    </span>
                  </td>
                  <td className="py-2.5 px-3 font-mono text-slate-500">Text</td>
                  <td className="py-2.5 px-3 font-mono text-slate-700 dark:text-slate-300">SKU-LP-0101</td>
                  <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400">Unique identifier code for each product. Updates existing items if already registered.</td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 font-mono font-bold text-emerald-700 dark:text-emerald-400">name</td>
                  <td className="py-2.5 px-3">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800">
                      Required
                    </span>
                  </td>
                  <td className="py-2.5 px-3 font-mono text-slate-500">Text</td>
                  <td className="py-2.5 px-3 font-medium text-slate-800 dark:text-slate-200">Dell Latitude 5420 i7</td>
                  <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400">Official product name shown in the hardware catalog and custody records.</td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 font-mono font-bold text-slate-700 dark:text-slate-300">base_uom</td>
                  <td className="py-2.5 px-3">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700">
                      Optional
                    </span>
                  </td>
                  <td className="py-2.5 px-3 font-mono text-slate-500">Text</td>
                  <td className="py-2.5 px-3 font-mono text-slate-700 dark:text-slate-300">pcs, box, kg, meter</td>
                  <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400">Unit of measurement for stock tracking. Defaults to &quot;pcs&quot; if left empty.</td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 font-mono font-bold text-slate-700 dark:text-slate-300">cost_price</td>
                  <td className="py-2.5 px-3">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700">
                      Optional
                    </span>
                  </td>
                  <td className="py-2.5 px-3 font-mono text-slate-500">Decimal</td>
                  <td className="py-2.5 px-3 font-mono text-slate-700 dark:text-slate-300">850.00</td>
                  <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400">Unit purchase cost for inventory valuation and profit calculations.</td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 font-mono font-bold text-slate-700 dark:text-slate-300">reorder_level</td>
                  <td className="py-2.5 px-3">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700">
                      Optional
                    </span>
                  </td>
                  <td className="py-2.5 px-3 font-mono text-slate-500">Number</td>
                  <td className="py-2.5 px-3 font-mono text-slate-700 dark:text-slate-300">5</td>
                  <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400">Minimum threshold that triggers automated Low Stock alerts.</td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 font-mono font-bold text-slate-700 dark:text-slate-300">buffer_stock</td>
                  <td className="py-2.5 px-3">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700">
                      Optional
                    </span>
                  </td>
                  <td className="py-2.5 px-3 font-mono text-slate-500">Number</td>
                  <td className="py-2.5 px-3 font-mono text-slate-700 dark:text-slate-300">2</td>
                  <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400">Safety reserve quantity before stock is deemed critically depleted.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 4. Interactive Full-Width Upload Dropzone */}
      <div
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={() => {
          if (!selectedFile) {
            fileInputRef.current?.click();
          }
        }}
        className={cn(
          "p-8 sm:p-10 rounded-3xl border-2 border-dashed transition-all text-center flex flex-col items-center justify-center space-y-4 shadow-xs",
          selectedFile
            ? "border-emerald-500 bg-emerald-50/20 dark:bg-emerald-950/20"
            : "border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900/50 hover:border-emerald-500/70 hover:bg-slate-50/60 dark:hover:bg-slate-800/40 cursor-pointer"
        )}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          onChange={handleFileChange}
          className="hidden"
        />

        {selectedFile ? (
          <div className="w-full space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto shadow-xs border border-emerald-500/20">
              <FileCheck className="w-7 h-7" />
            </div>

            <div>
              <p className="font-bold text-slate-900 dark:text-white text-base sm:text-lg flex items-center justify-center gap-2">
                <span>{selectedFile.name}</span>
              </p>
              <div className="flex items-center justify-center gap-3 text-xs text-slate-500 dark:text-slate-400 mt-1">
                <span>{(selectedFile.size / 1024).toFixed(1)} KB</span>
                <span>&bull;</span>
                <span className="font-bold text-slate-700 dark:text-slate-300">
                  {totalDetectedRows} total data rows detected
                </span>
                <span>&bull;</span>
                <span className="text-emerald-600 dark:text-emerald-400 font-semibold">CSV Verified</span>
              </div>
            </div>

            <div className="flex items-center justify-center gap-2 pt-1">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  fileInputRef.current?.click();
                }}
                className="px-3.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors shadow-2xs cursor-pointer"
              >
                Choose Another File
              </button>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleClearFile();
                }}
                className="px-3.5 py-1.5 rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 text-xs font-semibold hover:bg-rose-100 dark:hover:bg-rose-950/60 transition-colors cursor-pointer"
              >
                Remove File
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto shadow-xs border border-emerald-500/20 group-hover:scale-105 transition-transform">
              <Upload className="w-8 h-8" />
            </div>

            <div>
              <p className="font-bold text-slate-900 dark:text-white text-base sm:text-lg">
                Click to browse or drag &amp; drop your CSV file here
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto">
                Upload comma-delimited spreadsheets up to 10MB. Required columns: <code className="text-[11px] font-mono bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded font-bold text-emerald-700 dark:text-emerald-400">sku</code> and <code className="text-[11px] font-mono bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded font-bold text-emerald-700 dark:text-emerald-400">name</code>.
              </p>
            </div>

            <div className="flex items-center justify-center gap-2 text-[11px] text-slate-400 pt-1">
              <span className="flex items-center gap-1">
                <Check className="w-3.5 h-3.5 text-emerald-500" />
                UTF-8 Encoded
              </span>
              <span>&bull;</span>
              <span className="flex items-center gap-1">
                <Check className="w-3.5 h-3.5 text-emerald-500" />
                Automatic Schema Validation
              </span>
              <span>&bull;</span>
              <span className="flex items-center gap-1">
                <Check className="w-3.5 h-3.5 text-emerald-500" />
                Duplicate SKU Protection
              </span>
            </div>
          </div>
        )}
      </div>

      {/* 5. Live In-Browser CSV Data Preview Table */}
      {selectedFile && previewRows.length > 0 && !finalImportResult && (
        <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden animate-in fade-in duration-200">
          <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50 dark:bg-slate-950/40">
            <div>
              <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Eye className="w-4 h-4 text-emerald-600" />
                <span>Pre-Flight Data Preview</span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20">
                  Showing first {previewRows.length} of {totalDetectedRows} rows
                </span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Inspect how column headers and records are mapped prior to executing import
              </p>
            </div>

            <span className="text-xs font-mono text-slate-400">
              Columns detected: {previewHeaders.length}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs min-w-[700px]">
              <thead className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-3 px-4 w-16">Row #</th>
                  {previewHeaders.map((header) => (
                    <th key={header} className="py-3 px-4 font-mono">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {previewRows.map((row) => (
                  <tr key={row.rowNum} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="py-2.5 px-4 font-mono font-bold text-slate-400 text-center">
                      #{row.rowNum}
                    </td>
                    {previewHeaders.map((header) => (
                      <td key={header} className="py-2.5 px-4 font-medium text-slate-800 dark:text-slate-200">
                        {row.data[header] || <span className="text-slate-400 italic">&mdash;</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 6. Action Execution Toolbar */}
      {selectedFile && !finalImportResult && (
        <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {dryRunResult ? (
              <span className="flex items-center gap-1.5 font-medium">
                {dryRunResult.errors && dryRunResult.errors.length > 0 ? (
                  <span className="text-rose-600 font-bold">⚠️ Correct errors in CSV before committing import</span>
                ) : (
                  <span className="text-emerald-600 font-bold">✓ Pre-flight validation passed! Ready to commit.</span>
                )}
              </span>
            ) : (
              <span>Tip: Run Step 1 validation first to ensure all SKUs and names are valid.</span>
            )}
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            {/* Step 1: Validate Dry-Run */}
            <button
              type="button"
              onClick={handleDryRun}
              disabled={isDryRunning || isImporting}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all shadow-2xs disabled:opacity-50 cursor-pointer"
            >
              {isDryRunning ? (
                <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
              ) : (
                <RefreshCw className="w-4 h-4 text-slate-500" />
              )}
              <span>Step 1: Validate / Dry-Run</span>
            </button>

            {/* Step 2: Commit Batch Import */}
            <button
              type="button"
              onClick={handleExecuteImport}
              disabled={
                isDryRunning ||
                isImporting ||
                Boolean(dryRunResult?.errors && dryRunResult.errors.length > 0)
              }
              className={cn(
                "flex-1 sm:flex-initial flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-white text-xs font-bold shadow-md transition-all cursor-pointer disabled:opacity-50",
                dryRunResult && (!dryRunResult.errors || dryRunResult.errors.length === 0)
                  ? "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20 animate-pulse"
                  : "bg-[#0c3843] hover:bg-[#082931] shadow-[#0c3843]/20"
              )}
            >
              {isImporting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Upload className="w-4 h-4" />
              )}
              <span>Step 2: Commit Batch Import</span>
            </button>
          </div>
        </div>
      )}

      {/* 7. Validation Dry-Run Results Card */}
      {dryRunResult && (
        <div className="space-y-4 animate-in fade-in duration-200">
          <div className="p-5 rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <FileCheck className="w-4 h-4 text-emerald-600" />
                <span>Pre-Flight Validation Report</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                  DRY RUN SIMULATION
                </span>
              </h3>
              <span className="text-xs text-slate-400 font-mono">
                Total Rows Checked: <strong>{dryRunResult.total_rows}</strong>
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20">
                <span className="text-xs font-semibold text-emerald-800 dark:text-emerald-300 block">
                  Valid Products Ready To Import
                </span>
                <span className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-1 block">
                  {dryRunResult.total_rows - (dryRunResult.errors?.length || 0)}
                </span>
                <span className="text-[11px] text-emerald-600/70">
                  Passed syntax, SKU uniqueness, and type checks
                </span>
              </div>

              <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20">
                <span className="text-xs font-semibold text-rose-800 dark:text-rose-300 block">
                  Syntax / Schema Errors
                </span>
                <span className="text-2xl font-extrabold text-rose-600 dark:text-rose-400 mt-1 block">
                  {dryRunResult.errors?.length || 0}
                </span>
                <span className="text-[11px] text-rose-600/70">
                  {dryRunResult.errors?.length || 0} rows require correction before import
                </span>
              </div>
            </div>

            {dryRunResult.errors && dryRunResult.errors.length > 0 ? (
              <div className="space-y-2 pt-2">
                <h4 className="text-xs font-bold text-rose-600 flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4" />
                  <span>Detailed Row Error Log:</span>
                </h4>
                <div className="max-h-56 overflow-y-auto rounded-2xl border border-rose-200 dark:border-rose-900/40 divide-y divide-rose-100 dark:divide-rose-900/20 text-xs">
                  {dryRunResult.errors.map((err, i) => (
                    <div key={i} className="p-3 flex items-center justify-between gap-4">
                      <span className="font-mono font-bold text-slate-500 shrink-0">Row #{err.row}</span>
                      <span className="font-mono font-bold text-rose-600 dark:text-rose-400 shrink-0 uppercase text-[11px]">
                        [{err.field}]
                      </span>
                      <span className="text-slate-700 dark:text-slate-300 text-right">{err.error}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300 p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>
                  All {dryRunResult.total_rows} rows passed syntax validation! You can now click &ldquo;Step 2: Commit Batch Import&rdquo; above.
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 8. Final Success Celebration Banner */}
      {finalImportResult && (
        <div className="p-8 sm:p-10 rounded-3xl bg-gradient-to-b from-emerald-500/15 via-teal-500/10 to-emerald-500/15 border border-emerald-500/30 text-center space-y-4 animate-in fade-in duration-200 shadow-sm">
          <div className="w-16 h-16 rounded-3xl bg-emerald-600 text-white flex items-center justify-center mx-auto shadow-lg shadow-emerald-600/30">
            <CheckCircle2 className="w-9 h-9" />
          </div>

          <div>
            <h3 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white">
              Catalog Batch Import Complete!
            </h3>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 mt-1 max-w-lg mx-auto">
              Successfully inserted and synchronized{" "}
              <strong className="font-bold text-emerald-600 dark:text-emerald-400 text-base">
                {finalImportResult.imported}
              </strong>{" "}
              products into your master inventory database.
            </p>
          </div>

          <div className="flex items-center justify-center gap-3 pt-4 flex-wrap">
            <button
              type="button"
              onClick={handleClearFile}
              className="px-5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors shadow-2xs cursor-pointer"
            >
              Upload Another CSV File
            </button>

            <Link
              href="/products"
              className="flex items-center gap-1.5 px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md shadow-emerald-600/20 transition-all cursor-pointer"
            >
              <PackagePlus className="w-4 h-4" />
              <span>View In Products Catalog</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
