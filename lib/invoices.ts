import "server-only";
import { toNgn } from "./fx";
import {
  createAndSendInvoice,
  getInvoice,
  hasPayPalCredentials,
  listInvoices,
  remindInvoice,
  type PayPalInvoice,
} from "./paypal";
import type { InvoiceRow, InvoiceStatus, NewInvoiceInput } from "./types";

/**
 * The invoice service the API routes talk to.
 * - With PayPal credentials: everything goes through the PayPal sandbox Invoicing API.
 * - Without credentials: an in-memory demo store, so the UI runs out of the box.
 */

export const mode = () => (hasPayPalCredentials() ? "paypal" : "demo");

const UNPAID: InvoiceStatus[] = ["SENT", "UNPAID", "PARTIALLY_PAID", "PAYMENT_PENDING"];

function today() {
  return new Date().toISOString().slice(0, 10);
}

function finishRow(r: Omit<InvoiceRow, "amountNgn" | "overdue">): InvoiceRow {
  return {
    ...r,
    amountNgn: toNgn(r.amount, r.currency),
    overdue: UNPAID.includes(r.status) && !!r.dueDate && r.dueDate < today(),
  };
}

function itemsTotal(items: { quantity: string | number; unit_amount?: { value: string }; unitAmount?: number }[]) {
  return items.reduce(
    (sum, i) => sum + Number(i.quantity) * Number(i.unit_amount?.value ?? i.unitAmount ?? 0),
    0,
  );
}

function fromPayPal(inv: PayPalInvoice): InvoiceRow {
  const billing = inv.primary_recipients?.[0]?.billing_info;
  const name = billing?.name;
  const clientName =
    name?.full_name || [name?.given_name, name?.surname].filter(Boolean).join(" ") || billing?.email_address || "—";
  const amount = inv.amount ? Number(inv.amount.value) : itemsTotal(inv.items ?? []);

  return finishRow({
    id: inv.id,
    number: inv.detail.invoice_number ?? inv.id,
    clientName,
    clientEmail: billing?.email_address ?? "",
    description: inv.items?.map((i) => i.name).join(", ") || inv.detail.note || "",
    amount,
    currency: inv.amount?.currency_code ?? inv.detail.currency_code,
    status: inv.status as InvoiceStatus,
    issuedAt: inv.detail.invoice_date ?? inv.detail.metadata?.create_time?.slice(0, 10) ?? "",
    dueDate: inv.detail.payment_term?.due_date ?? null,
    payLink: inv.detail.metadata?.recipient_view_url ?? null,
  });
}

/* ------------------------------ demo store ------------------------------ */

function daysFromNow(n: number) {
  return new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
}

type DemoInvoice = Omit<InvoiceRow, "amountNgn" | "overdue">;

const g = globalThis as unknown as { __kudiDemo?: DemoInvoice[] };
g.__kudiDemo ??= [
  ["Sarah Mitchell", "sarah@brightleaf.co.uk", "Brand identity — logo + guidelines", 450, "GBP", "PAID", -30, -16],
  ["Daniel Okafor", "dan@okaforlaw.com", "Website redesign (50% deposit)", 600, "USD", "PAID", -24, -10],
  ["Emma Schulz", "emma@schulz.de", "Landing page copy + design", 380, "EUR", "SENT", -20, -6],
  ["James Carter", "james@cartercoffee.com", "3 social media posts", 150, "USD", "SENT", -12, 2],
  ["Sarah Mitchell", "sarah@brightleaf.co.uk", "Monthly retainer — October", 300, "GBP", "SENT", -18, -4],
  ["Priya Nair", "priya@nairstudio.ca", "Pitch deck design", 520, "CAD", "PAID", -15, -1],
  ["Daniel Okafor", "dan@okaforlaw.com", "Website redesign (balance)", 600, "USD", "SENT", -3, 11],
  ["Lena Brooks", "lena@brooksfit.com", "Mobile app UI — 6 screens", 900, "USD", "DRAFT", -1, 14],
].map(([clientName, clientEmail, description, amount, currency, status, issued, due], i) => ({
  id: `DEMO-${1001 + i}`,
  number: `KD-${1001 + i}`,
  clientName: clientName as string,
  clientEmail: clientEmail as string,
  description: description as string,
  amount: amount as number,
  currency: currency as string,
  status: status as InvoiceStatus,
  issuedAt: daysFromNow(issued as number),
  dueDate: daysFromNow(due as number),
  payLink: null,
}));
const demo = g.__kudiDemo;

/* ------------------------------ public API ------------------------------ */

export async function getRows(): Promise<InvoiceRow[]> {
  if (mode() === "demo") return demo.map(finishRow).sort((a, b) => b.issuedAt.localeCompare(a.issuedAt));
  const invoices = await listInvoices();
  return invoices.map(fromPayPal);
}

export async function createInvoice(input: NewInvoiceInput): Promise<{ id: string; payLink: string | null }> {
  if (mode() === "demo") {
    const n = 1001 + demo.length;
    const row: DemoInvoice = {
      id: `DEMO-${n}`,
      number: `KD-${n}`,
      clientName: input.clientName,
      clientEmail: input.clientEmail,
      description: input.items.map((i) => i.name).join(", "),
      amount: itemsTotal(input.items),
      currency: input.currency,
      status: "SENT",
      issuedAt: today(),
      dueDate: input.dueDate ?? daysFromNow(14),
      payLink: null,
    };
    demo.push(row);
    return { id: row.id, payLink: null };
  }
  return createAndSendInvoice(input);
}

export async function sendReminder(id: string, note?: string) {
  if (mode() === "demo") return;
  await remindInvoice(id, note);
}

export async function getRow(id: string): Promise<InvoiceRow | null> {
  if (mode() === "demo") {
    const r = demo.find((d) => d.id === id);
    return r ? finishRow(r) : null;
  }
  return fromPayPal(await getInvoice(id));
}
