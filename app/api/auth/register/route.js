import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { createServerSupabase } from "@/lib/supabase/server";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { PRIMARY_DOMAINS } from "@/lib/domains";
import { getSql } from "@/lib/db";
import { resolveRequestTenant } from "@/lib/tenant";
import { auth0OnlyEnabled } from "@/lib/env";
import { isDisposableEmail, recordConsent } from "@/lib/auth-server";

const schema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(8).max(200),
  // Server-required consent. The client checkbox alone used to be advisory;
  // without this field the API has no evidence that the member accepted the
  // current Terms and Privacy notice, so registration is refused.
  consent: z.object({ accepted: z.literal(true) }),
  metadata: z.object({
    name: z.string().max(120).optional(),
    roll_number: z.string().max(40).optional(),
    branch: z.string().max(80).optional(),
    year: z.number().int().min(1).max(6).optional(),
    domains: z.array(z.string().max(40)).max(10).optional()
  }).passthrough().optional()
});

// Rate-limited registration. Same reasoning as /api/auth/login: the browser was
// calling Supabase directly, so signup attempts bypassed this app's limiter
// entirely. Registration is the cheaper abuse target (no valid credential
// needed), so the bucket is deliberately tighter.
export async function POST(request) {
  // Auth0-only cutover is enforced on the SERVER. The public NEXT_PUBLIC flag
  // only hides the form; this is what actually closes the legacy endpoint.
  if (auth0OnlyEnabled()) {
    return fail(
      "AUTH0_ONLY",
      "Email/password registration is closed on this deployment. Continue with Auth0.",
      403
    );
  }

  const rl = await checkRateLimit(request, { durable: true, limit: 5, windowMs: 60 * 60_000 });
  if (!rl.ok) {
    const r = rateLimitResponse(rl.retryAfter);
    return fail(r.error.code, r.error.message, 429);
  }

  let body;
  try {
    body = schema.parse(await request.json());
  } catch (e) {
    return validationError(e);
  }

  if (isDisposableEmail(body.email)) {
    return fail(
      "DISPOSABLE_EMAIL",
      "Use a permanent email address. Disposable email domains are not accepted.",
      400
    );
  }

  // The same validation the first-login path applies. A junk domain that
  // reached user_metadata would silently produce a member with no department.
  const metadata = { ...(body.metadata || {}) };
  if (Array.isArray(metadata.domains)) {
    metadata.domains = metadata.domains.filter((d) => typeof d === "string" && PRIMARY_DOMAINS.includes(d));
  }

  // Tenant is SERVER-DERIVED from the request host / configured default slug.
  // Never accepted from the body. Refuse before creating an account we could
  // not place in a chapter or attach a consent record to.
  const tenant = await resolveRequestTenant();
  if (!tenant?.id) {
    return fail(
      "TENANT_UNRESOLVED",
      "This deployment could not resolve a chapter for your request. Contact the chapter operator.",
      400
    );
  }

  const supabase = await createServerSupabase();
  const { data, error } = await supabase.auth.signUp({
    email: body.email,
    password: body.password,
    options: { data: metadata }
  });

  if (error) return fail("SIGNUP_FAILED", error.message, 400);

  // Consent cannot be skipped silently. If the record cannot be written, say
  // so explicitly rather than returning a happy 201 for an unconsented account.
  if (!data.user?.id) {
    return fail(
      "CONSENT_NOT_RECORDED",
      "Your account could not be completed because the consent record could not be created. Contact the chapter operator.",
      502
    );
  }

  try {
    // Owner connection is deliberate: this runs before any authenticated
    // request context exists, and tenant_id is the server-derived value above.
    await recordConsent({
      sql: getSql(),
      userId: data.user.id,
      tenantId: tenant.id,
      actor: data.user.email || body.email,
      source: "supabase_register"
    });
  } catch (e) {
    console.error("[auth/register] consent record failed", e?.message || e);
    return fail(
      "CONSENT_NOT_RECORDED",
      "Your account was created but the consent record could not be saved. Do not continue; contact the chapter operator.",
      502
    );
  }

  // Email confirmation is intentionally disabled for this chapter, so signUp
  // returns a session. Report whether one came back so the client can send the
  // member onward rather than leaving them on a dead form.
  return ok({
    user: data.user ? { id: data.user.id, email: data.user.email } : null,
    session: !!data.session,
    confirmationRequired: !data.session
  }, { status: 201 });
}