/** Best guess at where a client is, from their email domain, then their currency. */

const TLD: Record<string, string> = {
  uk: "UK",
  de: "Germany",
  fr: "France",
  nl: "Netherlands",
  ie: "Ireland",
  es: "Spain",
  it: "Italy",
  ca: "Canada",
  au: "Australia",
  us: "USA",
  ng: "Nigeria",
  gh: "Ghana",
  ke: "Kenya",
  za: "South Africa",
};

const BY_CURRENCY: Record<string, string> = { GBP: "UK", CAD: "Canada", EUR: "Europe", USD: "USA", NGN: "Nigeria" };

export function guessCountry(email: string, currency: string): string {
  const tld = email.toLowerCase().split(".").pop() ?? "";
  return TLD[tld] ?? BY_CURRENCY[currency.toUpperCase()] ?? "Other";
}
