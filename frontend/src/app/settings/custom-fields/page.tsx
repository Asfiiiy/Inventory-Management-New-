"use client";

import React, { useState, useEffect, Suspense, useMemo } from "react";
import Link from "next/link";
import {
  Sliders,
  Plus,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Layers,
  ShieldCheck,
  HelpCircle,
  Tag,
  Calendar,
  Hash,
  Type,
  ToggleLeft,
  Barcode,
  ListFilter,
  Search,
  X,
  Check,
  PackageCheck,
  Laptop,
  Shirt,
  Pill,
  Wrench,
  Eye,
  Info,
  ArrowRight,
} from "lucide-react";
import { apiClient, CustomFieldDefinition } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import { ModalPortal } from "@/components/ui/modal-portal";
import { useAuth } from "@/lib/auth-context";
import { useRequireCompanyAdmin } from "@/lib/use-require-company-admin";
import { useInventory } from "@/lib/inventory-store";
import { cn } from "@/lib/utils";

export default function CustomFieldsSettingsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-xs text-slate-400">Loading Schema Builder...</div>}>
      <CustomFieldsContent />
    </Suspense>
  );
}

// Office IT Hardware & Equipment Starter Templates
const INDUSTRY_PRESET_PACKS = [
  {
    id: "laptops_desktops",
    name: "Laptops & Desktops",
    icon: Laptop,
    badgeColor: "bg-blue-500/10 text-blue-600 border-blue-500/20",
    description: "Serial numbers, CPU, RAM, SSD specs, and warranty tracking for office computers",
    fields: [
      { name: "Serial Number / Service Tag", type: "text", required: true },
      { name: "RAM Capacity", type: "dropdown", options: ["8GB", "16GB", "32GB", "64GB"], required: false },
      { name: "Storage (SSD/NVMe)", type: "dropdown", options: ["256GB SSD", "512GB SSD", "1TB NVMe", "2TB NVMe"], required: false },
      { name: "Warranty Expiry Date", type: "date", required: false },
    ],
  },
  {
    id: "monitors_displays",
    name: "LCD Monitors & Displays",
    icon: Eye,
    badgeColor: "bg-purple-500/10 text-purple-600 border-purple-500/20",
    description: "Screen sizes, panel resolution, refresh rate, and input ports for office displays",
    fields: [
      { name: "Screen Size (Inches)", type: "dropdown", options: ["22 Inch", "24 Inch", "27 Inch", "32 Inch", "34 Ultrawide"], required: true },
      { name: "Resolution", type: "dropdown", options: ["1080p Full HD", "1440p QHD", "4K UHD"], required: false },
      { name: "Display Ports", type: "dropdown", options: ["HDMI + DP", "USB-C + HDMI", "HDMI + VGA"], required: false },
      { name: "Asset Tag Code", type: "text", required: false },
    ],
  },
  {
    id: "peripherals_accessories",
    name: "Mice, Keyboards & Audio",
    icon: Tag,
    badgeColor: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
    description: "Connectivity type, switch style, and compatibility for office peripherals",
    fields: [
      { name: "Connectivity", type: "dropdown", options: ["Wired USB", "Wireless 2.4GHz Dongle", "Bluetooth Multi-Device", "USB-C"], required: true },
      { name: "Device Color", type: "dropdown", options: ["Matte Black", "Space Grey", "Silver / White", "Graphite"], required: false },
      { name: "Battery Type", type: "dropdown", options: ["Rechargeable Li-Ion", "AA / AAA Battery", "Wired (No Battery)"], required: false },
    ],
  },
  {
    id: "networking_office",
    name: "Networking & Custom Office Gear",
    icon: Wrench,
    badgeColor: "bg-amber-500/10 text-amber-600 border-amber-500/20",
    description: "MAC addresses, port counts, office floor location, and vendor service info",
    fields: [
      { name: "MAC Address / Serial", type: "text", required: true },
      { name: "Office Floor / Room", type: "dropdown", options: ["Ground Floor", "1st Floor", "2nd Floor", "Server Room", "Reception"], required: false },
      { name: "Equipment Condition", type: "dropdown", options: ["Brand New", "Good Working", "Refurbished / Repaired"], required: false },
      { name: "Support Vendor Name", type: "text", required: false },
    ],
  },
];

const DATA_TYPES = [
  {
    type: "text",
    label: "Text",
    desc: "Single-line string (Serial, Model, Brand)",
    icon: Type,
    badgeClass: "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800",
  },
  {
    type: "dropdown",
    label: "Dropdown",
    desc: "Predefined list of selectable choices",
    icon: ListFilter,
    badgeClass: "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800",
  },
  {
    type: "date",
    label: "Date",
    desc: "ISO calendar date (Expiry, Manufacture)",
    icon: Calendar,
    badgeClass: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800",
  },
  {
    type: "number",
    label: "Integer",
    desc: "Whole numbers (Count, Months, Pin)",
    icon: Hash,
    badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800",
  },
  {
    type: "decimal",
    label: "Decimal",
    desc: "Fractional numbers (Weight, Dimensions)",
    icon: Hash,
    badgeClass: "bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-800",
  },
  {
    type: "boolean",
    label: "Yes / No",
    desc: "Binary toggle switch (Fragile, Waterproof)",
    icon: ToggleLeft,
    badgeClass: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800",
  },
  {
    type: "barcode",
    label: "Barcode",
    desc: "Secondary scannable barcode or serial",
    icon: Barcode,
    badgeClass: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800",
  },
];

function CustomFieldsContent() {
  const { toast } = useToast();
  const { isAdmin } = useAuth();
  useRequireCompanyAdmin();
  const { products } = useInventory();

  const [fields, setFields] = useState<CustomFieldDefinition[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showGuide, setShowGuide] = useState(true);
  const [showPresets, setShowPresets] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [deleteFieldConfirm, setDeleteFieldConfirm] = useState<CustomFieldDefinition | null>(null);

  // New Field Form State
  const [fieldName, setFieldName] = useState("");
  const [fieldType, setFieldType] = useState("text");
  const [dropdownOptions, setDropdownOptions] = useState<string[]>([]);
  const [optionInput, setOptionInput] = useState("");
  const [isRequired, setIsRequired] = useState(false);

  const fetchFields = async () => {
    setIsLoading(true);
    try {
      const res = await apiClient.customFields.list();
      if (res.success && res.data) {
        setFields(res.data);
      }
    } catch (err: any) {
      toast({
        title: "Load Error",
        description: err?.message || "Failed to load custom fields",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchFields();
  }, []);

  const handleOpenAddModal = (initialData?: { name?: string; type?: string; options?: string[]; required?: boolean }) => {
    setFieldName(initialData?.name || "");
    setFieldType(initialData?.type || "text");
    setDropdownOptions(initialData?.options || []);
    setOptionInput("");
    setIsRequired(initialData?.required ?? false);
    setIsModalOpen(true);
  };

  const handleAddOption = () => {
    const trimmed = optionInput.trim();
    if (!trimmed) return;
    if (dropdownOptions.includes(trimmed)) {
      toast({
        title: "Duplicate Option",
        description: `"${trimmed}" is already added to options.`,
        variant: "destructive",
      });
      return;
    }
    setDropdownOptions([...dropdownOptions, trimmed]);
    setOptionInput("");
  };

  const handleRemoveOption = (indexToRemove: number) => {
    setDropdownOptions(dropdownOptions.filter((_, idx) => idx !== indexToRemove));
  };

  const handleKeyDownOption = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      handleAddOption();
    }
  };

  const handleCreateField = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = fieldName.trim();
    if (!trimmedName) {
      toast({
        title: "Validation Error",
        description: "Field name cannot be empty.",
        variant: "destructive",
      });
      return;
    }

    if (fieldType === "dropdown" && dropdownOptions.length === 0) {
      toast({
        title: "Dropdown Options Required",
        description: "Please add at least one option for the dropdown list.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await apiClient.customFields.create({
        field_name: trimmedName,
        field_type: fieldType,
        dropdown_options: fieldType === "dropdown" ? dropdownOptions : [],
        is_required: isRequired,
      });

      if (res.success && res.data) {
        toast({
          title: "Custom Field Created",
          description: `Field "${trimmedName}" is now active across your product catalog.`,
          variant: "success",
        });
        setIsModalOpen(false);
        setFieldName("");
        setFieldType("text");
        setDropdownOptions([]);
        setOptionInput("");
        setIsRequired(false);
        await fetchFields();
      }
    } catch (err: any) {
      toast({
        title: "Creation Failed",
        description: err?.problem?.detail || err.message || "Failed to create field",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteField = async () => {
    if (!deleteFieldConfirm) return;
    try {
      await apiClient.customFields.delete(deleteFieldConfirm.field_id);
      toast({
        title: "Field Deleted",
        description: `Custom field "${deleteFieldConfirm.field_name}" removed from schema.`,
        variant: "success",
      });
      setDeleteFieldConfirm(null);
      await fetchFields();
    } catch (err: any) {
      toast({
        title: "Delete Failed",
        description: err?.problem?.detail || err.message || "Could not delete field",
        variant: "destructive",
      });
    }
  };

  // Filtered fields list
  const filteredFields = useMemo(() => {
    return fields.filter((f) => {
      const matchesSearch =
        f.field_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        f.field_type.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesType = typeFilter === "ALL" || f.field_type.toLowerCase() === typeFilter.toLowerCase();
      return matchesSearch && matchesType;
    });
  }, [fields, searchTerm, typeFilter]);

  // KPI Calculations
  const mandatoryCount = useMemo(() => fields.filter((f) => f.is_required).length, [fields]);
  const dropdownCount = useMemo(() => fields.filter((f) => f.field_type === "dropdown").length, [fields]);

  const getFieldTypeBadge = (type: string) => {
    const found = DATA_TYPES.find((d) => d.type === type.toLowerCase());
    const Icon = found?.icon || Type;
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold border whitespace-nowrap shadow-2xs",
          found?.badgeClass || "bg-slate-100 text-slate-700 border-slate-200"
        )}
      >
        <Icon className="w-3.5 h-3.5 shrink-0" />
        <span className="capitalize">{found?.label || type}</span>
      </span>
    );
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16 page-enter">
      {/* 1. Header Toolbar (2-Tier Spacious Architecture) */}
      <div className="page-hero space-y-2.5">
        {/* Tier 1: Title & Primary CTA */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-teal-500/10 text-[#0c3843] dark:text-teal-400 flex items-center justify-center shrink-0 border border-teal-500/20 shadow-2xs">
              <Sliders className="w-5 h-5" />
            </div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 dark:text-white whitespace-nowrap">
                Custom Hardware Specs
              </h1>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-[#0c3843]/10 text-[#0c3843] dark:text-teal-300 border border-[#0c3843]/20 shadow-2xs whitespace-nowrap">
                <ShieldCheck className="w-3.5 h-3.5 text-[#0c3843] dark:text-teal-400" />
                Tenant Scoped Schema
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => handleOpenAddModal()}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#0c3843] hover:bg-[#082931] text-white text-xs font-bold shadow-sm hover:shadow transition-all cursor-pointer whitespace-nowrap"
              title="Create a new custom hardware attribute"
            >
              <Plus className="w-4 h-4 text-cyan-300" />
              <span>Add Custom Field</span>
            </button>
          </div>
        </div>

        {/* Tier 2: Subtitle & Secondary Controls */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pt-0.5">
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-3xl leading-relaxed">
            Define dynamic enterprise hardware specifications like Serial Numbers, MAC Addresses, RAM, Storage (SSD), and Asset Tags across all devices.
          </p>

          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <button
              type="button"
              onClick={() => setShowPresets(!showPresets)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold shadow-2xs transition-all cursor-pointer whitespace-nowrap",
                showPresets
                  ? "bg-purple-50 dark:bg-purple-950/40 border-purple-300 dark:border-purple-800 text-purple-700 dark:text-purple-300"
                  : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
              )}
              title="Explore industry starter templates"
            >
              <PackageCheck className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
              <span>Presets</span>
            </button>

            <button
              type="button"
              onClick={() => setShowGuide(!showGuide)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold shadow-2xs transition-all cursor-pointer whitespace-nowrap",
                showGuide
                  ? "bg-teal-50 dark:bg-teal-950/40 border-teal-300 dark:border-teal-800 text-teal-700 dark:text-teal-300"
                  : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
              )}
              title="Toggle Schema Guide"
            >
              <Info className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
              <span>Guide</span>
            </button>

            <Link
              href="/products"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold shadow-2xs transition-all whitespace-nowrap"
              title="Go to Products Catalog"
            >
              <Layers className="w-3.5 h-3.5 text-slate-500" />
              <span>Catalog ({products.length})</span>
            </Link>

            <button
              type="button"
              onClick={fetchFields}
              disabled={isLoading}
              className="p-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-50 text-xs font-semibold shadow-2xs transition-all cursor-pointer disabled:opacity-50"
              title="Refresh custom fields schema"
            >
              <RefreshCw className={cn("w-4 h-4 text-[#0c3843]", isLoading && "animate-spin")} />
            </button>
          </div>
        </div>
      </div>

      {/* 2. Four Master KPI Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Configured Fields */}
        <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs flex items-center justify-between transition-all hover:border-[#0c3843]/30">
          <div>
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Configured Attributes</span>
            <div className="text-2xl font-extrabold text-slate-900 dark:text-white mt-1">
              {fields.length}
            </div>
            <span className="text-[11px] text-slate-400">Dynamic catalog fields</span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-[#0c3843]/10 text-[#0c3843] dark:text-teal-400 flex items-center justify-center border border-[#0c3843]/20">
            <Sliders className="w-6 h-6" />
          </div>
        </div>

        {/* Card 2: Mandatory Fields */}
        <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs flex items-center justify-between transition-all hover:border-rose-500/30">
          <div>
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Mandatory Rules</span>
            <div className="text-2xl font-extrabold text-rose-600 dark:text-rose-400 mt-1">
              {mandatoryCount}
            </div>
            <span className="text-[11px] text-slate-400">Required on item creation</span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center border border-rose-500/20">
            <CheckCircle2 className="w-6 h-6" />
          </div>
        </div>

        {/* Card 3: Dropdown Selectors */}
        <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs flex items-center justify-between transition-all hover:border-purple-500/30">
          <div>
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Dropdown Lists</span>
            <div className="text-2xl font-extrabold text-purple-600 dark:text-purple-400 mt-1">
              {dropdownCount}
            </div>
            <span className="text-[11px] text-slate-400">Preset choice selectors</span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center border border-purple-500/20">
            <ListFilter className="w-6 h-6" />
          </div>
        </div>

        {/* Card 4: Schema Sync Engine */}
        <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs flex items-center justify-between transition-all hover:border-emerald-500/30">
          <div>
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">PostgreSQL JSONB</span>
            <div className="text-sm font-bold text-emerald-600 dark:text-emerald-400 mt-2 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Schema Active</span>
            </div>
            <span className="text-[11px] text-slate-400">Zero-downtime alterations</span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center border border-emerald-500/20">
            <CheckCircle2 className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* 3. Collapsible Workflow Guide Banner */}
      {showGuide && (
        <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-[#0c3843]/10 via-teal-500/5 to-indigo-500/10 border border-[#0c3843]/20 relative animate-in fade-in duration-200">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-[#0c3843]/20 text-[#0c3843] dark:text-teal-300 flex items-center justify-center shrink-0">
                <Info className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
                  How Dynamic Product Specifications Work
                </h3>
                <p className="text-[11px] text-slate-600 dark:text-slate-400">
                  Add the extra hardware details this office tracks, without a database change:
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

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4 pt-3 border-t border-[#0c3843]/15">
            <div className="p-3.5 rounded-xl bg-white/70 dark:bg-slate-900/70 border border-[#0c3843]/10 space-y-1">
              <span className="text-[10px] font-bold text-[#0c3843] dark:text-teal-400 uppercase tracking-wider flex items-center gap-1.5">
                <span className="w-4 h-4 rounded-full bg-[#0c3843] text-white flex items-center justify-center text-[10px] font-extrabold">1</span>
                <span>Define Specific Fields</span>
              </span>
              <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                Add the specs this office needs, such as serial number, RAM, MAC address, or SSD size.
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-white/70 dark:bg-slate-900/70 border border-[#0c3843]/10 space-y-1">
              <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider flex items-center gap-1.5">
                <span className="w-4 h-4 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px] font-extrabold">2</span>
                <span>Auto-Appears In Product Form</span>
              </span>
              <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                When staff adds or edits an item on the Products page, these fields automatically appear in the form.
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-white/70 dark:bg-slate-900/70 border border-[#0c3843]/10 space-y-1">
              <span className="text-[10px] font-bold text-purple-600 dark:text-purple-400 uppercase tracking-wider flex items-center gap-1.5">
                <span className="w-4 h-4 rounded-full bg-purple-600 text-white flex items-center justify-center text-[10px] font-extrabold">3</span>
                <span>Dossiers &amp; Barcode Printing</span>
              </span>
              <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                Specifications display in the 360° product dossier drawer and can be encoded into physical thermal barcode stickers.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 4. Collapsible Industry Starter Packs */}
      {showPresets && (
        <div className="p-5 rounded-3xl border border-purple-500/20 bg-gradient-to-br from-purple-500/5 via-white dark:via-slate-900 to-indigo-500/5 shadow-sm space-y-4 animate-in fade-in duration-200">
          <div className="flex items-center justify-between pb-3 border-b border-purple-500/15">
            <div className="flex items-center gap-2">
              <PackageCheck className="w-5 h-5 text-purple-600" />
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Quick Industry Starter Bundles
                </h3>
                <p className="text-xs text-slate-500">
                  Click on any recommended field to instantly pre-fill and add it to your schema
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowPresets(false)}
              className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
            >
              Close Presets
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {INDUSTRY_PRESET_PACKS.map((pack) => {
              const Icon = pack.icon;
              return (
                <div
                  key={pack.id}
                  className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs space-y-2.5 flex flex-col justify-between"
                >
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
                        <Icon className="w-4 h-4" />
                      </div>
                      <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                        {pack.name}
                      </h4>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                      {pack.description}
                    </p>

                    <div className="space-y-1.5 pt-1">
                      {pack.fields.map((f, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() =>
                            handleOpenAddModal({
                              name: f.name,
                              type: f.type,
                              options: f.options,
                              required: f.required,
                            })
                          }
                          className="w-full text-left p-1.5 rounded-lg bg-slate-50 dark:bg-slate-950/60 hover:bg-purple-50 dark:hover:bg-purple-950/40 border border-slate-200/60 dark:border-slate-800 text-[11px] font-medium text-slate-700 dark:text-slate-300 transition-colors flex items-center justify-between cursor-pointer group"
                        >
                          <span className="truncate">{f.name}</span>
                          <span className="text-[10px] font-mono text-purple-600 group-hover:translate-x-0.5 transition-transform">
                            Add
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 5. Search and Multi-Type Filter Toolbar */}
      <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
        {/* Type Toggle Tabs */}
        <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 overflow-x-auto w-full sm:w-fit">
          <button
            type="button"
            onClick={() => setTypeFilter("ALL")}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap",
              typeFilter === "ALL"
                ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs"
                : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
            )}
          >
            <span>All Attributes</span>
            <span className="px-1.5 py-0.2 rounded-full bg-slate-200 dark:bg-slate-700 text-[10px]">
              {fields.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setTypeFilter("text")}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap",
              typeFilter === "text"
                ? "bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-xs"
                : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
            )}
          >
            <Type className="w-3.5 h-3.5 text-indigo-500" />
            <span>Text</span>
          </button>

          <button
            type="button"
            onClick={() => setTypeFilter("dropdown")}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap",
              typeFilter === "dropdown"
                ? "bg-white dark:bg-slate-800 text-purple-600 dark:text-purple-400 shadow-xs"
                : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
            )}
          >
            <ListFilter className="w-3.5 h-3.5 text-purple-500" />
            <span>Dropdown</span>
          </button>

          <button
            type="button"
            onClick={() => setTypeFilter("date")}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap",
              typeFilter === "date"
                ? "bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-xs"
                : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
            )}
          >
            <Calendar className="w-3.5 h-3.5 text-blue-500" />
            <span>Date</span>
          </button>

          <button
            type="button"
            onClick={() => setTypeFilter("number")}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap",
              typeFilter === "number"
                ? "bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 shadow-xs"
                : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
            )}
          >
            <Hash className="w-3.5 h-3.5 text-emerald-500" />
            <span>Numeric</span>
          </button>
        </div>

        {/* Search Input */}
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search custom fields..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-8 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-[#0c3843] focus:ring-2 focus:ring-[#0c3843]/15 outline-none text-slate-900 dark:text-white placeholder:text-slate-400"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* 6. Master Custom Fields Schema Table */}
      <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
        {/* Table Top Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50 dark:bg-slate-950/40">
          <div>
            <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <span>Configured Product Attributes</span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-[#0c3843]/10 text-[#0c3843] dark:text-teal-300 border border-[#0c3843]/20">
                {filteredFields.length} active fields
              </span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Attributes dynamically injected into all catalog forms, product dossiers, and barcode thermal tags
            </p>
          </div>

          <span className="text-xs font-mono text-slate-400">
            Tenant ID: Organization Scoped
          </span>
        </div>

        {/* Table Content */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs min-w-[950px]">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-500 font-bold uppercase tracking-wider text-[11px]">
                <th className="py-3.5 px-5 font-bold whitespace-nowrap min-w-[220px]">Field Name &amp; Key</th>
                <th className="py-3.5 px-4 font-bold whitespace-nowrap w-36">Data Type</th>
                <th className="py-3.5 px-4 font-bold whitespace-nowrap min-w-[280px]">Options &amp; Constraints</th>
                <th className="py-3.5 px-4 font-bold text-center whitespace-nowrap w-32">Requirement</th>
                <th className="py-3.5 px-4 font-bold text-center whitespace-nowrap w-36">Created On</th>
                <th className="py-3.5 px-5 font-bold text-right whitespace-nowrap w-24">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredFields.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-16 text-center text-slate-400">
                    <div className="max-w-md mx-auto space-y-3">
                      <div className="w-14 h-14 rounded-2xl bg-[#0c3843]/10 text-[#0c3843] dark:text-teal-400 flex items-center justify-center mx-auto border border-[#0c3843]/20">
                        <Sliders className="w-7 h-7" />
                      </div>
                      <h4 className="text-base font-bold text-slate-700 dark:text-slate-300">
                        {searchTerm || typeFilter !== "ALL"
                          ? "No custom fields match your filter criteria."
                          : "No custom product fields configured yet."}
                      </h4>
                      <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                        Standard attributes (Name, SKU, Price, Unit, Stock) already work out of the box. Add custom specifications like Serial Numbers, Color, or Expiry Dates whenever needed.
                      </p>

                      <div className="pt-2 flex items-center justify-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleOpenAddModal()}
                          className="px-4 py-2 rounded-xl bg-[#0c3843] hover:bg-[#082931] text-white text-xs font-bold shadow-xs cursor-pointer"
                        >
                          Add First Custom Field
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowPresets(true)}
                          className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 cursor-pointer"
                        >
                          Load Industry Preset
                        </button>
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredFields.map((f) => {
                  return (
                    <tr
                      key={f.field_id}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors"
                    >
                      {/* Name & Key */}
                      <td className="py-3.5 px-5 align-middle">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 font-bold text-xs bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 shadow-2xs">
                            <Tag className="w-4 h-4 text-[#0c3843] dark:text-teal-400" />
                          </div>
                          <div className="min-w-0">
                            <div className="font-bold text-slate-900 dark:text-white text-xs sm:text-sm whitespace-nowrap">
                              {f.field_name}
                            </div>
                            <div className="text-[11px] font-mono text-slate-400 whitespace-nowrap">
                              key: {f.field_name.toLowerCase().replace(/\s+/g, "_")}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Type */}
                      <td className="py-3.5 px-4 align-middle whitespace-nowrap">
                        {getFieldTypeBadge(f.field_type)}
                      </td>

                      {/* Options / Constraints */}
                      <td className="py-3.5 px-4 align-middle">
                        {f.field_type === "dropdown" && f.dropdown_options && f.dropdown_options.length > 0 ? (
                          <div className="flex flex-wrap items-center gap-1.5 max-w-md">
                            {f.dropdown_options.map((opt, i) => (
                              <span
                                key={i}
                                className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-500/20 whitespace-nowrap"
                              >
                                {opt}
                              </span>
                            ))}
                            <span className="text-[10px] text-slate-400 font-mono">
                              ({f.dropdown_options.length} choices)
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-500 dark:text-slate-400 text-xs flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                            <span>Standard validation schema</span>
                          </span>
                        )}
                      </td>

                      {/* Requirement */}
                      <td className="py-3.5 px-4 align-middle text-center whitespace-nowrap">
                        {f.is_required ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/20 shadow-2xs">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                            <span>Mandatory</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                            Optional
                          </span>
                        )}
                      </td>

                      {/* Created At */}
                      <td className="py-3.5 px-4 align-middle text-center text-slate-500 text-xs font-mono whitespace-nowrap">
                        {f.created_at ? new Date(f.created_at).toLocaleDateString() : "Active"}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-5 align-middle text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setDeleteFieldConfirm(f)}
                            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                            title="Delete custom field"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
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

      {/* 7. Add Custom Field Modal Dialog */}
      {isModalOpen && (
        <ModalPortal>
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-[100] animate-in fade-in duration-150">
          <div className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-[#0c3843]/10 text-[#0c3843] dark:text-teal-400 flex items-center justify-center border border-[#0c3843]/20">
                  <Sliders className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Add Custom Product Attribute
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Define dynamic attribute injected into product catalog forms
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleCreateField} className="p-6 space-y-5 overflow-y-auto">
              {/* Field Display Name */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Attribute Display Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Serial Number, RAM Capacity, Expiry Date, Fabric"
                  value={fieldName}
                  onChange={(e) => setFieldName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-[#0c3843] focus:ring-2 focus:ring-[#0c3843]/15 font-medium"
                  required
                  autoFocus
                />
              </div>

              {/* Visual Data Type Selection Grid */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Select Data Type <span className="text-rose-500">*</span>
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {DATA_TYPES.map((dt) => {
                    const Icon = dt.icon;
                    const isSelected = fieldType === dt.type;
                    return (
                      <button
                        key={dt.type}
                        type="button"
                        onClick={() => setFieldType(dt.type)}
                        className={cn(
                          "p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between",
                          isSelected
                            ? "border-[#0c3843] dark:border-teal-400 bg-[#0c3843]/5 dark:bg-teal-950/20 ring-1 ring-[#0c3843]/20 shadow-xs"
                            : "border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-900"
                        )}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <Icon
                            className={cn(
                              "w-4 h-4",
                              isSelected ? "text-[#0c3843] dark:text-teal-400" : "text-slate-400"
                            )}
                          />
                          {isSelected && <Check className="w-3.5 h-3.5 text-[#0c3843] dark:text-teal-400 font-bold" />}
                        </div>
                        <div className="text-xs font-bold text-slate-900 dark:text-white">
                          {dt.label}
                        </div>
                        <div className="text-[10px] text-slate-400 line-clamp-1 mt-0.5">
                          {dt.desc}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Dropdown Options Builder (If dropdown is selected) */}
              {fieldType === "dropdown" && (
                <div className="p-4 rounded-2xl bg-purple-500/5 border border-purple-500/20 space-y-3">
                  <label className="block text-xs font-bold text-purple-900 dark:text-purple-300">
                    Dropdown Select Options <span className="text-rose-500">*</span>
                  </label>

                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="Type option (e.g. 16GB) & press Enter"
                      value={optionInput}
                      onChange={(e) => setOptionInput(e.target.value)}
                      onKeyDown={handleKeyDownOption}
                      className="flex-1 px-3 py-2 rounded-xl text-xs bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-purple-500"
                    />
                    <button
                      type="button"
                      onClick={handleAddOption}
                      className="px-3 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold shadow-xs cursor-pointer"
                    >
                      Add
                    </button>
                  </div>

                  {dropdownOptions.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {dropdownOptions.map((opt, idx) => (
                        <span
                          key={idx}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-white dark:bg-slate-900 text-purple-700 dark:text-purple-300 border border-purple-300 dark:border-purple-800 shadow-2xs"
                        >
                          <span>{opt}</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveOption(idx)}
                            className="text-slate-400 hover:text-rose-600 cursor-pointer"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[11px] text-purple-600/70 italic">
                      No options added yet. Type an option above and press Enter.
                    </p>
                  )}
                </div>
              )}

              {/* Requirement Checkbox */}
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-bold text-slate-900 dark:text-white">
                    Mandatory Attribute (Required)
                  </div>
                  <div className="text-[11px] text-slate-400">
                    If checked, staff cannot save a new product without filling this field
                  </div>
                </div>

                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isRequired}
                    onChange={(e) => setIsRequired(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-[#0c3843]"></div>
                </label>
              </div>

              {/* Live Preview Widget */}
              <div className="p-3.5 rounded-2xl bg-slate-50/80 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800 space-y-1.5">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                  <Eye className="w-3 h-3" />
                  <span>Preview In Product Creation Form</span>
                </span>
                <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 space-y-1">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                    <span>{fieldName || "Attribute Name"}</span>
                    {isRequired && <span className="text-rose-500">*</span>}
                  </label>
                  {fieldType === "dropdown" ? (
                    <select
                      disabled
                      className="w-full px-3 py-1.5 rounded-lg text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-500"
                    >
                      <option>
                        {dropdownOptions.length > 0 ? `-- Select ${fieldName || "Option"} --` : "No options defined"}
                      </option>
                      {dropdownOptions.map((opt, i) => (
                        <option key={i}>{opt}</option>
                      ))}
                    </select>
                  ) : fieldType === "date" ? (
                    <input
                      type="date"
                      disabled
                      className="w-full px-3 py-1.5 rounded-lg text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-400"
                    />
                  ) : fieldType === "boolean" ? (
                    <div className="flex items-center gap-2 pt-1">
                      <input type="checkbox" disabled className="rounded text-[#0c3843]" />
                      <span className="text-xs text-slate-500">Yes / Active</span>
                    </div>
                  ) : (
                    <input
                      type="text"
                      disabled
                      placeholder={`Enter ${fieldName || "value"}...`}
                      className="w-full px-3 py-1.5 rounded-lg text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-400"
                    />
                  )}
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2.5 rounded-xl bg-[#0c3843] hover:bg-[#082931] text-white text-xs font-bold shadow-md shadow-[#0c3843]/20 transition-all disabled:opacity-50 cursor-pointer"
                >
                  {isSubmitting ? "Creating Field..." : "Save Custom Field"}
                </button>
              </div>
            </form>
          </div>
        </div>
        </ModalPortal>
      )}

      {/* 8. Delete Confirmation Dialog */}
      {deleteFieldConfirm && (
        <ModalPortal>
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-[100] animate-in fade-in duration-150">
          <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl p-6 text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/10 text-rose-600 flex items-center justify-center mx-auto border border-rose-500/20">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Delete Custom Field?
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Are you sure you want to delete <strong className="text-slate-800 dark:text-slate-200">&ldquo;{deleteFieldConfirm.field_name}&rdquo;</strong>? Existing products will retain their saved values in JSONB, but this attribute will no longer be prompted on new product forms.
              </p>
            </div>

            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteFieldConfirm(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteField}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-xs cursor-pointer"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
        </ModalPortal>
      )}
    </div>
  );
}
