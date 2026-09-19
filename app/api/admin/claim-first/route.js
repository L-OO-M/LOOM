import { z } from "zod";
import { getSql } from "@/lib/db";
import { ok, fail } from "@/lib/api";
import { createServerSupabase } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/auth-server";

const bodySchema = z.object({
  userId: z.string().min(1),
  email: z.string().email().optional()
});

// First-admin bootstrap. Public in middleware (no admin exists yet to
// authorize against), so the route enforces its own triple gate:
// 1. caller must hold a valid session,
// 2. the claimed userId must be the caller's own id,
// 3. the platform_admins insert must win an atomic first-claim race
//    (single INSERT ... WHERE NOT EXISTS + ON CONFLICT DO NOTHING;
//    exactly one concurrent caller gets a RETURNING row).
export async function POST(request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail("UNAUTHORIZED", "Sign in before claiming admin", 401);

  let body;
  try { body = bodySchema.parse(await request.json()); }
  catch (e) { return fail("INVALID", "Invalid request", 400); }

  if (body.userId !== user.id) {
    return fail("FORBIDDEN", "You can only claim admin for your own account", 403);
  }

  const sql = getSql();

  // Idempotent re-claim by the existing admin (e.g. retried setup click).
  const [mine] = await sql`SELECT user_id FROM platform_admins WHERE user_id = ${user.id} LIMIT 1`;
  const [selfProfile] = await sql`SELECT tenant_id FROM profiles WHERE user_id = ${user.id} LIMIT 1`;
  if (mine) {
    await writeAudit({
      sql, actorId: user.id, tenantId: selfProfile?.tenant_id ?? null,
      action: "admin.claim_first", resource: "platform_admins", resourceId: user.id,
      after: { repeat: true }
    });
    return ok({ message: "Admin already claimed" });
  }

  const [won] = await sql`
    INSERT INTO platform_admins (user_id)
    SELECT ${user.id} WHERE NOT EXISTS (SELECT 1 FROM platform_admins)
    ON CONFLICT (user_id) DO NOTHING
    RETURNING user_id
  `;
  if (!won) return fail("ALREADY_SETUP", "Platform admin already exists", 403);

  if (selfProfile) {
    await sql`UPDATE profiles SET role = 'admin' WHERE user_id = ${user.id}`;
  } else {
    await sql`
      INSERT INTO profiles (user_id, name, role, primary_domain)
      VALUES (${user.id}, ${body.email?.split("@")[0] ?? "Admin"}, 'admin', 'web')
    `;
  }

  await writeAudit({
    sql, actorId: user.id, tenantId: selfProfile?.tenant_id ?? null,
    action: "admin.claim_first", resource: "platform_admins", resourceId: user.id
  });

  return ok({ message: "Admin claimed" });
}
