/** Currencies KudiDesk invoices in. Kept small so naira conversion always has a rate. */
export const CURRENCIES = ["USD", "GBP", "EUR", "CAD"] as const;
export type Currency = (typeof CURRENCIES)[number];

export const CURRENCY_SYMBOLS: Record<string, Currency> = { $: "USD", "£": "GBP", "€": "EUR" };

export function isCurrency(c: unknown): c is Currency {
  return typeof c === "string" && (CURRENCIES as readonly string[]).includes(c);
}
