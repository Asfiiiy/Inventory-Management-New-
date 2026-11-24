"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Barcode,
  ArrowDownLeft,
  ArrowUpRight,
  User,
  AlertTriangle,
  LogOut,
  Shield,
  Key,
  ChevronDown,
  HelpCircle,
  BookOpen,
} from "lucide-react";
import { useInventory } from "@/lib/inventory-store";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/components/ui/toast";
import { playScanBeep } from "@/lib/sound";
import { HelpGuideModal } from "./help-guide-modal";

interface HeaderProps {
  onToggleSidebar?: () => void;
  isSidebarCollapsed?: boolean;
}

export function Header({ onToggleSidebar, isSidebarCollapsed }: HeaderProps = {}) {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const { products, lowStockItems } = useInventory();
  const { user, logout, isAdmin, isSuperAdmin, isStaff } = useAuth();
  const { toast } = useToast();
  const [searchVal, setSearchVal] = useState("");
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [helpGuideOpen, setHelpGuideOpen] = useState(false);
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
    if (path === "/" || path === "/dashboard") return "Office overview";
    if (path.startsWith("/products")) return "All equipment";
    if (path.startsWith("/custody")) return "Assigned to staff";
    if (path.startsWith("/my-assets")) return "My Assigned Devices";
    if (path.startsWith("/adjustments")) return "Faulty & vendor";
    if (path.startsWith("/stock-out")) return "Give to staff";
    if (path.startsWith("/contacts")) return "Staff & vendors";
    if (path.startsWith("/stock-in")) return "New stock received";
    if (path.startsWith("/import")) return "Excel / CSV import";
    if (path.startsWith("/settings/custom-fields")) return "Custom spec fields";
    if (path === "/settings") return "Workspace settings";
    return path.replace("/", "").replace("-", " ");
  };

  const handleSearchSubmit = (raw: string) => {
    const clean = raw.trim();
    if (!clean) return;

    // Check if it's a barcode / SKU / name match
    const matched = products.find(
      (p) =>
        p.sku.toUpperCase() === clean.toUpperCase() ||
        (p.barcode && p.barcode.toUpperCase() === clean.toUpperCase()) ||
        (p.attributes?.barcode && String(p.attributes.barcode).toUpperCase() === clean.toUpperCase()) ||
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
      window.location.href = `/products?search=${encodeURIComponent(matched.barcode || matched.sku)}`;
    } else {
      window.location.href = `/products?search=${encodeURIComponent(clean)}`;
    }
    setSearchVal("");
  };

  return (
    <header className="h-16 border-b border-slate-200/80 bg-white/80 dark:bg-slate-950/80 backdrop-blur-md px-6 sm:px-8 flex items-center justify-between gap-4 sticky top-0 z-20 shadow-2xs">
      {/* Left: Clean Breadcrumbs */}
      <div className="flex items-center gap-1.5 text-xs text-slate-500 shrink-0 whitespace-nowrap">
        <span className="text-slate-400 font-medium hidden md:inline">Office IT Portal</span>
        <span className="text-slate-400 hidden md:inline">/</span>
        <span className="font-bold text-slate-900 dark:text-white capitalize text-sm whitespace-nowrap">{getPageTitle(pathname)}</span>
      </div>

      {/* Middle: Quick Search / Barcode Quick-Lookup */}
      <div className="hidden md:flex items-center gap-3 flex-1 min-w-[200px] max-w-sm lg:max-w-md mx-2 sm:mx-3">
        <div className="relative w-full">
          <Barcode className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchVal}
            onChange={(e) => setSearchVal(e.target.value)}
            placeholder="Search catalog or barcode..."
            className="w-full pl-9 pr-14 py-2 text-xs rounded-xl bg-slate-50 hover:bg-slate-100/80 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs focus:bg-white dark:focus:bg-slate-950 focus:border-[#0c3843] focus:ring-2 focus:ring-[#0c3843]/15 outline-none text-slate-900 dark:text-white transition-all placeholder:text-slate-400"
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

      {/* Right Controls: Notifications, Theme, User */}
      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
        {/* User Guide & Instructions Button */}
        <button
          onClick={() => setHelpGuideOpen(true)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-800 text-xs font-semibold shadow-2xs transition-all cursor-pointer"
          title="Open Store Help Guide & Instructions (Software Guide)"
        >
          <HelpCircle className="w-3.5 h-3.5 text-[#0c3843] dark:text-teal-400" />
          <span className="hidden 2xl:inline font-bold">User Guide</span>
        </button>

        {/* Restock Alerts Indicator */}
        {!isStaff && lowStockItems.length > 0 && (
          <Link
            href="/products?filter=low_stock"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800/60 text-xs font-semibold hover:bg-amber-100 dark:hover:bg-amber-950/70 transition-all shadow-2xs"
            title={`${lowStockItems.length} items require reordering or are out of stock`}
          >
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
            <span className="hidden 2xl:inline font-bold">{lowStockItems.length} Restock Alerts</span>
            <span className="2xl:hidden font-mono text-xs font-bold">{lowStockItems.length}</span>
          </Link>
        )}

        {isSuperAdmin && (
          <Link
            href="/admin"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 text-xs font-semibold transition-all"
            title="Return to Whoopit Master Admin"
          >
            <Shield className="w-3.5 h-3.5" />
            <span className="hidden 2xl:inline">Master Admin</span>
          </Link>
        )}


        {/* User Profile & Sign Out Dropdown */}
        <div className="relative pl-1.5 border-l border-slate-200" ref={dropdownRef}>
          <button
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            className="flex items-center gap-2 p-1 rounded-xl hover:bg-slate-100 transition-colors text-left cursor-pointer"
            title="User Profile & Session Settings"
          >
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shadow-xs text-white bg-gradient-to-tr from-[#0c3843] to-teal-700 ring-2 ring-[#0c3843]/30 shrink-0">
              {user?.name ? user.name.slice(0, 2).toUpperCase() : <User className="w-4 h-4" />}
            </div>

            <div className="hidden lg:flex flex-col text-left leading-tight min-w-0">
              <span className="text-xs font-bold text-slate-900 truncate max-w-[105px]">
                {user?.name || "Inventory User"}
              </span>
              <div className="flex items-center gap-1.5 mt-0.5">
                {isSuperAdmin ? (
                  <span className="px-1.5 py-0.2 rounded-full bg-[#0c3843]/10 text-[#0c3843] border border-[#0c3843]/20 text-[9px] font-bold uppercase tracking-wider">
                    Master Admin
                  </span>
                ) : isAdmin ? (
                  <span className="px-1.5 py-0.2 rounded-full bg-[#0c3843]/10 text-[#0c3843] border border-[#0c3843]/20 text-[9px] font-bold uppercase tracking-wider">
                    IT Admin
                  </span>
                ) : (
                  <span className="px-1.5 py-0.2 rounded-full bg-slate-200/70 text-slate-700 border border-slate-300 text-[9px] font-bold uppercase tracking-wider">
                    IT Staff
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
                    {isAdmin ? "Full Access" : "My devices"}
                  </span>
                </div>
              </div>

              {isSuperAdmin && (
                <div className="pt-2 border-t border-slate-100">
                  <Link
                    href="/admin"
                    onClick={() => {
                      if (typeof window !== "undefined") {
                        localStorage.removeItem("whoopit_preview_store");
                      }
                      setUserMenuOpen(false);
                    }}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-[#0c3843] hover:bg-[#082931] text-cyan-300 text-xs font-bold transition-all shadow-xs"
                  >
                    <Shield className="w-3.5 h-3.5" />
                    <span>Back to Master Admin</span>
                  </Link>
                </div>
              )}

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

      {/* Global User Guide & Cheatsheet Modal */}
      <HelpGuideModal isOpen={helpGuideOpen} onClose={() => setHelpGuideOpen(false)} />
    </header>
  );
}
