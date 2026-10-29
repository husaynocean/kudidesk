import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/api";
import { extractInvoice } from "@/lib/ai/extractInvoice";

const Body = z.object({
  chat: z.string().trim().min(10, "Paste a bit more of the conversation").max(20_000),
  today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

/** POST /api/ai/extract-invoice — turn a pasted client chat into an invoice draft for review. */
export async function POST(req: Request) {
  try {
    const { chat, today } = Body.parse(await req.json());
    const result = await extractInvoice(chat, today ?? new Date().toISOString().slice(0, 10));
    return NextResponse.json(result);
  } catch (err) {
    return errorResponse(err);
  }
}
