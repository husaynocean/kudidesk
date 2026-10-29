"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GridApi } from "ag-grid-community";
import AskGrid, { type AskGridHandle } from "./AskGrid";
import ChaseDialog from "./ChaseDialog";
import NewInvoiceDialog from "./NewInvoiceDialog";
import { naira } from "@/lib/format";
import type { InvoiceRow } from "@/lib/types";

// AG Grid touches the DOM, so load it on the client only.
const IncomeChart = dynamic(() => import("./IncomeChart"), {
  ssr: false,
  loading: () => <div className="mb-6 h-[330px] animate-pulse rounded-2xl bg-white" />,
});

const InvoiceGrid = dynamic(() => import("./InvoiceGrid"), {
  ssr: false,
  loading: () => <div className="h-[560px] animate-pulse rounded-xl bg-white" />,
});

export default function Dashboard() {
  const [rows, setRows] = useState<InvoiceRow[]>([]);
  const [mode, setMode] = useState<"paypal" | "demo" | null>(null);
  const [ai, setAi] = useState<"gemini" | "offline" | null>(null);
  const [gridApi, setGridApi] = useState<GridApi<InvoiceRow> | null>(null);
  const [selected, setSelected] = useState<InvoiceRow[]>([]);
  const [shownRows, setShownRows] = useState<InvoiceRow[] | null>(null);
  const [justPaid, setJustPaid] = useState<Set<string>>(new Set());
  const askRef = useRef<AskGridHandle>(null);
  const [chasing, setChasing] = useState<InvoiceRow[] | null>(null);
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
      setAi(data.ai);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Live updates: poll the webhook event feed; refresh rows and flash the ones that just got paid.
  const [live, setLive] = useState(false);
  useEffect(() => {
    let seq: number | null = null;
    let stopped = false;
    async function poll() {
      try {
        const res = await fetch(`/api/events?after=${seq ?? 0}`, { cache: "no-store" });
        const data: { seq: number; events: { invoiceId: string; summary: string; paid: boolean }[] } = await res.json();
        setLive(true);
        if (seq !== null && data.events.length) {
          await load();
          const paidIds = data.events.filter((e) => e.paid).map((e) => e.invoiceId);
          if (paidIds.length) {
            setJustPaid(new Set(paidIds));
            setTimeout(() => setJustPaid(new Set()), 4000);
          }
          const last = data.events[data.events.length - 1];
          setToast(`${last.paid ? "💸 " : ""}${last.summary}`);
        }
        seq = data.seq;
      } catch {
        setLive(false);
      }
      if (!stopped) timer = setTimeout(poll, 4000);
    }
    let timer = setTimeout(poll, 0);
    // Safety net for missed webhooks: quietly re-sync with PayPal every 2 minutes.
    const resync = setInterval(load, 120_000);
    return () => {
      stopped = true;
      clearTimeout(timer);
      clearInterval(resync);
    };
  }, [load]);

  const simulatePayment = useCallback(async () => {
    const res = await fetch("/api/demo/simulate-payment", { method: "POST" });
    const data = await res.json();
    if (!res.ok) setToast(data.error || "Couldn't simulate a payment");
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  const stats = useMemo(() => {
    const sum = (list: InvoiceRow[]) => list.reduce((s, r) => s + (r.amountNgn ?? 0), 0);
    const paid = rows.filter((r) => r.state === "Paid");
    const unpaid = rows.filter((r) => r.state === "Awaiting" || r.state === "Overdue");
    const overdue = unpaid.filter((r) => r.state === "Overdue");
    return {
      received: sum(paid),
      outstanding: sum(unpaid),
      overdue: sum(overdue),
      overdueCount: overdue.length,
      clients: new Set(rows.map((r) => r.clientEmail)).size,
    };
  }, [rows]);

  const remind = useCallback(
    async (row: InvoiceRow) => {
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
        load();
      } catch (err) {
        setToast((err as Error).message);
      } finally {
        setRemindingId(null);
      }
    },
    [load],
  );

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:py-10">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-kudi-600 text-lg font-bold text-white">₦</div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">KudiDesk</h1>
            <p className="hidden text-sm text-gray-500 sm:block">Every client payment, one desk.</p>
          </div>
          {mode && (
            <span
              className={`ml-2 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                mode === "paypal" ? "bg-kudi-100 text-kudi-700" : "bg-amber-100 text-amber-800"
              }`}
            >
              {mode === "paypal" ? "PayPal Sandbox" : "Demo data"}
            </span>
          )}
          {ai && (
            <span
              className={`whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                ai === "gemini" ? "bg-violet-100 text-violet-800" : "bg-gray-100 text-gray-600"
              }`}
              title={ai === "gemini" ? "AI features use Google Gemini" : "Set GEMINI_API_KEY for full AI"}
            >
              {ai === "gemini" ? "✨ Gemini" : "AI offline"}
            </span>
          )}
          {live && (
            <span
              className="flex items-center gap-1.5 text-[11px] font-medium text-gray-500"
              title="Listening for PayPal webhooks"
            >
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-kudi-500 opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-kudi-500" />
              </span>
              Live
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {mode === "demo" && (
            <button
              onClick={simulatePayment}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm font-medium hover:bg-gray-50"
              title="Sends a fake INVOICING.INVOICE.PAID webhook through the real handler"
            >
              Simulate a client payment
            </button>
          )}
          <button
            onClick={() => setDialogOpen(true)}
            className="rounded-lg bg-kudi-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-kudi-700"
          >
            + New invoice
          </button>
        </div>
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

      {rows.length > 0 && (
        <IncomeChart rows={shownRows ?? rows} filtered={!!shownRows && shownRows.length !== rows.length} />
      )}

      <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold">Invoices & payments</h2>
          <div className="flex items-center gap-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Quick search…"
              className="w-44 rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-kudi-500"
            />
            <button
              onClick={() => gridApi?.exportDataAsCsv({ fileName: "kudidesk-invoices.csv" })}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50"
            >
              Export CSV
            </button>
            <button
              onClick={load}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50"
              aria-label="Refresh"
            >
              ↻
            </button>
          </div>
        </div>

        <AskGrid ref={askRef} api={gridApi} rows={rows} />

        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl bg-gray-50 px-3 py-2 text-sm">
          <span className="text-gray-600">
            {selected.length
              ? `${selected.length} unpaid invoice${selected.length === 1 ? "" : "s"} selected`
              : "Tick unpaid invoices to chase them, or"}
          </span>
          {!selected.length && (
            <button
              onClick={() => {
                gridApi?.forEachNodeAfterFilter((n) => n.setSelected(n.data?.state === "Overdue"));
              }}
              disabled={!stats.overdueCount}
              className="font-medium text-kudi-700 hover:underline disabled:text-gray-400 disabled:no-underline"
            >
              select all overdue
            </button>
          )}
          {selected.length > 0 && (
            <>
              <button
                onClick={() => setChasing(selected)}
                className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700"
              >
                ✨ Chase with AI
              </button>
              <button onClick={() => gridApi?.deselectAll()} className="text-xs text-gray-500 hover:underline">
                Clear selection
              </button>
            </>
          )}
        </div>

        {error ? (
          <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700">{error}</div>
        ) : loading && rows.length === 0 ? (
          <div className="h-[560px] animate-pulse rounded-xl bg-gray-50" />
        ) : (
          <InvoiceGrid
            rows={rows}
            quickFilter={search}
            onRemind={remind}
            remindingId={remindingId}
            justPaid={justPaid}
            onReady={setGridApi}
            onSelectionChange={setSelected}
            onFilterChange={() => askRef.current?.filtersChanged()}
            onFilteredRows={setShownRows}
          />
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

      {chasing && (
        <ChaseDialog
          rows={chasing}
          onClose={() => setChasing(null)}
          onDone={(sent) => {
            if (sent)
              setToast(
                `${sent} reminder${sent === 1 ? "" : "s"} ${mode === "paypal" ? "sent via PayPal" : "logged (demo mode — nothing emailed)"}`,
              );
            gridApi?.deselectAll();
            load();
          }}
        />
      )}

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
