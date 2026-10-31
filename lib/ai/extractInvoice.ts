import "server-only";
import { z } from "zod";
import { CURRENCIES, CURRENCY_SYMBOLS, isCurrency } from "../currencies";
import { GeminiError, geminiJson, hasGemini } from "../gemini";

/** What the AI hands back to pre-fill the New invoice form. Everything is a suggestion the user reviews. */
export const InvoiceDraft = z.object({
  clientName: z.string().trim().nullable().catch(null),
  clientEmail: z.string().trim().email().nullable().catch(null),
  currency: z.enum(CURRENCIES).nullable().catch(null),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .catch(null),
  note: z.string().trim().max(1000).nullable().catch(null),
  items: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(200),
        quantity: z.coerce.number().positive().catch(1),
        unitAmount: z.coerce.number().nonnegative().catch(0),
      }),
    )
    .catch([]),
  warnings: z.array(z.string()).catch([]),
});
export type InvoiceDraft = z.infer<typeof InvoiceDraft>;

const SYSTEM = `You are KudiDesk's invoicing assistant for an African freelancer who bills foreign clients through PayPal.
You read a chat or email thread between the freelancer and a client and extract the invoice the freelancer should send.

Return ONLY a JSON object with exactly these keys:
{
  "clientName": string | null,        // the CLIENT's name (the person paying), not the freelancer
  "clientEmail": string | null,       // the client's email if it appears anywhere
  "currency": ${CURRENCIES.map((c) => `"${c}"`).join(" | ")} | null,
  "dueDate": "YYYY-MM-DD" | null,     // resolve relative dates ("by Friday", "in 2 weeks") against TODAY
  "note": string | null,              // one short, friendly line for the invoice, e.g. project name or PO number
  "items": [{ "name": string, "quantity": number, "unitAmount": number }],
  "warnings": string[]                // anything ambiguous the freelancer should double-check, in plain English
}

Rules:
- Only bill for work that was agreed. If a price was negotiated, use the FINAL agreed price.
- unitAmount is the price for ONE unit, in the invoice currency, as a plain number (no symbols).
- If a deposit was already paid, bill the remaining balance and add a warning saying so.
- If the currency isn't stated, infer it from symbols (£ GBP, € EUR, $ USD, C$ CAD) or the client's country, and add a warning.
- Never invent an email address. Use null if one isn't in the text.
- Keep item names short and professional (e.g. "Logo design — 3 concepts").`;

export async function extractInvoice(
  chat: string,
  today: string,
): Promise<{ draft: InvoiceDraft; source: "gemini" | "rules"; aiError?: string }> {
  if (!hasGemini()) return { draft: extractWithRules(chat, today), source: "rules" };
  try {
    const raw = await geminiJson(SYSTEM, `TODAY is ${today} (${weekday(today)}).\n\nCHAT:\n"""\n${chat}\n"""`);
    return { draft: InvoiceDraft.parse(raw), source: "gemini" };
  } catch (err) {
    // Keep working when Gemini is down: fall back to the offline parser and say why.
    if (!(err instanceof GeminiError)) throw err;
    return { draft: extractWithRules(chat, today), source: "rules", aiError: err.message };
  }
}

function weekday(iso: string) {
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", { weekday: "long", timeZone: "UTC" });
}

/* --------------------------------------------------------------------------
 * Rules-based fallback used when GEMINI_API_KEY isn't set, so the demo
 * still works. It handles the common shapes of a client chat, nothing more.
 * ------------------------------------------------------------------------ */

const DAY = 86_400_000;
const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

function addDays(iso: string, n: number) {
  return new Date(Date.parse(iso + "T00:00:00Z") + n * DAY).toISOString().slice(0, 10);
}

export function extractWithRules(chat: string, today: string): InvoiceDraft {
  const warnings = ["Drafted without AI (offline parser) — please check every field."];
  const email = chat.match(/[\w.+-]+@[\w-]+(\.[\w-]+)+/)?.[0] ?? null;

  // Currency: explicit code first, then symbol.
  let currency = (chat.toUpperCase().match(/\b(USD|GBP|EUR|CAD)\b/)?.[1] as InvoiceDraft["currency"]) ?? null;
  if (!currency) {
    if (/C\$/.test(chat)) currency = "CAD";
    else {
      const sym = chat.match(/[£€$]/)?.[0];
      currency = sym ? CURRENCY_SYMBOLS[sym] : null;
    }
  }
  if (!isCurrency(currency)) currency = null;

  // Items: each price is attached to the words just before it ("logo (£450)") or after it ("£300 for the guidelines").
  // A later price for the same thing replaces the earlier one; a bare price ("ok, £300 works") updates the last item.
  const byName = new Map<string, InvoiceDraft["items"][number]>();
  let last: string | null = null;
  const amountRe = /(?:C\$|[£€$]|\b(?:USD|GBP|EUR|CAD)\s?)\s?(\d[\d,]*(?:\.\d+)?)\s*(k\b)?/gi;
  for (const rawLine of chat.split(/\n+/)) {
    const line = rawLine.replace(/^\s*\[[^\]]*\]\s*/, "").replace(/^[^:]{1,30}:\s*/, "");
    let prevEnd = 0;
    for (const m of line.matchAll(amountRe)) {
      const amount = Number(m[1].replace(/,/g, "")) * (m[2] ? 1000 : 1);
      if (!(amount > 0)) continue;
      const after = line.slice(m.index! + m[0].length).match(/^\s*for (?:the |a |an )?([a-z][\w -]{2,40})/i)?.[1];
      const before =
        line
          .slice(prevEnd, m.index)
          .split(/[.,!?;:()]/)
          .filter((x) => x.trim())
          .pop() ?? "";
      prevEnd = m.index! + m[0].length;
      const name = cleanItemName(after ?? before);
      const key: string | null = name?.toLowerCase() ?? last;
      if (!key) continue;
      byName.set(key, {
        name: capitalise(name ?? byName.get(key)?.name ?? "Freelance work"),
        quantity: 1,
        unitAmount: amount,
      });
      last = key;
    }
  }
  const items = [...byName.values()];
  if (items.length > 1) warnings.push("Several prices were mentioned — remove any that aren't final.");

  // Due date.
  let dueDate: string | null = null;
  const lower = chat.toLowerCase();
  const inN = lower.match(/(?:in|within)\s+(\d+|a|one|two|three)\s+(day|week)s?/);
  if (inN) {
    const n = { a: 1, one: 1, two: 2, three: 3 }[inN[1]] ?? Number(inN[1]);
    dueDate = addDays(today, n * (inN[2] === "week" ? 7 : 1));
  } else {
    const wd = WEEKDAYS.findIndex((d) => new RegExp(`\\b(by|on|before|this|next)\\s+${d}`).test(lower));
    if (wd >= 0) {
      const cur = new Date(today + "T00:00:00Z").getUTCDay();
      dueDate = addDays(today, (wd - cur + 7) % 7 || 7);
    } else if (/end of (the )?month/.test(lower)) {
      const d = new Date(today + "T00:00:00Z");
      dueDate = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
    }
  }

  // Client name: "Name:" speaker labels that aren't "me"/"you", or a sign-off.
  const speakers = [...chat.matchAll(/^\s*(?:\[[^\]]*\]\s*)?([A-Z][a-z]+(?: [A-Z][a-z]+)?):/gm)]
    .map((m) => m[1])
    .filter((n) => !/^(Me|You|Re|Subject|From|To)$/.test(n));
  const signOff = chat.match(/(?:thanks|cheers|regards|best),?\s*\n\s*([A-Z][a-z]+(?: [A-Z][a-z]+)?)/i)?.[1];
  const clientName = signOff ?? speakers[0] ?? (email ? capitalise(email.split("@")[0].split(/[._]/)[0]) : null);

  if (!email) warnings.push("No client email found — add it before sending.");
  if (!currency) warnings.push("Couldn't tell the currency.");

  return InvoiceDraft.parse({ clientName, clientEmail: email, currency, dueDate, note: null, items, warnings });
}

const FILLER =
  /\b(okay|ok|sure|yes|great|perfect|could|would|you|we|i|me|do|be|is|it|that|this|works|work|on top of|the|a|an|for|to|of|and|just|so|total|price|cost|costs|about|around|only|then|will|can|pay|paid|charge|budget)\b/gi;

/** "Guidelines would be" → "Guidelines"; "Okay," → null. */
function cleanItemName(text: string): string | null {
  const words = text
    .replace(/[^\w\s-]/g, " ")
    .replace(FILLER, " ")
    .replace(/\s+/g, " ")
    .trim();
  return words.length >= 3 ? words.split(" ").slice(-5).join(" ") : null;
}

function capitalise(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
