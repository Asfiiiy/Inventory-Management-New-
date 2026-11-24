"use client";

import React, { useRef, useState, useEffect } from "react";
import { Eraser, PenTool, Type, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface SignaturePadProps {
  value: string;
  onChange: (dataUrl: string) => void;
  employeeName?: string;
}

export function SignaturePad({ value, onChange, employeeName }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [mode, setMode] = useState<"draw" | "type">("draw");
  const [typedName, setTypedName] = useState(employeeName || "");

  useEffect(() => {
    if (employeeName && !typedName) {
      setTypedName(employeeName);
    }
  }, [employeeName]);

  // Initialize white background on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.strokeStyle = "#0c3843";
    ctx.lineWidth = 2.4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, [mode]);

  const getCoordinates = (
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>
  ) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    if ("touches" in e) {
      const touch = e.touches[0] || e.changedTouches[0];
      return {
        x: (touch.clientX - rect.left) * scaleX,
        y: (touch.clientY - rect.top) * scaleY,
      };
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const startDrawing = (
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>
  ) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { x, y } = getCoordinates(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
  };

  const draw = (
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>
  ) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { x, y } = getCoordinates(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const endDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    const canvas = canvasRef.current;
    if (!canvas) return;
    onChange(canvas.toDataURL("image/png"));
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }
    onChange("");
  };

  const applyTypedSignature = (text: string) => {
    setTypedName(text);
    const trimmed = text.trim();
    if (!trimmed) {
      onChange("");
      return;
    }
    const offscreen = document.createElement("canvas");
    offscreen.width = 480;
    offscreen.height = 140;
    const ctx = offscreen.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, offscreen.width, offscreen.height);
    ctx.fillStyle = "#0c3843";
    ctx.font = "italic 600 36px Georgia, 'Times New Roman', cursive, serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(trimmed, offscreen.width / 2, offscreen.height / 2);

    // Subtle baseline flourish
    ctx.strokeStyle = "#0891b2";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(90, 98);
    ctx.quadraticCurveTo(240, 112, 390, 94);
    ctx.stroke();

    onChange(offscreen.toDataURL("image/png"));
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              setMode("draw");
              clearSignature();
            }}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer",
              mode === "draw"
                ? "bg-[#0c3843] text-white shadow-2xs"
                : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200"
            )}
          >
            <PenTool className="w-3 h-3" />
            <span>Draw Signature (Mouse / Touch)</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("type");
              if (typedName || employeeName) {
                applyTypedSignature(typedName || employeeName || "");
              }
            }}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer",
              mode === "type"
                ? "bg-[#0c3843] text-white shadow-2xs"
                : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200"
            )}
          >
            <Type className="w-3 h-3" />
            <span>Digital e-Sign (Type Name)</span>
          </button>
        </div>

        <button
          type="button"
          onClick={clearSignature}
          className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors cursor-pointer"
        >
          <Eraser className="w-3 h-3" />
          <span>Clear</span>
        </button>
      </div>

      {mode === "draw" ? (
        <div className="relative rounded-xl border-2 border-dashed border-cyan-500/40 bg-white dark:bg-slate-950 overflow-hidden">
          <canvas
            ref={canvasRef}
            width={480}
            height={140}
            onMouseDown={startDrawing}
            onMouseMove={draw}
            onMouseUp={endDrawing}
            onMouseLeave={endDrawing}
            onTouchStart={startDrawing}
            onTouchMove={draw}
            onTouchEnd={endDrawing}
            className="w-full h-[125px] cursor-crosshair touch-none"
          />
          {!value && (
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-slate-400">
              <PenTool className="w-4 h-4 mb-1 text-cyan-600/60" />
              <span className="text-xs font-medium">
                Employee signs here using Mouse, Touchpad, or Finger
              </span>
            </div>
          )}
          <div className="px-3 py-1.5 bg-slate-50 dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[10px] text-slate-500">
            <span>Official Online Custody Acknowledgment</span>
            {value ? (
              <span className="text-emerald-600 font-bold flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Signature Captured
              </span>
            ) : (
              <span className="text-amber-600 font-semibold">Signature Required</span>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-2 p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/50">
          <input
            type="text"
            value={typedName}
            onChange={(e) => applyTypedSignature(e.target.value)}
            placeholder="Type employee full name to generate digital signature..."
            className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-medium text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
          />
          {value && (
            <div className="p-2 rounded-lg bg-white border border-slate-200 flex items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={value} alt="Digital Signature Preview" className="h-14 object-contain" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
