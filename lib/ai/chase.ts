import "server-only";
import { z } from "zod";
import { money } from "../format";
import { GeminiError, geminiJson, hasGemini } from "../gemini";
import type { InvoiceRow } from "../types";

/**
 * The "Chase overdue" agent: for each selected invoice it looks at how late it is
 * and how this client has paid before, picks a tone, and writes a short reminder
 * that PayPal sends with its own invoice reminder email. Nothing is sent until
 * the freelancer reviews the drafts.
 */

export const TONES = ["heads-up", "gentle", "firm", "final"] as const;
export type Tone = (typeof TONES)[number];

export const ReminderDraft = z.object({
  id: z.string(),
  tone: z.enum(TONES).catch("gentle"),
  subject: z.string().trim().min(1).max(120),
  note: z.string().trim().min(1).max(1200),
  why: z.string().trim().max(240).catch(""),
});
export type ReminderDraft = z.infer<typeof ReminderDraft>;

interface InvoiceContext {
  id: string;
  invoice: string;
  client: string;
  work: string;
  amount: string;
  dueDate: string | null;
  daysOverdue: number;
  hasPayLink: boolean;
  remindedBefore: boolean;
  history: { paidBefore: number; paidLate: number; otherUnpaid: number };
}

function contextFor(row: InvoiceRow, all: InvoiceRow[]): InvoiceContext {
  const others = all.filter((r) => r.clientEmail === row.clientEmail && r.id !== row.id);
  const paid = others.filter((r) => r.state === "Paid");
  return {
    id: row.id,
    invoice: row.number,
    client: row.clientName,
    work: row.description,
    amount: money(row.amount, row.currency),
    dueDate: row.dueDate,
    daysOverdue: row.daysOverdue ?? 0,
    hasPayLink: !!row.payLink,
    remindedBefore: !!row.lastRemindedAt,
    history: {
      paidBefore: paid.length,
      paidLate: paid.filter((r) => r.paidAt && r.dueDate && r.paidAt > r.dueDate).length,
      otherUnpaid: others.filter((r) => r.state === "Overdue" || r.state === "Awaiting").length,
    },
  };
}

export function pickTone(c: InvoiceContext): Tone {
  if (c.daysOverdue <= 0) return "heads-up";
  if (c.daysOverdue <= 7 && !c.remindedBefore) return "gentle";
  if (c.daysOverdue <= 21) return "firm";
  return "final";
}

const SYSTEM = `You are KudiDesk's collections assistant. You write payment reminders on behalf of an African freelancer
to their foreign clients. PayPal will email the reminder with the invoice and a "Pay now" button attached,
so the note must NOT include links, bank details, or the invoice total table.

For each invoice, write:
- "subject": max 80 characters, specific (mention the invoice number or the work).
- "note": 2–4 short sentences, plain text, no greeting line like "Dear Sir". Start with the client's first name.
  Mention the work and amount. End with the freelancer's sign-off name if one is given, otherwise no name.
- "tone": one of heads-up | gentle | firm | final — use the suggestedTone unless the history clearly says otherwise.
- "why": one short sentence telling the freelancer why you chose this tone.

Tone guide:
- heads-up: not due yet / just due — friendly, no pressure.
- gentle: a few days late — assume it slipped through, warm.
- firm: 1–3 weeks late or already reminded — polite but clear, ask for a payment date.
- final: over 3 weeks late — still courteous, state that work/next deliverables are paused until payment and offer to split it.
Adjust for history: a long-standing client who always pays should get warmer wording; a client who often pays late or
has other unpaid invoices can be firmer (mention the other open invoices).
Never threaten, never guilt-trip, never use ALL CAPS, never invent facts not in the data.

Return ONLY JSON: { "drafts": [{ "id", "tone", "subject", "note", "why" }] } with one entry per invoice, same ids.`;

export async function draftReminders(
  rows: InvoiceRow[],
  all: InvoiceRow[],
  senderName: string,
): Promise<{ drafts: ReminderDraft[]; source: "gemini" | "templates"; aiError?: string }> {
  const contexts = rows.map((r) => ({ ...contextFor(r, all), suggestedTone: pickTone(contextFor(r, all)) }));

  const templates = () => contexts.map((c) => templateDraft(c, c.suggestedTone, senderName));
  if (!hasGemini()) return { drafts: templates(), source: "templates" };

  let raw: unknown;
  try {
    raw = await geminiJson(
      SYSTEM,
      `Freelancer sign-off name: ${senderName || "(none)"}\n\nINVOICES:\n${JSON.stringify(contexts, null, 2)}`,
      0.6,
    );
  } catch (err) {
    // Gemini down or misconfigured: still give the freelancer drafts to review, and say why.
    if (!(err instanceof GeminiError)) throw err;
    return { drafts: templates(), source: "templates", aiError: err.message };
  }

  const parsed = z.object({ drafts: z.array(z.unknown()) }).safeParse(raw);
  const drafts = (parsed.success ? parsed.data.drafts : [])
    .map((d) => ReminderDraft.safeParse(d))
    .flatMap((d) => (d.success ? [d.data] : []));
  // Any invoice the model skipped or mangled gets a template, so every selected row has a draft.
  const byId = new Map(drafts.filter((d) => rows.some((r) => r.id === d.id)).map((d) => [d.id, d]));
  return {
    drafts: contexts.map((c) => byId.get(c.id) ?? templateDraft(c, c.suggestedTone, senderName)),
    source: "gemini",
  };
}

/* ------------------------- template fallback ------------------------- */

function templateDraft(c: InvoiceContext, tone: Tone, sender: string): ReminderDraft {
  const first = c.client.split(" ")[0];
  const sign = sender ? `\n\n${sender}` : "";
  const late = c.daysOverdue === 1 ? "1 day" : `${c.daysOverdue} days`;
  const thanks = c.history.paidBefore > 0 ? " Thanks as always for working with me." : "";
  const open =
    c.history.otherUnpaid > 0
      ? ` There ${c.history.otherUnpaid === 1 ? "is also 1 other open invoice" : `are also ${c.history.otherUnpaid} other open invoices`} on your account.`
      : "";

  const byTone: Record<Tone, { subject: string; note: string; why: string }> = {
    "heads-up": {
      subject: `Quick heads-up: invoice ${c.invoice}`,
      note: `Hi ${first}, just a friendly heads-up that invoice ${c.invoice} for ${c.work} (${c.amount}) is due${c.dueDate ? ` on ${c.dueDate}` : " soon"}. You can pay securely through PayPal using the button in this email.${thanks}`,
      why: "Not overdue yet, so a light-touch heads-up.",
    },
    gentle: {
      subject: `Friendly reminder: ${c.work}`,
      note: `Hi ${first}, I hope you're well! Invoice ${c.invoice} for ${c.work} (${c.amount}) is now ${late} past due — I know these things slip through. Could you take a look when you get a moment?${thanks}`,
      why: `Only ${late} late and not reminded yet — assume it slipped through.`,
    },
    firm: {
      subject: `Invoice ${c.invoice} is ${late} overdue`,
      note: `Hi ${first}, following up on invoice ${c.invoice} for ${c.work} (${c.amount}), which is now ${late} overdue.${open} Could you let me know when I can expect payment? Happy to help if anything is holding it up.`,
      why: c.remindedBefore
        ? "Already reminded once, so asking for a payment date."
        : `${late} late — polite but asking for a date.`,
    },
    final: {
      subject: `Overdue: invoice ${c.invoice} (${c.amount})`,
      note: `Hi ${first}, invoice ${c.invoice} for ${c.work} (${c.amount}) is now ${late} overdue.${open} I'll need to pause further work until it's settled. If paying in full is difficult right now, I'm happy to split it into two payments — just reply and let me know.`,
      why: `Over three weeks late — clear about next steps, with a way to pay in parts.`,
    },
  };
  const t = byTone[tone];
  return { id: c.id, tone, subject: t.subject, note: t.note + sign, why: t.why };
}
