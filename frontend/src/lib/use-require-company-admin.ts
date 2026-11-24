"use client";

import { useEffect } from "react";
import { useAuth } from "@/lib/auth-context";

/**
 * Company Office IT admin-only pages.
 * Staff → /my-assets; SuperAdmin stays (preview); unauthenticated → /login.
 */
export function useRequireCompanyAdmin() {
  const { user, isLoading, isStaff, isAdmin, isSuperAdmin } = useAuth();

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      window.location.href = "/login";
      return;
    }
    if (isSuperAdmin) return;
    if (isStaff && !isAdmin) {
      window.location.href = "/my-assets";
    }
  }, [isLoading, user, isStaff, isAdmin, isSuperAdmin]);

  return {
    ready: !isLoading && !!user && (isSuperAdmin || isAdmin || !(isStaff && !isAdmin)),
    isLoading,
  };
}
