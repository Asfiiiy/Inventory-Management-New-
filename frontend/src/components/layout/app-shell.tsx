"use client";

import React, { useState, Suspense } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "./sidebar";
import { Header } from "./header";

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  return (
    <Suspense fallback={<div className="h-full w-full bg-slate-950 flex items-center justify-center text-xs text-slate-500">Loading...</div>}>
      <AppShellInner>{children}</AppShellInner>
    </Suspense>
  );
}

function AppShellInner({ children }: AppShellProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  // 1. Login Page: Full screen fixed (non-scrollable)
  if (pathname === "/login") {
    return <main className="h-full w-full overflow-hidden">{children}</main>;
  }

  // 2. Dashboard 1: Admin Portal (Standalone complete Executive Dashboard with its own sidebar)
  if (pathname.startsWith("/admin")) {
    return <main className="h-screen w-screen overflow-hidden bg-slate-50 text-slate-900">{children}</main>;
  }

  // 3. Dashboard 2: Software Dashboard (Client / Shopkeeper store software with store sidebar)
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#f4f7f9] text-slate-800 font-sans selection:bg-[#0c3843] selection:text-white">
      <Sidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed(!collapsed)}
      />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-[#f4f7f9]">
        <Header />

        <main className="flex-1 overflow-y-auto bg-[#f4f7f9] p-6 md:p-8">
          <div className="max-w-7xl mx-auto space-y-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
