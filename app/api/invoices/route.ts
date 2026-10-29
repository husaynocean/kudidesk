import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/api";
import { hasGemini } from "@/lib/gemini";
import { createInvoice, getRows, mode } from "@/lib/invoices";

export const dynamic = "force-dynamic";

/** GET /api/invoices — every invoice as a grid row. */
export async function GET() {
  try {
    return NextResponse.json({ mode: mode(), ai: hasGemini() ? "gemini" : "offline", rows: await getRows() });
  } catch (err) {
    return errorResponse(err);
  }
}

const NewInvoice = z.object({
  clientName: z.string().trim().min(1),
  clientEmail: z.string().trim().email(),
  currency: z.string().length(3).toUpperCase(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  note: z.string().max(4000).optional(),
  items: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(200),
        quantity: z.coerce.number().positive(),
        unitAmount: z.coerce.number().positive(),
      }),
    )
    .min(1),
});

/** POST /api/invoices — create a PayPal invoice and send it to the client. */
export async function POST(req: Request) {
  try {
    const input = NewInvoice.parse(await req.json());
    const result = await createInvoice(input);
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
