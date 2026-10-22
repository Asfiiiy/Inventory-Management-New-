"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { setTenantId, DEFAULT_TENANT_ID } from "./api";

export type IndustryProfile = "office_it" | "warehouse" | "retail" | "factory";
export type UserRole = "admin" | "operator";

export interface TenantConfig {
  orgId: string;
  name: string;
  slug: string;
  profile: IndustryProfile;
  role: UserRole;
  modules: {
    custody: boolean;
    fefoLots: boolean;
    retailPOS: boolean;
    scrap: boolean;
  };
}

const defaultProfilesMap: Record<IndustryProfile, { name: string; modules: TenantConfig["modules"] }> = {
  office_it: {
    name: "Apex Global Technologies",
    modules: { custody: true, fefoLots: false, retailPOS: false, scrap: false },
  },
  warehouse: {
    name: "Atlas Logistics & Distribution",
    modules: { custody: false, fefoLots: true, retailPOS: false, scrap: true },
  },
  retail: {
    name: "Urban Brands Retail Group",
    modules: { custody: false, fefoLots: false, retailPOS: true, scrap: false },
  },
  factory: {
    name: "Precision Dynamics Assembly",
    modules: { custody: false, fefoLots: false, retailPOS: false, scrap: true },
  },
};

const initialConfig: TenantConfig = {
  orgId: DEFAULT_TENANT_ID,
  name: "Apex Global Technologies",
  slug: "apex-global",
  profile: "office_it",
  role: "admin",
  modules: {
    custody: true,
    fefoLots: false,
    retailPOS: false,
    scrap: false,
  },
};

interface TenantContextValue {
  tenant: TenantConfig;
  updateProfile: (profile: IndustryProfile) => void;
  updateRole: (role: UserRole) => void;
  updateOrgId: (orgId: string) => void;
  toggleModule: (moduleKey: keyof TenantConfig["modules"]) => void;
  updateTenantName: (name: string) => void;
}

const TenantContext = createContext<TenantContextValue | undefined>(undefined);

export function TenantProvider({ children }: { children: React.ReactNode }) {
  const [tenant, setTenant] = useState<TenantConfig>(initialConfig);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("whoopit_tenant_config");
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          setTenant(parsed);
          setTenantId(parsed.orgId);
        } catch {
          // ignore parsing error
        }
      }
      setIsLoaded(true);
    }
  }, []);

  const saveConfig = (newConfig: TenantConfig) => {
    setTenant(newConfig);
    setTenantId(newConfig.orgId);
    if (typeof window !== "undefined") {
      localStorage.setItem("whoopit_tenant_config", JSON.stringify(newConfig));
    }
  };

  const updateProfile = (profile: IndustryProfile) => {
    const profileDefaults = defaultProfilesMap[profile];
    const newConfig: TenantConfig = {
      ...tenant,
      profile,
      name: profileDefaults.name,
      modules: { ...profileDefaults.modules },
    };
    saveConfig(newConfig);
  };

  const updateRole = (role: UserRole) => {
    saveConfig({ ...tenant, role });
  };

  const updateOrgId = (orgId: string) => {
    saveConfig({ ...tenant, orgId });
  };

  const updateTenantName = (name: string) => {
    saveConfig({ ...tenant, name });
  };

  const toggleModule = (moduleKey: keyof TenantConfig["modules"]) => {
    const newConfig: TenantConfig = {
      ...tenant,
      modules: {
        ...tenant.modules,
        [moduleKey]: !tenant.modules[moduleKey],
      },
    };
    saveConfig(newConfig);
  };

  return (
    <TenantContext.Provider
      value={{
        tenant,
        updateProfile,
        updateRole,
        updateOrgId,
        toggleModule,
        updateTenantName,
      }}
    >
      {children}
    </TenantContext.Provider>
  );
}

export function useTenant() {
  const context = useContext(TenantContext);
  if (!context) {
    throw new Error("useTenant must be used within a TenantProvider");
  }
  return context;
}
