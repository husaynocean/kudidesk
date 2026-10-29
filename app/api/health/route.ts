import { NextResponse } from "next/server";
import { mode } from "@/lib/invoices";
import { checkCredentials } from "@/lib/paypal";

export const dynamic = "force-dynamic";

/** GET /api/health — open this in the browser to confirm your PayPal sandbox keys work. */
export async function GET() {
  if (mode() === "demo") {
    return NextResponse.json({ mode: "demo", paypal: "no credentials set — using sample data" });
  }
  try {
    await checkCredentials();
    return NextResponse.json({ mode: "paypal", paypal: "connected to sandbox ✔" });
  } catch (err) {
    return NextResponse.json({ mode: "paypal", paypal: "failed", error: (err as Error).message }, { status: 502 });
  }
}
