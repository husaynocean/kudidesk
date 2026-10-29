"use client";

import { useEffect, useState } from "react";
import { money } from "@/lib/format";
import type { InvoiceRow } from "@/lib/types";

type Tone = "heads-up" | "gentle" | "firm" | "final";
interface Draft {
  id: string;
  tone: Tone;
  subject: string;
  note: string;
  why: string;
}
type SendState = "idle" | "sending" | "sent" | "failed";

const TONE_STYLE: Record<Tone, string> = {
  "heads-up": "bg-sky-100 text-sky-800",
  gentle: "bg-kudi-100 text-kudi-700",
  firm: "bg-amber-100 text-amber-800",
  final: "bg-red-100 text-red-700",
};

interface Props {
  rows: InvoiceRow[];
  onClose: () => void;
  onDone: (sent: number) => void;
}

/**
 * The chase agent's review step: AI drafts one reminder per invoice, the freelancer
 * edits or unticks any of them, then KudiDesk sends each through PayPal's remind API.
 */
export default function ChaseDialog({ rows, onClose, onDone }: Props) {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [source, setSource] = useState<string | null>(null);
  const [include, setInclude] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<Record<string, { state: SendState; error?: string }>>({});
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/ai/chase", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: rows.map((r) => r.id) }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Couldn't draft reminders");
        if (cancelled) return;
        setDrafts(data.drafts);
        setSource(data.source);
        setInclude(new Set(data.drafts.map((d: Draft) => d.id)));
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [rows]);

  const byId = new Map(rows.map((r) => [r.id, r]));
  const done = Object.values(status).some((s) => s.state === "sent" || s.state === "failed") && !sending;

  function edit(id: string, patch: Partial<Draft>) {
    setDrafts((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  }

  async function sendAll() {
    setSending(true);
    let sent = 0;
    for (const d of drafts) {
      if (!include.has(d.id) || status[d.id]?.state === "sent") continue;
      setStatus((s) => ({ ...s, [d.id]: { state: "sending" } }));
      try {
        const res = await fetch(`/api/invoices/${encodeURIComponent(d.id)}/remind`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subject: d.subject, note: d.note }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed");
        sent++;
        setStatus((s) => ({ ...s, [d.id]: { state: "sent" } }));
      } catch (err) {
        setStatus((s) => ({ ...s, [d.id]: { state: "failed", error: (err as Error).message } }));
      }
    }
    setSending(false);
    onDone(sent);
  }

  const count = drafts.filter((d) => include.has(d.id) && status[d.id]?.state !== "sent").length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[94vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:rounded-2xl"
      >
        <div className="flex items-start justify-between border-b border-gray-100 p-5">
          <div>
            <h2 className="text-lg font-semibold">
              ✨ Chase {rows.length === 1 ? "this invoice" : `${rows.length} invoices`}
            </h2>
            <p className="text-sm text-gray-500">
              {loading
                ? "The agent is reading each invoice and the client's payment history…"
                : "Review each reminder. PayPal emails it with the invoice and a Pay now button."}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700" aria-label="Close">
            ✕
          </button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto p-5">
          {loading && rows.map((r) => <div key={r.id} className="h-36 animate-pulse rounded-xl bg-gray-50" />)}
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

          {drafts.map((d) => {
            const row = byId.get(d.id);
            const st = status[d.id];
            const on = include.has(d.id);
            return (
              <div
                key={d.id}
                className={`rounded-xl border p-4 ${on ? "border-gray-200" : "border-dashed border-gray-200 opacity-60"}`}
              >
                <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={on}
                    disabled={sending || st?.state === "sent"}
                    onChange={(e) =>
                      setInclude((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(d.id);
                        else next.delete(d.id);
                        return next;
                      })
                    }
                    aria-label={`Include ${row?.clientName}`}
                  />
                  <strong>{row?.clientName}</strong>
                  <span className="text-gray-500">
                    {row?.number} · {row && money(row.amount, row.currency)}
                    {row?.daysOverdue ? ` · ${row.daysOverdue}d late` : " · not yet due"}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${TONE_STYLE[d.tone]}`}>
                    {d.tone}
                  </span>
                  <span className="ml-auto text-xs">
                    {st?.state === "sending" && <span className="text-gray-500">Sending…</span>}
                    {st?.state === "sent" && <span className="font-semibold text-kudi-700">✓ Sent via PayPal</span>}
                    {st?.state === "failed" && <span className="text-red-600">✕ {st.error}</span>}
                  </span>
                </div>
                {d.why && <p className="mb-2 text-xs italic text-violet-700">Agent: {d.why}</p>}
                <input
                  value={d.subject}
                  onChange={(e) => edit(d.id, { subject: e.target.value })}
                  disabled={!on || sending || st?.state === "sent"}
                  maxLength={120}
                  className="mb-2 w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium outline-none focus:border-kudi-500"
                  aria-label="Subject"
                />
                <textarea
                  value={d.note}
                  onChange={(e) => edit(d.id, { note: e.target.value })}
                  disabled={!on || sending || st?.state === "sent"}
                  rows={4}
                  maxLength={1200}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-kudi-500"
                  aria-label="Message"
                />
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-gray-100 p-4">
          <span className="text-xs text-gray-400">
            {source && (source === "gemini" ? "Drafted by Gemini" : "Drafted from templates (no GEMINI_API_KEY)")}
          </span>
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50">
              {done ? "Close" : "Cancel"}
            </button>
            <button
              onClick={sendAll}
              disabled={loading || sending || count === 0}
              className="rounded-lg bg-kudi-600 px-4 py-2 text-sm font-semibold text-white hover:bg-kudi-700 disabled:opacity-50"
            >
              {sending ? "Sending…" : `Send ${count} reminder${count === 1 ? "" : "s"} via PayPal`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
