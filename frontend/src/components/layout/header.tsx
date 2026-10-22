"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useTheme } from "next-themes";
import {
  Sun,
  Moon,
  Barcode,
  ArrowDownLeft,
  ArrowUpRight,
  User,
  AlertTriangle,
  RotateCcw,
  LogOut,
  Shield,
  Key,
  ChevronDown,
  Crown,
} from "lucide-react";
import { useInventory } from "@/lib/inventory-store";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/components/ui/toast";
import { playScanBeep } from "@/lib/sound";

export function Header() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const { products, lowStockItems, resetToDefaults } = useInventory();
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
    <header className="h-16 px-6 border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-950/80 backdrop-blur-md flex items-center justify-between gap-4 sticky top-0 z-20">
      {/* Left: Quick Search / Barcode Quick-Lookup */}
      <div className="flex items-center gap-3 flex-1 max-w-md">
        <div className="relative w-full">
          <Barcode className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-indigo-500" />
          <input
            type="text"
            value={searchVal}
            onChange={(e) => setSearchVal(e.target.value)}
            placeholder="Search or scan SKU barcode..."
            className="w-full pl-9 pr-12 py-1.5 text-xs rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 focus:border-indigo-500 outline-none text-slate-900 dark:text-white font-mono"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                handleSearchSubmit(searchVal);
              }
            }}
          />
          <kbd className="hidden sm:inline-block absolute right-2.5 top-1/2 -translate-y-1/2 px-1.5 py-0.5 text-[10px] font-mono text-slate-400 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded shadow-xs">
            Enter
          </kbd>
        </div>
      </div>

      {/* Right Controls: Quick Actions, Low Stock Bell, Theme, User */}
      <div className="flex items-center gap-2.5">
        {isAdmin && (
          <Link
            href="/admin"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 text-xs font-bold transition-all shadow-xs"
            title="Go to Admin Portal"
          >
            <Shield className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Admin Portal</span>
          </Link>
        )}

        {/* Quick In / Out Action Buttons */}
        <Link
          href="/stock-in"
          className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-xs font-semibold transition-all"
        >
          <ArrowDownLeft className="w-3.5 h-3.5" />
          <span>Stock In</span>
        </Link>

        <Link
          href="/stock-out"
          className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 border border-blue-500/20 text-xs font-semibold transition-all"
        >
          <ArrowUpRight className="w-3.5 h-3.5" />
          <span>Stock Out</span>
        </Link>

        {/* Low Stock Indicator */}
        {lowStockItems.length > 0 && (
          <Link
            href="/products?filter=low_stock"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 text-xs font-semibold hover:bg-amber-500/20 transition-all"
            title={`${lowStockItems.length} items low in stock`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span className="hidden md:inline">{lowStockItems.length} Low Stock</span>
          </Link>
        )}

        {/* Theme Toggle */}
        <button
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="w-9 h-9 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100/60 dark:bg-slate-900/60 hover:bg-slate-200 dark:hover:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-400 transition-colors cursor-pointer"
          title="Toggle light/dark theme"
        >
          {mounted && theme === "dark" ? (
            <Sun className="w-4 h-4 text-amber-400" />
          ) : (
            <Moon className="w-4 h-4 text-slate-600" />
          )}
        </button>

        {/* Demo Data Reset (Admin only or general utility) */}
        {isAdmin && (
          <button
            onClick={() => {
              if (confirm("Reset inventory to clean standard sample products?")) {
                resetToDefaults();
              }
            }}
            className="w-9 h-9 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100/60 dark:bg-slate-900/60 hover:bg-slate-200 dark:hover:bg-slate-800 flex items-center justify-center text-slate-500 transition-colors cursor-pointer"
            title="Reset to default sample inventory"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        )}

        {/* User Profile & Sign Out Dropdown */}
        <div className="relative pl-2 border-l border-slate-200 dark:border-slate-800" ref={dropdownRef}>
          <button
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            className="flex items-center gap-2.5 p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors text-left cursor-pointer"
            title="User Profile & Session Settings"
          >
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shadow-xs text-white ${
              isAdmin
                ? "bg-gradient-to-tr from-indigo-600 to-purple-600 ring-2 ring-indigo-500/30"
                : "bg-gradient-to-tr from-amber-600 to-orange-500 ring-2 ring-amber-500/30"
            }`}>
              {user?.name ? user.name.slice(0, 2).toUpperCase() : <User className="w-4 h-4" />}
            </div>

            <div className="hidden lg:flex flex-col text-left leading-tight">
              <span className="text-xs font-bold text-slate-900 dark:text-white truncate max-w-[130px]">
                {user?.name || "Inventory User"}
              </span>
              <div className="flex items-center gap-1.5 mt-0.5">
                {isAdmin ? (
                  <span className="px-1.5 py-0.2 rounded-full bg-indigo-500/10 text-indigo-500 dark:text-indigo-400 border border-indigo-500/20 text-[9px] font-bold uppercase tracking-wider">
                    Admin
                  </span>
                ) : (
                  <span className="px-1.5 py-0.2 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 text-[9px] font-bold uppercase tracking-wider">
                    Staff
                  </span>
                )}
              </div>
            </div>

            <ChevronDown className="w-3.5 h-3.5 text-slate-400 hidden lg:block" />
          </button>

          {/* User Profile Menu Modal/Dropdown */}
          {userMenuOpen && (
            <div className="absolute right-0 mt-2 w-64 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-3 space-y-3 z-50">
              <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100 dark:border-slate-800">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold text-white shadow-xs ${
                  isAdmin
                    ? "bg-gradient-to-tr from-indigo-600 to-purple-600"
                    : "bg-gradient-to-tr from-amber-600 to-orange-500"
                }`}>
                  {user?.name ? user.name.slice(0, 2).toUpperCase() : <User className="w-4 h-4" />}
                </div>
                <div className="flex flex-col truncate">
                  <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                    {user?.name || "Inventory User"}
                  </span>
                  <span className="text-[11px] text-slate-400 truncate">
                    {user?.email || "No email"}
                  </span>
                </div>
              </div>

              <div className="space-y-1.5 text-[11px]">
                <div className="flex items-center justify-between py-1 px-2 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                  <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                    <Shield className="w-3.5 h-3.5 text-indigo-400" />
                    Access Role:
                  </span>
                  <span className={`font-semibold capitalize ${
                    isAdmin ? "text-indigo-500 dark:text-indigo-400" : "text-amber-500 dark:text-amber-400"
                  }`}>
                    {user?.role || "Staff"}
                  </span>
                </div>

                <div className="flex items-center justify-between py-1 px-2 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                  <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                    <Key className="w-3.5 h-3.5 text-slate-400" />
                    Permissions:
                  </span>
                  <span className="text-slate-700 dark:text-slate-300 font-mono text-[10px]">
                    {isAdmin ? "Full Access" : "Stock Ops Only"}
                  </span>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  onClick={() => {
                    setUserMenuOpen(false);
                    logout();
                  }}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/20 text-xs font-semibold transition-all cursor-pointer"
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
