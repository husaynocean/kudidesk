import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/api";
import { getRows, mode } from "@/lib/invoices";
import { handleInvoiceEvent } from "@/lib/webhooks";

const Body = z.object({ id: z.string().max(64).optional() });

/**
 * POST /api/demo/simulate-payment — demo mode only. Sends a fake
 * INVOICING.INVOICE.PAID webhook through the real webhook handler, so judges
 * can watch a row turn green without a PayPal account.
 */
export async function POST(req: Request) {
  if (mode() !== "demo") return NextResponse.json({ error: "Only available in demo mode" }, { status: 404 });
  try {
    const { id } = Body.parse(await req.json().catch(() => ({})));
    const unpaid = (await getRows()).filter((r) => r.state === "Overdue" || r.state === "Awaiting");
    const target =
      (id && unpaid.find((r) => r.id === id)) || unpaid.sort((a, b) => a.issuedAt.localeCompare(b.issuedAt))[0];
    if (!target) return NextResponse.json({ error: "Every invoice is already paid 🎉" }, { status: 400 });
    const result = await handleInvoiceEvent({
      id: `WH-DEMO-${Date.now()}`,
      event_type: "INVOICING.INVOICE.PAID",
      resource: { invoice: { id: target.id } },
    });
    return NextResponse.json(result);
  } catch (err) {
    return errorResponse(err);
  }
}
