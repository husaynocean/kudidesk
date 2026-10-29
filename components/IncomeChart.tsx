"use client";

import { useMemo } from "react";
import { AgCharts } from "ag-charts-react";
import { AllCommunityModule, ModuleRegistry, type AgCartesianChartOptions } from "ag-charts-community";
import { CURRENCIES } from "@/lib/currencies";
import { naira } from "@/lib/format";
import type { InvoiceRow } from "@/lib/types";

ModuleRegistry.registerModules([AllCommunityModule]);

// Fixed categorical order (validated for colour-blind separation): the colour follows the currency, never its rank.
const CURRENCY_COLORS: Record<string, string> = { USD: "#2a78d6", GBP: "#eb6834", EUR: "#1baf7a", CAD: "#eda100" };
const MONTHS = 6;

function monthKey(iso: string) {
  return iso.slice(0, 7);
}

function monthLabel(key: string) {
  return new Date(key + "-01T00:00:00").toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
}

/** Money received per month in naira, stacked by the currency the client paid in. Follows the grid's filters. */
export default function IncomeChart({ rows, filtered }: { rows: InvoiceRow[]; filtered: boolean }) {
  const { data, thisMonth, lastMonth, used } = useMemo(() => {
    const now = new Date();
    const keys = Array.from({ length: MONTHS }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (MONTHS - 1 - i), 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    });
    const buckets = new Map(
      keys.map((k) => [k, { month: monthLabel(k), total: 0 } as Record<string, number | string>]),
    );
    const used = new Set<string>();
    for (const r of rows) {
      if (r.state !== "Paid" || !r.paidAt || r.amountNgn == null) continue;
      const b = buckets.get(monthKey(r.paidAt));
      if (!b) continue;
      b[r.currency] = ((b[r.currency] as number) ?? 0) + r.amountNgn;
      b.total = (b.total as number) + r.amountNgn;
      used.add(r.currency);
    }
    const data = [...buckets.values()];
    return {
      data,
      thisMonth: data[MONTHS - 1].total as number,
      lastMonth: data[MONTHS - 2].total as number,
      used: CURRENCIES.filter((c) => used.has(c)),
    };
  }, [rows]);

  const options = useMemo<AgCartesianChartOptions>(
    () => ({
      data,
      height: 260,
      background: { visible: false },
      padding: { top: 8, right: 8, bottom: 4, left: 4 },
      series: used.map((c) => ({
        type: "bar" as const,
        xKey: "month",
        yKey: c,
        yName: c,
        stacked: true,
        fill: CURRENCY_COLORS[c],
        stroke: "#ffffff",
        strokeWidth: 2,
        cornerRadius: 4,
        tooltip: {
          renderer: ({ datum }: { datum: Record<string, number | string> }) => ({
            heading: String(datum.month),
            title: `Paid in ${c}`,
            data: [
              { label: c, value: naira(datum[c] as number) },
              { label: "Month total", value: naira(datum.total as number) },
            ],
          }),
        },
      })),
      axes: {
        x: { type: "category", position: "bottom", line: { enabled: false }, label: { color: "#6b7280" } },
        y: {
          type: "number",
          position: "left",
          label: {
            color: "#6b7280",
            formatter: ({ value }: { value: number }) => (value >= 1e6 ? `₦${value / 1e6}m` : `₦${value / 1e3}k`),
          },
          gridLine: { style: [{ stroke: "#eef0ee", lineDash: [] }] },
        },
      },
      legend: { position: "bottom", item: { marker: { shape: "square" }, label: { color: "#374151" } } },
    }),
    [data, used],
  );

  const change = lastMonth ? Math.round(((thisMonth - lastMonth) / lastMonth) * 100) : null;

  return (
    <section className="mb-6 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="font-semibold">Income received</h2>
          <p className="text-xs text-gray-500">
            Naira value by month, split by the currency clients paid in
            {filtered ? " · following your grid filters" : ""}
          </p>
        </div>
        <p className="text-sm text-gray-600">
          This month <strong className="text-gray-900">{naira(thisMonth)}</strong>
          {change != null && (
            <span className={`ml-2 text-xs font-medium ${change >= 0 ? "text-kudi-700" : "text-red-600"}`}>
              {change >= 0 ? "▲" : "▼"} {Math.abs(change)}% vs last month
            </span>
          )}
        </p>
      </div>
      {used.length ? (
        <AgCharts options={options} />
      ) : (
        <div className="grid h-[260px] place-items-center text-sm text-gray-400">
          No payments in the last six months yet.
        </div>
      )}
    </section>
  );
}
