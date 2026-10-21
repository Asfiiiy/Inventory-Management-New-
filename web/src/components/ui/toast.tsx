"use client";

import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type ToastVariant = "default" | "success" | "destructive" | "warning";

export interface ToastItem {
  id: string;
  title?: string;
  description?: string;
  variant?: ToastVariant;
  duration?: number;
}

interface ToastContextType {
  toasts: ToastItem[];
  toast: (opts: Omit<ToastItem, "id">) => void;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

let globalToastHandler: ((opts: Omit<ToastItem, "id">) => void) | null = null;

export function toast(opts: Omit<ToastItem, "id">) {
  if (globalToastHandler) {
    globalToastHandler(opts);
  } else {
    console.log("[Toast]", opts);
  }
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback((opts: Omit<ToastItem, "id">) => {
    const id = "toast-" + Math.random().toString(36).substring(2, 9);
    const duration = opts.duration ?? 4500;
    const newToast: ToastItem = { ...opts, id };

    setToasts((prev) => [...prev, newToast]);

    if (duration > 0) {
      setTimeout(() => {
        dismiss(id);
      }, duration);
    }
  }, [dismiss]);

  useEffect(() => {
    globalToastHandler = addToast;
    return () => {
      globalToastHandler = null;
    };
  }, [addToast]);

  return (
    <ToastContext.Provider value={{ toasts, toast: addToast, dismiss }}>
      {children}
      <Toaster />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    return {
      toast,
      toasts: [],
      dismiss: () => {},
    };
  }
  return context;
}

export function Toaster() {
  const context = useContext(ToastContext);
  if (!context) return null;
  const { toasts, dismiss } = context;

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2.5 max-w-sm w-full pointer-events-none">
      {toasts.map((t) => {
        const isSuccess = t.variant === "success";
        const isDestructive = t.variant === "destructive";
        const isWarning = t.variant === "warning";

        return (
          <div
            key={t.id}
            className={cn(
              "pointer-events-auto flex items-start gap-3 p-4 rounded-2xl border shadow-xl transition-all duration-200 animate-in slide-in-from-bottom-3",
              isDestructive
                ? "bg-rose-950/90 border-rose-800/80 text-rose-100"
                : isSuccess
                ? "bg-emerald-950/90 border-emerald-800/80 text-emerald-100"
                : isWarning
                ? "bg-amber-950/90 border-amber-800/80 text-amber-100"
                : "bg-slate-900/95 border-slate-800 text-slate-100"
            )}
          >
            {isSuccess && <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />}
            {isDestructive && <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />}
            {isWarning && <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />}
            {!isSuccess && !isDestructive && !isWarning && (
              <Info className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
            )}

            <div className="flex-1 text-xs">
              {t.title && <div className="font-bold text-sm tracking-tight">{t.title}</div>}
              {t.description && (
                <div className="mt-0.5 text-xs text-slate-300 leading-relaxed font-medium">
                  {t.description}
                </div>
              )}
            </div>

            <button
              onClick={() => dismiss(t.id)}
              className="text-slate-400 hover:text-white shrink-0 p-1 rounded-md hover:bg-white/10 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
