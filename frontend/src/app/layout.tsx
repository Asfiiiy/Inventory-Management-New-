import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";
import { AppShell } from "@/components/layout/app-shell";

export const metadata: Metadata = {
  title: "Whoopit Inventory Platform (v4)",
  description: "Enterprise Multi-Tenant SaaS Engine with PostgreSQL RLS & Double-Entry Stock Ledger",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning className="h-full antialiased">
      <body className="h-full overflow-hidden bg-slate-50 text-slate-900 font-sans selection:bg-[#0c3843] selection:text-white">
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
