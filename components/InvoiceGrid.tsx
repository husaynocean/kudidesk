"use client";

import { useMemo } from "react";
import {
  AllCommunityModule,
  ModuleRegistry,
  themeQuartz,
  type ColDef,
  type ICellRendererParams,
} from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
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
  wrapperBorderRadius: 12,
  spacing: 7,
});

const STATUS_STYLE: Record<string, string> = {
  PAID: "bg-kudi-100 text-kudi-700",
  MARKED_AS_PAID: "bg-kudi-100 text-kudi-700",
  SENT: "bg-sky-100 text-sky-700",
  UNPAID: "bg-sky-100 text-sky-700",
  PARTIALLY_PAID: "bg-amber-100 text-amber-800",
  PAYMENT_PENDING: "bg-amber-100 text-amber-800",
  DRAFT: "bg-gray-100 text-gray-600",
  CANCELLED: "bg-gray-100 text-gray-500",
};

function StatusCell({ data }: ICellRendererParams<InvoiceRow>) {
  if (!data) return null;
  const label = data.overdue ? "OVERDUE" : data.status.replaceAll("_", " ");
  const cls = data.overdue ? "bg-red-100 text-red-700" : STATUS_STYLE[data.status] ?? "bg-gray-100 text-gray-600";
  return <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-wide ${cls}`}>{label}</span>;
}

interface Props {
  rows: InvoiceRow[];
  quickFilter: string;
  onRemind: (row: InvoiceRow) => void;
  remindingId: string | null;
}

export default function InvoiceGrid({ rows, quickFilter, onRemind, remindingId }: Props) {
  const columnDefs = useMemo<ColDef<InvoiceRow>[]>(
    () => [
      { field: "number", headerName: "Invoice", width: 105 },
      {
        field: "clientName",
        headerName: "Client",
        minWidth: 170,
        flex: 1,
        cellRenderer: ({ data }: ICellRendererParams<InvoiceRow>) =>
          data ? (
            <div className="flex flex-col justify-center leading-tight py-1.5">
              <span className="font-medium text-gray-900">{data.clientName}</span>
              <span className="text-[11px] text-gray-500">{data.clientEmail}</span>
            </div>
          ) : null,
        autoHeight: true,
      },
      { field: "description", headerName: "Work", minWidth: 200, flex: 1.4, tooltipField: "description" },
      {
        field: "amount",
        headerName: "Amount",
        width: 120,
        type: "rightAligned",
        filter: "agNumberColumnFilter",
        valueFormatter: (p) => (p.data ? money(p.data.amount, p.data.currency) : ""),
        cellClass: "font-medium",
      },
      {
        field: "amountNgn",
        headerName: "≈ Naira",
        width: 130,
        type: "rightAligned",
        filter: "agNumberColumnFilter",
        valueFormatter: (p) => naira(p.value),
        cellClass: "text-gray-600",
      },
      {
        field: "status",
        headerName: "Status",
        width: 135,
        cellRenderer: StatusCell,
        filterValueGetter: (p) => (p.data?.overdue ? "OVERDUE" : p.data?.status),
      },
      { field: "issuedAt", headerName: "Issued", width: 100, valueFormatter: (p) => shortDate(p.value) },
      {
        field: "dueDate",
        headerName: "Due",
        width: 100,
        valueFormatter: (p) => shortDate(p.value),
        cellClassRules: { "text-red-600 font-semibold": (p) => !!p.data?.overdue },
      },
      {
        headerName: "",
        colId: "actions",
        width: 140,
        sortable: false,
        filter: false,
        cellRenderer: ({ data }: ICellRendererParams<InvoiceRow>) => {
          if (!data) return null;
          const unpaid = ["SENT", "UNPAID", "PARTIALLY_PAID"].includes(data.status);
          return (
            <div className="flex h-full items-center gap-2">
              {unpaid && (
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

  return (
    <div className="h-[520px] w-full">
      <AgGridReact<InvoiceRow>
        theme={kudiTheme}
        rowData={rows}
        columnDefs={columnDefs}
        defaultColDef={{ sortable: true, filter: true, resizable: true }}
        quickFilterText={quickFilter}
        getRowId={(p) => p.data.id}
        animateRows
        tooltipShowDelay={400}
        overlayNoRowsTemplate="No invoices yet — create your first one."
      />
    </div>
  );
}
