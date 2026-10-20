import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { consumeVerificationToken } from "@/lib/email-verification";

// GET /api/auth/verify-email/confirm?token=...
//
// Public on purpose: an email link is often opened in a different browser or on
// a phone with no session. The token itself is the credential, it is single-use,
// expires in 24 hours, and only a hash of it is stored.
export const dynamic = "force-dynamic";

function page(request, status) {
  const url = new URL("/verify-email", request.url);
  url.searchParams.set("status", status);
  return NextResponse.redirect(url, 303);
}

export async function GET(request) {
  const token = new URL(request.url).searchParams.get("token");
  if (!token) return page(request, "invalid");
  try {
    const result = await consumeVerificationToken({ sql: getSql(), raw: token });
    return page(request, result.ok ? "verified" : result.reason === "expired" ? "expired" : "invalid");
  } catch {
    return page(request, "error");
  }
}
