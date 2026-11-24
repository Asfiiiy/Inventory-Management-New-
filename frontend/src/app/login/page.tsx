"use client";

import React, { useState, useEffect } from "react";
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
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { apiClient, clearAuthToken } from "@/lib/api";

export default function LoginPage() {
  const { login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const err = params.get("error");
      if (err) setErrorMsg(err);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSubmitting(true);

    try {
      const params =
        typeof window !== "undefined"
          ? new URLSearchParams(window.location.search)
          : null;
      const next = params?.get("next") || undefined;
      await login(email.trim(), password, {
        rememberMe,
        redirectTo: next || undefined,
      });
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
      <div className="absolute -top-24 -left-24 w-[480px] h-[480px] bg-teal-400/20 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute -bottom-28 right-0 w-[520px] h-[440px] bg-[#0c3843]/15 rounded-full blur-[100px] pointer-events-none" />
      <div
        className="absolute inset-0 pointer-events-none opacity-30 [mask-image:radial-gradient(ellipse_75%_75%_at_50%_50%,#000_65%,transparent_100%)]"
        style={{
          backgroundImage: "radial-gradient(#0c3843 0.9px, transparent 0.9px)",
          backgroundSize: "22px 22px",
        }}
      />

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
          <div className="lg:w-1/2 bg-[#0c3843] p-8 sm:p-10 lg:p-12 flex flex-col justify-between relative overflow-hidden text-white order-2 lg:order-1">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(34,211,238,0.18),transparent_55%)] pointer-events-none" />

            <div className="relative z-10 flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-2xl bg-white/10 border border-white/15 flex items-center justify-center">
                <Boxes className="w-5 h-5 text-cyan-300" />
              </div>
              <div>
                <div className="text-lg font-extrabold tracking-tight">Whoopit</div>
                <div className="text-[11px] text-cyan-200/80">Office IT Asset Platform</div>
              </div>
            </div>

            <div className="relative z-10 my-10 lg:my-auto space-y-4 max-w-sm">
              <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-white leading-tight">
                Hardware. Staff. Signatures.
              </h2>
              <p className="text-sm text-cyan-100/75 leading-relaxed">
                Issue laptops and monitors with e-sign handovers, track repairs, and keep finance book value in one workspace.
              </p>
              <div className="flex flex-wrap gap-2 pt-1 text-[11px] font-semibold text-cyan-100/90">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/10 border border-white/15">
                  <ShieldCheck className="w-3.5 h-3.5" /> e-Sign custody
                </span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/10 border border-white/15">
                  Vendor repairs
                </span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/10 border border-white/15">
                  Finance NBV
                </span>
              </div>
            </div>

            <p className="relative z-10 text-[11px] text-cyan-200/50">
              Multi-tenant · company workspaces · staff &amp; admin roles
            </p>
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

                  <button
                    type="button"
                    disabled={resetting || !email.trim()}
                    onClick={async () => {
                      setErrorMsg(null);
                      setInfoMsg(null);
                      setResetting(true);
                      try {
                        const res = await apiClient.auth.forgotPassword(email.trim());
                        setInfoMsg(res.data?.message || "If the account exists, a temporary password was emailed (check Mailpit :8025).");
                      } catch (err: any) {
                        setErrorMsg(err?.problem?.detail || err?.message || "Could not start password reset.");
                      } finally {
                        setResetting(false);
                      }
                    }}
                    className="text-[11px] font-bold text-[#0c3843] hover:underline disabled:opacity-50 cursor-pointer"
                  >
                    {resetting ? "Sending…" : "Forgot password?"}
                  </button>
                </div>

                {infoMsg && (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-800 text-[11px] p-2.5">
                    {infoMsg}
                  </div>
                )}

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={submitting}
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

                {/* Dev/local quick fill — hidden on real production hosts */}
                {(process.env.NODE_ENV !== "production" ||
                  (typeof window !== "undefined" &&
                    (window.location.hostname === "localhost" ||
                      window.location.hostname === "127.0.0.1"))) && (
                  <div className="pt-2 flex flex-col gap-1.5 text-[11px]">
                    <span className="text-slate-400 font-medium">Quick Fill:</span>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setEmail("admin@whoopit.io");
                          setPassword("Password123!");
                        }}
                        className="px-2.5 py-1 rounded-lg bg-teal-50 hover:bg-teal-100 text-teal-800 font-bold text-[11px] transition-colors cursor-pointer border border-teal-200"
                        title="Whoopit Master Admin — software vendor portal"
                      >
                        Whoopit Admin
                      </button>
                    </div>
                  </div>
                )}
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
