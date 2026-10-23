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
    <div className="min-h-screen w-full flex items-center justify-center p-3 sm:p-6 lg:p-10 bg-slate-100 font-sans selection:bg-[#0c3843] selection:text-white">
      {/* ========================================================= */}
      {/* MAIN CONTAINER: 2-Sided Split Card                       */}
      {/* ========================================================= */}
      <div className="w-full max-w-5xl bg-white rounded-[28px] sm:rounded-[36px] overflow-hidden shadow-[0_25px_70px_-15px_rgba(15,23,42,0.12),0_0_0_1px_rgba(15,23,42,0.05)] flex flex-col lg:flex-row transition-all duration-300">
        
        {/* ========================================================= */}
        {/* LEFT COLUMN: Rich Deep Petrol Teal Showcase               */}
        {/* ========================================================= */}
        <div className="lg:w-1/2 bg-[#0c3843] p-8 sm:p-12 lg:p-14 xl:p-16 flex flex-col justify-between relative overflow-hidden text-white order-2 lg:order-1">
          
          {/* Subtle Geometric Decorative Cubes (Top Left) */}
          <div className="absolute top-4 left-4 flex flex-col gap-2.5 opacity-25 pointer-events-none">
            <div className="flex gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-white/40" />
              <div className="w-6 h-6 rounded-md bg-white/30" />
              <div className="w-4 h-4 rounded-sm bg-white/20" />
            </div>
            <div className="flex gap-2.5 pl-4">
              <div className="w-5 h-5 rounded-md bg-white/30" />
              <div className="w-6 h-6 rounded-md bg-white/20" />
            </div>
          </div>

          {/* Subtle Geometric Decorative Cubes (Bottom Right) */}
          <div className="absolute bottom-6 right-6 flex flex-col gap-2 opacity-20 pointer-events-none">
            <div className="flex gap-2 justify-end">
              <div className="w-7 h-7 rounded-lg bg-white/20" />
              <div className="w-5 h-5 rounded-md bg-white/30" />
            </div>
            <div className="flex gap-2 justify-end pr-3">
              <div className="w-6 h-6 rounded-md bg-white/25" />
              <div className="w-4 h-4 rounded-sm bg-white/40" />
            </div>
          </div>

          {/* Ambient Lighting Orbs */}
          <div className="absolute top-1/4 -left-16 w-80 h-80 bg-cyan-400/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-20 right-10 w-80 h-80 bg-emerald-400/10 rounded-full blur-3xl pointer-events-none" />

          {/* Top Pill / Tag */}
          <div className="relative z-10 flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 border border-white/15 text-cyan-200 text-xs font-semibold backdrop-blur-md">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Real-Time Inventory Engine</span>
            </span>

            <span className="text-[11px] font-mono text-cyan-200/60 hidden sm:inline-block">
              PostgreSQL 18 RLS
            </span>
          </div>

          {/* Centerpiece: Clean Floating Dashboard UI Cards */}
          <div className="relative z-10 my-10 lg:my-auto max-w-md mx-auto w-full">
            {/* Main Analytics Card */}
            <div className="bg-white rounded-2xl sm:rounded-3xl p-5 sm:p-6 shadow-[0_20px_50px_rgba(0,0,0,0.25)] text-slate-800 border border-white/40 relative">
              
              {/* Card Header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm sm:text-base font-bold text-slate-900">
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
              <div className="h-28 sm:h-32 w-full pt-2">
                <svg viewBox="0 0 320 100" className="w-full h-full overflow-visible">
                  <defs>
                    <linearGradient id="gradientCyan" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" stopColor="#0c3843" stopOpacity="0.25" />
                      <stop offset="100%" stopColor="#0c3843" stopOpacity="0.0" />
                    </linearGradient>
                    <linearGradient id="gradientAmber" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.2" />
                      <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.0" />
                    </linearGradient>
                  </defs>

                  {/* Horizontal Guide Lines */}
                  <line x1="0" y1="20" x2="320" y2="20" stroke="#f1f5f9" strokeWidth="1" strokeDasharray="3 3" />
                  <line x1="0" y1="50" x2="320" y2="50" stroke="#f1f5f9" strokeWidth="1" strokeDasharray="3 3" />
                  <line x1="0" y1="80" x2="320" y2="80" stroke="#f1f5f9" strokeWidth="1" strokeDasharray="3 3" />

                  {/* Area 1: Inflow */}
                  <path
                    d="M 0,75 Q 40,40 80,60 T 160,30 T 240,45 T 320,20 L 320,100 L 0,100 Z"
                    fill="url(#gradientCyan)"
                  />
                  {/* Line 1: Inflow */}
                  <path
                    d="M 0,75 Q 40,40 80,60 T 160,30 T 240,45 T 320,20"
                    fill="none"
                    stroke="#0c3843"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  />

                  {/* Line 2: Dispatch / Demand */}
                  <path
                    d="M 0,85 Q 40,70 80,45 T 160,55 T 240,30 T 320,40"
                    fill="none"
                    stroke="#06b6d4"
                    strokeWidth="2"
                    strokeDasharray="4 4"
                    strokeLinecap="round"
                  />

                  {/* Interactive Dot Node */}
                  <circle cx="240" cy="45" r="4.5" fill="#0c3843" stroke="#ffffff" strokeWidth="2" />
                </svg>
              </div>

              {/* Days of Week */}
              <div className="flex items-center justify-between text-[10px] font-semibold text-slate-400 mt-2 px-1">
                <span>MON</span>
                <span>TUE</span>
                <span>WED</span>
                <span>THU</span>
                <span>FRI</span>
                <span>SAT</span>
              </div>
            </div>

            {/* Overlapping KPI Donut Card (Template Style) */}
            <div className="absolute -bottom-8 -right-3 sm:-right-6 w-36 sm:w-44 bg-white rounded-2xl p-3 sm:p-4 shadow-[0_20px_40px_rgba(0,0,0,0.22)] border border-white/60 text-slate-800">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Stock Health
                </span>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              </div>

              <div className="flex items-center gap-3">
                {/* Donut SVG */}
                <div className="relative w-12 h-12 flex-shrink-0 flex items-center justify-center">
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
                  <span className="absolute text-[10px] font-extrabold text-slate-800">
                    94%
                  </span>
                </div>

                <div className="space-y-0.5">
                  <span className="text-xs font-bold text-slate-900 block leading-tight">
                    Optimized
                  </span>
                  <span className="text-[10px] text-slate-400 block leading-tight">
                    0-Variance RLS
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Caption & Subtitle (Exact Template Enhancement) */}
          <div className="relative z-10 pt-8 sm:pt-10 space-y-2 text-center lg:text-left">
            <h2 className="text-lg sm:text-xl font-bold tracking-tight text-white">
              Very simple way you can manage
            </h2>
            <p className="text-xs text-slate-300 leading-relaxed max-w-sm">
              Welcome to Whoopit Inventory Management System! Efficiently track, audit, and dispatch multi-store stock with ease.
            </p>

            {/* Pagination / Slide Dots */}
            <div className="flex items-center justify-center lg:justify-start gap-1.5 pt-2">
              <span className="w-6 h-1.5 rounded-full bg-white transition-all" />
              <span className="w-1.5 h-1.5 rounded-full bg-white/40" />
              <span className="w-1.5 h-1.5 rounded-full bg-white/40" />
            </div>
          </div>
        </div>

        {/* ========================================================= */}
        {/* RIGHT COLUMN: Clean White Form Area (Login on Right Side) */}
        {/* ========================================================= */}
        <div className="lg:w-1/2 p-8 sm:p-12 lg:p-14 xl:p-16 flex flex-col justify-between bg-white relative order-1 lg:order-2">
          
          {/* Top: Brand Logo */}
          <div className="flex items-center gap-2.5 mb-8">
            <div className="w-9 h-9 rounded-xl bg-[#0c3843] flex items-center justify-center text-white shadow-md shadow-[#0c3843]/20">
              <Boxes className="w-5 h-5 text-cyan-300" />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xl font-extrabold tracking-tight text-slate-900">
                Whoopit
              </span>
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                IMS
              </span>
            </div>
          </div>

          {/* Middle: Main Form Block */}
          <div className="space-y-6 my-auto">
            <div className="space-y-1.5">
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
                Sign in to your account
              </h1>
              <p className="text-xs sm:text-sm text-slate-500">
                Welcome back! Please enter your details to sign in.
              </p>
            </div>

            {/* Error Message Alert */}
            {errorMsg && (
              <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2.5 animate-in fade-in duration-200">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-rose-600" />
                <div className="space-y-0.5">
                  <span className="font-semibold block text-rose-800">Authentication Failed</span>
                  <span className="text-[11px] text-rose-600 leading-tight">{errorMsg}</span>
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Email Address */}
              <div className="space-y-1.5">
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
                    className="w-full pl-10 pr-3.5 py-3 text-sm rounded-xl bg-slate-50/80 hover:bg-slate-50 border border-slate-200 text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-[#0c3843] focus:ring-4 focus:ring-[#0c3843]/10 outline-none transition-all duration-200"
                  />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-1.5">
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
                    className="w-full pl-10 pr-10 py-3 text-sm rounded-xl bg-slate-50/80 hover:bg-slate-50 border border-slate-200 text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-[#0c3843] focus:ring-4 focus:ring-[#0c3843]/10 outline-none transition-all duration-200"
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
              <div className="flex items-center justify-between pt-1 text-xs text-slate-500">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="w-4 h-4 rounded text-[#0c3843] border-slate-300 focus:ring-[#0c3843] cursor-pointer"
                  />
                  <span className="text-slate-600 text-xs font-medium">
                    Remember me on this device
                  </span>
                </label>

                <span className="text-[11px] text-slate-400 font-medium">
                  RLS Protected
                </span>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={submitting || isLoading}
                className="w-full mt-3 py-3.5 px-4 rounded-xl bg-[#0c3843] hover:bg-[#082931] active:bg-[#062026] text-white font-bold text-sm shadow-md shadow-[#0c3843]/20 hover:shadow-lg hover:shadow-[#0c3843]/25 flex items-center justify-center gap-2 transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
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
          <div className="pt-8 mt-6 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
            <span className="flex items-center gap-1.5 text-slate-500">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>Multi-Tenant Enterprise Security</span>
            </span>
            <span className="text-slate-400 font-mono">v4.2.0</span>
          </div>
        </div>

      </div>
    </div>
  );
}
