import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { auth0 } from "@/lib/auth0";
import { getRequestContext, writeAudit } from "@/lib/auth-server";
import { checkRateLimit } from "@/lib/rate-limit";
import { Auth0ManagementError, ensurePasswordIdentity } from "@/lib/auth0-management";

const schema = z.object({
  password: z.string().min(8).max(200)
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

  try {
    const result = await ensurePasswordIdentity({
      sub: session.user.sub,
      email: session.user.email,
      emailVerified: session.user.email_verified === true,
      password: body.password
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
      if (error.status === 400) {
        return fail("PASSWORD_REJECTED", "Use a stronger password and try again.", 400);
      }
    }
    return fail("PASSWORD_SETUP_FAILED", "Could not update your password. Try again later.", 502);
  }
}
