import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { createServerSupabase } from "@/lib/supabase/server";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

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
  const rl = checkRateLimit(request, { limit: 8, windowMs: 10 * 60_000 });
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