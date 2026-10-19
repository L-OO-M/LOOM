import { z } from "zod";
import { getSql } from "@/lib/db";
import { ok, fail } from "@/lib/api";
import { getSessionIdentity, writeAudit } from "@/lib/auth-server";

const bodySchema = z.object({
  userId: z.string().min(1).optional(),
  email: z.string().email().optional()
});

// First-admin bootstrap. Public in middleware (no admin exists yet to
// authorize against), so the route enforces its own triple gate:
// 1. caller must hold a valid session (Auth0 or the Supabase fallback),
// 2. the claimed userId must be the caller's own canonical id,
// 3. the platform_admins insert must win an atomic first-claim race
//    (single INSERT ... WHERE NOT EXISTS + ON CONFLICT DO NOTHING;
//    exactly one concurrent caller gets a RETURNING row).
export async function POST(request) {
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

  const userId = identity.userId;
  const email = identity.email || body.email || null;
  const sql = getSql();

  // Idempotent re-claim by the existing admin (e.g. retried setup click).
  const [mine] = await sql`SELECT user_id FROM platform_admins WHERE user_id = ${userId} LIMIT 1`;
  const [selfProfile] = await sql`SELECT tenant_id FROM profiles WHERE user_id = ${userId} LIMIT 1`;
  if (mine) {
    await writeAudit({
      sql, actorId: userId, tenantId: selfProfile?.tenant_id ?? null,
      action: "admin.claim_first", resource: "platform_admins", resourceId: userId,
      after: { repeat: true }
    });
    return ok({ message: "Admin already claimed" });
  }

  const [won] = await sql`
    INSERT INTO platform_admins (user_id)
    SELECT ${userId} WHERE NOT EXISTS (SELECT 1 FROM platform_admins)
    ON CONFLICT (user_id) DO NOTHING
    RETURNING user_id
  `;
  if (!won) return fail("ALREADY_SETUP", "Platform admin already exists", 403);

  if (selfProfile) {
    await sql`UPDATE profiles SET role = 'admin' WHERE user_id = ${userId}`;
  } else {
    await sql`
      INSERT INTO profiles (user_id, name, role, primary_domain)
      VALUES (${userId}, ${email?.split("@")[0] ?? "Admin"}, 'admin', 'web')
    `;
  }

  await writeAudit({
    sql, actorId: userId, tenantId: selfProfile?.tenant_id ?? null,
    action: "admin.claim_first", resource: "platform_admins", resourceId: userId
  });

  return ok({ message: "Admin claimed" });
}
