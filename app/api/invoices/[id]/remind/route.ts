import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/api";
import { sendReminder } from "@/lib/invoices";

const Body = z.object({ note: z.string().max(4000).optional() });

/** POST /api/invoices/:id/remind — send PayPal's reminder email (with an optional custom note). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { note } = Body.parse(await req.json().catch(() => ({})));
    await sendReminder(id, note);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
