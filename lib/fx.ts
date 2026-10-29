const DEFAULT_RATES: Record<string, number> = { USD: 1500, GBP: 2000, EUR: 1700, CAD: 1100, NGN: 1 };

let cached: Record<string, number> | null = null;

/** Approximate NGN per 1 unit of each currency, read from FX_RATES_NGN. */
export function ngnRates(): Record<string, number> {
  if (cached) return cached;
  try {
    cached = { ...DEFAULT_RATES, ...JSON.parse(process.env.FX_RATES_NGN || "{}") };
  } catch {
    cached = DEFAULT_RATES;
  }
  return cached!;
}

export function toNgn(amount: number, currency: string): number | null {
  const rate = ngnRates()[currency.toUpperCase()];
  return rate ? Math.round(amount * rate) : null;
}
