"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  apiClient,
  setAuthToken,
  getAuthToken,
  clearAuthToken,
  getTenantId,
  setTenantId,
  UserProfile,
} from "./api";

interface AuthContextType {
  user: UserProfile | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  isStaff: boolean;
  login: (
    email: string,
    password: string,
    options?: { rememberMe?: boolean; redirectTo?: string }
  ) => Promise<void>;
  register: (payload: { email: string; password: string; name?: string; org_name?: string }) => Promise<void>;
  logout: () => void;
}

const defaultAuthContext: AuthContextType = {
  user: null,
  token: null,
  isLoading: true,
  isAuthenticated: false,
  isAdmin: false,
  isSuperAdmin: false,
  isStaff: false,
  login: async () => {},
  register: async () => {},
  logout: () => {},
};

const AuthContext = createContext<AuthContextType>(defaultAuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(() => {
    if (typeof window !== "undefined") {
      try {
        const cachedUserStr = localStorage.getItem("whoopit_auth_user");
        if (cachedUserStr) return JSON.parse(cachedUserStr);
      } catch {
        // Ignore json parse error
      }
    }
    return null;
  });

  const [token, setTokenState] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      return getAuthToken();
    }
    return null;
  });

  const [isLoading, setIsLoading] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      const savedToken = getAuthToken();
      if (savedToken) return true;
    }
    return false;
  });

  // Verify session freshness with /auth/me in background
  useEffect(() => {
    async function initAuth() {
      const savedToken = getAuthToken();
      if (!savedToken) {
        setIsLoading(false);
        return;
      }

      setTokenState(savedToken);

      // Verify token freshness with live backend
      try {
        const res = await apiClient.auth.me();
        if (res.data) {
          setUser(res.data);
          localStorage.setItem("whoopit_auth_user", JSON.stringify(res.data));
          const roleLower = String(res.data.role || "").toLowerCase();
          const isMaster =
            roleLower === "superadmin" ||
            roleLower === "platform_admin" ||
            res.data.email === "admin@whoopit.io";
          const isStaffRole =
            roleLower === "staff" ||
            roleLower === "employee" ||
            roleLower === "storekeeper" ||
            roleLower === "viewer";
          const role = isMaster ? "admin" : isStaffRole ? "staff" : "client";
          localStorage.setItem("whoopit_auth_role", role);
          document.cookie = `whoopit_auth_role=${encodeURIComponent(role)}; path=/; max-age=604800; SameSite=Lax`;
          if (res.data.org_id) {
            const currentTenant = getTenantId();
            const isPreviewing = localStorage.getItem("whoopit_preview_store") === "true";
            if (!currentTenant || (!isPreviewing && res.data.role !== "superadmin")) {
              setTenantId(res.data.org_id);
            }
          }
        }
      } catch (err: any) {
        console.warn("Failed to refresh session profile:", err?.message);
        if (err?.status === 401) {
          clearAuthToken();
          setUser(null);
          setTokenState(null);
        }
      } finally {
        setIsLoading(false);
      }
    }

    initAuth();
  }, []);

  const login = useCallback(
    async (
      email: string,
      password: string,
      options?: { rememberMe?: boolean; redirectTo?: string }
    ) => {
      setIsLoading(true);
      try {
        const res = await apiClient.auth.login({ email, password });
        const { token: receivedToken, user: receivedUser } = res.data;

        const roleLower = String(receivedUser.role || "").toLowerCase();
        const isMaster =
          roleLower === "superadmin" ||
          roleLower === "platform_admin" ||
          receivedUser.email === "admin@whoopit.io";
        const isStaffLogin =
          roleLower === "staff" ||
          roleLower === "employee" ||
          roleLower === "storekeeper" ||
          roleLower === "viewer";
        const role = isMaster ? "admin" : isStaffLogin ? "staff" : "client";

        setAuthToken(receivedToken, role, options?.rememberMe !== false);
        setTokenState(receivedToken);
        setUser(receivedUser);
        localStorage.setItem("whoopit_auth_user", JSON.stringify(receivedUser));

        if (receivedUser.org_id) {
          setTenantId(receivedUser.org_id);
        }

        const requested = options?.redirectTo;
        const safeNext =
          requested &&
          requested.startsWith("/") &&
          !requested.startsWith("//") &&
          !requested.startsWith("/login")
            ? requested
            : null;

        // SuperAdmin → /admin; company admin → /dashboard; staff → /my-assets
        const destination =
          safeNext ||
          (isMaster ? "/admin" : isStaffLogin ? "/my-assets" : "/dashboard");
        if (typeof window !== "undefined") {
          window.location.href = destination;
        } else {
          router.push(destination);
        }
      } finally {
        setIsLoading(false);
      }
    },
    [router]
  );

  const register = useCallback(
    async (payload: { email: string; password: string; name?: string; org_name?: string }) => {
      setIsLoading(true);
      try {
        const res = await apiClient.auth.register(payload);
        const { token: receivedToken, user: receivedUser } = res.data;

        setAuthToken(receivedToken);
        setTokenState(receivedToken);
        setUser(receivedUser);
        localStorage.setItem("whoopit_auth_user", JSON.stringify(receivedUser));

        if (receivedUser.org_id) {
          setTenantId(receivedUser.org_id);
        }

        if (typeof window !== "undefined") {
          window.location.href = "/dashboard";
        } else {
          router.push("/dashboard");
        }
      } finally {
        setIsLoading(false);
      }
    },
    [router]
  );

  const logout = useCallback(async () => {
    try {
      await apiClient.auth.logout();
    } catch {
      // always clear local session even if API revoke fails
    }
    clearAuthToken();
    setUser(null);
    setTokenState(null);
    if (typeof window !== "undefined") {
      window.location.href = "/login";
    } else {
      router.push("/login");
    }
  }, [router]);

  const role = (user?.role || "").toLowerCase();
  const isSuperAdmin = user?.email === "admin@whoopit.io" || role === "superadmin" || role === "platform_admin";
  const isAdmin =
    isSuperAdmin ||
    role === "owner" ||
    role === "admin" ||
    role === "manager";
  const isStaff =
    role === "staff" ||
    role === "employee" ||
    role === "storekeeper" ||
    role === "viewer";
  const isAuthenticated = !!token && !!user;

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        isAuthenticated,
        isAdmin,
        isSuperAdmin,
        isStaff,
        login,
        register,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  return context || defaultAuthContext;
}
