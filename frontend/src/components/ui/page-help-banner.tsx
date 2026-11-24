"use client";

import React, { useState } from "react";
import { Info, ChevronDown, ChevronUp, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface PageHelpBannerProps {
  title: string;
  badge?: string;
  steps: Array<{
    title: string;
    description: string;
  }>;
  className?: string;
}

export function PageHelpBanner({
  title,
  badge = "User Tips",
  steps,
  className,
}: PageHelpBannerProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div
      className={cn(
        "rounded-2xl border transition-all duration-200 overflow-hidden",
        "bg-gradient-to-r from-teal-500/5 via-cyan-500/5 to-transparent",
        "border-[#0c3843]/15 dark:border-teal-500/20",
        className
      )}
    >
      <div className="flex items-center justify-between px-4 py-2.5">
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 rounded-lg bg-[#0c3843]/10 text-[#0c3843] dark:text-teal-400 flex items-center justify-center shrink-0">
            <Info className="w-3.5 h-3.5" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-900 dark:text-white">
              {title}
            </span>
            <span className="text-[10px] font-bold uppercase px-1.5 py-0.2 rounded-md bg-teal-500/10 text-[#0c3843] dark:text-teal-400 border border-teal-500/20">
              {badge}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-1 text-[11px] font-semibold text-[#0c3843] dark:text-teal-400 hover:underline cursor-pointer"
        >
          <span>{isOpen ? "Hide Instructions" : "How to use this page (Instructions)"}</span>
          {isOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
      </div>

      {isOpen && (
        <div className="px-4 pb-3.5 pt-1 border-t border-[#0c3843]/10 dark:border-teal-500/10 animate-in fade-in slide-in-from-top-1 duration-150">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 text-xs">
            {steps.map((s, idx) => (
              <div
                key={idx}
                className="p-3 rounded-xl bg-white/80 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800 space-y-1 shadow-2xs"
              >
                <div className="flex items-center gap-1.5 font-bold text-slate-900 dark:text-white">
                  <span className="w-4 h-4 rounded-full bg-[#0c3843] text-white text-[10px] flex items-center justify-center font-mono">
                    {idx + 1}
                  </span>
                  <span>{s.title}</span>
                </div>
                <p className="text-[11px] text-slate-500 leading-relaxed pl-5.5">
                  {s.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
