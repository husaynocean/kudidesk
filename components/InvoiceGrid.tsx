"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AllCommunityModule,
  ModuleRegistry,
  themeQuartz,
  type ColDef,
  type GridApi,
  type GridReadyEvent,
  type ICellRendererParams,
  type RowClassRules,
} from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import { FLAGS } from "@/lib/country";
import { money, naira, shortDate } from "@/lib/format";
import type { InvoiceRow } from "@/lib/types";

ModuleRegistry.registerModules([AllCommunityModule]);

const kudiTheme = themeQuartz.withParams({
  accentColor: "#0b8a43",
  fontFamily: "inherit",
  fontSize: 13,
  headerFontWeight: 600,
  headerBackgroundColor: "#f8faf9",
  borderColor: "#e6e9e7",
  rowHoverColor: "#f1f8f4",
  selectedRowBackgroundColor: "#ede9fe",
  wrapperBorderRadius: 12,
  spacing: 7,
});

const STATE_STYLE: Record<string, string> = {
  Paid: "bg-kudi-100 text-kudi-700",
  Overdue: "bg-red-100 text-red-700",
  Awaiting: "bg-sky-100 text-sky-700",
  Draft: "bg-gray-100 text-gray-600",
  Cancelled: "bg-gray-100 text-gray-500",
  Refunded: "bg-amber-100 text-amber-800",
};

export const isChaseable = (r?: InvoiceRow) => !!r && (r.state === "Overdue" || r.state === "Awaiting");

function ago(iso: string) {
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const h = Math.round(mins / 60);
  return h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
}

function StateCell({ data, node }: ICellRendererParams<InvoiceRow>) {
  if (!data || node.rowPinned) return null;
  return (
    <div className="flex flex-col justify-center py-2 leading-tight">
      <span
        title={`PayPal status: ${data.status}`}
        className={`w-fit rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-wide ${STATE_STYLE[data.state]}`}
      >
        {data.state.toUpperCase()}
      </span>
      {data.lastRemindedAt && <span className="mt-1 text-[10px] text-gray-400">reminded {ago(data.lastRemindedAt)}</span>}
    </div>
  );
}

interface Props {
  rows: InvoiceRow[];
  quickFilter: string;
  onRemind: (row: InvoiceRow) => void;
  remindingId: string | null;
  /** Rows that just got paid — highlighted for a few seconds. */
  justPaid: Set<string>;
  onReady: (api: GridApi<InvoiceRow>) => void;
  onSelectionChange: (rows: InvoiceRow[]) => void;
  onFilterChange: () => void;
}

export default function InvoiceGrid({
  rows,
  quickFilter,
  onRemind,
  remindingId,
  justPaid,
  onReady,
  onSelectionChange,
  onFilterChange,
}: Props) {
  const apiRef = useRef<GridApi<InvoiceRow> | null>(null);
  const justPaidRef = useRef(justPaid);
  const [totals, setTotals] = useState<{ count: number; ngn: number }>({ count: 0, ngn: 0 });

  // Re-style rows when the "just paid" set changes.
  useEffect(() => {
    justPaidRef.current = justPaid;
    apiRef.current?.redrawRows();
  }, [justPaid]);

  // "reminded 2m ago" lives outside the cell's value, so refresh the status cells on new data.
  useEffect(() => {
    apiRef.current?.refreshCells({ columns: ["state"], force: true });
  }, [rows]);

  const columnDefs = useMemo<ColDef<InvoiceRow>[]>(
    () => [
      { field: "number", headerName: "Invoice", width: 105 },
      {
        field: "clientName",
        headerName: "Client",
        minWidth: 180,
        flex: 1,
        cellRenderer: ({ data, node }: ICellRendererParams<InvoiceRow>) =>
          node.rowPinned ? (
            <span className="font-semibold">{data?.clientName}</span>
          ) : data ? (
            <div className="flex flex-col justify-center py-1.5 leading-tight">
              <span className="font-medium text-gray-900">{data.clientName}</span>
              <span className="text-[11px] text-gray-500">{data.clientEmail}</span>
            </div>
          ) : null,
        autoHeight: true,
      },
      {
        field: "clientCountry",
        headerName: "Country",
        width: 115,
        valueFormatter: (p) => (p.value ? `${FLAGS[p.value] ?? "🌍"} ${p.value}` : ""),
      },
      { field: "description", headerName: "Work", minWidth: 200, flex: 1.4, tooltipField: "description" },
      {
        field: "amount",
        headerName: "Amount",
        width: 120,
        type: "rightAligned",
        filter: "agNumberColumnFilter",
        valueFormatter: (p) => (p.data && !p.node?.rowPinned ? money(p.data.amount, p.data.currency) : ""),
        cellClass: "font-medium",
      },
      { field: "currency", headerName: "Cur", width: 80, hide: true },
      {
        field: "amountNgn",
        headerName: "≈ Naira",
        width: 135,
        type: "rightAligned",
        filter: "agNumberColumnFilter",
        valueFormatter: (p) => naira(p.value),
        cellClass: (p) => (p.node.rowPinned ? "font-bold text-gray-900" : "text-gray-600"),
      },
      {
        field: "state",
        headerName: "Status",
        width: 135,
        cellRenderer: StateCell,
        autoHeight: true,
        filterParams: { maxNumConditions: 6 },
      },
      {
        field: "issuedAt",
        headerName: "Issued",
        width: 100,
        cellDataType: "dateString",
        filter: "agDateColumnFilter",
        valueFormatter: (p) => (p.node?.rowPinned ? "" : shortDate(p.value)),
      },
      {
        field: "dueDate",
        headerName: "Due",
        width: 115,
        cellDataType: "dateString",
        filter: "agDateColumnFilter",
        valueFormatter: (p) =>
          p.node?.rowPinned ? "" : p.data?.daysOverdue ? `${shortDate(p.value)} · ${p.data.daysOverdue}d late` : shortDate(p.value),
        cellClassRules: { "text-red-600 font-semibold": (p) => !!p.data?.overdue },
      },
      {
        field: "daysOverdue",
        headerName: "Days late",
        width: 105,
        hide: true,
        filter: "agNumberColumnFilter",
      },
      {
        field: "paidAt",
        headerName: "Paid",
        width: 100,
        cellDataType: "dateString",
        filter: "agDateColumnFilter",
        valueFormatter: (p) => (p.node?.rowPinned ? "" : shortDate(p.value)),
      },
      {
        headerName: "",
        colId: "actions",
        width: 130,
        sortable: false,
        filter: false,
        cellRenderer: ({ data, node }: ICellRendererParams<InvoiceRow>) => {
          if (!data || node.rowPinned) return null;
          return (
            <div className="flex h-full items-center gap-2">
              {isChaseable(data) && (
                <button
                  onClick={() => onRemind(data)}
                  disabled={remindingId === data.id}
                  className="rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium hover:border-kudi-500 hover:text-kudi-700 disabled:opacity-50"
                >
                  {remindingId === data.id ? "Sending…" : "Remind"}
                </button>
              )}
              {data.payLink && (
                <a href={data.payLink} target="_blank" rel="noreferrer" className="text-xs text-kudi-700 underline">
                  Pay link
                </a>
              )}
            </div>
          );
        },
      },
    ],
    [onRemind, remindingId],
  );

  const rowClassRules = useMemo<RowClassRules<InvoiceRow>>(
    () => ({
      "kudi-row-paid": (p) => p.data?.state === "Paid",
      "kudi-row-just-paid": (p) => !!p.data && justPaidRef.current.has(p.data.id),
    }),
    [],
  );

  /** Keeps the pinned totals row in step with whatever is filtered. */
  const recomputeTotals = useCallback(() => {
    const api = apiRef.current;
    if (!api) return;
    let count = 0;
    let ngn = 0;
    api.forEachNodeAfterFilter((n) => {
      if (!n.data) return;
      count++;
      ngn += n.data.amountNgn ?? 0;
    });
    setTotals((t) => (t.count === count && t.ngn === ngn ? t : { count, ngn }));
  }, []);

  const pinnedBottomRowData = useMemo(
    () => [{ id: "__total", clientName: `${totals.count} invoice${totals.count === 1 ? "" : "s"} shown`, amountNgn: totals.ngn } as InvoiceRow],
    [totals],
  );

  return (
    <div className="h-[560px] w-full">
      <AgGridReact<InvoiceRow>
        theme={kudiTheme}
        rowData={rows}
        columnDefs={columnDefs}
        defaultColDef={{ sortable: true, filter: true, resizable: true, enableCellChangeFlash: true }}
        quickFilterText={quickFilter}
        getRowId={(p) => p.data.id}
        rowSelection={{
          mode: "multiRow",
          isRowSelectable: (n) => isChaseable(n.data),
          hideDisabledCheckboxes: true,
          enableClickSelection: false,
        }}
        selectionColumnDef={{ pinned: "left", width: 48 }}
        rowClassRules={rowClassRules}
        pinnedBottomRowData={pinnedBottomRowData}
        animateRows
        tooltipShowDelay={400}
        overlayNoRowsTemplate="No invoices match — clear the filters or create one."
        onGridReady={(e: GridReadyEvent<InvoiceRow>) => {
          apiRef.current = e.api;
          onReady(e.api);
        }}
        onModelUpdated={recomputeTotals}
        onFilterChanged={(e) => {
          // Only hand-edited column filters count; API calls (Ask-the-grid) and data refreshes don't.
          if (e.source === "columnFilter" && !e.afterDataChange) onFilterChange();
        }}
        onSelectionChanged={(e) => onSelectionChange(e.api.getSelectedRows())}
      />
    </div>
  );
}
