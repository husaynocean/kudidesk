"use client";

import { useEffect, useState } from "react";
import { CURRENCIES } from "@/lib/currencies";

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (payLink: string | null) => void;
}

type Item = { name: string; quantity: number; unitAmount: number };
type Field = "clientName" | "clientEmail" | "currency" | "dueDate" | "note" | "items";

interface Draft {
  clientName: string | null;
  clientEmail: string | null;
  currency: string | null;
  dueDate: string | null;
  note: string | null;
  items: Item[];
  warnings: string[];
}

const SAMPLE_CHAT = `[10:02] Sarah Mitchell: Hi! Loved the logo concepts. Can we go ahead with the full brand guidelines too?
[10:05] Me: Great to hear! Guidelines would be £350 on top of the logo (£450).
[10:07] Sarah Mitchell: Could you do £300 for the guidelines? Budget is tight this quarter.
[10:09] Me: Okay, £300 works.
[10:10] Sarah Mitchell: Perfect. Send the invoice to accounts@brightleaf.co.uk — we pay within 2 weeks. Thanks!`;

function inDays(n: number) {
  return new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
}

function localToday() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

export default function NewInvoiceDialog({ open, onClose, onCreated }: Props) {
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [dueDate, setDueDate] = useState(inDays(14));
  const [note, setNote] = useState("");
  const [items, setItems] = useState<Item[]>([{ name: "", quantity: 1, unitAmount: 0 }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // AI "paste a client chat" state.
  const [chat, setChat] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [aiFields, setAiFields] = useState<Set<Field>>(new Set());
  const [warnings, setWarnings] = useState<string[]>([]);
  const [aiSource, setAiSource] = useState<"gemini" | "rules" | null>(null);
  const [showChat, setShowChat] = useState(true);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const total = items.reduce((s, i) => s + i.quantity * i.unitAmount, 0);

  function touched(field: Field) {
    setAiFields((prev) => {
      if (!prev.has(field)) return prev;
      const next = new Set(prev);
      next.delete(field);
      return next;
    });
  }

  function updateItem(idx: number, patch: Partial<Item>) {
    touched("items");
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }

  async function draftFromChat() {
    setDrafting(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/extract-invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat, today: localToday() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not read the chat");
      const d: Draft = data.draft;
      const filled = new Set<Field>();
      if (d.clientName) (setClientName(d.clientName), filled.add("clientName"));
      if (d.clientEmail) (setClientEmail(d.clientEmail), filled.add("clientEmail"));
      if (d.currency) (setCurrency(d.currency), filled.add("currency"));
      if (d.dueDate) (setDueDate(d.dueDate), filled.add("dueDate"));
      if (d.note) (setNote(d.note), filled.add("note"));
      if (d.items.length) (setItems(d.items), filled.add("items"));
      setAiFields(filled);
      setWarnings(d.warnings);
      setAiSource(data.source);
      setShowChat(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setDrafting(false);
    }
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
      setChat("");
      setAiFields(new Set());
      setWarnings([]);
      setAiSource(null);
      setShowChat(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const base =
    "w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none focus:border-kudi-500 focus:ring-2 focus:ring-kudi-100";
  const input = (f?: Field) =>
    `${base} ${f && aiFields.has(f) ? "border-violet-300 bg-violet-50/60" : "border-gray-300"}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[94vh] w-full max-w-xl overflow-y-auto rounded-t-2xl bg-white p-6 shadow-xl sm:rounded-2xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">New PayPal invoice</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-700" aria-label="Close">
            ✕
          </button>
        </div>

        {/* ---- AI: paste a client chat ---- */}
        <div className="mb-5 rounded-xl border border-violet-200 bg-violet-50/50 p-3">
          <button
            type="button"
            onClick={() => setShowChat((s) => !s)}
            className="flex w-full items-center justify-between text-left text-sm font-semibold text-violet-900"
          >
            <span>✨ Draft from a client chat</span>
            <span className="text-xs font-normal text-violet-700">{showChat ? "Hide" : "Show"}</span>
          </button>
          {showChat && (
            <div className="mt-2">
              <p className="mb-2 text-xs text-violet-800/80">
                Paste a WhatsApp, email or Upwork thread. AI picks out the client, items, prices, currency and due date
                — you review before anything is sent.
              </p>
              <textarea
                className={`${base} border-violet-200 font-mono text-xs`}
                rows={6}
                value={chat}
                onChange={(e) => setChat(e.target.value)}
                placeholder="Paste the conversation here…"
              />
              <div className="mt-2 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setChat(SAMPLE_CHAT)}
                  className="text-xs font-medium text-violet-700 hover:underline"
                >
                  Use a sample chat
                </button>
                <button
                  type="button"
                  onClick={draftFromChat}
                  disabled={drafting || chat.trim().length < 10}
                  className="rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
                >
                  {drafting ? "Reading chat…" : "Draft invoice"}
                </button>
              </div>
            </div>
          )}
          {!showChat && aiSource && (
            <p className="mt-1 text-xs text-violet-800">
              Fields shaded purple were filled by {aiSource === "gemini" ? "Gemini" : "the offline parser"}. Check them
              before sending.
            </p>
          )}
          {warnings.length > 0 && (
            <ul className="mt-2 space-y-1 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
              {warnings.map((w, i) => (
                <li key={i}>⚠ {w}</li>
              ))}
            </ul>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="mb-1 block text-gray-600">Client name</span>
            <input
              className={input("clientName")}
              required
              value={clientName}
              onChange={(e) => (touched("clientName"), setClientName(e.target.value))}
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-gray-600">Client email</span>
            <input
              className={input("clientEmail")}
              type="email"
              required
              value={clientEmail}
              onChange={(e) => (touched("clientEmail"), setClientEmail(e.target.value))}
              placeholder="sb-…@personal.example.com"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-gray-600">Currency</span>
            <select
              className={input("currency")}
              value={currency}
              onChange={(e) => (touched("currency"), setCurrency(e.target.value))}
            >
              {CURRENCIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-gray-600">Due date</span>
            <input
              className={input("dueDate")}
              type="date"
              value={dueDate}
              onChange={(e) => (touched("dueDate"), setDueDate(e.target.value))}
            />
          </label>
        </div>

        <div className="mt-5">
          <span className="mb-2 block text-sm text-gray-600">Items</span>
          <div className="space-y-2">
            {items.map((it, idx) => (
              <div key={idx} className="grid grid-cols-[1fr_64px_96px_24px] gap-2">
                <input
                  className={input("items")}
                  required
                  placeholder="e.g. Logo design"
                  value={it.name}
                  onChange={(e) => updateItem(idx, { name: e.target.value })}
                />
                <input
                  className={input("items")}
                  type="number"
                  min={1}
                  value={it.quantity}
                  onChange={(e) => updateItem(idx, { quantity: Number(e.target.value) })}
                  aria-label="Quantity"
                />
                <input
                  className={input("items")}
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
                  onClick={() => (touched("items"), setItems((prev) => prev.filter((_, i) => i !== idx)))}
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
          <textarea
            className={input("note")}
            rows={2}
            value={note}
            onChange={(e) => (touched("note"), setNote(e.target.value))}
          />
        </label>

        {error && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <div className="mt-6 flex items-center justify-between">
          <span className="text-sm text-gray-600">
            Total{" "}
            <strong className="text-gray-900">
              {currency} {total.toFixed(2)}
            </strong>
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
