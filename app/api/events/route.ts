import { NextResponse } from "next/server";
import { eventsAfter } from "@/lib/events";

export const dynamic = "force-dynamic";

/** GET /api/events?after=<seq> — invoice events since the dashboard last looked. */
export async function GET(req: Request) {
  const after = Number(new URL(req.url).searchParams.get("after") ?? 0) || 0;
  return NextResponse.json(eventsAfter(after));
}
