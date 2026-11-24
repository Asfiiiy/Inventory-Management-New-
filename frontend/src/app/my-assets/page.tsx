"use client";

import React, { useEffect, useState } from "react";
import { Laptop, Plus, RefreshCw, ShieldCheck } from "lucide-react";
import { apiClient, ApiError, CustodyAssignment, AssetRequest } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useInventory } from "@/lib/inventory-store";
import { useToast } from "@/components/ui/toast";
import { ModalPortal } from "@/components/ui/modal-portal";

export default function MyAssetsPage() {
  const { user } = useAuth();
  const { products } = useInventory();
  const { toast } = useToast();
  const [items, setItems] = useState<CustodyAssignment[]>([]);
  const [myRequests, setMyRequests] = useState<AssetRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [requestOpen, setRequestOpen] = useState(false);
  const [assetId, setAssetId] = useState("");
  const [serial, setSerial] = useState("");
  const [reason, setReason] = useState("Need hardware for my role");
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    if (!user?.id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.custody.listEmployeeCustody(user.id);
      const active = (res.data || []).filter((row) => !row.returned_at);
      setItems(active);
      try {
        const reqRes = await apiClient.custody.listRequests("ALL");
        const mine = (reqRes.data || []).filter(
          (r) => r.employee_user_id === user.id || r.requester_user_id === user.id
        );
        setMyRequests(mine.slice(0, 20));
      } catch {
        setMyRequests([]);
      }
    } catch (err: unknown) {
      const message = err instanceof ApiError ? err.message : "Could not load assigned devices.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const submitRequest = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!assetId || !user?.id) return;
    setSubmitting(true);
    try {
      await apiClient.custody.createRequest({
        asset_id: assetId,
        employee_user_id: user.id,
        serial_number: serial.trim(),
        reason: reason.trim() || "Hardware request",
        request_type: "CHECKOUT",
        quantity: 1,
      });
      toast({
        title: "Request submitted",
        description: "An admin must approve this before hardware is issued.",
        variant: "success",
      });
      setRequestOpen(false);
      setAssetId("");
      setSerial("");
      await load();
    } catch (err: unknown) {
      const message = err instanceof ApiError ? err.message : "Could not submit the request.";
      toast({ title: "Request failed", description: message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      <div className="pb-4 border-b border-slate-200/80 dark:border-slate-800 flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-[#0c3843]/10 text-[#0c3843] dark:text-cyan-300 flex items-center justify-center border border-[#0c3843]/20">
            <Laptop className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 dark:text-white">
              My Assigned Devices
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Hardware currently checked out to {user?.name || "you"}.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setRequestOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#0c3843] text-white text-xs font-bold"
          >
            <Plus className="w-3.5 h-3.5" />
            Request device
          </button>
          <button
            type="button"
            onClick={load}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-600 dark:text-slate-300"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 text-rose-700 text-xs p-4">{error}</div>
      )}

      {loading ? (
        <p className="text-sm text-slate-500">Loading your devices…</p>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-950/40 p-12 text-center">
          <div className="w-14 h-14 rounded-2xl bg-[#0c3843]/10 text-[#0c3843] dark:text-cyan-300 flex items-center justify-center mx-auto mb-4 border border-[#0c3843]/15">
            <Laptop className="w-7 h-7" />
          </div>
          <h2 className="text-base font-bold text-slate-900 dark:text-white">No devices assigned yet</h2>
          <p className="text-xs text-slate-500 mt-1.5 max-w-sm mx-auto">
            When IT issues a laptop or monitor to you, it will show up here with the serial and return date.
          </p>
          <button
            type="button"
            onClick={() => setRequestOpen(true)}
            className="mt-5 inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#0c3843] text-white text-xs font-bold"
          >
            <Plus className="w-3.5 h-3.5" />
            Request a device
          </button>
        </div>
      ) : (
        <>
          <div className="md:hidden space-y-3">
            {items.map((row) => (
              <div key={row.assignment_id} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
                <div className="font-bold text-slate-900 dark:text-white">{row.asset_name || "Hardware"}</div>
                <div className="text-[11px] text-slate-500 font-mono mt-0.5">{row.asset_sku}</div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-slate-600 dark:text-slate-300">
                  <div><span className="text-slate-400">Serial</span><div className="font-mono">{row.serial_number || "—"}</div></div>
                  <div><span className="text-slate-400">Condition</span><div>{row.condition_grade || "—"}</div></div>
                  <div><span className="text-slate-400">Issued</span><div>{row.checkout_date ? new Date(row.checkout_date).toLocaleDateString() : "—"}</div></div>
                  <div><span className="text-slate-400">Return</span><div>{row.expected_return_date ? new Date(row.expected_return_date).toLocaleDateString() : "Open"}</div></div>
                </div>
              </div>
            ))}
          </div>
          <div className="hidden md:block rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-950/50 text-slate-500 uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3 font-bold">Asset</th>
                    <th className="px-4 py-3 font-bold">Serial</th>
                    <th className="px-4 py-3 font-bold">Issued</th>
                    <th className="px-4 py-3 font-bold">Expected return</th>
                    <th className="px-4 py-3 font-bold">Condition</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((row) => (
                    <tr key={row.assignment_id} className="border-t border-slate-100 dark:border-slate-800">
                      <td className="px-4 py-3">
                        <div className="font-bold text-slate-900 dark:text-white">{row.asset_name || "Hardware"}</div>
                        <div className="text-[11px] text-slate-500 font-mono">{row.asset_sku}</div>
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-700 dark:text-slate-300">
                        {row.serial_number || "—"}
                      </td>
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                        {row.checkout_date ? new Date(row.checkout_date).toLocaleString() : "—"}
                      </td>
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                        {row.expected_return_date ? new Date(row.expected_return_date).toLocaleDateString() : "Open"}
                      </td>
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                        {row.condition_grade || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {myRequests.length > 0 && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-2">
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">My requests</h2>
          {myRequests.map((r) => (
            <div key={r.request_id} className="flex items-center justify-between gap-3 text-xs border-t border-slate-100 dark:border-slate-800 pt-2 first:border-0 first:pt-0">
              <div>
                <div className="font-bold text-slate-800 dark:text-slate-100">{r.item_name}</div>
                <div className="text-slate-500">{r.reason || r.request_type}</div>
              </div>
              <span className="px-2 py-1 rounded-full text-[10px] font-bold uppercase bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                {r.status}
              </span>
            </div>
          ))}
        </div>
      )}

      {requestOpen && (
        <ModalPortal>
        <div className="fixed inset-0 z-[100] bg-slate-950/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <form
            onSubmit={submitRequest}
            className="w-full sm:max-w-md bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl border border-slate-200 dark:border-slate-800 p-5 space-y-3"
          >
            <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">Request hardware</h3>
            <p className="text-[11px] text-slate-500">An admin will approve before the device is issued to you.</p>
            <label className="block space-y-1">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Device</span>
              <select
                required
                value={assetId}
                onChange={(e) => setAssetId(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-sm"
              >
                <option value="">Select product…</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.sku})
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Preferred serial (optional)</span>
              <input
                value={serial}
                onChange={(e) => setSerial(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-sm"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Reason</span>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-sm"
              />
            </label>
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setRequestOpen(false)}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 py-2.5 rounded-xl bg-[#0c3843] text-white text-xs font-bold disabled:opacity-60"
              >
                {submitting ? "Sending…" : "Submit request"}
              </button>
            </div>
          </form>
        </div>
        </ModalPortal>
      )}
    </div>
  );
}
