import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { createServerSupabase } from "@/lib/supabase/server";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { PRIMARY_DOMAINS } from "@/lib/domains";

const schema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(8).max(200),
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
  const rl = checkRateLimit(request, { limit: 5, windowMs: 60 * 60_000 });
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

  // The same validation the first-login path applies. A junk domain that
  // reached user_metadata would silently produce a member with no department.
  const metadata = { ...(body.metadata || {}) };
  if (Array.isArray(metadata.domains)) {
    metadata.domains = metadata.domains.filter((d) => typeof d === "string" && PRIMARY_DOMAINS.includes(d));
  }

  const supabase = await createServerSupabase();
  const { data, error } = await supabase.auth.signUp({
    email: body.email,
    password: body.password,
    options: { data: metadata }
  });

  if (error) return fail("SIGNUP_FAILED", error.message, 400);

  // Email confirmation is intentionally disabled for this chapter, so signUp
  // returns a session. Report whether one came back so the client can send the
  // member onward rather than leaving them on a dead form.
  return ok({
    user: data.user ? { id: data.user.id, email: data.user.email } : null,
    session: !!data.session,
    confirmationRequired: !data.session
  }, { status: 201 });
}