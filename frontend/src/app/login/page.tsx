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
  Loader2,
  AlertCircle,
  TrendingUp,
  Sparkles,
  Server,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";

export default function LoginPage() {
  const { login, isLoading } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
        "Authentication failed. Please check your credentials.";
      setErrorMsg(detail);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="h-screen w-screen overflow-hidden flex items-center justify-center p-3 sm:p-5 lg:p-8 bg-gradient-to-br from-slate-100 via-[#e1ecf0] to-[#cfe0e6] relative font-sans selection:bg-[#0c3843] selection:text-white">
      {/* ========================================================= */}
      {/* RICH AMBIENT BACKGROUND: Glows, Dots, & Floating Accents  */}
      {/* ========================================================= */}
      
      {/* Soft Ambient Colorful Blurred Orbs */}
      <div className="absolute -top-24 -left-24 w-[480px] h-[480px] bg-teal-400/25 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute -top-20 -right-20 w-[450px] h-[450px] bg-indigo-400/20 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute -bottom-28 left-1/4 w-[520px] h-[440px] bg-[#0c3843]/18 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute -bottom-20 -right-16 w-[400px] h-[400px] bg-cyan-400/20 rounded-full blur-[90px] pointer-events-none" />

      {/* Subtle Architectural Dot Matrix Overlay */}
      <div
        className="absolute inset-0 pointer-events-none opacity-45 [mask-image:radial-gradient(ellipse_75%_75%_at_50%_50%,#000_65%,transparent_100%)]"
        style={{
          backgroundImage: "radial-gradient(#0c3843 0.9px, transparent 0.9px)",
          backgroundSize: "22px 22px",
        }}
      />

      {/* Floating Ambient Micro Badges in Background */}
      <div className="hidden xl:flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/70 border border-white/80 shadow-sm backdrop-blur-md text-[11px] font-semibold text-[#0c3843] absolute top-7 left-10 pointer-events-none animate-in fade-in duration-500">
        <Sparkles className="w-3.5 h-3.5 text-teal-600" />
        <span>Enterprise Multi-Tenant Engine</span>
      </div>

      <div className="hidden xl:flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/70 border border-white/80 shadow-sm backdrop-blur-md text-[11px] font-semibold text-[#0c3843] absolute bottom-7 right-10 pointer-events-none animate-in fade-in duration-500">
        <Server className="w-3.5 h-3.5 text-cyan-600" />
        <span>99.99% Uptime SLA &bull; Double-Entry Stock Ledger</span>
      </div>

      {/* ========================================================= */}
      {/* MAIN FLOATING CARD WRAPPER WITH SOFT COLORED HALO GLOW   */}
      {/* ========================================================= */}
      <div className="relative z-10 w-full max-w-4xl xl:max-w-[980px]">
        {/* Soft Colored Halo directly behind card */}
        <div className="absolute -inset-1.5 bg-gradient-to-r from-teal-500/20 via-[#0c3843]/15 to-cyan-500/20 rounded-[38px] blur-xl opacity-75 pointer-events-none" />

        {/* 2-Sided Split Card */}
        <div className="relative w-full bg-white rounded-[26px] sm:rounded-[32px] overflow-hidden shadow-[0_25px_60px_-15px_rgba(12,56,67,0.2),0_0_0_1px_rgba(255,255,255,0.9)_inset] flex flex-col lg:flex-row max-h-[92vh] sm:max-h-[600px] lg:max-h-[560px]">
          
          {/* ======================================================= */}
          {/* LEFT COLUMN: Deep Petrol Teal Showcase Panel            */}
          {/* ======================================================= */}
          <div className="lg:w-1/2 bg-[#0c3843] p-6 sm:p-8 lg:p-9 flex flex-col justify-between relative overflow-hidden text-white order-2 lg:order-1">
            
            {/* Geometric Floating Cubes (Top Left) */}
            <div className="absolute top-3 left-3 flex flex-col gap-2 opacity-25 pointer-events-none">
              <div className="flex gap-2">
                <div className="w-7 h-7 rounded-lg bg-white/40" />
                <div className="w-5 h-5 rounded-md bg-white/30" />
                <div className="w-3.5 h-3.5 rounded-sm bg-white/20" />
              </div>
              <div className="flex gap-2 pl-3">
                <div className="w-4 h-4 rounded-md bg-white/30" />
                <div className="w-5 h-5 rounded-md bg-white/20" />
              </div>
            </div>

            {/* Geometric Floating Cubes (Bottom Right) */}
            <div className="absolute bottom-4 right-4 flex flex-col gap-1.5 opacity-20 pointer-events-none">
              <div className="flex gap-1.5 justify-end">
                <div className="w-6 h-6 rounded-md bg-white/20" />
                <div className="w-4 h-4 rounded-sm bg-white/30" />
              </div>
              <div className="flex gap-1.5 justify-end pr-2.5">
                <div className="w-5 h-5 rounded-md bg-white/25" />
                <div className="w-3.5 h-3.5 rounded-sm bg-white/40" />
              </div>
            </div>

            {/* Top Pill / Status Tag */}
            <div className="relative z-10 flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 border border-white/15 text-cyan-200 text-xs font-semibold backdrop-blur-md">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>Real-Time Inventory Engine</span>
              </span>

              <span className="text-[10px] font-mono text-cyan-200/60 hidden sm:inline-block">
                PostgreSQL 18 RLS
              </span>
            </div>

            {/* Centerpiece: Floating Analytics & Donut KPI Cards */}
            <div className="relative z-10 my-4 sm:my-auto max-w-sm sm:max-w-md mx-auto w-full">
              {/* Main Analytics Card */}
              <div className="bg-white rounded-2xl p-4 sm:p-5 shadow-[0_15px_40px_rgba(0,0,0,0.22)] text-slate-800 border border-white/50 relative">
                
                {/* Header */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs sm:text-sm font-bold text-slate-900">
                      Analytics
                    </span>
                    <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full flex items-center gap-1">
                      <TrendingUp className="w-3 h-3" />
                      +18.4%
                    </span>
                  </div>

                  {/* Period Pills */}
                  <div className="flex items-center p-0.5 bg-slate-100 rounded-lg text-[10px] font-semibold text-slate-500">
                    <span className="px-2 py-0.5 bg-white text-slate-900 rounded-md shadow-2xs">
                      Weekly
                    </span>
                    <span className="px-2 py-0.5 hover:text-slate-800 cursor-pointer">
                      Monthly
                    </span>
                    <span className="px-2 py-0.5 hover:text-slate-800 cursor-pointer">
                      Yearly
                    </span>
                  </div>
                </div>

                {/* Multi-line Trend SVG Chart */}
                <div className="h-20 sm:h-24 w-full pt-1">
                  <svg viewBox="0 0 320 80" className="w-full h-full overflow-visible">
                    <defs>
                      <linearGradient id="gradientCyan" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stopColor="#0c3843" stopOpacity="0.22" />
                        <stop offset="100%" stopColor="#0c3843" stopOpacity="0.0" />
                      </linearGradient>
                      <linearGradient id="gradientAmber" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.18" />
                        <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.0" />
                      </linearGradient>
                    </defs>

                    {/* Guide Lines */}
                    <line x1="0" y1="15" x2="320" y2="15" stroke="#f1f5f9" strokeWidth="1" strokeDasharray="3 3" />
                    <line x1="0" y1="40" x2="320" y2="40" stroke="#f1f5f9" strokeWidth="1" strokeDasharray="3 3" />
                    <line x1="0" y1="65" x2="320" y2="65" stroke="#f1f5f9" strokeWidth="1" strokeDasharray="3 3" />

                    {/* Area 1: Inflow */}
                    <path
                      d="M 0,60 Q 40,30 80,45 T 160,22 T 240,35 T 320,15 L 320,80 L 0,80 Z"
                      fill="url(#gradientCyan)"
                    />
                    {/* Line 1 */}
                    <path
                      d="M 0,60 Q 40,30 80,45 T 160,22 T 240,35 T 320,15"
                      fill="none"
                      stroke="#0c3843"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                    />

                    {/* Line 2 */}
                    <path
                      d="M 0,70 Q 40,55 80,35 T 160,42 T 240,24 T 320,32"
                      fill="none"
                      stroke="#06b6d4"
                      strokeWidth="2"
                      strokeDasharray="4 4"
                      strokeLinecap="round"
                    />

                    {/* Dot */}
                    <circle cx="240" cy="35" r="4" fill="#0c3843" stroke="#ffffff" strokeWidth="2" />
                  </svg>
                </div>

                {/* Days */}
                <div className="flex items-center justify-between text-[9px] font-semibold text-slate-400 mt-1 px-1">
                  <span>MON</span>
                  <span>TUE</span>
                  <span>WED</span>
                  <span>THU</span>
                  <span>FRI</span>
                  <span>SAT</span>
                </div>
              </div>

              {/* Overlapping Donut Card */}
              <div className="absolute -bottom-6 -right-2 sm:-right-4 w-32 sm:w-40 bg-white rounded-2xl p-2.5 sm:p-3 shadow-[0_15px_35px_rgba(0,0,0,0.22)] border border-white/60 text-slate-800">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                    Stock Health
                  </span>
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                </div>

                <div className="flex items-center gap-2.5">
                  <div className="relative w-10 h-10 flex-shrink-0 flex items-center justify-center">
                    <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                      <circle
                        cx="18"
                        cy="18"
                        r="14"
                        fill="none"
                        stroke="#e2e8f0"
                        strokeWidth="3.5"
                      />
                      <circle
                        cx="18"
                        cy="18"
                        r="14"
                        fill="none"
                        stroke="#0c3843"
                        strokeWidth="3.8"
                        strokeDasharray="88, 100"
                        strokeLinecap="round"
                      />
                    </svg>
                    <span className="absolute text-[9px] font-extrabold text-slate-800">
                      94%
                    </span>
                  </div>

                  <div className="space-y-0.2">
                    <span className="text-[11px] font-bold text-slate-900 block leading-tight">
                      Optimized
                    </span>
                    <span className="text-[9px] text-slate-400 block leading-tight">
                      0-Variance
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom Caption */}
            <div className="relative z-10 pt-4 space-y-1.5 text-center lg:text-left">
              <h2 className="text-base sm:text-lg font-bold tracking-tight text-white">
                Very simple way you can manage
              </h2>
              <p className="text-[11px] text-slate-300 leading-snug max-w-xs">
                Welcome to Whoopit Inventory Management System! Efficiently track, audit, and dispatch multi-store stock with ease.
              </p>

              {/* Dots */}
              <div className="flex items-center justify-center lg:justify-start gap-1.5 pt-1">
                <span className="w-5 h-1.5 rounded-full bg-white transition-all" />
                <span className="w-1.5 h-1.5 rounded-full bg-white/40" />
                <span className="w-1.5 h-1.5 rounded-full bg-white/40" />
              </div>
            </div>
          </div>

          {/* ======================================================= */}
          {/* RIGHT COLUMN: Clean White Form Area (Login on Right)    */}
          {/* ======================================================= */}
          <div className="lg:w-1/2 p-6 sm:p-8 lg:p-9 xl:p-10 flex flex-col justify-between bg-white relative order-1 lg:order-2">
            
            {/* Top Brand Logo */}
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-xl bg-[#0c3843] flex items-center justify-center text-white shadow-md shadow-[#0c3843]/20">
                <Boxes className="w-4 h-4 text-cyan-300" />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-lg font-extrabold tracking-tight text-slate-900">
                  Whoopit
                </span>
                <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                  IMS
                </span>
              </div>
            </div>

            {/* Main Form Block */}
            <div className="space-y-4 my-auto">
              <div className="space-y-1">
                <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-slate-900">
                  Sign in to your account
                </h1>
                <p className="text-xs text-slate-500">
                  Welcome back! Please enter your details to sign in.
                </p>
              </div>

              {/* Error Message Alert */}
              {errorMsg && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2 animate-in fade-in duration-200">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-rose-600" />
                  <div className="space-y-0.5">
                    <span className="font-semibold block text-rose-800 text-[11px]">Authentication Failed</span>
                    <span className="text-[10px] text-rose-600 leading-tight">{errorMsg}</span>
                  </div>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-3.5">
                {/* Email Address */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 block">
                    Email
                  </label>
                  <div className="relative group">
                    <Mail className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-[#0c3843] transition-colors" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Enter your email"
                      className="w-full pl-10 pr-3.5 py-2.5 sm:py-3 text-xs sm:text-sm rounded-xl bg-slate-50/80 hover:bg-slate-50 border border-slate-200 text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-[#0c3843] focus:ring-4 focus:ring-[#0c3843]/10 outline-none transition-all duration-200"
                    />
                  </div>
                </div>

                {/* Password */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-700">Password</label>
                  </div>
                  <div className="relative group">
                    <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-[#0c3843] transition-colors" />
                    <input
                      type={showPassword ? "text" : "password"}
                      required
                      minLength={6}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      className="w-full pl-10 pr-10 py-2.5 sm:py-3 text-xs sm:text-sm rounded-xl bg-slate-50/80 hover:bg-slate-50 border border-slate-200 text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-[#0c3843] focus:ring-4 focus:ring-[#0c3843]/10 outline-none transition-all duration-200"
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

                {/* Checkbox Options */}
                <div className="flex items-center justify-between pt-0.5 text-xs text-slate-500">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="w-3.5 h-3.5 rounded text-[#0c3843] border-slate-300 focus:ring-[#0c3843] cursor-pointer"
                    />
                    <span className="text-slate-600 text-xs font-medium">
                      Remember me on this device
                    </span>
                  </label>

                  <span className="text-[10px] text-slate-400 font-medium">
                    RLS Protected
                  </span>
                </div>

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={submitting || isLoading}
                  className="w-full mt-2 py-3 px-4 rounded-xl bg-[#0c3843] hover:bg-[#082931] active:bg-[#062026] text-white font-bold text-xs sm:text-sm shadow-md shadow-[#0c3843]/20 hover:shadow-lg hover:shadow-[#0c3843]/25 flex items-center justify-center gap-2 transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-white" />
                      <span>Signing in...</span>
                    </>
                  ) : (
                    <>
                      <span>Sign in</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>
            </div>

            {/* Bottom Security / Support Footer */}
            <div className="pt-4 mt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400">
              <span className="flex items-center gap-1.5 text-slate-500">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span>Multi-Tenant Enterprise Security</span>
              </span>
              <span className="text-slate-400 font-mono">v4.2.0</span>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
