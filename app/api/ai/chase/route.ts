import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/api";
import { draftReminders } from "@/lib/ai/chase";
import { getRows } from "@/lib/invoices";

const Body = z.object({ ids: z.array(z.string().max(64)).min(1).max(25) });

/** POST /api/ai/chase — draft a tailored reminder per selected invoice. Sends nothing. */
export async function POST(req: Request) {
  try {
    const { ids } = Body.parse(await req.json());
    const all = await getRows();
    const rows = all.filter((r) => ids.includes(r.id) && (r.state === "Overdue" || r.state === "Awaiting"));
    if (!rows.length) return NextResponse.json({ error: "None of those invoices are unpaid." }, { status: 400 });
    return NextResponse.json(await draftReminders(rows, all, process.env.FREELANCER_NAME ?? ""));
  } catch (err) {
    return errorResponse(err);
  }
}
