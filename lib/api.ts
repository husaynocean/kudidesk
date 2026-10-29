import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { PayPalError } from "./paypal";

/** Turns any thrown error into a clean JSON response. */
export function errorResponse(err: unknown) {
  if (err instanceof ZodError) {
    return NextResponse.json({ error: "Invalid input", details: err.issues }, { status: 400 });
  }
  if (err instanceof PayPalError) {
    return NextResponse.json(
      { error: err.message, issue: err.issue, debugId: err.debugId },
      { status: err.status >= 400 && err.status < 600 ? err.status : 502 },
    );
  }
  console.error(err);
  return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
}
