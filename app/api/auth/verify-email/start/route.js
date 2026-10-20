import { fail, ok } from "@/lib/api";
import { getRequestContext } from "@/lib/auth-server";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  createVerificationToken,
  maskEmail,
  sendVerificationEmail,
  verificationConfigured,
} from "@/lib/email-verification";

// POST /api/auth/verify-email/start
//
// Session required. Mints a single-use token and asks the configured provider to
// send it. Deliberately does NOT require a profile or an allowlisted domain:
// this is a trust signal, not an access gate.
export async function POST() {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Sign in first", 401);
  const { user, profile, tenant, sql } = ctx;

  if (!verificationConfigured()) {
    return fail(
      "NOT_CONFIGURED",
      "Email verification is not switched on for this deployment. Your account works without it.",
      400
    );
  }
  if (profile?.email_verified_at) {
    return ok({ alreadyVerified: true, email: maskEmail(user.email) });
  }
  if (!user.email) return fail("NO_EMAIL", "This account has no email address to verify", 400);

  const limited = checkRateLimit(`verify-email:${user.id}`, { limit: 3, windowMs: 60 * 60_000 });
  if (!limited.ok) return fail("RATE_LIMITED", "A link was sent recently. Try again in an hour.", 429);

  const { token } = await createVerificationToken({
    sql,
    userId: user.id,
    tenantId: tenant?.id ?? null,
    email: user.email,
  });
  const sent = await sendVerificationEmail({ to: user.email, token, name: profile?.name });
  if (!sent.ok) {
    // Keep the code but not the provider's raw response.
    return fail(sent.code || "EMAIL_FAILED", sent.message || "Could not send the email", 502);
  }
  return ok({ sent: true, email: maskEmail(user.email) });
}
