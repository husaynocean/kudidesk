"use client";

import { useState } from "react";

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (payLink: string | null) => void;
}

const CURRENCIES = ["USD", "GBP", "EUR", "CAD"];

function inDays(n: number) {
  return new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
}

export default function NewInvoiceDialog({ open, onClose, onCreated }: Props) {
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [dueDate, setDueDate] = useState(inDays(14));
  const [note, setNote] = useState("");
  const [items, setItems] = useState([{ name: "", quantity: 1, unitAmount: 0 }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const total = items.reduce((s, i) => s + i.quantity * i.unitAmount, 0);

  function updateItem(idx: number, patch: Partial<(typeof items)[number]>) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientName, clientEmail, currency, dueDate, note: note || undefined, items }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not create invoice");
      onCreated(data.payLink ?? null);
      setClientName("");
      setClientEmail("");
      setNote("");
      setItems([{ name: "", quantity: 1, unitAmount: 0 }]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const input =
    "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-kudi-500 focus:ring-2 focus:ring-kudi-100";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-6 shadow-xl sm:rounded-2xl"
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold">New PayPal invoice</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-700" aria-label="Close">
            ✕
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="mb-1 block text-gray-600">Client name</span>
            <input className={input} required value={clientName} onChange={(e) => setClientName(e.target.value)} />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-gray-600">Client email</span>
            <input
              className={input}
              type="email"
              required
              value={clientEmail}
              onChange={(e) => setClientEmail(e.target.value)}
              placeholder="sb-…@personal.example.com"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-gray-600">Currency</span>
            <select className={input} value={currency} onChange={(e) => setCurrency(e.target.value)}>
              {CURRENCIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-gray-600">Due date</span>
            <input className={input} type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </label>
        </div>

        <div className="mt-5">
          <span className="mb-2 block text-sm text-gray-600">Items</span>
          <div className="space-y-2">
            {items.map((it, idx) => (
              <div key={idx} className="grid grid-cols-[1fr_64px_96px_24px] gap-2">
                <input
                  className={input}
                  required
                  placeholder="e.g. Logo design"
                  value={it.name}
                  onChange={(e) => updateItem(idx, { name: e.target.value })}
                />
                <input
                  className={input}
                  type="number"
                  min={1}
                  value={it.quantity}
                  onChange={(e) => updateItem(idx, { quantity: Number(e.target.value) })}
                  aria-label="Quantity"
                />
                <input
                  className={input}
                  type="number"
                  min={0}
                  step="0.01"
                  required
                  value={it.unitAmount || ""}
                  placeholder="Price"
                  onChange={(e) => updateItem(idx, { unitAmount: Number(e.target.value) })}
                  aria-label="Unit price"
                />
                <button
                  type="button"
                  className="text-gray-400 hover:text-red-600 disabled:invisible"
                  disabled={items.length === 1}
                  onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))}
                  aria-label="Remove item"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            className="mt-2 text-sm font-medium text-kudi-700 hover:underline"
            onClick={() => setItems((p) => [...p, { name: "", quantity: 1, unitAmount: 0 }])}
          >
            + Add item
          </button>
        </div>

        <label className="mt-4 block text-sm">
          <span className="mb-1 block text-gray-600">Note to client (optional)</span>
          <textarea className={input} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>

        {error && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <div className="mt-6 flex items-center justify-between">
          <span className="text-sm text-gray-600">
            Total <strong className="text-gray-900">{currency} {total.toFixed(2)}</strong>
          </span>
          <button
            disabled={saving}
            className="rounded-lg bg-kudi-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-kudi-700 disabled:opacity-60"
          >
            {saving ? "Sending…" : "Create & send"}
          </button>
        </div>
      </form>
    </div>
  );
}
