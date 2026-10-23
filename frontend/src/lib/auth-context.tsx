"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  apiClient,
  setAuthToken,
  getAuthToken,
  clearAuthToken,
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
  login: (email: string, password: string) => Promise<void>;
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
  const [user, setUser] = useState<UserProfile | null>(null);
  const [token, setTokenState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Initialize session from localStorage and refresh with /auth/me
  useEffect(() => {
    async function initAuth() {
      const savedToken = getAuthToken();
      if (!savedToken) {
        setIsLoading(false);
        return;
      }

      setTokenState(savedToken);

      // Restore cached user immediately for fast UI paint
      const cachedUserStr = localStorage.getItem("whoopit_auth_user");
      if (cachedUserStr) {
        try {
          setUser(JSON.parse(cachedUserStr));
        } catch {
          // Ignore json parse error
        }
      }

      // Verify token freshness with live backend
      try {
        const res = await apiClient.auth.me();
        if (res.data) {
          setUser(res.data);
          localStorage.setItem("whoopit_auth_user", JSON.stringify(res.data));
          const isMaster =
            res.data.role === "superadmin" || res.data.email === "admin@whoopit.io";
          const role = isMaster ? "admin" : "client";
          localStorage.setItem("whoopit_auth_role", role);
          document.cookie = `whoopit_auth_role=${encodeURIComponent(role)}; path=/; max-age=604800; SameSite=Lax`;
          if (res.data.org_id) {
            setTenantId(res.data.org_id);
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
    async (email: string, password: string, targetRedirect?: string) => {
      setIsLoading(true);
      try {
        const res = await apiClient.auth.login({ email, password });
        const { token: receivedToken, user: receivedUser } = res.data;

        const isMaster =
          receivedUser.role === "superadmin" || receivedUser.email === "admin@whoopit.io";
        const role = isMaster ? "admin" : "client";

        setAuthToken(receivedToken, role);
        setTokenState(receivedToken);
        setUser(receivedUser);
        localStorage.setItem("whoopit_auth_user", JSON.stringify(receivedUser));

        if (receivedUser.org_id) {
          setTenantId(receivedUser.org_id);
        }

        if (targetRedirect) {
          router.push(targetRedirect);
        } else if (isMaster) {
          router.push("/admin");
        } else {
          router.push("/");
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

        router.push("/");
      } finally {
        setIsLoading(false);
      }
    },
    [router]
  );

  const logout = useCallback(() => {
    clearAuthToken();
    setUser(null);
    setTokenState(null);
    router.push("/login");
  }, [router]);

  const isSuperAdmin = user?.email === "admin@whoopit.io" || user?.role === "superadmin";
  const isAdmin = user?.role === "owner" || user?.role === "admin" || user?.role === "superadmin";
  const isStaff = user?.role === "staff" || user?.role === "employee";
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
