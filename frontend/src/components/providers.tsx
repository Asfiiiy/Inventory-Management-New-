"use client";

import React, { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { InventoryProvider } from "@/lib/inventory-store";
import { ToastProvider } from "@/components/ui/toast";

function TenantInventoryWrapper({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated } = useAuth();
  // Keying InventoryProvider with the user's specific org_id guarantees that whenever
  // a user logs in, logs out, or switches accounts, React completely destroys the previous
  // tenant's inventory state in memory and mounts an isolated, fresh instance.
  const tenantKey = user?.org_id || (isAuthenticated ? "auth-user" : "guest");
  return <InventoryProvider key={tenantKey}>{children}</InventoryProvider>;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5 * 1000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="light"
      enableSystem
      disableTransitionOnChange
    >
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <AuthProvider>
            <TenantInventoryWrapper>{children}</TenantInventoryWrapper>
          </AuthProvider>
        </ToastProvider>
      </QueryClientProvider>
    </NextThemesProvider>
  );
}
