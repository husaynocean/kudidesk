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
import { guessCountry } from "./country";
import type { InvoiceRow, InvoiceStatus, NewInvoiceInput, PaymentState } from "./types";

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

type BaseRow = Omit<InvoiceRow, "amountNgn" | "overdue" | "state" | "daysOverdue" | "clientCountry" | "lastRemindedAt">;

/** Reminders sent this server session: invoice id → ISO time. */
const g0 = globalThis as unknown as { __kudiReminders?: Map<string, string> };
const reminders = (g0.__kudiReminders ??= new Map());

function stateOf(status: InvoiceStatus, overdue: boolean): PaymentState {
  if (status === "PAID" || status === "MARKED_AS_PAID") return "Paid";
  if (overdue) return "Overdue";
  if (UNPAID.includes(status)) return "Awaiting";
  if (status === "DRAFT" || status === "SCHEDULED") return "Draft";
  if (status.includes("REFUNDED")) return "Refunded";
  return "Cancelled";
}

function finishRow(r: BaseRow): InvoiceRow {
  const overdue = UNPAID.includes(r.status) && !!r.dueDate && r.dueDate < today();
  return {
    ...r,
    amountNgn: toNgn(r.amount, r.currency),
    overdue,
    state: stateOf(r.status, overdue),
    daysOverdue: overdue ? Math.round((Date.parse(today()) - Date.parse(r.dueDate!)) / 86_400_000) : null,
    clientCountry: guessCountry(r.clientEmail, r.currency),
    lastRemindedAt: reminders.get(r.id) ?? null,
  };
}

function itemsTotal(items: { quantity: string | number; unit_amount?: { value: string }; unitAmount?: number }[]) {
  return items.reduce((sum, i) => sum + Number(i.quantity) * Number(i.unit_amount?.value ?? i.unitAmount ?? 0), 0);
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
    paidAt:
      inv.status === "PAID" || inv.status === "MARKED_AS_PAID"
        ? (inv.payments?.transactions?.at(-1)?.payment_date ?? inv.detail.metadata?.last_update_time ?? "").slice(
            0,
            10,
          ) || null
        : null,
  });
}

/* ------------------------------ demo store ------------------------------ */

function daysFromNow(n: number) {
  return new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
}

type DemoInvoice = BaseRow;

// [client, email, work, amount, currency, status, issued (days from now), due, paid]
const SEED: [string, string, string, number, string, InvoiceStatus, number, number, number | null][] = [
  [
    "Sarah Mitchell",
    "sarah@brightleaf.co.uk",
    "Brand identity — logo + guidelines",
    450,
    "GBP",
    "PAID",
    -150,
    -136,
    -138,
  ],
  ["Daniel Okafor", "dan@okaforlaw.com", "Law firm website — discovery", 400, "USD", "PAID", -140, -126, -125],
  ["Emma Schulz", "emma@schulz.de", "Product launch emails (x4)", 260, "EUR", "PAID", -118, -104, -101],
  ["Sarah Mitchell", "sarah@brightleaf.co.uk", "Monthly retainer — July", 300, "GBP", "PAID", -110, -96, -97],
  ["James Carter", "james@cartercoffee.com", "Menu + packaging design", 700, "USD", "PAID", -95, -81, -84],
  ["Sarah Mitchell", "sarah@brightleaf.co.uk", "Monthly retainer — August", 300, "GBP", "PAID", -80, -66, -68],
  ["Priya Nair", "priya@nairstudio.ca", "Portfolio site build", 1200, "CAD", "PAID", -72, -58, -55],
  ["Tom Becker", "tom@beckerbikes.de", "Shopify theme tweaks", 340, "EUR", "PAID", -60, -46, -50],
  ["Sarah Mitchell", "sarah@brightleaf.co.uk", "Monthly retainer — September", 300, "GBP", "PAID", -50, -36, -37],
  ["Sarah Mitchell", "sarah@brightleaf.co.uk", "Brand guidelines refresh", 350, "GBP", "PAID", -30, -16, -16],
  ["Daniel Okafor", "dan@okaforlaw.com", "Website redesign (50% deposit)", 600, "USD", "PAID", -24, -10, -11],
  ["Emma Schulz", "emma@schulz.de", "Landing page copy + design", 380, "EUR", "SENT", -20, -6, null],
  ["Oliver Grant", "oliver@grantandco.co.uk", "Annual report layout", 820, "GBP", "SENT", -45, -31, null],
  ["James Carter", "james@cartercoffee.com", "3 social media posts", 150, "USD", "SENT", -12, 2, null],
  ["Sarah Mitchell", "sarah@brightleaf.co.uk", "Monthly retainer — October", 300, "GBP", "SENT", -18, -4, null],
  ["Priya Nair", "priya@nairstudio.ca", "Pitch deck design", 520, "CAD", "PAID", -15, -1, -3],
  ["Daniel Okafor", "dan@okaforlaw.com", "Website redesign (balance)", 600, "USD", "SENT", -3, 11, null],
  ["Lena Brooks", "lena@brooksfit.com", "Mobile app UI — 6 screens", 900, "USD", "DRAFT", -1, 14, null],
];

const g = globalThis as unknown as { __kudiDemo?: DemoInvoice[] };
g.__kudiDemo ??= SEED.map(([clientName, clientEmail, description, amount, currency, status, issued, due, paid], i) => ({
  id: `DEMO-${1001 + i}`,
  number: `KD-${1001 + i}`,
  clientName,
  clientEmail,
  description,
  amount,
  currency,
  status,
  issuedAt: daysFromNow(issued),
  dueDate: daysFromNow(due),
  paidAt: paid == null ? null : daysFromNow(paid),
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
      paidAt: null,
      payLink: null,
    };
    demo.push(row);
    return { id: row.id, payLink: null };
  }
  return createAndSendInvoice(input);
}

export async function sendReminder(id: string, note?: string, subject?: string) {
  if (mode() === "paypal") await remindInvoice(id, note, subject);
  else if (!demo.some((d) => d.id === id)) throw new Error(`No demo invoice ${id}`);
  reminders.set(id, new Date().toISOString());
}

/** Demo only: mark an invoice paid, as if the client paid through PayPal. */
export function markDemoPaid(id: string): boolean {
  const inv = demo.find((d) => d.id === id);
  if (!inv || mode() !== "demo") return false;
  inv.status = "PAID";
  inv.paidAt = today();
  return true;
}

export async function getRow(id: string): Promise<InvoiceRow | null> {
  if (mode() === "demo") {
    const r = demo.find((d) => d.id === id);
    return r ? finishRow(r) : null;
  }
  return fromPayPal(await getInvoice(id));
}
