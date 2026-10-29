import { NextResponse } from "next/server";
import { mode } from "@/lib/invoices";
import { verifyWebhook } from "@/lib/paypal";
import { handleInvoiceEvent, type PayPalWebhookEvent } from "@/lib/webhooks";

export const dynamic = "force-dynamic";

/**
 * POST /api/webhooks/paypal — PayPal calls this when an invoice changes.
 * Subscribe to INVOICING.INVOICE.* events in your sandbox app, pointing at
 * https://<your-app>.onrender.com/api/webhooks/paypal, and set PAYPAL_WEBHOOK_ID.
 */
export async function POST(req: Request) {
  let event: PayPalWebhookEvent;
  try {
    event = JSON.parse(await req.text());
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (mode() === "paypal") {
    const webhookId = process.env.PAYPAL_WEBHOOK_ID;
    if (webhookId) {
      const ok = await verifyWebhook(req.headers, event, webhookId).catch((err) => {
        console.error("[webhook] verification call failed", err);
        return false;
      });
      if (!ok) return NextResponse.json({ error: "Signature verification failed" }, { status: 401 });
    } else {
      // Still safe: handleInvoiceEvent re-reads the invoice from PayPal and never trusts the payload.
      console.warn("[webhook] PAYPAL_WEBHOOK_ID not set — skipping signature check");
    }
  }

  try {
    const result = await handleInvoiceEvent(event);
    console.log("[webhook]", event.event_type, result);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[webhook] handling failed", err);
    // A 500 makes PayPal retry later, which is what we want.
    return NextResponse.json({ error: "Handling failed" }, { status: 500 });
  }
}
