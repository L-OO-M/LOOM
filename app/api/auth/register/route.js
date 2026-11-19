import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { createServerSupabase } from "@/lib/supabase/server";
import { checkRateLimit, rateLimitResponse, accountKey } from "@/lib/rate-limit";
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

// Supabase reports "this address is taken" in two different ways depending on
// whether email confirmation is on: an error, or a "user" row whose identities
// array is empty. Both are answered with ONE neutral reply, because the old code
// returned `fail("SIGNUP_FAILED", error.message)` -- which printed the provider's
// "User already registered" straight to the caller and turned registration into
// an account-existence oracle.
const DUPLICATE_EMAIL = /already registered|already exists|email_exists|user_already_exists/i;
const SIGNUP_UNAVAILABLE =
  "We could not create an account with those details. If you already have an account, sign in instead or reset your password.";

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

  // Per-account budget alongside the per-IP one.
  //
  // The IP bucket keys on a request header, so an attacker who rotates
  // `x-forwarded-for` resets it (verified before the fix). Counting the
  // attempted address as well bounds how many times one mailbox can be probed
  // for "does this account exist" or spammed with signup attempts, regardless
  // of source address. The reply is the generic rate-limit text so it says
  // nothing about whether the address is already registered.
  const account = await checkRateLimit(`register-account:${accountKey(body.email)}`, {
    durable: true,
    limit: 5,
    windowMs: 60 * 60_000
  });
  if (!account.ok) {
    const r = rateLimitResponse(account.retryAfter);
    return fail(r.error.code, r.error.message, 429);
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

  if (error) {
    if (DUPLICATE_EMAIL.test(error.message || "") || DUPLICATE_EMAIL.test(error.code || "")) {
      return fail("SIGNUP_UNAVAILABLE", SIGNUP_UNAVAILABLE, 409);
    }
    // Provider detail stays in the server log; the caller only learns that the
    // sign-up did not go through.
    console.error("[auth/register] signUp failed", error.code || error.message);
    return fail("SIGNUP_FAILED", SIGNUP_UNAVAILABLE, 400);
  }

  // With email confirmation enabled Supabase does NOT error for a taken
  // address: it returns a user row with no identities. Treating that as success
  // would write a consent record against an existing member's id and tell the
  // caller a new account exists, so it is refused here instead. The `!session`
  // guard keeps a legitimate new signup that happens to omit identities (older
  // or differently configured providers) working.
  if (!data?.session && Array.isArray(data?.user?.identities) && data.user.identities.length === 0) {
    return fail("SIGNUP_UNAVAILABLE", SIGNUP_UNAVAILABLE, 409);
  }

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