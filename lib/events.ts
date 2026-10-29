import "server-only";

/**
 * A small in-memory feed of invoice events (from PayPal webhooks), which the
 * dashboard polls so rows update live. It lives in server memory: fine for a
 * single Render instance, and PayPal stays the source of truth for status.
 */

export interface InvoiceEvent {
  seq: number;
  at: string;
  type: string; // e.g. INVOICING.INVOICE.PAID
  invoiceId: string;
  summary: string;
  paid: boolean;
}

const g = globalThis as unknown as { __kudiEvents?: { seq: number; list: InvoiceEvent[]; seen: Set<string> } };
const store = (g.__kudiEvents ??= { seq: 0, list: [], seen: new Set() });

export function recordEvent(e: Omit<InvoiceEvent, "seq" | "at">, webhookId?: string): InvoiceEvent | null {
  // PayPal retries deliveries; ignore ones we've already handled.
  if (webhookId) {
    if (store.seen.has(webhookId)) return null;
    store.seen.add(webhookId);
  }
  const event = { ...e, seq: ++store.seq, at: new Date().toISOString() };
  store.list.push(event);
  if (store.list.length > 200) store.list.splice(0, store.list.length - 200);
  return event;
}

export function eventsAfter(seq: number) {
  return { seq: store.seq, events: store.list.filter((e) => e.seq > seq) };
}
