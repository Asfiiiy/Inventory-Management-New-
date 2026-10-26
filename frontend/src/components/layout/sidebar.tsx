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
  Building2,
  Plus,
  LogOut,
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
  const { user, isAdmin, isStaff, logout } = useAuth();

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
    },
    {
      label: "Stock Out / Sales",
      href: "/stock-out",
      icon: ArrowUpRight,
    },
    {
      label: "Tool & Staff Custody",
      href: "/custody",
      icon: ShieldCheck,
    },
    {
      label: "Stock Adjustments",
      href: "/adjustments",
      icon: SlidersHorizontal,
      restricted: isStaff,
    },
    {
      label: "Suppliers & Customers",
      href: "/contacts",
      icon: Users,
    },
    {
      label: "CSV Bulk Import",
      href: "/import",
      icon: FileSpreadsheet,
    },
    {
      label: "Custom Field Builder",
      href: "/settings/custom-fields",
      icon: Sliders,
      restricted: isStaff,
    },
  ];

  return (
    <aside
      className={cn(
        "relative flex flex-col justify-between border-r border-[#082931] bg-[#0c3843] text-white transition-all duration-300 ease-in-out z-30 select-none shadow-xl shrink-0",
        collapsed ? "w-18" : "w-56 lg:w-60 xl:w-64"
      )}
    >
      <div className="flex flex-col min-h-0 flex-1">
        {/* Brand Header */}
        <div className="flex items-center justify-between h-16 px-4 border-b border-white/10 shrink-0">
          <Link href="/" className="flex items-center gap-3 overflow-hidden">
            <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-white/10 text-cyan-300 border border-white/15 shadow-sm shrink-0">
              <Boxes className="w-5 h-5 text-cyan-300" />
            </div>
            {!collapsed && (
              <div className="flex flex-col truncate">
                <span className="text-sm font-extrabold tracking-tight text-white flex items-center gap-1.5 truncate">
                  <span className="truncate max-w-[130px]">
                    {user?.org_name || (user?.role === "owner" ? `${user.name}'s Store` : "Whoopit IMS")}
                  </span>
                  <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-400/30 shrink-0">
                    {user?.org_plan || "Store"}
                  </span>
                </span>
                <span className="text-[10px] text-cyan-200/70 truncate">
                  {user?.role === "owner" ? "Private Store Workspace" : "Inventory Management System"}
                </span>
              </div>
            )}
          </Link>

          <button
            onClick={onToggle}
            className="hidden md:flex items-center justify-center w-7 h-7 rounded-lg border border-white/10 hover:bg-white/10 text-cyan-200/80 transition-colors cursor-pointer"
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>

        {/* Quick Action Button (+ Add Product) */}
        {!collapsed && (
          <div className="p-3 pb-1">
            <Link
              href="/products?action=new"
              className="w-full flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-slate-950 text-xs font-bold shadow-md shadow-cyan-500/20 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4 text-slate-950 shrink-0" />
              <span>+ Add New Product</span>
            </Link>
          </div>
        )}

        {/* Navigation Links */}
        <div className="flex-1 overflow-y-auto py-3 px-3 space-y-1">
          {!collapsed && (
            <h4 className="px-2 mb-2 text-[10px] font-bold uppercase tracking-wider text-cyan-200/60">
              Store Navigation
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
                  "flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold transition-all group relative cursor-pointer",
                  isActive
                    ? "bg-white/15 text-white font-bold border-l-4 border-cyan-400 shadow-2xs"
                    : "text-slate-300 hover:bg-white/10 hover:text-white"
                )}
                title={collapsed ? item.label : undefined}
              >
                <Icon
                  className={cn(
                    "w-4 h-4 shrink-0 transition-colors",
                    isActive
                      ? "text-cyan-300"
                      : "text-slate-300 group-hover:text-cyan-300"
                  )}
                />

                {!collapsed && <span className="truncate flex-1">{item.label}</span>}

                {!collapsed && (item as any).restricted && (
                  <span
                    className={cn(
                      "text-[9px] font-semibold px-1.5 py-0.5 rounded-full flex items-center gap-1",
                      isActive
                        ? "bg-white/20 text-white"
                        : "bg-amber-400/20 text-amber-300 border border-amber-400/30"
                    )}
                  >
                    <Lock className="w-2.5 h-2.5" />
                    <span>Locked</span>
                  </span>
                )}

                {!collapsed && item.badge && (
                  <span
                    className={cn(
                      "text-[10px] font-mono px-2 py-0.5 rounded-full",
                      isActive
                        ? "bg-white/20 text-white"
                        : "bg-white/10 text-cyan-200 border border-white/10"
                    )}
                  >
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </div>

      {/* Footer Area: Alerts & User Card */}
      <div className="shrink-0">
        {/* Low Stock Alert Banner */}
        {!collapsed && lowStockItems.length > 0 && (
          <div className="p-3 mx-3 mb-2 rounded-xl border border-amber-400/30 bg-amber-400/10 text-amber-200 text-xs">
            <div className="flex items-center gap-2 font-semibold mb-1">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <span className="text-white font-bold">Low Stock Alert</span>
            </div>
            <p className="text-[11px] text-slate-300 leading-tight">
              <span className="font-bold text-amber-300">
                {lowStockItems.length} {lowStockItems.length === 1 ? "item" : "items"}
              </span>{" "}
              at or below reorder level.
            </p>
            <Link
              href="/products?filter=low_stock"
              className="mt-2 inline-block text-[11px] font-bold text-cyan-300 hover:text-cyan-200 hover:underline"
            >
              Review Items &rarr;
            </Link>
          </div>
        )}

        {/* Bottom Profile & Privacy Shield */}
        {!collapsed ? (
          <div className="p-3 border-t border-white/10 space-y-2">
            {/* Zero-Knowledge Privacy Badge */}
            <div className="p-2 rounded-xl bg-white/5 border border-white/10 flex items-center gap-2">
              <Lock className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span className="text-[10px] text-slate-300 leading-tight">
                Zero-Knowledge Store Privacy Enforced.
              </span>
            </div>

            {/* Store User Card & Sign Out */}
            <div className="flex items-center justify-between p-2 rounded-xl bg-white/10 border border-white/10">
              <div className="flex items-center gap-2 truncate">
                <div className="w-7 h-7 rounded-lg bg-cyan-500/20 text-cyan-300 font-bold text-xs flex items-center justify-center border border-cyan-400/30 shrink-0">
                  {user?.name ? user.name.slice(0, 2).toUpperCase() : "US"}
                </div>
                <div className="flex flex-col truncate leading-tight">
                  <span className="text-xs font-bold text-white truncate">{user?.name || "Store User"}</span>
                  <span className="text-[10px] text-cyan-200/70 truncate">{user?.email || ""}</span>
                </div>
              </div>

              <button
                onClick={() => logout()}
                className="w-7 h-7 rounded-lg hover:bg-rose-500/20 text-slate-300 hover:text-rose-300 flex items-center justify-center transition-colors cursor-pointer shrink-0"
                title="Sign Out"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ) : (
          <div className="p-2 border-t border-white/10 flex flex-col items-center gap-2">
            <div
              className="w-8 h-8 rounded-lg bg-cyan-500/20 text-cyan-300 font-bold text-xs flex items-center justify-center border border-cyan-400/30"
              title={user?.name || "User"}
            >
              {user?.name ? user.name.slice(0, 2).toUpperCase() : "US"}
            </div>
            <button
              onClick={() => logout()}
              className="w-8 h-8 rounded-lg hover:bg-rose-500/20 text-slate-300 hover:text-rose-300 flex items-center justify-center transition-colors cursor-pointer"
              title="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
