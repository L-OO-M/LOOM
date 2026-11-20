import { fail } from "@/lib/api";

// Retired: minting our own email-verification tokens.
//
// Auth0 verifies the address during sign-in and reports `email_verified` on the
// session, so a second verification channel would be a parallel truth about the
// same fact. Tokens are no longer minted, mailed, or accepted.
//
// 410 Gone, not 403: the capability is removed.
//
// The settings card still calls this path; it now shows this message instead of
// a network failure.
export const dynamic = "force-dynamic";

export async function POST() {
  return fail(
    "AUTH0_ONLY",
    "Email verification is handled by Auth0 during sign-in.",
    410
  );
}
