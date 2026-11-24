"use client";

import React from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  PanelLeftClose,
  PanelLeftOpen,
  LayoutDashboard,
  Package,
  ArrowDownLeft,
  Users,
  Boxes,
  AlertTriangle,
  ShieldCheck,
  FileSpreadsheet,
  Sliders,
  Settings,
  LogOut,
  DollarSign,
  Wrench,
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
  const searchParams = useSearchParams();
  const financeOpen = searchParams.get("finance") === "1";
  const { lowStockItems } = useInventory();
  const { user, logout, isSuperAdmin, isAdmin, isStaff } = useAuth();
  const displayName = user?.name?.trim() || "Signed-in user";
  const displayEmail = user?.email?.trim() || "";
  const userInitial = user?.name?.trim() ? user.name.trim()[0].toUpperCase() : "U";

  // Staff: catalog only. Company admin: full office inventory story.
  const lifecycleNavItems = [
    !isStaff || isAdmin
      ? {
          label: "Office overview",
          href: "/dashboard",
          icon: LayoutDashboard,
        }
      : null,
    {
      label: "All equipment",
      href: "/products",
      icon: Package,
    },
    isAdmin || !isStaff
      ? {
          label: "Assigned to staff",
          href: "/custody",
          icon: ShieldCheck,
        }
      : null,
    isAdmin || !isStaff
      ? {
          label: "Faulty & vendor",
          href: "/adjustments",
          icon: Wrench,
        }
      : null,
  ].filter(Boolean) as Array<{
    label: string;
    href: string;
    icon: typeof LayoutDashboard;
    badge?: string;
  }>;

  const configNavItems = (isAdmin
    ? [
        {
          label: "New stock received",
          href: "/stock-in",
          icon: ArrowDownLeft,
        },
        {
          label: "Finance record",
          href: "/dashboard?finance=1",
          icon: DollarSign,
        },
        {
          label: "Staff & vendors",
          href: "/contacts",
          icon: Users,
        },
        {
          label: "Excel / CSV import",
          href: "/import",
          icon: FileSpreadsheet,
        },
        {
          label: "Custom spec fields",
          href: "/settings/custom-fields",
          icon: Sliders,
        },
      ]
    : []) as Array<{
    label: string;
    href: string;
    icon: typeof LayoutDashboard;
    badge?: string;
  }>;

  const renderNavItem = (item: (typeof lifecycleNavItems)[0]) => {
    const Icon = item.icon;
    const isActive = item.href.startsWith("/dashboard?finance")
      ? pathname === "/dashboard" && financeOpen
      : item.href === "/dashboard"
        ? pathname === "/dashboard" && !financeOpen
        : pathname === item.href || pathname.startsWith(`${item.href}/`);

    return (
      <div key={item.href} className="relative group">
        <Link
          href={item.href}
          className={cn(
            "flex items-center rounded-xl text-xs font-semibold transition-all relative cursor-pointer",
            collapsed
              ? "justify-center w-11 h-11 mx-auto my-1"
              : "gap-3 px-3.5 py-2.5 my-0.5",
            isActive
              ? collapsed
                ? "bg-white/20 text-cyan-300 border border-cyan-400/50 shadow-sm"
                : "bg-white/15 text-white font-bold border-l-4 border-cyan-400 shadow-2xs"
              : "text-slate-300 hover:bg-white/10 hover:text-white"
          )}
        >
          <Icon
            className={cn(
              "shrink-0 transition-colors",
              collapsed ? "w-5 h-5" : "w-4 h-4",
              isActive
                ? "text-cyan-300"
                : "text-slate-300 group-hover:text-cyan-300"
            )}
          />

          {!collapsed && (
            <>
              <span className="truncate flex-1">{item.label}</span>
              {item.badge && (
                <span
                  className={cn(
                    "text-[10px] font-mono px-2 py-0.5 rounded-full shrink-0",
                    isActive
                      ? "bg-white/20 text-white"
                      : "bg-white/10 text-cyan-200 border border-white/10"
                  )}
                >
                  {item.badge}
                </span>
              )}
            </>
          )}
        </Link>

        {/* Gemini Floating Pill Tooltip */}
        {collapsed && (
          <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 px-3.5 py-1.5 rounded-xl bg-[#e3e3e3] text-zinc-900 text-xs font-semibold whitespace-nowrap shadow-xl pointer-events-none opacity-0 group-hover:opacity-100 transition-all duration-150 z-50 flex items-center gap-2">
            <span>{item.label}</span>
            {item.badge && (
              <span className="px-1.5 py-0.2 rounded-full bg-cyan-600 text-white text-[10px] font-mono">
                {item.badge}
              </span>
            )}
          </div>
        )}
      </div>
    );
  };


  return (
    <aside
      className={cn(
        "relative flex flex-col justify-between border-r border-[#082931] bg-[#0c3843] text-white transition-all duration-300 ease-in-out z-30 select-none shadow-2xl shrink-0 overflow-visible",
        collapsed ? "w-[68px]" : "w-64 lg:w-70"
      )}
    >
      <div className="flex flex-col min-h-0 flex-1">
        {/* Gemini-Style Top Bar */}
        <div
          className={cn(
            "flex items-center h-16 shrink-0 transition-all px-3",
            collapsed ? "justify-center" : "justify-between border-b border-white/10"
          )}
        >
          {collapsed ? (
            /* COLLAPSED STATE: 
               By default shows the App Logo.
               When user hovers to open, it smoothly swaps to PanelLeftOpen icon with 'Open sidebar' tooltip! 
            */
            <div className="relative group flex items-center justify-center">
              <button
                onClick={onToggle}
                className="flex items-center justify-center w-11 h-11 rounded-2xl hover:bg-white/10 transition-all cursor-pointer relative"
                aria-label="Open sidebar"
              >
                {/* 1. Default: App Logo (Boxes Icon in cyan badge) */}
                <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-cyan-500/20 text-cyan-300 border border-cyan-400/30 transition-all duration-200 group-hover:opacity-0 group-hover:scale-75 absolute">
                  <Boxes className="w-5 h-5 text-cyan-300" />
                </div>

                {/* 2. On Hover: Gemini Open Sidebar Icon (PanelLeftOpen) */}
                <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-white/15 text-white transition-all duration-200 opacity-0 scale-75 group-hover:opacity-100 group-hover:scale-100">
                  <PanelLeftOpen className="w-5 h-5 text-white" />
                </div>
              </button>

              {/* Gemini-Style Light Pill Tooltip */}
              <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 px-3.5 py-1.5 rounded-xl bg-[#e3e3e3] text-zinc-900 text-xs font-semibold whitespace-nowrap shadow-xl pointer-events-none opacity-0 group-hover:opacity-100 transition-all duration-150 z-50">
                Open sidebar
              </div>
            </div>
          ) : (
            /* EXPANDED STATE: 
               Shows App Logo + Title on left, and Close Sidebar (PanelLeftClose) button on right.
            */
            <>
              <Link
                href={isStaff && !isAdmin ? "/my-assets" : "/dashboard"}
                className="flex items-center gap-3 overflow-hidden group min-w-0"
              >
                <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-cyan-500/20 text-cyan-300 border border-cyan-400/30 shadow-sm shrink-0 group-hover:scale-105 transition-transform">
                  <Boxes className="w-5 h-5 text-cyan-300" />
                </div>
                <div className="flex flex-col min-w-0">
                  <span
                    className="text-sm font-extrabold tracking-tight text-white truncate"
                    title={user?.org_name || "Whoopit Office IT"}
                  >
                    {user?.org_name || "Whoopit Office IT"}
                  </span>
                  <span className="text-[10px] text-cyan-200/70 truncate">
                    Office IT Portal
                  </span>
                </div>
              </Link>

              {/* Gemini Close Sidebar Button (PanelLeftClose) with Tooltip */}
              <div className="relative group shrink-0">
                <button
                  onClick={onToggle}
                  className="flex items-center justify-center w-9 h-9 rounded-xl text-slate-300 hover:text-white hover:bg-white/10 transition-all cursor-pointer"
                  aria-label="Close sidebar"
                >
                  <PanelLeftClose className="w-5 h-5 text-slate-300 group-hover:text-white" />
                </button>
                <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 px-3.5 py-1.5 rounded-xl bg-[#e3e3e3] text-zinc-900 text-xs font-semibold whitespace-nowrap shadow-xl pointer-events-none opacity-0 group-hover:opacity-100 transition-all duration-150 z-50">
                  Close sidebar
                </div>
              </div>
            </>
          )}
        </div>

        {/* Navigation Links with Grouped Sections */}
        <div className="flex-1 overflow-y-auto py-3 px-2 space-y-1 scrollbar-none">
          {/* Minimal exit for SuperAdmin preview — not a SaaS console inside client UI */}
          {isSuperAdmin && (
            <div className="mb-2 px-1">
              {!collapsed ? (
                <Link
                  href="/admin"
                  className="flex items-center gap-2 px-3 py-2 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 text-slate-200 text-xs font-semibold transition-all cursor-pointer"
                  title="Return to Whoopit Master Admin"
                >
                  <ShieldCheck className="w-3.5 h-3.5 text-cyan-300 shrink-0" />
                  <span className="truncate">Back to Master Admin</span>
                </Link>
              ) : (
                <div className="relative group flex justify-center">
                  <Link
                    href="/admin"
                    className="w-11 h-11 rounded-xl bg-white/5 border border-white/15 text-cyan-300 flex items-center justify-center hover:bg-white/10 transition-all cursor-pointer"
                    title="Master Admin"
                  >
                    <ShieldCheck className="w-5 h-5" />
                  </Link>
                </div>
              )}
            </div>
          )}

          {!collapsed ? (
            <div className="px-3 pt-1 pb-1.5 text-[10px] font-black uppercase tracking-wider text-cyan-200/60 flex items-center justify-between">
              <span>Office inventory</span>
            </div>
          ) : (
            <div className="my-1 border-t border-white/5" />
          )}

          {lifecycleNavItems.map(renderNavItem)}

          {configNavItems.length > 0 && (
            <>
              {!collapsed ? (
                <div className="pt-3 pb-1.5 px-3">
                  <div className="h-px bg-white/10 mb-2.5" />
                  <div className="text-[10px] font-black uppercase tracking-wider text-cyan-200/60">
                    Store &amp; records
                  </div>
                </div>
              ) : (
                <div className="my-2 border-t border-white/10 mx-2" />
              )}
              {configNavItems.map(renderNavItem)}
            </>
          )}
        </div>
      </div>

      {/* Footer Area: Alerts & Gemini-Style User Profile */}
      <div className="shrink-0 p-2 border-t border-white/10">
        {/* Low Stock Alert — admins / managers only */}
        {(isAdmin || !isStaff) && lowStockItems.length > 0 && (
          <>
            {!collapsed ? (
              <div className="p-3 mx-1 mb-2 rounded-xl border border-amber-400/30 bg-amber-400/10 text-amber-200 text-xs">
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
            ) : (
              <div className="relative group mb-1 flex justify-center">
                <Link
                  href="/products?filter=low_stock"
                  className="w-11 h-11 rounded-xl bg-amber-400/15 border border-amber-400/30 text-amber-300 flex items-center justify-center hover:bg-amber-400/25 transition-all"
                >
                  <AlertTriangle className="w-5 h-5 text-amber-400 animate-pulse" />
                </Link>
                {/* Floating pill tooltip */}
                <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 px-3.5 py-1.5 rounded-xl bg-[#e3e3e3] text-zinc-900 text-xs font-semibold whitespace-nowrap shadow-xl pointer-events-none opacity-0 group-hover:opacity-100 transition-all duration-150 z-50">
                  ⚠️ {lowStockItems.length} Low Stock Alert
                </div>
              </div>
            )}
          </>
        )}

        {/* Gemini-Style User Profile */}
        {!collapsed ? (
          /* EXPANDED PROFILE: Green Avatar 'M' + Name + Settings Gear + Logout */
          <div className="flex items-center justify-between p-2 rounded-xl hover:bg-white/10 transition-colors mx-1">
            <div className="flex items-center gap-2.5 truncate">
              {/* Green circular avatar M (like in Gemini screenshot) */}
              <div className="w-8 h-8 rounded-full bg-[#4CAF50] text-white font-bold text-xs flex items-center justify-center shadow-xs shrink-0">
                {userInitial}
              </div>
              <div className="flex flex-col truncate leading-tight">
                <span className="text-xs font-bold text-white truncate">
                  {displayName}
                </span>
                {displayEmail ? (
                  <span className="text-[10px] text-cyan-200/70 truncate">
                    {displayEmail}
                  </span>
                ) : null}
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {/* Settings Gear Icon */}
              <Link
                href="/settings"
                className="w-7 h-7 rounded-lg hover:bg-white/10 text-slate-300 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
                title="Workspace Settings"
              >
                <Settings className="w-3.5 h-3.5" />
              </Link>

              {/* Logout Button */}
              <button
                onClick={() => logout()}
                className="w-7 h-7 rounded-lg hover:bg-rose-500/20 text-slate-300 hover:text-rose-300 flex items-center justify-center transition-colors cursor-pointer"
                title="Sign Out"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ) : (
          /* COLLAPSED PROFILE: Settings Gear + Green Avatar M with Tooltips */
          <div className="flex flex-col items-center gap-1.5">
            {/* Settings Gear Icon */}
            <div className="relative group">
              <Link
                href="/settings"
                className="w-11 h-11 rounded-xl hover:bg-white/10 text-slate-300 hover:text-white flex items-center justify-center transition-all cursor-pointer"
                aria-label="Workspace Settings"
              >
                <Settings className="w-5 h-5 text-slate-300" />
              </Link>
              <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 px-3.5 py-1.5 rounded-xl bg-[#e3e3e3] text-zinc-900 text-xs font-semibold whitespace-nowrap shadow-xl pointer-events-none opacity-0 group-hover:opacity-100 transition-all duration-150 z-50">
                Workspace Settings
              </div>
            </div>

            {/* Green Circular Avatar 'M' */}
            <div className="relative group">
              <div className="w-10 h-10 rounded-full bg-[#4CAF50] text-white font-bold text-sm flex items-center justify-center shadow-xs cursor-default">
                {userInitial}
              </div>
              <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 px-3.5 py-1.5 rounded-xl bg-[#e3e3e3] text-zinc-900 text-xs font-semibold whitespace-nowrap shadow-xl pointer-events-none opacity-0 group-hover:opacity-100 transition-all duration-150 z-50">
                {displayName}
              </div>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
