"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import {
  Sun,
  Moon,
  Barcode,
  ArrowDownLeft,
  ArrowUpRight,
  User,
  AlertTriangle,
  LogOut,
  Shield,
  Key,
  ChevronDown,
} from "lucide-react";
import { useInventory } from "@/lib/inventory-store";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/components/ui/toast";
import { playScanBeep } from "@/lib/sound";

export function Header() {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const { products, lowStockItems } = useInventory();
  const { user, logout, isAdmin, isSuperAdmin, isStaff } = useAuth();
  const { toast } = useToast();
  const [searchVal, setSearchVal] = useState("");
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);

    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const getPageTitle = (path: string) => {
    if (path === "/") return "Dashboard";
    if (path.startsWith("/products")) return "Products Master";
    if (path.startsWith("/stock-in")) return "Stock In Purchases";
    if (path.startsWith("/stock-out")) return "Stock Out Sales";
    if (path.startsWith("/custody")) return "Tool & Staff Custody";
    if (path.startsWith("/adjustments")) return "Stock Adjustments";
    if (path.startsWith("/contacts")) return "Suppliers & Customers";
    if (path.startsWith("/import")) return "CSV Bulk Import";
    if (path.startsWith("/settings/custom-fields")) return "Custom Fields";
    return path.replace("/", "").replace("-", " ");
  };

  const handleSearchSubmit = (raw: string) => {
    const clean = raw.trim();
    if (!clean) return;

    // Check if it's a barcode / SKU match
    const matched = products.find(
      (p) =>
        p.sku.toUpperCase() === clean.toUpperCase() ||
        p.id.toUpperCase() === clean.toUpperCase() ||
        p.name.toLowerCase().includes(clean.toLowerCase())
    );

    if (matched) {
      playScanBeep();
      toast({
        title: "Product Located",
        description: `${matched.name} (${matched.sku}) — Available: ${matched.currentStock} ${matched.unit}`,
        variant: "success",
      });
      window.location.href = `/products?search=${encodeURIComponent(matched.sku)}`;
    } else {
      window.location.href = `/products?search=${encodeURIComponent(clean)}`;
    }
    setSearchVal("");
  };

  return (
    <header className="h-16 border-b border-slate-200/80 bg-white/80 backdrop-blur-md px-6 sm:px-8 flex items-center justify-between gap-4 sticky top-0 z-20 shadow-2xs">
      {/* Left: Breadcrumbs & Live Store Status Indicator */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span className="text-slate-400 font-medium hidden sm:inline">Store</span>
          <span className="text-slate-400 hidden sm:inline">/</span>
          <span className="font-bold text-slate-900 capitalize text-sm">{getPageTitle(pathname)}</span>
        </div>

        <div className="h-4 w-px bg-slate-200 hidden md:block" />

        <div className="hidden md:flex items-center gap-2">
          <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-semibold flex items-center gap-1.5 shadow-2xs">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Store Engine Online
          </span>
          <span className="px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-slate-700 text-[10px] font-semibold shadow-2xs">
            Tenant Isolated
          </span>
        </div>
      </div>

      {/* Middle: Quick Search / Barcode Quick-Lookup */}
      <div className="hidden lg:flex items-center gap-3 flex-1 max-w-xs xl:max-w-sm">
        <div className="relative w-full">
          <Barcode className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#0c3843]" />
          <input
            type="text"
            value={searchVal}
            onChange={(e) => setSearchVal(e.target.value)}
            placeholder="Search or scan SKU barcode..."
            className="w-full pl-9 pr-12 py-1.5 text-xs rounded-xl bg-white border border-slate-200 shadow-2xs focus:border-[#0c3843] focus:ring-2 focus:ring-[#0c3843]/15 outline-none text-slate-900 font-mono transition-all"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                handleSearchSubmit(searchVal);
              }
            }}
          />
          <kbd className="hidden sm:inline-block absolute right-2.5 top-1/2 -translate-y-1/2 px-1.5 py-0.5 text-[10px] font-mono text-slate-400 bg-slate-50 border border-slate-200 rounded shadow-xs">
            Enter
          </kbd>
        </div>
      </div>

      {/* Right Controls: Quick Actions, Low Stock Bell, Theme, User */}
      <div className="flex items-center gap-2.5">
        {isSuperAdmin && (
          <Link
            href="/admin"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#0c3843]/10 hover:bg-[#0c3843]/20 text-[#0c3843] border border-[#0c3843]/20 text-xs font-bold transition-all shadow-xs"
            title="Go to Master Platform Control Center"
          >
            <Shield className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Admin Portal</span>
          </Link>
        )}

        {/* Quick In / Out Action Buttons */}
        <Link
          href="/stock-in"
          className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs font-semibold transition-all shadow-2xs"
        >
          <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-600" />
          <span>Stock In</span>
        </Link>

        <Link
          href="/stock-out"
          className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#0c3843]/10 hover:bg-[#0c3843]/20 text-[#0c3843] border border-[#0c3843]/20 text-xs font-semibold transition-all shadow-2xs"
        >
          <ArrowUpRight className="w-3.5 h-3.5 text-[#0c3843]" />
          <span>Stock Out</span>
        </Link>

        {/* Low Stock Indicator */}
        {lowStockItems.length > 0 && (
          <Link
            href="/products?filter=low_stock"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-amber-50 text-amber-700 border border-amber-200 text-xs font-semibold hover:bg-amber-100 transition-all shadow-2xs"
            title={`${lowStockItems.length} items low in stock`}
          >
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
            <span className="hidden md:inline">{lowStockItems.length} Low Stock</span>
          </Link>
        )}

        {/* Theme Toggle */}
        <button
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="w-9 h-9 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 flex items-center justify-center text-slate-600 transition-colors cursor-pointer shadow-2xs"
          title="Toggle light/dark theme"
        >
          {mounted && theme === "dark" ? (
            <Sun className="w-4 h-4 text-amber-400" />
          ) : (
            <Moon className="w-4 h-4 text-slate-600" />
          )}
        </button>

        {/* User Profile & Sign Out Dropdown */}
        <div className="relative pl-2 border-l border-slate-200" ref={dropdownRef}>
          <button
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            className="flex items-center gap-2.5 p-1.5 rounded-xl hover:bg-slate-100 transition-colors text-left cursor-pointer"
            title="User Profile & Session Settings"
          >
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shadow-xs text-white bg-gradient-to-tr from-[#0c3843] to-teal-700 ring-2 ring-[#0c3843]/30">
              {user?.name ? user.name.slice(0, 2).toUpperCase() : <User className="w-4 h-4" />}
            </div>

            <div className="hidden lg:flex flex-col text-left leading-tight">
              <span className="text-xs font-bold text-slate-900 truncate max-w-[130px]">
                {user?.name || "Inventory User"}
              </span>
              <div className="flex items-center gap-1.5 mt-0.5">
                {isAdmin ? (
                  <span className="px-1.5 py-0.2 rounded-full bg-[#0c3843]/10 text-[#0c3843] border border-[#0c3843]/20 text-[9px] font-bold uppercase tracking-wider">
                    Store Admin
                  </span>
                ) : (
                  <span className="px-1.5 py-0.2 rounded-full bg-slate-200/70 text-slate-700 border border-slate-300 text-[9px] font-bold uppercase tracking-wider">
                    Staff
                  </span>
                )}
              </div>
            </div>

            <ChevronDown className="w-3.5 h-3.5 text-slate-400 hidden lg:block" />
          </button>

          {/* User Profile Menu Modal/Dropdown */}
          {userMenuOpen && (
            <div className="absolute right-0 mt-2 w-64 rounded-2xl bg-white border border-slate-200 shadow-2xl p-3 space-y-3 z-50 animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold text-white shadow-xs bg-gradient-to-tr from-[#0c3843] to-teal-700">
                  {user?.name ? user.name.slice(0, 2).toUpperCase() : <User className="w-4 h-4" />}
                </div>
                <div className="flex flex-col truncate">
                  <span className="text-xs font-bold text-slate-900 truncate">
                    {user?.name || "Inventory User"}
                  </span>
                  <span className="text-[11px] text-slate-400 truncate">
                    {user?.email || "No email"}
                  </span>
                </div>
              </div>

              <div className="space-y-1.5 text-[11px]">
                <div className="flex items-center justify-between py-1 px-2 rounded-lg bg-slate-50">
                  <span className="text-slate-500 flex items-center gap-1.5">
                    <Shield className="w-3.5 h-3.5 text-[#0c3843]" />
                    Access Role:
                  </span>
                  <span className="font-semibold capitalize text-[#0c3843]">
                    {user?.role || "Staff"}
                  </span>
                </div>

                <div className="flex items-center justify-between py-1 px-2 rounded-lg bg-slate-50">
                  <span className="text-slate-500 flex items-center gap-1.5">
                    <Key className="w-3.5 h-3.5 text-slate-400" />
                    Permissions:
                  </span>
                  <span className="text-slate-700 font-mono text-[10px]">
                    {isAdmin ? "Full Access" : "Stock Ops Only"}
                  </span>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100">
                <button
                  onClick={() => {
                    setUserMenuOpen(false);
                    logout();
                  }}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 text-xs font-semibold transition-all cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign Out</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
