"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Package,
  ArrowDownLeft,
  ArrowUpRight,
  SlidersHorizontal,
  Users,
  ChevronLeft,
  ChevronRight,
  Boxes,
  AlertTriangle,
  Lock,
  ShieldCheck,
  FileSpreadsheet,
  Sliders,
  Crown,
} from "lucide-react";
import { useInventory } from "@/lib/inventory-store";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const pathname = usePathname();
  const { products, lowStockItems } = useInventory();
  const { isAdmin, isStaff } = useAuth();

  const navItems = [
    {
      label: "Dashboard",
      href: "/",
      icon: LayoutDashboard,
    },
    {
      label: "Products Master",
      href: "/products",
      icon: Package,
      badge: products.length > 0 ? `${products.length}` : undefined,
    },
    {
      label: "Stock In / Purchases",
      href: "/stock-in",
      icon: ArrowDownLeft,
      color: "text-emerald-500",
    },
    {
      label: "Stock Out / Sales",
      href: "/stock-out",
      icon: ArrowUpRight,
      color: "text-blue-500",
    },
    {
      label: "Tool & Staff Custody",
      href: "/custody",
      icon: ShieldCheck,
      color: "text-indigo-500",
    },
    {
      label: "Stock Adjustments",
      href: "/adjustments",
      icon: SlidersHorizontal,
      color: "text-amber-500",
      restricted: isStaff,
    },
    {
      label: "Suppliers & Customers",
      href: "/contacts",
      icon: Users,
      color: "text-purple-500",
    },
    {
      label: "CSV Bulk Import",
      href: "/import",
      icon: FileSpreadsheet,
      color: "text-emerald-500",
    },
    {
      label: "Custom Field Builder",
      href: "/settings/custom-fields",
      icon: Sliders,
      color: "text-fuchsia-500",
      restricted: isStaff,
    },
    {
      label: "SuperAdmin HQ",
      href: "/superadmin",
      icon: Crown,
      color: "text-amber-500",
      restricted: isStaff,
    },
  ];

  return (
    <aside
      className={cn(
        "relative flex flex-col border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 transition-all duration-300 ease-in-out z-30 select-none",
        collapsed ? "w-18" : "w-64"
      )}
    >
      {/* Brand Header */}
      <div className="flex items-center justify-between h-16 px-4 border-b border-slate-200 dark:border-slate-800">
        <Link href="/" className="flex items-center gap-3 overflow-hidden">
          <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-blue-500 text-white shadow-sm flex-shrink-0">
            <Boxes className="w-5 h-5" />
          </div>
          {!collapsed && (
            <div className="flex flex-col truncate">
              <span className="text-sm font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-1.5">
                Whoopit IMS
                <span className="text-[10px] font-semibold uppercase px-1.5 py-0.2 rounded-full bg-indigo-500/10 text-indigo-500 border border-indigo-500/20">
                  Standard
                </span>
              </span>
              <span className="text-[11px] text-slate-400 truncate">
                Inventory Management System
              </span>
            </div>
          )}
        </Link>

        <button
          onClick={onToggle}
          className="hidden md:flex items-center justify-center w-7 h-7 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition-colors"
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      {/* Navigation Links */}
      <div className="flex-1 overflow-y-auto py-5 px-3 space-y-1.5">
        {!collapsed && (
          <h4 className="px-2 mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Main Menu
          </h4>
        )}
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all group relative",
                isActive
                  ? "bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800/60 font-semibold shadow-xs"
                  : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900 hover:text-slate-900 dark:hover:text-white"
              )}
              title={collapsed ? item.label : undefined}
            >
              <Icon
                className={cn(
                  "w-4 h-4 flex-shrink-0 transition-colors",
                  isActive
                    ? "text-indigo-600 dark:text-indigo-400"
                    : item.color || "text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-200"
                )}
              />

              {!collapsed && <span className="truncate flex-1">{item.label}</span>}

              {!collapsed && (item as any).restricted && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 flex items-center gap-1">
                  <Lock className="w-2.5 h-2.5" />
                  <span>Locked</span>
                </span>
              )}

              {!collapsed && item.badge && (
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-200/70 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                  {item.badge}
                </span>
              )}
            </Link>
          );
        })}
      </div>

      {/* Low Stock Alert Footer */}
      {!collapsed && lowStockItems.length > 0 && (
        <div className="p-3 mx-3 mb-3 rounded-xl border border-amber-500/20 bg-amber-500/5 text-amber-700 dark:text-amber-400 text-xs">
          <div className="flex items-center gap-2 font-semibold mb-1">
            <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
            <span>Low Stock Alert</span>
          </div>
          <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-tight">
            <span className="font-bold text-amber-600 dark:text-amber-400">
              {lowStockItems.length} {lowStockItems.length === 1 ? "item" : "items"}
            </span>{" "}
            at or below reorder level.
          </p>
          <Link
            href="/products?filter=low_stock"
            className="mt-2 inline-block text-[11px] font-bold text-amber-600 dark:text-amber-400 hover:underline"
          >
            Review Items &rarr;
          </Link>
        </div>
      )}
    </aside>
  );
}
