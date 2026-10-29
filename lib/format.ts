export function money(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

export function naira(amount: number | null) {
  if (amount == null) return "—";
  return "₦" + new Intl.NumberFormat("en-NG", { maximumFractionDigits: 0 }).format(amount);
}

export function shortDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
