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
  CheckCircle2,
  Layers,
  Cpu,
  Database,
  Building2,
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
    <div className="min-h-screen w-full flex flex-col lg:flex-row bg-slate-50 selection:bg-indigo-600 selection:text-white font-sans antialiased">
      {/* ========================================================= */}
      {/* LEFT COLUMN: Platform Visual Showcase & Enterprise Branding */}
      {/* ========================================================= */}
      <div className="lg:w-[50%] xl:w-[52%] relative flex flex-col justify-between p-6 sm:p-10 lg:p-12 xl:p-14 bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 text-white overflow-hidden border-b lg:border-b-0 lg:border-r border-slate-800/80 shadow-2xl">
        {/* Ambient Glows */}
        <div className="absolute -top-32 -left-32 w-96 h-96 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-10 right-10 w-96 h-96 bg-cyan-500/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-[radial-gradient(#4f46e5_1px,transparent_1px)] [background-size:32px_32px] opacity-15 pointer-events-none" />

        {/* Top Branding */}
        <div className="relative z-10 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-indigo-500 via-indigo-600 to-cyan-500 p-0.5 shadow-lg shadow-indigo-500/30 flex items-center justify-center">
                <div className="w-full h-full bg-slate-950/60 rounded-[14px] backdrop-blur-sm flex items-center justify-center">
                  <Boxes className="w-6 h-6 text-cyan-300" />
                </div>
              </div>
              <div>
                <span className="text-xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-300 bg-clip-text text-transparent">
                  Whoopit IMS
                </span>
                <span className="block text-[11px] font-medium text-indigo-300/80 tracking-wide">
                  Enterprise Inventory OS
                </span>
              </div>
            </div>

            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-400/20 text-indigo-300 text-xs font-semibold backdrop-blur-md">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>v4 Live Engine</span>
            </div>
          </div>
        </div>

        {/* Centerpiece 3D Visual & Floating Highlights */}
        <div className="relative z-10 my-8 lg:my-auto flex flex-col items-center">
          {/* Main Visual Frame */}
          <div className="relative w-full max-w-md lg:max-w-lg group">
            {/* Soft Ambient Border Ring */}
            <div className="absolute -inset-1 rounded-3xl bg-gradient-to-r from-indigo-500 via-purple-500 to-cyan-500 opacity-40 blur-lg group-hover:opacity-60 transition duration-700" />
            
            <div className="relative rounded-2xl sm:rounded-3xl overflow-hidden border border-white/15 bg-slate-900/80 shadow-2xl backdrop-blur-xl">
              <img
                src="/images/login_showcase.jpg"
                alt="Whoopit Inventory Platform Architecture & Warehouse Simulation"
                className="w-full h-[320px] sm:h-[400px] lg:h-[420px] object-cover object-center transform group-hover:scale-[1.02] transition-transform duration-700 ease-out"
              />

              {/* Gradient Scrim on Top of Image */}
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/20 to-transparent opacity-80" />

              {/* Floating Pill: Double-Entry Ledger */}
              <div className="absolute top-4 left-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900/85 border border-white/15 text-slate-200 text-xs font-semibold backdrop-blur-md shadow-lg">
                <Database className="w-3.5 h-3.5 text-cyan-400" />
                <span>Double-Entry Stock Ledger</span>
              </div>

              {/* Floating Pill: Postgres 18 RLS */}
              <div className="absolute top-4 right-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900/85 border border-white/15 text-slate-200 text-xs font-semibold backdrop-blur-md shadow-lg">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>Zero-Leak Tenant Isolation</span>
              </div>

              {/* Lower Overlay Text Card */}
              <div className="absolute bottom-4 left-4 right-4 p-4 rounded-xl sm:rounded-2xl bg-slate-900/90 border border-white/10 backdrop-blur-md space-y-1">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
                  <span className="flex items-center gap-1.5 text-cyan-300">
                    <Layers className="w-3.5 h-3.5" />
                    <span>Real-Time Logistics Telemetry</span>
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">14,350+ SKU Nodes</span>
                </div>
                <p className="text-[11px] text-slate-400 leading-snug">
                  Automated barcode tracking, stock reconciliation, multi-store dispatch, and master admin tenant controls.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Feature Badges */}
        <div className="relative z-10 pt-4 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5">
              <Cpu className="w-4 h-4 text-indigo-400" />
              <span>Golang Micro-Engine</span>
            </span>
            <span className="flex items-center gap-1.5">
              <Building2 className="w-4 h-4 text-cyan-400" />
              <span>Multi-Store SaaS</span>
            </span>
          </div>
          <span className="text-[11px] text-slate-500 font-mono">
            &copy; {new Date().getFullYear()} Whoopit Technologies
          </span>
        </div>
      </div>

      {/* ========================================================= */}
      {/* RIGHT COLUMN: Clean, Ultra-Professional Login Panel       */}
      {/* ========================================================= */}
      <div className="lg:w-[50%] xl:w-[48%] flex flex-col justify-center px-6 py-10 sm:px-12 lg:px-14 xl:px-20 bg-white relative">
        {/* Subtle Decorative Pattern */}
        <div
          className="absolute inset-0 pointer-events-none opacity-[0.035]"
          style={{
            backgroundImage: "radial-gradient(#4f46e5 1px, transparent 1px)",
            backgroundSize: "20px 20px",
          }}
        />

        <div className="w-full max-w-md mx-auto space-y-6 relative z-10">
          {/* Header */}
          <div className="space-y-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-700 text-xs font-semibold mb-1">
              <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
              <span>Secure Authentication Portal</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
              Welcome back
            </h1>
            <p className="text-sm text-slate-500">
              Please enter your credentials or select an account below to sign in to your workspace.
            </p>
          </div>

          {/* 1-Click Fast Account Switcher Cards */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
              <span className="flex items-center gap-1.5">
                <span>Select quick account:</span>
              </span>
              <span className="text-[11px] text-indigo-600 font-medium">1-click test fill</span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* Account Card 1: Admin */}
              <button
                type="button"
                onClick={() => handleQuickFill("admin", "admin@whoopit.io", "AdminPass123!")}
                className={cn(
                  "p-3 rounded-xl border text-left cursor-pointer transition-all duration-200 relative group flex flex-col justify-between gap-2",
                  selectedAccount === "admin"
                    ? "bg-indigo-50/90 border-indigo-500 shadow-sm shadow-indigo-500/10 ring-2 ring-indigo-500/20"
                    : "bg-slate-50 hover:bg-slate-100/80 border-slate-200 text-slate-600"
                )}
              >
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-2">
                    <div className={cn(
                      "w-7 h-7 rounded-lg flex items-center justify-center transition-colors",
                      selectedAccount === "admin" ? "bg-indigo-600 text-white" : "bg-slate-200 text-slate-700"
                    )}>
                      <Shield className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-xs font-bold text-slate-900 block leading-tight">Master Admin</span>
                      <span className="text-[10px] text-indigo-600 font-semibold">SuperAdmin</span>
                    </div>
                  </div>
                  {selectedAccount === "admin" && (
                    <CheckCircle2 className="w-4 h-4 text-indigo-600 flex-shrink-0" />
                  )}
                </div>
                <span className="text-[11px] text-slate-500 font-mono truncate w-full">
                  admin@whoopit.io
                </span>
              </button>

              {/* Account Card 2: Store Staff */}
              <button
                type="button"
                onClick={() => handleQuickFill("staff", "staff@whoopit.io", "StaffPass123!")}
                className={cn(
                  "p-3 rounded-xl border text-left cursor-pointer transition-all duration-200 relative group flex flex-col justify-between gap-2",
                  selectedAccount === "staff"
                    ? "bg-amber-50/90 border-amber-500 shadow-sm shadow-amber-500/10 ring-2 ring-amber-500/20"
                    : "bg-slate-50 hover:bg-slate-100/80 border-slate-200 text-slate-600"
                )}
              >
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-2">
                    <div className={cn(
                      "w-7 h-7 rounded-lg flex items-center justify-center transition-colors",
                      selectedAccount === "staff" ? "bg-amber-500 text-slate-950 font-bold" : "bg-slate-200 text-slate-700"
                    )}>
                      <Store className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-xs font-bold text-slate-900 block leading-tight">Store User</span>
                      <span className="text-[10px] text-amber-700 font-semibold">Staff Client</span>
                    </div>
                  </div>
                  {selectedAccount === "staff" && (
                    <CheckCircle2 className="w-4 h-4 text-amber-600 flex-shrink-0" />
                  )}
                </div>
                <span className="text-[11px] text-slate-500 font-mono truncate w-full">
                  staff@whoopit.io
                </span>
              </button>
            </div>
          </div>

          {/* Error Message */}
          {errorMsg && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2.5 animate-in fade-in duration-200">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-rose-600" />
              <div className="space-y-0.5">
                <span className="font-semibold block text-rose-800">Authentication Failed</span>
                <span className="text-[11px] text-rose-600 leading-tight">{errorMsg}</span>
              </div>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email Field */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 block">
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
                  className="w-full pl-10 pr-3.5 py-2.5 text-sm rounded-xl bg-slate-50 hover:bg-slate-50/80 border border-slate-200 text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-indigo-600 focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all duration-200"
                />
              </div>
            </div>

            {/* Password Field */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-700">Password</label>
                <span className="text-[11px] text-slate-400">Encrypted via BCrypt</span>
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
                  className="w-full pl-10 pr-10 py-2.5 text-sm rounded-xl bg-slate-50 hover:bg-slate-50/80 border border-slate-200 text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-indigo-600 focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all duration-200"
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

            {/* Session & Security */}
            <div className="flex items-center justify-between pt-1 text-xs text-slate-500">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="w-4 h-4 rounded text-indigo-600 border-slate-300 focus:ring-indigo-500 cursor-pointer"
                />
                <span className="text-slate-600 text-xs font-medium">Keep me signed in</span>
              </label>

              <span className="text-[11px] text-slate-400 font-medium">
                RLS Multi-Tenant
              </span>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={submitting || isLoading}
              className="w-full mt-2 py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-bold text-sm shadow-md shadow-indigo-600/25 hover:shadow-lg hover:shadow-indigo-600/30 flex items-center justify-center gap-2 transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
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
          <div className="pt-4 border-t border-slate-100 text-center space-y-2">
            <p className="text-xs text-slate-500">
              Need credentials for a new company or store?{" "}
              <span className="text-indigo-600 font-semibold block sm:inline">
                Managed via Admin Dashboard
              </span>
            </p>
            <div className="inline-flex items-center justify-center gap-1.5 text-[11px] text-slate-400">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
              <span>Isolated database tenant schema &bull; 256-bit JWT authentication</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
