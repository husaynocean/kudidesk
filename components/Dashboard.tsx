"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import NewInvoiceDialog from "./NewInvoiceDialog";
import { naira } from "@/lib/format";
import type { InvoiceRow } from "@/lib/types";

// AG Grid touches the DOM, so load it on the client only.
const InvoiceGrid = dynamic(() => import("./InvoiceGrid"), {
  ssr: false,
  loading: () => <div className="h-[520px] animate-pulse rounded-xl bg-white" />,
});

const PAID = ["PAID", "MARKED_AS_PAID"];
const UNPAID = ["SENT", "UNPAID", "PARTIALLY_PAID", "PAYMENT_PENDING"];

export default function Dashboard() {
  const [rows, setRows] = useState<InvoiceRow[]>([]);
  const [mode, setMode] = useState<"paypal" | "demo" | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [remindingId, setRemindingId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/invoices", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load invoices");
      setRows(data.rows);
      setMode(data.mode);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const stats = useMemo(() => {
    const sum = (list: InvoiceRow[]) => list.reduce((s, r) => s + (r.amountNgn ?? 0), 0);
    const paid = rows.filter((r) => PAID.includes(r.status));
    const unpaid = rows.filter((r) => UNPAID.includes(r.status));
    const overdue = unpaid.filter((r) => r.overdue);
    return {
      received: sum(paid),
      outstanding: sum(unpaid),
      overdue: sum(overdue),
      overdueCount: overdue.length,
      clients: new Set(rows.map((r) => r.clientEmail)).size,
    };
  }, [rows]);

  const remind = useCallback(async (row: InvoiceRow) => {
    setRemindingId(row.id);
    try {
      const res = await fetch(`/api/invoices/${row.id}/remind`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Reminder failed");
      setToast(`Reminder sent to ${row.clientName}`);
    } catch (err) {
      setToast((err as Error).message);
    } finally {
      setRemindingId(null);
    }
  }, []);

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:py-10">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-kudi-600 text-lg font-bold text-white">₦</div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">KudiDesk</h1>
            <p className="text-sm text-gray-500">Every client payment, one desk.</p>
          </div>
          {mode && (
            <span
              className={`ml-2 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                mode === "paypal" ? "bg-kudi-100 text-kudi-700" : "bg-amber-100 text-amber-800"
              }`}
            >
              {mode === "paypal" ? "PayPal Sandbox" : "Demo data"}
            </span>
          )}
        </div>
        <button
          onClick={() => setDialogOpen(true)}
          className="rounded-lg bg-kudi-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-kudi-700"
        >
          + New invoice
        </button>
      </header>

      <section className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Received" value={naira(stats.received)} tone="green" />
        <Stat label="Outstanding" value={naira(stats.outstanding)} />
        <Stat
          label="Overdue"
          value={naira(stats.overdue)}
          sub={`${stats.overdueCount} invoice${stats.overdueCount === 1 ? "" : "s"}`}
          tone={stats.overdueCount ? "red" : undefined}
        />
        <Stat label="Clients" value={String(stats.clients)} />
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold">Invoices & payments</h2>
          <div className="flex items-center gap-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search client, work, status…"
              className="w-64 rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-kudi-500"
            />
            <button
              onClick={load}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50"
              aria-label="Refresh"
            >
              ↻
            </button>
          </div>
        </div>

        {error ? (
          <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700">{error}</div>
        ) : loading && rows.length === 0 ? (
          <div className="h-[520px] animate-pulse rounded-xl bg-gray-50" />
        ) : (
          <InvoiceGrid rows={rows} quickFilter={search} onRemind={remind} remindingId={remindingId} />
        )}
        <p className="mt-3 text-xs text-gray-400">Naira values are approximate (set FX_RATES_NGN in .env.local).</p>
      </section>

      <NewInvoiceDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onCreated={(payLink) => {
          setDialogOpen(false);
          setToast(payLink ? "Invoice sent — pay link added to the grid" : "Invoice sent");
          load();
        }}
      />

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-gray-900 px-4 py-2.5 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}
    </main>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "green" | "red" }) {
  const color = tone === "green" ? "text-kudi-700" : tone === "red" ? "text-red-600" : "text-gray-900";
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
      <p className={`mt-1 text-xl font-bold sm:text-2xl ${color}`}>{value}</p>
      {sub && <p className="text-xs text-gray-500">{sub}</p>}
    </div>
  );
}
