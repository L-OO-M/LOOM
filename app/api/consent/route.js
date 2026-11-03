import { ok, fail } from "@/lib/api";
import { getRequestContext, recordConsent } from "@/lib/auth-server";

// Records acceptance of the CURRENT Terms and Privacy versions for the signed-in
// member. The versions come from lib/legal.js on the server; the client cannot
// choose which policy it is accepting.
export async function POST() {
  const ctx = await getRequestContext();
  if (!ctx.user) return fail("UNAUTHORIZED", "Sign in to continue", 401);
  if (!ctx.profile || !ctx.tenant) {
    return fail(
      "PROFILE_NOT_READY",
      "Your chapter profile is not ready yet. Contact the chapter operator.",
      409
    );
  }
  if (ctx.error && ctx.error !== "CONSENT_REQUIRED") {
    return fail("CONTEXT_ERROR", "Your account context could not be loaded", 500);
  }

  try {
    await recordConsent({
      sql: ctx.sql,
      userId: ctx.user.id,
      tenantId: ctx.tenant.id,
      actor: ctx.user.email || ctx.user.id,
      source: "explicit_consent"
    });
  } catch (error) {
    console.error("[consent] record failed", error?.message || error);
    return fail("CONSENT_NOT_RECORDED", "The consent record could not be saved", 502);
  }

  return ok({ accepted: true });
}
