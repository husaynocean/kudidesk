import { z } from "zod";

/**
 * "Ask the grid": a plain-English question becomes a small, validated query,
 * which is then turned into native AG Grid filter + sort state. Shared by the
 * server (AI + offline parser) and the browser (applying it to the grid).
 */

export type ColKind = "text" | "number" | "date";

export const GRID_COLUMNS = {
  number: { kind: "text", about: "invoice number, e.g. KD-1004" },
  clientName: { kind: "text", about: "client's name" },
  clientEmail: { kind: "text", about: "client's email" },
  clientCountry: { kind: "text", about: "client's country (UK, USA, Germany, Canada, Europe, …)" },
  description: { kind: "text", about: "the work being billed" },
  currency: { kind: "text", about: "invoice currency code: USD, GBP, EUR or CAD" },
  amount: { kind: "number", about: "invoice amount in its OWN currency (see currency column)" },
  amountNgn: { kind: "number", about: "approximate value in Nigerian naira (₦)" },
  state: {
    kind: "text",
    about: "one of Paid, Overdue, Awaiting, Draft, Cancelled, Refunded. 'Unpaid' = Overdue OR Awaiting",
  },
  daysOverdue: { kind: "number", about: "days past the due date (only for overdue invoices)" },
  issuedAt: { kind: "date", about: "date the invoice was issued" },
  dueDate: { kind: "date", about: "payment due date" },
  paidAt: { kind: "date", about: "date the client paid" },
} as const satisfies Record<string, { kind: ColKind; about: string }>;

export type GridColId = keyof typeof GRID_COLUMNS;
const COL_IDS = Object.keys(GRID_COLUMNS) as [GridColId, ...GridColId[]];

export const OPS = {
  text: ["equals", "notEqual", "contains", "notContains", "startsWith"],
  number: ["equals", "notEqual", "greaterThan", "greaterThanOrEqual", "lessThan", "lessThanOrEqual", "inRange"],
  date: ["equals", "greaterThan", "lessThan", "inRange"],
} as const;

const Condition = z.object({
  colId: z.enum(COL_IDS),
  op: z.string(),
  value: z.union([z.string(), z.number()]),
  valueTo: z.union([z.string(), z.number()]).nullish(),
});

export const GridQuery = z.object({
  filters: z.array(Condition).max(12).default([]),
  sort: z
    .array(z.object({ colId: z.enum(COL_IDS), dir: z.enum(["asc", "desc"]) }))
    .max(3)
    .default([]),
  explanation: z.string().max(300).default(""),
});
export type GridQuery = z.infer<typeof GridQuery>;
export type GridCondition = z.infer<typeof Condition>;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Drops conditions that don't make sense for their column, so a bad AI answer can't break the grid. */
export function sanitize(q: GridQuery): GridQuery {
  const filters = q.filters.filter((f) => {
    const kind = GRID_COLUMNS[f.colId].kind;
    if (!(OPS[kind] as readonly string[]).includes(f.op)) return false;
    if (kind === "number")
      return Number.isFinite(Number(f.value)) && (f.op !== "inRange" || Number.isFinite(Number(f.valueTo)));
    if (kind === "date")
      return DATE_RE.test(String(f.value)) && (f.op !== "inRange" || DATE_RE.test(String(f.valueTo ?? "")));
    return String(f.value).trim().length > 0;
  });
  return { ...q, filters };
}

/* ------------------------------ → AG Grid ------------------------------ */

type AgCondition = Record<string, unknown>;

function toAgCondition(f: GridCondition): AgCondition {
  const kind = GRID_COLUMNS[f.colId].kind;
  if (kind === "number") {
    return {
      filterType: "number",
      type: f.op,
      filter: Number(f.value),
      filterTo: f.valueTo == null ? null : Number(f.valueTo),
    };
  }
  if (kind === "date") {
    return {
      filterType: "date",
      type: f.op,
      dateFrom: `${f.value} 00:00:00`,
      dateTo: f.valueTo ? `${f.valueTo} 00:00:00` : null,
    };
  }
  return { filterType: "text", type: f.op, filter: String(f.value) };
}

/**
 * Converts a query into AG Grid's own filter model and column state.
 * Several conditions on one column are combined: "equals" text values with OR
 * (Overdue OR Awaiting), everything else with AND (amount > 200 AND < 500).
 */
export function toAgGrid(q: GridQuery) {
  const byCol = new Map<GridColId, GridCondition[]>();
  for (const f of q.filters) byCol.set(f.colId, [...(byCol.get(f.colId) ?? []), f]);

  const filterModel: Record<string, AgCondition> = {};
  for (const [colId, conds] of byCol) {
    if (conds.length === 1) {
      filterModel[colId] = toAgCondition(conds[0]);
    } else {
      const or = conds.every((c) => c.op === "equals" && GRID_COLUMNS[colId].kind === "text");
      filterModel[colId] = {
        filterType: GRID_COLUMNS[colId].kind,
        operator: or ? "OR" : "AND",
        conditions: conds.map(toAgCondition),
      };
    }
  }

  const columnState = q.sort.map((s, i) => ({ colId: s.colId, sort: s.dir, sortIndex: i }));
  return { filterModel, columnState };
}

/** Human-readable chips for the active query, e.g. "state = Overdue", "amount > 200". */
export function describe(q: GridQuery): string[] {
  const sym: Record<string, string> = {
    equals: "=",
    notEqual: "≠",
    contains: "contains",
    notContains: "doesn't contain",
    startsWith: "starts with",
    greaterThan: ">",
    greaterThanOrEqual: "≥",
    lessThan: "<",
    lessThanOrEqual: "≤",
  };
  const label = (c: GridColId) =>
    ({
      clientName: "client",
      clientEmail: "email",
      clientCountry: "country",
      amountNgn: "₦ value",
      daysOverdue: "days overdue",
      issuedAt: "issued",
      dueDate: "due",
      paidAt: "paid",
      description: "work",
    })[c as string] ?? c;
  const chips = q.filters.map((f) =>
    f.op === "inRange"
      ? `${label(f.colId)} ${f.value}–${f.valueTo}`
      : `${label(f.colId)} ${sym[f.op] ?? f.op} ${f.value}`,
  );
  for (const s of q.sort) chips.push(`sort ${label(s.colId)} ${s.dir === "asc" ? "↑" : "↓"}`);
  return chips;
}

/* ------------------------- offline (no-AI) parser ------------------------- */

export interface QueryContext {
  today: string;
  clients: string[];
  countries: string[];
}

const COUNTRY_WORDS: Record<string, string> = {
  uk: "UK",
  british: "UK",
  england: "UK",
  "united kingdom": "UK",
  us: "USA",
  usa: "USA",
  american: "USA",
  "united states": "USA",
  germany: "Germany",
  german: "Germany",
  canada: "Canada",
  canadian: "Canada",
  europe: "Europe",
  european: "Europe",
};

function shiftDays(iso: string, n: number) {
  return new Date(Date.parse(iso + "T00:00:00Z") + n * 86_400_000).toISOString().slice(0, 10);
}

/** Understands the common shapes of a question without AI. Good enough for the demo. */
export function parseWithRules(text: string, ctx: QueryContext): GridQuery {
  const t = ` ${text.toLowerCase()} `;
  const filters: GridCondition[] = [];
  const sort: GridQuery["sort"] = [];

  // Payment state.
  if (/\b(unpaid|outstanding|owed|owing|owes?|not paid|haven't paid|hasn't paid|still due)\b/.test(t)) {
    filters.push(
      { colId: "state", op: "equals", value: "Overdue" },
      { colId: "state", op: "equals", value: "Awaiting" },
    );
  } else if (/\b(overdue|late|past due)\b/.test(t)) {
    filters.push({ colId: "state", op: "equals", value: "Overdue" });
  } else if (/\b(paid|received|settled)\b/.test(t)) {
    filters.push({ colId: "state", op: "equals", value: "Paid" });
  } else if (/\bdrafts?\b/.test(t)) {
    filters.push({ colId: "state", op: "equals", value: "Draft" });
  }

  // Country.
  for (const [word, country] of Object.entries(COUNTRY_WORDS)) {
    if (new RegExp(`\\b${word}\\b`).test(t) && ctx.countries.includes(country)) {
      filters.push({ colId: "clientCountry", op: "equals", value: country });
      break;
    }
  }

  // Client by name.
  for (const name of ctx.clients) {
    const first = name.split(" ")[0].toLowerCase();
    if (t.includes(name.toLowerCase()) || new RegExp(`\\b${first}\\b`).test(t)) {
      filters.push({ colId: "clientName", op: "contains", value: name });
      break;
    }
  }

  // Amounts: "over £200", "under ₦500k", "more than 300 dollars".
  const amountRe =
    /\b(over|above|more than|greater than|at least|under|below|less than|at most)\s+(₦|£|€|\$|c\$)?\s?(\d[\d,]*(?:\.\d+)?)\s*(k|m)?\s*(naira|ngn|pounds?|gbp|euros?|eur|dollars?|usd|cad)?/g;
  for (const m of t.matchAll(amountRe)) {
    const n = Number(m[3].replace(/,/g, "")) * (m[4] === "k" ? 1e3 : m[4] === "m" ? 1e6 : 1);
    const unit = (m[2] ?? "") + (m[5] ?? "");
    const op = /over|above|more|greater/.test(m[1])
      ? "greaterThan"
      : /least/.test(m[1])
        ? "greaterThanOrEqual"
        : /most/.test(m[1])
          ? "lessThanOrEqual"
          : "lessThan";
    const cur = /£|pound|gbp/.test(unit)
      ? "GBP"
      : /€|euro|eur/.test(unit)
        ? "EUR"
        : /c\$|cad/.test(unit)
          ? "CAD"
          : /\$|dollar|usd/.test(unit)
            ? "USD"
            : null;
    if (/₦|naira|ngn/.test(unit) || (!cur && n >= 10_000)) {
      filters.push({ colId: "amountNgn", op, value: n });
    } else {
      filters.push({ colId: "amount", op, value: n });
      if (cur) filters.push({ colId: "currency", op: "equals", value: cur });
    }
  }

  // "overdue by more than a week", "over 10 days overdue"
  const late = t.match(
    /(?:more than|over|at least)\s+(\d+|a|one|two)\s+(day|week)s?\s+(?:overdue|late)|overdue (?:by )?(?:more than|over)\s+(\d+|a|one|two)\s+(day|week)s?/,
  );
  if (late) {
    const word = late[1] ?? late[3];
    const unit = late[2] ?? late[4];
    const n = ({ a: 1, one: 1, two: 2 } as Record<string, number>)[word] ?? Number(word);
    const pos = filters.findIndex((f) => f.colId === "amount" && Number(f.value) === n);
    if (pos >= 0) filters.splice(pos, 1); // "over 10" was days, not money
    filters.push({ colId: "daysOverdue", op: "greaterThan", value: n * (unit === "week" ? 7 : 1) });
  }

  // Time windows.
  const month = ctx.today.slice(0, 7);
  const dateCol = filters.some((f) => f.colId === "state" && f.value === "Paid") ? "paidAt" : "issuedAt";
  if (/\bthis month\b/.test(t))
    filters.push({ colId: dateCol, op: "greaterThan", value: shiftDays(`${month}-01`, -1) });
  else if (/\blast (\d+) days\b/.test(t)) {
    const n = Number(t.match(/\blast (\d+) days\b/)![1]);
    filters.push({ colId: dateCol, op: "greaterThan", value: shiftDays(ctx.today, -n - 1) });
  } else if (/\b(this|past) week\b/.test(t))
    filters.push({ colId: dateCol, op: "greaterThan", value: shiftDays(ctx.today, -8) });

  // Sorting.
  if (/\b(oldest|earliest)\b/.test(t)) sort.push({ colId: "issuedAt", dir: "asc" });
  else if (/\b(newest|latest|most recent)\b/.test(t)) sort.push({ colId: "issuedAt", dir: "desc" });
  if (/\b(biggest|largest|highest|most valuable|top)\b/.test(t)) sort.push({ colId: "amountNgn", dir: "desc" });
  else if (/\b(smallest|lowest|cheapest)\b/.test(t)) sort.push({ colId: "amountNgn", dir: "asc" });
  if (/\bmost overdue|longest overdue\b/.test(t)) sort.push({ colId: "daysOverdue", dir: "desc" });

  return sanitize({
    filters,
    sort,
    explanation:
      filters.length || sort.length
        ? "Matched with the offline parser."
        : "Sorry, I couldn't understand that one without AI.",
  });
}
