import { NextResponse } from "next/server";
import { ZodError } from "zod";

export function ok(data, init = {}) {
  return NextResponse.json({ ok: true, data }, init);
}

export function fail(code, message, status = 400, details = undefined) {
  return NextResponse.json(
    {
      ok: false,
      error: {
        code,
        message,
        details
      }
    },
    { status }
  );
}

export function validationError(error) {
  if (error instanceof ZodError) {
    return fail("VALIDATION_ERROR", "Request body is invalid", 400, error.flatten());
  }

  return fail("VALIDATION_ERROR", "Request body is invalid", 400);
}
