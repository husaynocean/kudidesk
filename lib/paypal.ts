import "server-only";
import type { NewInvoiceInput } from "./types";

/**
 * Minimal PayPal REST client for the sandbox.
 * Docs: https://developer.paypal.com/docs/api/invoicing/v2/
 */

const BASE = process.env.PAYPAL_API_BASE || "https://api-m.sandbox.paypal.com";

let token: { value: string; expiresAt: number } | null = null;

export class PayPalError extends Error {
  constructor(
    message: string,
    public status: number,
    public issue?: string,
    public debugId?: string,
  ) {
    super(message);
  }
}

export function hasPayPalCredentials() {
  return Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET);
}

async function getAccessToken(): Promise<string> {
  if (token && Date.now() < token.expiresAt) return token.value;

  const auth = Buffer.from(
    `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`,
  ).toString("base64");

  const res = await fetch(`${BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });
  if (!res.ok) {
    throw new PayPalError("Could not get a PayPal access token — check your sandbox Client ID and Secret.", res.status);
  }
  const data = (await res.json()) as { access_token: string; expires_in: number };
  // Refresh a minute early.
  token = { value: data.access_token, expiresAt: Date.now() + (data.expires_in - 60) * 1000 };
  return token.value;
}

export async function paypal<T = unknown>(
  path: string,
  init: { method?: string; body?: unknown; headers?: Record<string, string> } = {},
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: init.method || "GET",
    headers: {
      Authorization: `Bearer ${await getAccessToken()}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: "no-store",
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) {
    // PayPal error envelope: { name, message, details: [{ issue, description }], debug_id }
    const issue = data?.details?.[0]?.issue;
    const description = data?.details?.[0]?.description || data?.message || res.statusText;
    console.error("[paypal]", res.status, path, issue, data?.debug_id);
    throw new PayPalError(description, res.status, issue, data?.debug_id);
  }
  return data as T;
}

/* ----------------------------- Invoicing ----------------------------- */

export interface PayPalInvoice {
  id: string;
  status: string;
  detail: {
    invoice_number?: string;
    invoice_date?: string;
    currency_code: string;
    note?: string;
    payment_term?: { due_date?: string };
    metadata?: { recipient_view_url?: string; create_time?: string };
  };
  primary_recipients?: {
    billing_info?: { email_address?: string; name?: { given_name?: string; surname?: string; full_name?: string } };
  }[];
  items?: { name: string; quantity: string; unit_amount: { value: string } }[];
  amount?: { currency_code: string; value: string };
  due_amount?: { currency_code: string; value: string };
  links?: { href: string; rel: string }[];
}

export async function listInvoices(): Promise<PayPalInvoice[]> {
  const data = await paypal<{ items?: PayPalInvoice[] }>(
    "/v2/invoicing/invoices?page=1&page_size=100&total_required=true",
  );
  return data.items ?? [];
}

export async function getInvoice(id: string) {
  return paypal<PayPalInvoice>(`/v2/invoicing/invoices/${encodeURIComponent(id)}`);
}

/** Creates a draft invoice, then sends it to the client. Returns the sent invoice. */
export async function createAndSendInvoice(input: NewInvoiceInput) {
  const [given, ...rest] = input.clientName.trim().split(/\s+/);

  const draft = await paypal<PayPalInvoice>("/v2/invoicing/invoices", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: {
      detail: {
        currency_code: input.currency,
        note: input.note || undefined,
        payment_term: input.dueDate ? { due_date: input.dueDate } : undefined,
      },
      primary_recipients: [
        {
          billing_info: {
            name: { given_name: given, surname: rest.join(" ") || undefined },
            email_address: input.clientEmail,
          },
        },
      ],
      items: input.items.map((i) => ({
        name: i.name,
        quantity: String(i.quantity),
        unit_amount: { currency_code: input.currency, value: i.unitAmount.toFixed(2) },
      })),
    },
  });

  const sent = await paypal<{ links?: { href: string; rel: string }[] }>(
    `/v2/invoicing/invoices/${draft.id}/send`,
    { method: "POST", body: { send_to_recipient: true, send_to_invoicer: false } },
  );

  const payLink = sent.links?.find((l) => l.rel === "payer-view")?.href ?? null;
  return { id: draft.id, payLink };
}

/** Sends PayPal's reminder email for an unpaid invoice, with an optional custom note. */
export async function remindInvoice(id: string, note?: string, subject?: string) {
  await paypal(`/v2/invoicing/invoices/${encodeURIComponent(id)}/remind`, {
    method: "POST",
    body: { subject, note, send_to_invoicer: false, send_to_recipient: true },
  });
}

/** Cheap call used by /api/health to confirm the credentials work. */
export async function checkCredentials() {
  await getAccessToken();
  return true;
}
