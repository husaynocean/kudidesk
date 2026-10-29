export type InvoiceStatus =
  | "DRAFT"
  | "SENT"
  | "SCHEDULED"
  | "PAID"
  | "MARKED_AS_PAID"
  | "CANCELLED"
  | "REFUNDED"
  | "PARTIALLY_PAID"
  | "PARTIALLY_REFUNDED"
  | "MARKED_AS_REFUNDED"
  | "UNPAID"
  | "PAYMENT_PENDING";

/** A simpler status the grid, AI and charts work with. */
export type PaymentState = "Paid" | "Overdue" | "Awaiting" | "Draft" | "Cancelled" | "Refunded";

/** One row in the KudiDesk grid — a flattened view of a PayPal invoice. */
export interface InvoiceRow {
  id: string;
  number: string;
  clientName: string;
  clientEmail: string;
  description: string;
  amount: number;
  currency: string;
  /** Approximate naira value, using FX_RATES_NGN. */
  amountNgn: number | null;
  status: InvoiceStatus;
  issuedAt: string; // YYYY-MM-DD
  dueDate: string | null; // YYYY-MM-DD
  /** True when unpaid and past the due date. */
  overdue: boolean;
  /** Link the client opens to pay. */
  payLink: string | null;
  /** Derived fields — handy for filtering, AI queries and charts. */
  state: PaymentState;
  /** Days past the due date (unpaid invoices only), otherwise null. */
  daysOverdue: number | null;
  /** Best guess from the email domain / currency. */
  clientCountry: string;
  /** When the client paid (YYYY-MM-DD), if known. */
  paidAt: string | null;
  /** Last time KudiDesk sent a reminder for this invoice (ISO timestamp), this server session. */
  lastRemindedAt: string | null;
}

export interface NewInvoiceInput {
  clientName: string;
  clientEmail: string;
  currency: string;
  dueDate?: string;
  note?: string;
  items: { name: string; quantity: number; unitAmount: number }[];
}
