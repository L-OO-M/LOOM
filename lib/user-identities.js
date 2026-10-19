import { getSql } from "@/lib/db";
import { canLinkByEmail } from "@/lib/auth";

/**
 * Resolve an Auth0 identity to this application's canonical user_id.
 *
 * Auth0 is the front door, but the id used across the schema stays the Supabase
 * uid (profiles.user_id, projects.owner_id, ...) -- moving to Auth0 must not
 * rewrite any existing rows. This is the single place that binds one to the
 * other:
 *
 *   1. If this Auth0 `sub` is already linked, return its user_id (one indexed
 *      read on the hot path).
 *   2. Otherwise match an EXISTING account by email (auth.users) so a person who
 *      signed up under Supabase keeps their uid, and link them.
 *   3. Otherwise this is a brand-new signup: mint a uuid and link it.
 *
 * Runs on the owner connection on purpose: it executes before any tenant (or
 * app.user_id) is known, and user_identities is a deny-all RLS table (047) that
 * the scoped application role must not reach directly.
 *
 * Returns null only when the identity has no subject at all.
 */
export async function resolveUserIdForAuth0(user) {
  const sub = user?.sub;
  if (typeof sub !== "string" || !sub) return null;

  const sql = getSql();

  const [linked] = await sql`
    SELECT user_id FROM public.user_identities WHERE auth0_sub = ${sub} LIMIT 1
  `;
  if (linked?.user_id) return linked.user_id;

  // Step 2: reuse the existing account's uid when the email matches a Supabase
  // user. Auth0 lower-cases and verifies email; compare case-insensitively.
  //
  // ONLY when Auth0 has verified the address. Matching on an unverified email
  // would let anyone who registers a colliding address at the identity provider
  // inherit the victim's canonical user_id -- a full account takeover, since
  // that id is the sole key for profile, role, projects and grants.
  const email = typeof user.email === "string" ? user.email.trim().toLowerCase() : null;
  let userId = null;
  if (email && canLinkByEmail(user)) {
    const [existing] = await sql`
      SELECT id::text AS id FROM auth.users WHERE lower(email) = ${email} LIMIT 1
    `;
    userId = existing?.id ?? null;
  }

  // Step 3: a genuinely new account gets a fresh canonical id.
  if (!userId) userId = crypto.randomUUID();

  const provider = sub.includes("|") ? sub.split("|")[0] : null;

  // Concurrent first logins (two tabs) race here; ON CONFLICT keeps the winner's
  // mapping rather than failing the request. The RETURNING user_id would be the
  // loser's own minted id, so re-read the row to return the canonical mapping.
  await sql`
    INSERT INTO public.user_identities (auth0_sub, user_id, email, provider)
    VALUES (${sub}, ${userId}, ${email}, ${provider})
    ON CONFLICT (auth0_sub) DO UPDATE SET email = EXCLUDED.email, updated_at = now()
  `;

  const [settled] = await sql`
    SELECT user_id FROM public.user_identities WHERE auth0_sub = ${sub} LIMIT 1
  `;
  return settled?.user_id ?? userId;
}
