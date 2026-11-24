import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { auth0 } from "@/lib/auth0";
import { getRequestContext, writeAudit } from "@/lib/auth-server";
import { checkRateLimit } from "@/lib/rate-limit";
import { createLogger } from "@/lib/log";
import {
  Auth0ManagementError,
  PASSWORD_MIN_LENGTH,
  ensurePasswordIdentity,
  isPasswordPolicyError
} from "@/lib/auth0-management";

const log = createLogger("auth/password");

const schema = z.object({
  password: z.string().min(PASSWORD_MIN_LENGTH).max(200)
});

export const dynamic = "force-dynamic";

export async function POST(request) {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);

  const limited = checkRateLimit(`auth-password:${ctx.user.id}`, { limit: 5, windowMs: 60 * 60_000 });
  if (!limited.ok) return fail("RATE_LIMITED", "Too many password attempts. Try again later.", 429);

  let body;
  try {
    body = schema.parse(await request.json());
  } catch (error) {
    if (error instanceof z.ZodError) {
      return fail(
        "VALIDATION_ERROR",
        `Use at least ${PASSWORD_MIN_LENGTH} characters.`,
        400,
        error.flatten()
      );
    }
    return validationError(error);
  }

  let session;
  try {
    session = await auth0?.getSession();
  } catch {
    session = null;
  }
  if (!session?.user?.sub) {
    return fail("AUTH0_SESSION_REQUIRED", "Sign in through Auth0 before adding a password.", 409);
  }

  // The public handle is the friendliest username to store on the identity; the
  // management helper falls back to the GitHub handle and then the address.
  const [card] = await ctx.sql`
    SELECT username FROM user_profiles WHERE user_id = ${ctx.user.id} LIMIT 1
  `;

  try {
    const result = await ensurePasswordIdentity({
      sub: session.user.sub,
      email: session.user.email,
      emailVerified: session.user.email_verified === true,
      password: body.password,
      username: card?.username || null,
      userId: ctx.user.id
    });
    await writeAudit({
      sql: ctx.sql,
      actorId: ctx.user.id,
      tenantId: ctx.tenant?.id,
      action: "set_password",
      resource: "user_identity",
      resourceId: ctx.user.id,
      after: { created: result.created, provider: "auth0" }
    });
    return ok({ hasPassword: true });
  } catch (error) {
    if (error instanceof Auth0ManagementError) {
      if (error.code === "EMAIL_UNVERIFIED") {
        return fail("EMAIL_UNVERIFIED", "Verify your email before adding a password.", 400);
      }
      if (error.code === "PASSWORD_IDENTITY_CONFLICT") {
        return fail("PASSWORD_IDENTITY_CONFLICT", error.message, 409);
      }
      if (error.code === "AUTH0_MANAGEMENT_NOT_CONFIGURED") {
        return fail("PASSWORD_SETUP_UNAVAILABLE", "Password setup is not configured for this deployment.", 503);
      }
      if (isPasswordPolicyError(error)) {
        return fail(
          "PASSWORD_REJECTED",
          `Use at least ${PASSWORD_MIN_LENGTH} characters. A short phrase works — there is no symbol requirement.`,
          400
        );
      }
      // Anything else is our request's fault, not the member's. Log the code and
      // status (never the password or address) so a 400 can never again present
      // itself as "use a stronger password" and stay invisible for days.
      log.warn("provider rejected password setup", { code: error.code, status: error.status });
    } else {
      log.error("password setup failed", { err: error });
    }
    return fail("PASSWORD_SETUP_FAILED", "Could not update your password. Try again later.", 502);
  }
}
