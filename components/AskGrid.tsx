"use client";

import { forwardRef, useImperativeHandle, useState } from "react";
import type { GridApi } from "ag-grid-community";
import { describe, toAgGrid, type GridQuery } from "@/lib/gridQuery";
import type { InvoiceRow } from "@/lib/types";

const EXAMPLES = [
  "unpaid UK clients over £200, oldest first",
  "overdue more than a week, biggest first",
  "what has Sarah paid this month?",
  "anything over ₦500k still owed",
];

export interface AskGridHandle {
  /** Call when the user edits a column filter by hand — the AI chips no longer describe the grid. */
  filtersChanged: () => void;
}

interface Props {
  api: GridApi<InvoiceRow> | null;
  rows: InvoiceRow[];
}

function localToday() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

const AskGrid = forwardRef<AskGridHandle, Props>(function AskGrid({ api, rows }, ref) {
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<{ query: GridQuery; source: string; state: ReturnType<typeof toAgGrid> } | null>(null);
  const [showState, setShowState] = useState(false);

  useImperativeHandle(ref, () => ({
    filtersChanged: () => setActive(null),
  }));

  async function ask(q: string) {
    if (!api || !q.trim()) return;
    setQuestion(q);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/grid-query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: q,
          today: localToday(),
          clients: [...new Set(rows.map((r) => r.clientName))],
          countries: [...new Set(rows.map((r) => r.clientCountry))],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't answer that");
      const query: GridQuery = data.query;
      const state = toAgGrid(query);

      // Apply as native AG Grid state: the column filter menus and sort arrows reflect it too.
      api.setFilterModel(state.filterModel);
      api.applyColumnState({ state: state.columnState, defaultState: { sort: null } });
      for (const colId of Object.keys(state.filterModel)) {
        if (!api.getColumn(colId)?.isVisible()) api.setColumnsVisible([colId], true);
      }
      setActive({ query, source: data.source, state });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function clear() {
    if (!api) return;
    api.setFilterModel(null);
    api.applyColumnState({ defaultState: { sort: null } });
    api.setColumnsVisible(["currency", "daysOverdue"], false);
    setActive(null);
    setQuestion("");
  }

  return (
    <div className="mb-3">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(question);
        }}
        className="flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50/60 p-1.5 pl-3 focus-within:border-violet-400"
      >
        <span aria-hidden>✨</span>
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask your invoices… e.g. unpaid UK clients over £200, oldest first"
          className="min-w-0 flex-1 bg-transparent py-1.5 text-sm outline-none placeholder:text-violet-900/40"
          aria-label="Ask the grid"
        />
        <button
          disabled={busy || !question.trim()}
          className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
        >
          {busy ? "Thinking…" : "Ask"}
        </button>
      </form>

      {!active && !error && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              onClick={() => ask(ex)}
              className="rounded-full border border-gray-200 bg-white px-2.5 py-1 text-[11px] text-gray-600 hover:border-violet-300 hover:text-violet-800"
            >
              {ex}
            </button>
          ))}
        </div>
      )}

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

      {active && (
        <div className="mt-2 rounded-lg bg-white text-xs">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-gray-500">{active.query.explanation}</span>
            {describe(active.query).map((c, i) => (
              <span key={i} className="rounded-full bg-violet-100 px-2 py-0.5 font-medium text-violet-800">
                {c}
              </span>
            ))}
            <button onClick={() => setShowState((s) => !s)} className="ml-1 text-violet-700 hover:underline">
              {showState ? "Hide" : "View"} AG Grid state
            </button>
            <button onClick={clear} className="text-gray-500 hover:text-gray-900 hover:underline">
              Clear
            </button>
            <span className="ml-auto text-[10px] uppercase tracking-wide text-gray-400">
              {active.source === "gemini" ? "Gemini" : "offline parser"}
            </span>
          </div>
          {showState && (
            <pre className="mt-2 max-h-56 overflow-auto rounded-lg bg-gray-900 p-3 text-[11px] leading-relaxed text-gray-100">
              {`api.setFilterModel(${JSON.stringify(active.state.filterModel, null, 2)});\n\napi.applyColumnState(${JSON.stringify(
                { state: active.state.columnState, defaultState: { sort: null } },
                null,
                2,
              )});`}
            </pre>
          )}
        </div>
      )}
    </div>
  );
});

export default AskGrid;
