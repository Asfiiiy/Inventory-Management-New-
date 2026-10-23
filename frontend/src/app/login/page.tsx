"use client";

import React, { useState } from "react";
import {
  Boxes,
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  ShieldCheck,
  Sparkles,
  Shield,
  Store,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

export default function LoginPage() {
  const { login, isLoading } = useAuth();

  const [selectedAccount, setSelectedAccount] = useState<"admin" | "staff" | "custom">("admin");
  const [email, setEmail] = useState("admin@whoopit.io");
  const [password, setPassword] = useState("AdminPass123!");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSubmitting(true);

    try {
      await login(email.trim(), password);
    } catch (err: any) {
      console.error("Auth error:", err);
      const detail =
        err?.problem?.detail ||
        err?.problem?.title ||
        err?.message ||
        "Authentication failed. Please verify your credentials.";
      setErrorMsg(detail);
    } finally {
      setSubmitting(false);
    }
  };

  const handleQuickFill = (accountType: "admin" | "staff", demoEmail: string, demoPass: string) => {
    setSelectedAccount(accountType);
    setEmail(demoEmail);
    setPassword(demoPass);
    setErrorMsg(null);
  };

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center p-4 sm:p-6 bg-gradient-to-br from-slate-50 via-indigo-50/30 to-sky-50/40 relative overflow-hidden selection:bg-indigo-500 selection:text-white">
      {/* Decorative ambient background mesh & light orbs */}
      <div className="absolute -top-32 -left-32 w-96 h-96 bg-indigo-300/25 rounded-full blur-3xl pointer-events-none animate-pulse" />
      <div className="absolute top-1/3 -right-24 w-80 h-80 bg-purple-300/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-28 left-1/3 w-96 h-96 bg-sky-200/30 rounded-full blur-3xl pointer-events-none" />

      {/* Subtle Dot Grid Overlay */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.4]"
        style={{
          backgroundImage: "radial-gradient(#6366f1 0.75px, transparent 0.75px)",
          backgroundSize: "24px 24px",
        }}
      />

      <div className="w-full max-w-md relative z-10 space-y-5 my-auto">
        {/* Brand Header */}
        <div className="text-center space-y-2.5">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-blue-500 text-white shadow-xl shadow-indigo-500/25 ring-4 ring-white/80 transition-transform duration-300 hover:scale-105 mb-0.5">
            <Boxes className="w-7 h-7" />
          </div>

          <div>
            <div className="flex items-center justify-center gap-2">
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
                Whoopit IMS
              </h1>
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 border border-indigo-200/80 shadow-2xs">
                v4 Enterprise
              </span>
            </div>
            <p className="text-xs text-slate-500 max-w-xs mx-auto mt-1">
              Multi-Tenant Inventory Platform &amp; Live Stock Ledger
            </p>
          </div>
        </div>

        {/* 1-Click Fast Account Switcher Card */}
        <div className="bg-white/80 border border-slate-200/80 rounded-2xl p-3 backdrop-blur-xl shadow-xs space-y-2 transition-all hover:border-slate-300">
          <div className="flex items-center justify-between text-[11px] text-slate-500 font-medium px-1">
            <span className="flex items-center gap-1.5 font-semibold text-slate-700">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span>Select Account to Sign In:</span>
            </span>
            <span className="text-[10px] text-slate-400 font-mono">1-click switch</span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {/* Account 1: Admin */}
            <button
              type="button"
              onClick={() => handleQuickFill("admin", "admin@whoopit.io", "AdminPass123!")}
              className={cn(
                "flex flex-col items-start p-2.5 rounded-xl border text-left cursor-pointer transition-all duration-200 relative group",
                selectedAccount === "admin"
                  ? "bg-indigo-50/90 border-indigo-500/80 shadow-sm shadow-indigo-500/10 ring-2 ring-indigo-500/20"
                  : "bg-slate-50/70 hover:bg-slate-100/80 border-slate-200/80 text-slate-600"
              )}
            >
              <div className="flex items-center justify-between w-full">
                <span className="text-[11px] font-bold text-indigo-700 flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5 text-indigo-600" />
                  <span>1. Admin (Hum)</span>
                </span>
                <span
                  className={cn(
                    "text-[9px] px-1.5 py-0.2 rounded-full font-bold uppercase tracking-wider",
                    selectedAccount === "admin"
                      ? "bg-indigo-600 text-white"
                      : "bg-slate-200/70 text-slate-600"
                  )}
                >
                  Admin
                </span>
              </div>
              <span className="text-[10px] text-slate-500 font-mono mt-1 truncate w-full">
                admin@whoopit.io
              </span>
            </button>

            {/* Account 2: Software Store User */}
            <button
              type="button"
              onClick={() => handleQuickFill("staff", "staff@whoopit.io", "StaffPass123!")}
              className={cn(
                "flex flex-col items-start p-2.5 rounded-xl border text-left cursor-pointer transition-all duration-200 relative group",
                selectedAccount === "staff"
                  ? "bg-amber-50/90 border-amber-500/80 shadow-sm shadow-amber-500/10 ring-2 ring-amber-500/20"
                  : "bg-slate-50/70 hover:bg-slate-100/80 border-slate-200/80 text-slate-600"
              )}
            >
              <div className="flex items-center justify-between w-full">
                <span className="text-[11px] font-bold text-amber-700 flex items-center gap-1.5">
                  <Store className="w-3.5 h-3.5 text-amber-600" />
                  <span>2. Store User</span>
                </span>
                <span
                  className={cn(
                    "text-[9px] px-1.5 py-0.2 rounded-full font-bold uppercase tracking-wider",
                    selectedAccount === "staff"
                      ? "bg-amber-500 text-slate-950 font-bold"
                      : "bg-slate-200/70 text-slate-600"
                  )}
                >
                  Store
                </span>
              </div>
              <span className="text-[10px] text-slate-500 font-mono mt-1 truncate w-full">
                staff@whoopit.io
              </span>
            </button>
          </div>
        </div>

        {/* Main Card */}
        <div className="bg-white/95 border border-slate-200/90 rounded-3xl p-6 sm:p-7 shadow-[0_20px_60px_-15px_rgba(15,23,42,0.08),0_0_0_1px_rgba(255,255,255,0.8)_inset] backdrop-blur-2xl space-y-5">
          <div className="space-y-1">
            <h2 className="text-lg font-bold text-slate-900 tracking-tight">
              Sign In to Your Workspace
            </h2>
            <p className="text-xs text-slate-500">
              Enter your credentials to access your store or admin dashboard.
            </p>
          </div>

          {/* Error Message */}
          {errorMsg && (
            <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2.5 shadow-2xs animate-in fade-in duration-200">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-rose-500" />
              <div className="space-y-0.5">
                <span className="font-semibold block">Authentication Failed</span>
                <span className="text-[11px] text-rose-600 leading-tight">{errorMsg}</span>
              </div>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email Field */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 block">
                Email Address
              </label>
              <div className="relative group">
                <Mail className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-600 transition-colors" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => {
                    const val = e.target.value;
                    setEmail(val);
                    if (val === "admin@whoopit.io") {
                      setSelectedAccount("admin");
                    } else if (val === "staff@whoopit.io") {
                      setSelectedAccount("staff");
                    } else {
                      setSelectedAccount("custom");
                    }
                  }}
                  placeholder="name@company.com"
                  className="w-full pl-10 pr-3.5 py-2.5 text-xs sm:text-sm rounded-xl bg-slate-50/70 hover:bg-slate-50 border border-slate-200 text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all duration-200"
                />
              </div>
            </div>

            {/* Password Field */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-700">Password</label>
                <span className="text-[11px] text-slate-400">Secured via BCrypt</span>
              </div>
              <div className="relative group">
                <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-600 transition-colors" />
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full pl-10 pr-10 py-2.5 text-xs sm:text-sm rounded-xl bg-slate-50/70 hover:bg-slate-50 border border-slate-200 text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all duration-200"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                  title={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Remember & Notice */}
            <div className="flex items-center justify-between pt-0.5 text-xs text-slate-500">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="w-4 h-4 rounded text-indigo-600 border-slate-300 focus:ring-indigo-500 cursor-pointer"
                />
                <span className="text-slate-600 text-[11px] font-medium">Remember session</span>
              </label>

              <span className="text-[11px] text-slate-400">
                RLS Multi-Tenant
              </span>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={submitting || isLoading}
              className="w-full mt-2 py-3 px-4 rounded-xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-blue-600 hover:from-indigo-700 hover:via-indigo-600 hover:to-blue-700 text-white font-bold text-xs sm:text-sm shadow-md shadow-indigo-600/20 hover:shadow-indigo-600/30 flex items-center justify-center gap-2 transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.99]"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                  <span>Signing In...</span>
                </>
              ) : (
                <>
                  <span>
                    {selectedAccount === "admin"
                      ? "Sign In to Admin Portal"
                      : selectedAccount === "staff"
                      ? "Sign In to Store Software"
                      : "Sign In to Workspace"}
                  </span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Provisioning Notice */}
          <div className="pt-2 border-t border-slate-100 text-center">
            <p className="text-[11px] text-slate-500">
              Need a new software instance?{" "}
              <span className="text-indigo-600 font-semibold">
                Provisioned exclusively by Master Admin
              </span>
            </p>
          </div>
        </div>

        {/* Security & Isolation Trust Footer */}
        <div className="flex flex-col items-center justify-center gap-1.5 text-center">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/70 border border-slate-200/70 text-[11px] text-slate-600 shadow-2xs backdrop-blur-sm">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>PostgreSQL 18 Row-Level Security &bull; 256-bit JWT Session</span>
          </div>
          <span className="text-[10px] text-slate-400">
            &copy; {new Date().getFullYear()} Whoopit IMS. All Rights Reserved.
          </span>
        </div>
      </div>
    </div>
  );
}
