"use client";

import React, { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";
import { QRCodeSVG } from "qrcode.react";
import { cn } from "@/lib/utils";

interface BarcodeViewProps {
  value: string;
  format?: "CODE128" | "EAN13" | "UPC";
  width?: number;
  height?: number;
  displayValue?: boolean;
  fontSize?: number;
  className?: string;
}

export function BarcodeView({
  value,
  format = "CODE128",
  width = 1.6,
  height = 42,
  displayValue = true,
  fontSize = 12,
  className,
}: BarcodeViewProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (svgRef.current && value) {
      try {
        JsBarcode(svgRef.current, value, {
          format,
          width,
          height,
          displayValue,
          fontSize,
          font: "monospace",
          textMargin: 2,
          margin: 0,
          background: "transparent",
          lineColor: "#000000",
        });
      } catch (err) {
        console.warn("Failed to render barcode for value:", value, err);
      }
    }
  }, [value, format, width, height, displayValue, fontSize]);

  if (!value) return null;

  return (
    <div className={cn("inline-flex items-center justify-center p-1 bg-white rounded", className)}>
      <svg ref={svgRef} className="max-w-full h-auto" />
    </div>
  );
}

interface QRCodeViewProps {
  value: string;
  size?: number;
  level?: "L" | "M" | "Q" | "H";
  includeMargin?: boolean;
  className?: string;
}

export function QRCodeView({
  value,
  size = 64,
  level = "M",
  includeMargin = false,
  className,
}: QRCodeViewProps) {
  if (!value) return null;

  return (
    <div className={cn("inline-flex items-center justify-center p-1 bg-white rounded", className)}>
      <QRCodeSVG
        value={value}
        size={size}
        level={level}
        includeMargin={includeMargin}
        fgColor="#000000"
        bgColor="#ffffff"
      />
    </div>
  );
}
