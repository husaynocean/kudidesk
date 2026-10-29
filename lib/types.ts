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
}

export interface NewInvoiceInput {
  clientName: string;
  clientEmail: string;
  currency: string;
  dueDate?: string;
  note?: string;
  items: { name: string; quantity: number; unitAmount: number }[];
}
