import { ok, fail } from "@/lib/api";
import { auth0 } from "@/lib/auth0";
import { getRequestContext } from "@/lib/auth-server";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  Auth0ManagementError,
  getAuth0Security,
  isAuth0ManagementConfigured
} from "@/lib/auth0-management";

export const dynamic = "force-dynamic";

export async function GET() {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);

  const limited = checkRateLimit(`auth-security:${ctx.user.id}`, { limit: 30, windowMs: 60_000 });
  if (!limited.ok) return fail("RATE_LIMITED", "Too many requests. Try again shortly.", 429);

  if (!auth0) {
    return ok({ auth0: false, managementConfigured: false, hasPassword: true, emailVerified: true, identities: [] });
  }

  let session;
  try {
    session = await auth0.getSession();
  } catch {
    session = null;
  }
  if (!session?.user?.sub) {
    return ok({ auth0: false, managementConfigured: false, hasPassword: true, emailVerified: true, identities: [] });
  }

  if (!isAuth0ManagementConfigured()) {
    return ok({
      auth0: true,
      managementConfigured: false,
      hasPassword: null,
      emailVerified: session.user.email_verified === true,
      identities: []
    });
  }

  try {
    const security = await getAuth0Security(session.user.sub);
    return ok({ auth0: true, managementConfigured: true, ...security });
  } catch (error) {
    if (error instanceof Auth0ManagementError && error.code === "AUTH0_MANAGEMENT_NOT_CONFIGURED") {
      return ok({
        auth0: true,
        managementConfigured: false,
        hasPassword: null,
        emailVerified: session.user.email_verified === true,
        identities: []
      });
    }
    return fail("AUTH0_MANAGEMENT_UNAVAILABLE", "Account security is temporarily unavailable.", 503);
  }
}
