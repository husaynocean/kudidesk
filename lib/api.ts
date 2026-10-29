import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { GeminiError } from "./gemini";
import { PayPalError } from "./paypal";

/** Turns any thrown error into a clean JSON response. */
export function errorResponse(err: unknown) {
  if (err instanceof ZodError) {
    return NextResponse.json({ error: `Invalid input: ${err.issues[0]?.message ?? "check the form"}`, details: err.issues }, { status: 400 });
  }
  if (err instanceof PayPalError) {
    return NextResponse.json(
      { error: err.message, issue: err.issue, debugId: err.debugId },
      { status: err.status >= 400 && err.status < 600 ? err.status : 502 },
    );
  }
  if (err instanceof GeminiError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  console.error(err);
  return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
}
