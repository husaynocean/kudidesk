import { NextResponse } from "next/server";
import { geminiModel, hasGemini } from "@/lib/gemini";
import { mode } from "@/lib/invoices";
import { checkCredentials } from "@/lib/paypal";

export const dynamic = "force-dynamic";

/**
 * GET /api/health — open this in the browser to check your setup.
 * Always returns 200 so Render's health check passes even while keys are being sorted out.
 */
export async function GET() {
  const ai = hasGemini() ? `gemini (${geminiModel()})` : "offline fallback — set GEMINI_API_KEY";
  const webhooks = process.env.PAYPAL_WEBHOOK_ID ? "signature verification on" : "PAYPAL_WEBHOOK_ID not set";

  if (mode() === "demo") {
    return NextResponse.json({ mode: "demo", paypal: "no credentials set — using sample data", ai, webhooks });
  }
  try {
    await checkCredentials();
    return NextResponse.json({ mode: "paypal", paypal: "connected to sandbox ✔", ai, webhooks });
  } catch (err) {
    return NextResponse.json({ mode: "paypal", paypal: "failed", error: (err as Error).message, ai, webhooks });
  }
}
