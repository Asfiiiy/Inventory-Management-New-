"use client";

import React, { useState } from "react";
import {
  Users,
  Plus,
  Search,
  Building2,
  Mail,
  Phone,
  MapPin,
  Trash2,
  X,
  Truck,
  ShoppingBag,
  ExternalLink,
} from "lucide-react";
import { useInventory, Contact } from "@/lib/inventory-store";
import { cn } from "@/lib/utils";

export default function ContactsDirectoryPage() {
  const { contacts, addContact, deleteContact } = useInventory();

  const [activeTab, setActiveTab] = useState<"ALL" | "SUPPLIER" | "CUSTOMER">("ALL");
  const [searchTerm, setSearchTerm] = useState("");
  const [modalOpen, setModalOpen] = useState(false);

  const [formData, setFormData] = useState({
    name: "",
    company: "",
    type: "SUPPLIER" as "SUPPLIER" | "CUSTOMER",
    email: "",
    phone: "",
    address: "",
  });

  const handleOpenAdd = (type: "SUPPLIER" | "CUSTOMER" = "SUPPLIER") => {
    setFormData({
      name: "",
      company: "",
      type,
      email: "",
      phone: "",
      address: "",
    });
    setModalOpen(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) return;

    addContact({
      name: formData.name.trim(),
      company: formData.company.trim() || undefined,
      type: formData.type,
      email: formData.email.trim(),
      phone: formData.phone.trim(),
      address: formData.address.trim(),
    });

    setModalOpen(false);
  };

  const handleDelete = (c: Contact) => {
    if (confirm(`Delete contact "${c.name}"?`)) {
      deleteContact(c.id);
    }
  };

  const filteredContacts = contacts.filter((c) => {
    const matchesTab = activeTab === "ALL" || c.type === activeTab;
    const matchesSearch =
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (c.company && c.company.toLowerCase().includes(searchTerm.toLowerCase())) ||
      c.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.phone.toLowerCase().includes(searchTerm.toLowerCase());

    return matchesTab && matchesSearch;
  });

  const supplierCount = contacts.filter((c) => c.type === "SUPPLIER").length;
  const customerCount = contacts.filter((c) => c.type === "CUSTOMER").length;

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white flex items-center gap-2.5">
            <Users className="w-6 h-6 text-purple-500" />
            <span>Suppliers & Customers Directory</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Maintain your vendor accounts for inward purchasing and customer directory for stock sales.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => handleOpenAdd("SUPPLIER")}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold shadow-xs transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Add Supplier</span>
          </button>
          <button
            onClick={() => handleOpenAdd("CUSTOMER")}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-xs transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Add Customer</span>
          </button>
        </div>
      </div>

      {/* Filter Tabs & Search */}
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 w-full sm:w-fit">
          <button
            onClick={() => setActiveTab("ALL")}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5",
              activeTab === "ALL"
                ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs"
                : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
            )}
          >
            <span>All Directory</span>
            <span className="px-1.5 py-0.2 rounded-full bg-slate-200 dark:bg-slate-700 text-[10px]">
              {contacts.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab("SUPPLIER")}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5",
              activeTab === "SUPPLIER"
                ? "bg-white dark:bg-slate-800 text-purple-600 dark:text-purple-400 shadow-xs"
                : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
            )}
          >
            <Truck className="w-3.5 h-3.5 text-purple-500" />
            <span>Suppliers</span>
            <span className="px-1.5 py-0.2 rounded-full bg-slate-200 dark:bg-slate-700 text-[10px]">
              {supplierCount}
            </span>
          </button>

          <button
            onClick={() => setActiveTab("CUSTOMER")}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5",
              activeTab === "CUSTOMER"
                ? "bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-xs"
                : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
            )}
          >
            <ShoppingBag className="w-3.5 h-3.5 text-blue-500" />
            <span>Customers</span>
            <span className="px-1.5 py-0.2 rounded-full bg-slate-200 dark:bg-slate-700 text-[10px]">
              {customerCount}
            </span>
          </button>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search contacts..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 focus:border-[#0c3843] focus:ring-1 focus:ring-[#0c3843]/20 outline-none text-slate-900 dark:text-white"
          />
        </div>
      </div>

      {/* Contacts Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredContacts.length === 0 ? (
          <div className="col-span-full py-12 text-center text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
            <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-xs font-medium">No contacts found.</p>
          </div>
        ) : (
          filteredContacts.map((c) => {
            const isSupplier = c.type === "SUPPLIER";

            return (
              <div
                key={c.id}
                className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 shadow-xs space-y-3 relative group hover:border-slate-300 dark:hover:border-slate-700 transition-all"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <span
                      className={cn(
                        "text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border",
                        isSupplier
                          ? "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20"
                          : "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20"
                      )}
                    >
                      {c.type}
                    </span>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white mt-2">
                      {c.name}
                    </h3>
                    {c.company && (
                      <p className="text-[11px] text-slate-400 font-medium">
                        {c.company}
                      </p>
                    )}
                  </div>

                  <button
                    onClick={() => handleDelete(c)}
                    className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                    title="Delete contact"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-1.5 text-xs text-slate-500 dark:text-slate-400">
                  {c.email && (
                    <div className="flex items-center gap-2">
                      <Mail className="w-3.5 h-3.5 text-slate-400" />
                      <a href={`mailto:${c.email}`} className="hover:text-indigo-500 truncate">
                        {c.email}
                      </a>
                    </div>
                  )}

                  {c.phone && (
                    <div className="flex items-center gap-2">
                      <Phone className="w-3.5 h-3.5 text-slate-400" />
                      <a href={`tel:${c.phone}`} className="hover:text-indigo-500">
                        {c.phone}
                      </a>
                    </div>
                  )}

                  {c.address && (
                    <div className="flex items-start gap-2">
                      <MapPin className="w-3.5 h-3.5 text-slate-400 flex-shrink-0 mt-0.5" />
                      <span className="truncate">{c.address}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Add Contact Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-slate-950/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Users className="w-4 h-4 text-purple-500" />
                <span>Add {formData.type === "SUPPLIER" ? "Supplier" : "Customer"}</span>
              </h3>
              <button
                onClick={() => setModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="font-semibold text-slate-700 dark:text-slate-300">
                  Contact Type *
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, type: "SUPPLIER" })}
                    className={cn(
                      "py-2 rounded-xl text-xs font-semibold border transition-all text-center",
                      formData.type === "SUPPLIER"
                        ? "bg-purple-500/10 border-purple-500 text-purple-600 dark:text-purple-400"
                        : "border-slate-200 dark:border-slate-800 text-slate-500"
                    )}
                  >
                    Supplier (Vendor)
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, type: "CUSTOMER" })}
                    className={cn(
                      "py-2 rounded-xl text-xs font-semibold border transition-all text-center",
                      formData.type === "CUSTOMER"
                        ? "bg-blue-500/10 border-blue-500 text-blue-600 dark:text-blue-400"
                        : "border-slate-200 dark:border-slate-800 text-slate-500"
                    )}
                  >
                    Customer (Buyer)
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700 dark:text-slate-300">
                  Full Name / Contact Person *
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-[#0c3843] focus:ring-1 focus:ring-[#0c3843]/20 outline-none"
                  placeholder="e.g. John Doe / Dell Commercial Direct"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700 dark:text-slate-300">
                  Company / Organization
                </label>
                <input
                  type="text"
                  value={formData.company}
                  onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-[#0c3843] focus:ring-1 focus:ring-[#0c3843]/20 outline-none"
                  placeholder="e.g. Dell Technologies Inc."
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-semibold text-slate-700 dark:text-slate-300">
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-[#0c3843] focus:ring-1 focus:ring-[#0c3843]/20 outline-none"
                    placeholder="orders@company.com"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-slate-700 dark:text-slate-300">
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-[#0c3843] focus:ring-1 focus:ring-[#0c3843]/20 outline-none"
                    placeholder="+1 (555) 000-0000"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700 dark:text-slate-300">
                  Address
                </label>
                <input
                  type="text"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-[#0c3843] focus:ring-1 focus:ring-[#0c3843]/20 outline-none"
                  placeholder="123 Warehouse Blvd, Austin, TX"
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-[#0c3843] hover:bg-[#082931] text-white font-semibold shadow-md shadow-[#0c3843]/20 transition-all cursor-pointer"
                >
                  Save Contact
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
