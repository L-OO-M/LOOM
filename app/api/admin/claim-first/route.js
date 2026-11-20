import { z } from "zod";
import { getSql } from "@/lib/db";
import { ok, fail } from "@/lib/api";
import { getSessionIdentity, writeAudit } from "@/lib/auth-server";
import { firstAdminSetupEnabled, setupCodeMatches } from "@/lib/first-admin";

const bodySchema = z.object({
  userId: z.string().min(1).optional(),
  email: z.string().email().optional(),
  code: z.string().min(1).max(256).optional()
});

// Thrown inside the transaction when the first-claim INSERT returns no row.
// Throwing (rather than returning) makes postgres.js roll the transaction back,
// so a lost race cannot leave any partial write behind.
class ClaimLostError extends Error {}

// Thrown inside the transaction when the caller did not present the bootstrap
// code. Thrown, not returned, for the same reason as ClaimLostError: no partial
// write may survive a refused claim.
class ClaimCodeError extends Error {}

// First-admin bootstrap. Public in middleware (no admin exists yet to
// authorize against), so the route enforces its own gates:
// 1. a bootstrap code (FIRST_ADMIN_CODE) must be configured and match,
// 2. caller must hold a valid session,
// 3. the claimed userId must be the caller's own canonical id,
// 4. the platform_admins insert must win an atomic first-claim race
//    (single INSERT ... WHERE NOT EXISTS + ON CONFLICT DO NOTHING;
//    exactly one concurrent caller gets a RETURNING row).
//
// Gate 1 exists because gates 2-4 alone were an open land grab: the first
// stranger to sign in and POST the endpoint became the permanent founder. The
// code is handed out by the operator out-of-band (env var), so bootstrap no
// longer depends on being first to a public URL.
//
// The claim and the profile promotion run in ONE transaction: if the profile
// write fails, the platform_admins row rolls back with it. The previous split
// statements could strand a platform admin with no admin profile.
export async function POST(request) {
  if (!firstAdminSetupEnabled()) {
    return fail(
      "SETUP_DISABLED",
      "First-admin setup is turned off on this deployment. Set FIRST_ADMIN_CODE, or seed the founder with load/seed-founder.js.",
      503
    );
  }

  // resolveIdentity() -- not the Supabase client directly. Reading only Supabase
  // made /setup unusable for anyone who signed in through Auth0: the page had a
  // valid session, but this route reported "Sign in before claiming admin".
  const identity = await getSessionIdentity();
  if (!identity?.userId) return fail("UNAUTHORIZED", "Sign in before claiming admin", 401);

  let body;
  try { body = bodySchema.parse(await request.json()); }
  catch { return fail("INVALID", "Invalid request", 400); }

  // The body may omit the id (the client no longer has to know it); if present
  // it must match the session. A mismatch is always an attack, never a typo.
  if (body.userId && body.userId !== identity.userId) {
    return fail("FORBIDDEN", "You can only claim admin for your own account", 403);
  }

  const codeOk = setupCodeMatches(body.code);
  const userId = identity.userId;
  const email = identity.email || body.email || null;
  const sql = getSql();

  let claim;
  try {
    claim = await sql.begin(async (tx) => {
      // Serialize concurrent first-claims. WHERE NOT EXISTS alone is safe for
      // the same user_id (unique constraint), but two DIFFERENT user IDs can
      // both observe zero rows under READ COMMITTED and each insert. The
      // transaction-scoped lock makes the read-then-insert atomic and releases
      // automatically on commit or rollback.
      await tx`SELECT pg_advisory_xact_lock(741852963)`;

      // Idempotent re-claim by the existing admin (e.g. retried setup click).
      const [mine] = await tx`SELECT user_id FROM platform_admins WHERE user_id = ${userId} LIMIT 1`;
      const [selfProfile] = await tx`SELECT tenant_id FROM profiles WHERE user_id = ${userId} LIMIT 1`;
      if (mine) {
        await writeAudit({
          sql: tx, actorId: userId, tenantId: selfProfile?.tenant_id ?? null,
          action: "admin.claim_first", resource: "platform_admins", resourceId: userId,
          after: { repeat: true }
        });
        return { repeat: true };
      }

      // Only a genuine first claim needs the bootstrap code. A retried click by
      // the already-claimed admin is idempotent and needs nothing.
      if (!codeOk) throw new ClaimCodeError();

      const [won] = await tx`
        INSERT INTO platform_admins (user_id, is_founder, locked, label)
        SELECT ${userId}, true, true, 'Founder'
        WHERE NOT EXISTS (SELECT 1 FROM platform_admins)
        ON CONFLICT (user_id) DO NOTHING
        RETURNING user_id
      `;
      if (!won) throw new ClaimLostError();

      if (selfProfile) {
        await tx`UPDATE profiles SET role = 'admin' WHERE user_id = ${userId}`;
      } else {
        await tx`
          INSERT INTO profiles (user_id, name, role, primary_domain)
          VALUES (${userId}, ${email?.split("@")[0] ?? "Admin"}, 'admin', 'web')
        `;
      }

      await writeAudit({
        sql: tx, actorId: userId, tenantId: selfProfile?.tenant_id ?? null,
        action: "admin.claim_first", resource: "platform_admins", resourceId: userId
      });

      return { repeat: false };
    });
  } catch (error) {
    if (error instanceof ClaimCodeError) {
      return fail("INVALID_CODE", "That setup code is not valid", 403);
    }
    if (error instanceof ClaimLostError) {
      return fail("ALREADY_SETUP", "Platform admin already exists", 403);
    }
    throw error;
  }

  return ok({ message: claim.repeat ? "Admin already claimed" : "Admin claimed" });
}
