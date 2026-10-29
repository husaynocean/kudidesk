import "server-only";
import { recordEvent } from "./events";
import { money, naira } from "./format";
import { getRow, markDemoPaid, mode } from "./invoices";

export interface PayPalWebhookEvent {
  id?: string;
  event_type?: string;
  resource?: { id?: string; invoice?: { id?: string } };
}

const LABELS: Record<string, string> = {
  "INVOICING.INVOICE.PAID": "paid",
  "INVOICING.INVOICE.CANCELLED": "was cancelled",
  "INVOICING.INVOICE.REFUNDED": "was refunded",
  "INVOICING.INVOICE.UPDATED": "was updated",
  "INVOICING.INVOICE.CREATED": "was created",
  "INVOICING.INVOICE.SCHEDULED": "was scheduled",
};

/**
 * Handles one PayPal invoicing webhook. The event only tells us *which* invoice
 * changed: we re-read the invoice from PayPal before showing anything, so a
 * forged or replayed event can't mark an invoice as paid.
 */
export async function handleInvoiceEvent(event: PayPalWebhookEvent) {
  const type = event.event_type ?? "";
  if (!type.startsWith("INVOICING.INVOICE.")) return { ignored: true as const };
  const invoiceId = event.resource?.invoice?.id ?? event.resource?.id;
  if (!invoiceId) return { ignored: true as const };

  if (mode() === "demo" && type === "INVOICING.INVOICE.PAID") markDemoPaid(invoiceId);

  const row = await getRow(invoiceId).catch(() => null);
  if (!row) return { ignored: true as const };

  const paid = row.state === "Paid";
  const verb = type === "INVOICING.INVOICE.PAID" && !paid ? "has a payment pending" : (LABELS[type] ?? "changed");
  const summary = `${row.clientName} ${verb} — ${row.number}, ${money(row.amount, row.currency)} (${naira(row.amountNgn)})`;
  const recorded = recordEvent({ type, invoiceId, summary, paid }, event.id);
  return { ignored: false as const, recorded: !!recorded, summary };
}
