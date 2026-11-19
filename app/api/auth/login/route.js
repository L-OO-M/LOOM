import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { createServerSupabase } from "@/lib/supabase/server";
import { checkRateLimit, rateLimitResponse, accountKey } from "@/lib/rate-limit";
import { auth0OnlyEnabled } from "@/lib/env";

const schema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(1).max(200)
});

// Rate-limited credential check.
//
// The login form used to call supabase.auth.signInWithPassword() straight from
// the browser, which meant this app's rate limiter never saw a login attempt:
// the only thing between an attacker and unlimited guesses was Supabase's own
// account protection, which is not configured here. Registering through the
// server puts every attempt behind a bucket we control, and gives us somewhere
// to hang progressive backoff later.
//
// Deliberately does NOT reveal whether an account exists: the failure message is
// Supabase's, unchanged, so this is not an account-enumeration oracle.
export async function POST(request) {
  if (auth0OnlyEnabled()) {
    return fail(
      "AUTH0_ONLY",
      "Legacy email/password sign-in is closed on this deployment. Continue with Auth0.",
      403
    );
  }

  const rl = await checkRateLimit(request, { durable: true, limit: 8, windowMs: 10 * 60_000 });
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

  // Per-account budget, on top of the per-IP one above.
  //
  // The IP bucket keys on a request header (see clientIp()), so a distributed
  // or header-rotating attacker can reset it. This one is keyed on the address
  // being guessed and cannot be reset from the client, which turns "unlimited
  // guesses" into "30 guesses per 15 minutes per account" regardless of source.
  // The message stays the generic rate-limit text so it is not an oracle for
  // whether the account exists.
  const account = await checkRateLimit(`login-account:${accountKey(body.email)}`, {
    durable: true,
    limit: 30,
    windowMs: 15 * 60_000
  });
  if (!account.ok) {
    const r = rateLimitResponse(account.retryAfter);
    return fail(r.error.code, r.error.message, 429);
  }

  const supabase = await createServerSupabase();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: body.email,
    password: body.password
  });

  if (error) {
    // Supabase returns the same message for "no such user" and "wrong
    // password" on the anon key, which is exactly the behaviour we want.
    return fail("INVALID_CREDENTIALS", error.message, 401);
  }

  return ok({ user: data.user ? { id: data.user.id, email: data.user.email } : null });
}