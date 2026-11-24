"use client";

import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  Printer,
  X,
  ShieldCheck,
  Building2,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  UserCheck,
  QrCode,
  Hash,
  Download,
} from "lucide-react";
import { QRCodeView } from "../barcode/barcode-view";
import { HandoverCertificate } from "@/lib/api";

interface HandoverCertificateModalProps {
  certificate: HandoverCertificate | null;
  isOpen: boolean;
  onClose: () => void;
  employeeName?: string;
  employeeEmail?: string;
}

export function HandoverCertificateModal({
  certificate,
  isOpen,
  onClose,
  employeeName,
  employeeEmail,
}: HandoverCertificateModalProps) {
  const [companyName, setCompanyName] = useState("WHOOPIT ENTERPRISE SYSTEMS");
  const [companyAddress, setCompanyAddress] = useState(
    "Technology Park, Industrial Hub, Karachi, PK"
  );
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!isOpen || !certificate || !mounted) return null;

  const handlePrint = () => {
    window.print();
  };

  const checkoutDate = certificate.assignment.checkout_date
    ? new Date(certificate.assignment.checkout_date)
    : new Date();
  const formattedCheckout = checkoutDate.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const expectedReturn = certificate.assignment.expected_return_date
    ? new Date(certificate.assignment.expected_return_date).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "Indefinite / Permanent";

  const qrPayload = JSON.stringify({
    aid: certificate.assignment.assignment_id,
    asset: certificate.assignment.asset_sku || certificate.assignment.asset_id,
    hash: certificate.evidence?.record_hash?.slice(0, 16),
  });

  return createPortal(
    <>
      {/* Modal Dialog (Hidden on Print) */}
      <div className="fixed inset-0 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150 no-print">
        <div className="w-full max-w-4xl bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
          {/* Header Bar */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <span>Cryptographic Handover Certificate</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                    {certificate.assignment.assignment_id.slice(0, 8)}
                  </span>
                </h3>
                <p className="text-[11px] text-slate-400">
                  Secured with SHA-256 blockchain-style hash chain &bull; {formattedCheckout}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handlePrint}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print Certificate</span>
              </button>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Body Preview */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Status Alert */}
            {certificate.is_valid && !certificate.tamper_detected ? (
              <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-400 text-xs">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <div>
                  <span className="font-bold">Cryptographically Verified:</span> The stored SHA-256 seal matches mathematical derivation. No tampering detected.
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-700 dark:text-rose-400 text-xs">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                <div>
                  <span className="font-bold">Tamper Warning:</span> Cryptographic hash discrepancy detected in this custody record!
                </div>
              </div>
            )}

            {/* Certificate Document Canvas */}
            <div className="p-8 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 shadow-xs space-y-6">
              {/* Document Header */}
              <div className="flex items-start justify-between pb-6 border-b border-slate-200 dark:border-slate-800">
                <div>
                  <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-white text-base">
                    <Building2 className="w-5 h-5 text-indigo-500" />
                    <span>{companyName}</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1 max-w-sm">{companyAddress}</p>
                </div>

                <div className="text-right">
                  <div className="inline-block px-3 py-1 rounded-full bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400 text-xs font-bold uppercase tracking-wider">
                    Equipment Handover Certificate
                  </div>
                  <p className="text-xs text-slate-400 mt-1.5 font-mono">
                    REF: {certificate.assignment.assignment_id}
                  </p>
                </div>
              </div>

              {/* Custody Parties */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-4 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800 text-xs">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                    Receiving Office Employee
                  </div>
                  <div className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-2">
                    <span>{certificate.assignment.employee_name || employeeName || "Designated Employee"}</span>
                    {certificate.assignment.employee_code && (
                      <span className="px-2 py-0.5 rounded-md bg-cyan-500/15 text-[#0c3843] dark:text-cyan-300 border border-cyan-500/30 font-mono text-[11px] font-extrabold">
                        ID: {certificate.assignment.employee_code}
                      </span>
                    )}
                  </div>
                  {certificate.assignment.employee_department && (
                    <div className="text-slate-600 dark:text-slate-300 font-semibold mt-0.5">
                      Department: {certificate.assignment.employee_department}
                    </div>
                  )}
                  {(certificate.assignment.employee_email || employeeEmail) && (
                    <div className="text-slate-500 mt-0.5">
                      {certificate.assignment.employee_email || employeeEmail}
                    </div>
                  )}
                </div>

                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                    Issuance & Schedule
                  </div>
                  <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
                    <span>Handover Date:</span>
                    <span className="font-semibold">{formattedCheckout}</span>
                  </div>
                  <div className="flex items-center justify-between text-slate-600 dark:text-slate-300 mt-1">
                    <span>Expected Return:</span>
                    <span className="font-semibold text-indigo-600 dark:text-indigo-400">
                      {expectedReturn}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-slate-600 dark:text-slate-300 mt-1">
                    <span>Condition Grade:</span>
                    <span className="px-1.5 py-0.2 rounded font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                      Grade {certificate.assignment.condition_grade || "A"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Asset Specifics */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                  Assigned IT Hardware / Office Equipment
                </h4>
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-900 text-slate-500 border-b border-slate-200 dark:border-slate-800">
                      <tr>
                        <th className="py-2.5 px-4 font-semibold">SKU / Code</th>
                        <th className="py-2.5 px-4 font-semibold">IT Item Description</th>
                        <th className="py-2.5 px-4 font-semibold">Serial / Asset Tag</th>
                        <th className="py-2.5 px-4 font-semibold text-right">Quantity</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                      <tr>
                        <td className="py-3 px-4 font-mono font-bold text-indigo-600 dark:text-indigo-400">
                          {certificate.assignment.asset_sku || "IT-ASSET"}
                        </td>
                        <td className="py-3 px-4 font-medium">
                          {certificate.assignment.asset_name || "Office IT Equipment"}
                        </td>
                        <td className="py-3 px-4 font-mono text-[11px] text-slate-500">
                          {certificate.assignment.serial_number || certificate.assignment.asset_id.slice(0, 12)}
                        </td>
                        <td className="py-3 px-4 font-bold text-right">
                          {certificate.assignment.quantity || 1} {(certificate.assignment.quantity || 1) === 1 ? "Unit" : "Units"}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Cryptographic Proof & QR */}
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col md:flex-row items-center gap-6">
                <div className="shrink-0 bg-white p-2 rounded-xl border border-slate-200 shadow-xs">
                  <QRCodeView value={qrPayload} size={110} />
                  <div className="text-[9px] text-center font-mono text-slate-500 mt-1">
                    VERIFY QR
                  </div>
                </div>

                <div className="flex-1 space-y-1.5 text-[11px] text-slate-600 dark:text-slate-400">
                  <div className="flex items-center gap-1.5 font-bold text-slate-900 dark:text-white text-xs">
                    <Hash className="w-3.5 h-3.5 text-indigo-500" />
                    <span>Cryptographic Evidence Ledger (Immutable)</span>
                  </div>
                  <div>
                    <span className="font-semibold text-slate-500">Record Hash:</span>{" "}
                    <code className="text-[10px] bg-slate-200 dark:bg-slate-800 px-1 py-0.5 rounded font-mono break-all text-indigo-600 dark:text-indigo-300">
                      {certificate.evidence?.record_hash || certificate.stored_hash || "N/A"}
                    </code>
                  </div>
                  <div>
                    <span className="font-semibold text-slate-500">Previous Hash:</span>{" "}
                    <code className="text-[10px] bg-slate-200 dark:bg-slate-800 px-1 py-0.5 rounded font-mono break-all">
                      {certificate.evidence?.previous_hash || "GENESIS_NODE"}
                    </code>
                  </div>
                  <div>
                    <span className="font-semibold text-slate-500">Document SHA-256:</span>{" "}
                    <code className="text-[10px] bg-slate-200 dark:bg-slate-800 px-1 py-0.5 rounded font-mono break-all">
                      {certificate.evidence?.pdf_sha256 || "N/A"}
                    </code>
                  </div>
                </div>
              </div>

              {/* Legal Undertaking & Signature Lines */}
              <div className="pt-2 text-[11px] text-slate-500 leading-relaxed border-t border-slate-100 dark:border-slate-800">
                <p>
                  <strong>Custodian Undertaking:</strong> I acknowledge receipt of the asset listed above in the condition stated. I accept responsibility for safeguarding this asset against loss, unauthorized transfer, or negligence, and agree to return it upon request or project completion.
                </p>

                <div className="grid grid-cols-2 gap-12 pt-6 text-center items-end">
                  <div className="border-t border-dashed border-slate-300 dark:border-slate-700 pt-2">
                    <div className="font-bold text-slate-800 dark:text-slate-200 text-xs">
                      IT Inventory Administrator
                    </div>
                    <div className="text-[10px] text-slate-400">Authorized Handover Issuer</div>
                  </div>

                  <div className="flex flex-col items-center">
                    {certificate.assignment.signature_data && (
                      <div className="mb-1 p-1.5 bg-white rounded-lg border border-slate-200">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={certificate.assignment.signature_data}
                          alt="Employee Online Signature"
                          className="h-14 object-contain"
                        />
                      </div>
                    )}
                    <div className="w-full border-t border-dashed border-slate-300 dark:border-slate-700 pt-2">
                      <div className="font-bold text-slate-800 dark:text-slate-200 text-xs">
                        {certificate.assignment.employee_name || employeeName || "Receiving Employee"}{" "}
                        {certificate.assignment.employee_code ? `(${certificate.assignment.employee_code})` : ""}
                      </div>
                      <div className="text-[10px] text-emerald-600 font-semibold">
                        {certificate.assignment.signature_data
                          ? "✓ Online Digital Signature Captured"
                          : "Signature & Date"}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Standalone Print-only View */}
      <div id="printable-document-area" className="hidden print:block p-8 font-sans max-w-3xl mx-auto text-slate-900 bg-white">
        <div className="flex items-start justify-between pb-4 border-b border-slate-300">
          <div>
            <h1 className="text-xl font-bold">{companyName}</h1>
            <p className="text-xs text-slate-600 mt-1">{companyAddress}</p>
          </div>
          <div className="text-right">
            <h2 className="text-sm font-bold uppercase tracking-wider text-indigo-700">
              Tool & Equipment Handover Certificate
            </h2>
            <p className="text-xs text-slate-500 font-mono mt-1">
              REF: {certificate.assignment.assignment_id}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 my-4 p-4 border border-slate-200 text-xs">
          <div>
            <div className="font-bold text-slate-500 uppercase text-[10px]">Issued To</div>
            <div className="font-bold text-sm text-slate-900">{employeeName || "Designated Employee"}</div>
            {employeeEmail && <div className="text-slate-600">{employeeEmail}</div>}
          </div>
          <div className="text-right">
            <div><strong>Issue Date:</strong> {formattedCheckout}</div>
            <div><strong>Expected Return:</strong> {expectedReturn}</div>
            <div><strong>Condition Grade:</strong> Grade {certificate.assignment.condition_grade || "A"}</div>
          </div>
        </div>

        <table className="w-full text-left text-xs border border-slate-200 my-4">
          <thead className="bg-slate-100 border-b border-slate-200">
            <tr>
              <th className="p-2">SKU</th>
              <th className="p-2">Item Name</th>
              <th className="p-2">Asset ID</th>
              <th className="p-2 text-right">Qty</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="p-2 font-mono font-bold">{certificate.assignment.asset_sku || "HW-SERIALIZED"}</td>
              <td className="p-2">{certificate.assignment.asset_name || "Hardware Asset"}</td>
              <td className="p-2 font-mono text-[10px]">{certificate.assignment.asset_id}</td>
              <td className="p-2 text-right font-bold">1</td>
            </tr>
          </tbody>
        </table>

        <div className="p-3 border border-slate-200 text-[10px] space-y-1 my-4">
          <div className="font-bold">Cryptographic Ledger Proof:</div>
          <div>Record Hash: <span className="font-mono">{certificate.evidence?.record_hash || certificate.stored_hash}</span></div>
          <div>Previous Hash: <span className="font-mono">{certificate.evidence?.previous_hash || "GENESIS"}</span></div>
          <div>Status: {certificate.is_valid ? "VERIFIED VALID" : "TAMPER WARNING"}</div>
        </div>

        <p className="text-[10px] text-slate-600 my-4">
          I acknowledge receipt of the asset listed above in the specified condition and accept full responsibility for its safe custody.
        </p>

        <div className="grid grid-cols-2 gap-12 pt-8 text-center text-xs items-end">
          <div className="border-t border-slate-400 pt-2">IT Inventory Administrator</div>
          <div className="flex flex-col items-center">
            {certificate.assignment.signature_data && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={certificate.assignment.signature_data}
                alt="Employee Signature"
                className="h-12 object-contain mb-1"
              />
            )}
            <div className="w-full border-t border-slate-400 pt-2">
              {certificate.assignment.employee_name || employeeName || "Receiving Employee"}{" "}
              {certificate.assignment.employee_code ? `(${certificate.assignment.employee_code})` : ""}
            </div>
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}
