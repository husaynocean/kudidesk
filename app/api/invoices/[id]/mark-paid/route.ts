import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/api";
import { markPaid } from "@/lib/invoices";
import { handleInvoiceEvent } from "@/lib/webhooks";

const Body = z.object({ method: z.enum(["BANK_TRANSFER", "CASH", "OTHER"]).optional() });

/**
 * POST /api/invoices/:id/mark-paid — the client paid outside PayPal checkout (bank transfer, Paga, cash).
 * Records the payment on the PayPal invoice, then pushes it through the same event feed as a webhook
 * so the row turns green straight away.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { method } = Body.parse(await req.json().catch(() => ({})));
    await markPaid(id, method);
    await handleInvoiceEvent({
      id: `MARK-${id}-${Date.now()}`,
      event_type: "INVOICING.INVOICE.PAID",
      resource: { invoice: { id } },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
