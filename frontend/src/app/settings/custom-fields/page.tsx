"use client";

import React, { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import {
  Sliders,
  Plus,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Layers,
  Sparkles,
  HelpCircle,
  Tag,
  Calendar,
  Hash,
  Type,
  ToggleLeft,
  Barcode,
  ListFilter,
} from "lucide-react";
import { apiClient, CustomFieldDefinition } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

export default function CustomFieldsSettingsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-xs text-slate-400">Loading Schema Builder...</div>}>
      <CustomFieldsContent />
    </Suspense>
  );
}

function CustomFieldsContent() {
  const { toast } = useToast();
  const { isAdmin } = useAuth();

  const [fields, setFields] = useState<CustomFieldDefinition[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // New Field Form State
  const [fieldName, setFieldName] = useState("");
  const [fieldType, setFieldType] = useState("text");
  const [dropdownOptionsInput, setDropdownOptionsInput] = useState("");
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

    let options: string[] = [];
    if (fieldType === "dropdown") {
      options = dropdownOptionsInput
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      if (options.length === 0) {
        toast({
          title: "Dropdown Options Required",
          description: "Please specify at least one option separated by commas.",
          variant: "destructive",
        });
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const res = await apiClient.customFields.create({
        field_name: trimmedName,
        field_type: fieldType,
        dropdown_options: options,
        is_required: isRequired,
      });

      if (res.success && res.data) {
        toast({
          title: "Custom Field Created",
          description: `Field "${trimmedName}" added to organization schema.`,
        });
        setIsModalOpen(false);
        setFieldName("");
        setFieldType("text");
        setDropdownOptionsInput("");
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

  const handleDeleteField = async (fieldId: string, name: string) => {
    if (!confirm(`Are you sure you want to delete custom field "${name}"?`)) return;

    try {
      await apiClient.customFields.delete(fieldId);
      toast({
        title: "Field Deleted",
        description: `Custom field "${name}" removed.`,
      });
      await fetchFields();
    } catch (err: any) {
      toast({
        title: "Delete Failed",
        description: err?.problem?.detail || err.message || "Could not delete field",
        variant: "destructive",
      });
    }
  };

  const getFieldTypeIcon = (type: string) => {
    switch (type) {
      case "number":
      case "decimal":
        return <Hash className="w-4 h-4 text-emerald-500" />;
      case "date":
        return <Calendar className="w-4 h-4 text-blue-500" />;
      case "dropdown":
        return <ListFilter className="w-4 h-4 text-purple-500" />;
      case "boolean":
        return <ToggleLeft className="w-4 h-4 text-amber-500" />;
      case "barcode":
        return <Barcode className="w-4 h-4 text-rose-500" />;
      default:
        return <Type className="w-4 h-4 text-indigo-500" />;
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider mb-1">
            <Sliders className="w-4 h-4" />
            <span>Master Data Customization</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Dynamic Custom Field Builder
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Extend catalog items with organization-specific attributes enforced by PostgreSQL JSONB schema validator.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => fetchFields()}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/80 transition-colors shadow-xs cursor-pointer"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", isLoading && "animate-spin")} />
            <span>Refresh</span>
          </button>

          {isAdmin && (
            <button
              onClick={() => setIsModalOpen(true)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#0c3843] hover:bg-[#082931] text-white text-xs font-semibold shadow-md shadow-[#0c3843]/20 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Add Custom Field</span>
            </button>
          )}
        </div>
      </div>

      {/* Explanatory Banner */}
      <div className="p-4 rounded-2xl bg-indigo-50/50 dark:bg-indigo-950/30 border border-indigo-200/60 dark:border-indigo-800/50 text-xs flex items-start gap-3 text-slate-700 dark:text-slate-300">
        <Sparkles className="w-5 h-5 text-indigo-500 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-semibold text-indigo-950 dark:text-indigo-200">
            Phase B3 Dynamic Attribute Validator Active
          </p>
          <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
            Fields defined here are automatically evaluated when creating or updating products. Required fields will reject invalid payloads with RFC 7807 problem details (HTTP 422) if omitted or malformed.
          </p>
        </div>
      </div>

      {/* Fields List Table */}
      <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/50 shadow-xs overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <span>Configured Custom Fields</span>
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
              {fields.length}
            </span>
          </h3>
          <span className="text-xs text-slate-400">Tenant Scoped</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-left text-xs">
            <thead className="bg-slate-50/75 dark:bg-slate-900 text-slate-500 border-b border-slate-200/80 dark:border-slate-800">
              <tr>
                <th className="py-3 px-5 font-semibold min-w-[160px]">Field Name</th>
                <th className="py-3 px-5 font-semibold min-w-[100px]">Type</th>
                <th className="py-3 px-5 font-semibold min-w-[200px]">Options / Constraints</th>
                <th className="py-3 px-5 font-semibold text-center min-w-[90px]">Required</th>
                <th className="py-3 px-5 font-semibold text-right min-w-[90px] whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
              {fields.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-400">
                    <Sliders className="w-8 h-8 mx-auto mb-2 text-slate-300 dark:text-slate-700 stroke-1" />
                    <p className="font-medium text-slate-600 dark:text-slate-400">
                      No custom fields configured for this organization yet.
                    </p>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Click &ldquo;Add Custom Field&rdquo; above to create attributes like Serial Number, Batch Code, Warranty, or RAM Size.
                    </p>
                  </td>
                </tr>
              ) : (
                fields.map((f) => {
                  return (
                    <tr
                      key={f.field_id}
                      className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="py-3.5 px-5 font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        {getFieldTypeIcon(f.field_type)}
                        <span>{f.field_name}</span>
                      </td>

                      <td className="py-3.5 px-5">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 uppercase">
                          {f.field_type}
                        </span>
                      </td>

                      <td className="py-3.5 px-5">
                        {f.field_type === "dropdown" && f.dropdown_options && f.dropdown_options.length > 0 ? (
                          <div className="flex flex-wrap gap-1 max-w-sm">
                            {f.dropdown_options.map((opt, i) => (
                              <span
                                key={i}
                                className="px-1.5 py-0.2 rounded text-[10px] bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20"
                              >
                                {opt}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-slate-400 text-[11px]">Standard validation</span>
                        )}
                      </td>

                      <td className="py-3.5 px-5 text-center">
                        {f.is_required ? (
                          <span className="px-2 py-0.5 rounded-full font-bold text-[10px] bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                            Required
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[11px]">Optional</span>
                        )}
                      </td>

                      <td className="py-3.5 px-5 text-right">
                        {isAdmin ? (
                          <button
                            onClick={() => handleDeleteField(f.field_id, f.field_name)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                            title="Delete custom field"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        ) : (
                          <span className="text-slate-400 text-[11px]">&mdash;</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Custom Field Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center">
                  <Plus className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Add Custom Field
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Defines dynamic attribute for catalog items.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-xs cursor-pointer"
              >
                Cancel
              </button>
            </div>

            <form onSubmit={handleCreateField} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Field Display Name *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Serial Number, RAM (GB), Expiry Date"
                  value={fieldName}
                  onChange={(e) => setFieldName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Data Type *
                </label>
                <select
                  value={fieldType}
                  onChange={(e) => setFieldType(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="text">Text (String)</option>
                  <option value="number">Integer Number</option>
                  <option value="decimal">Decimal / Float</option>
                  <option value="date">Date (ISO 8601)</option>
                  <option value="dropdown">Dropdown (Preset Options)</option>
                  <option value="boolean">Boolean (Yes/No)</option>
                  <option value="barcode">Barcode / Scan Code</option>
                </select>
              </div>

              {fieldType === "dropdown" && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Dropdown Options (comma-separated) *
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 8GB, 16GB, 32GB, 64GB"
                    value={dropdownOptionsInput}
                    onChange={(e) => setDropdownOptionsInput(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white"
                    required
                  />
                </div>
              )}

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="isRequiredField"
                  checked={isRequired}
                  onChange={(e) => setIsRequired(e.target.checked)}
                  className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300"
                />
                <label htmlFor="isRequiredField" className="text-xs text-slate-700 dark:text-slate-300 font-medium cursor-pointer">
                  Mandatory field (reject item creation if missing)
                </label>
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl bg-[#0c3843] hover:bg-[#082931] text-white text-xs font-semibold shadow-md shadow-[#0c3843]/20 transition-all disabled:opacity-50 cursor-pointer"
                >
                  {isSubmitting ? "Creating..." : "Save Custom Field"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
