import "server-only";
import { geminiJson, hasGemini } from "../gemini";
import { GRID_COLUMNS, GridQuery, OPS, parseWithRules, sanitize, type QueryContext } from "../gridQuery";

const SYSTEM = `You turn a freelancer's plain-English question about their invoices into a filter + sort for a data grid.

Columns (colId: kind — meaning):
${Object.entries(GRID_COLUMNS)
  .map(([id, c]) => `- ${id}: ${c.kind} — ${c.about}`)
  .join("\n")}

Operators by kind:
- text: ${OPS.text.join(", ")}
- number: ${OPS.number.join(", ")} (inRange needs value and valueTo)
- date: ${OPS.date.join(", ")} (values are "YYYY-MM-DD"; inRange needs value and valueTo)

Return ONLY JSON:
{
  "filters": [{ "colId": string, "op": string, "value": string | number, "valueTo"?: string | number }],
  "sort": [{ "colId": string, "dir": "asc" | "desc" }],
  "explanation": string   // one short sentence describing what the grid now shows
}

Rules:
- Several "equals" filters on the same text column are OR-ed; anything else on the same column is AND-ed.
- "Unpaid" / "outstanding" / "owed" means TWO filters: state equals "Overdue" and state equals "Awaiting".
- An amount with a currency symbol (£200, $1k, €50) filters "amount" AND adds currency equals that code. A naira amount (₦, "naira", "k naira") uses amountNgn.
- Amounts with no currency: use amountNgn if it's 10,000 or more, otherwise amount.
- Country names must match the provided list exactly (e.g. "UK", not "United Kingdom").
- Client names must be matched with "contains" using a name from the provided list.
- "Oldest first" sorts issuedAt asc; "biggest" sorts amountNgn desc; "most overdue" sorts daysOverdue desc.
- Relative dates ("this month", "last 30 days", "since September") resolve against TODAY. For paid invoices use paidAt, otherwise issuedAt.
- If the question can't be answered with these columns, return empty filters and say why in the explanation.`;

export async function askGrid(question: string, ctx: QueryContext): Promise<{ query: GridQuery; source: "gemini" | "rules" }> {
  if (!hasGemini()) return { query: parseWithRules(question, ctx), source: "rules" };

  const prompt = `TODAY: ${ctx.today}
Known clients: ${ctx.clients.join(", ") || "none"}
Known countries: ${ctx.countries.join(", ") || "none"}

QUESTION: ${question}`;
  const raw = await geminiJson(SYSTEM, prompt, 0);
  const parsed = GridQuery.safeParse(raw);
  if (!parsed.success) return { query: parseWithRules(question, ctx), source: "rules" };
  return { query: sanitize(parsed.data), source: "gemini" };
}
