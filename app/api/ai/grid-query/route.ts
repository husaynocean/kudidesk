import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/api";
import { askGrid } from "@/lib/ai/gridQuery";

const Body = z.object({
  question: z.string().trim().min(2).max(300),
  today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  clients: z.array(z.string().max(120)).max(500).default([]),
  countries: z.array(z.string().max(60)).max(100).default([]),
});

/** POST /api/ai/grid-query — plain-English question → validated grid filter + sort. */
export async function POST(req: Request) {
  try {
    const { question, ...ctx } = Body.parse(await req.json());
    return NextResponse.json(await askGrid(question, ctx));
  } catch (err) {
    return errorResponse(err);
  }
}
