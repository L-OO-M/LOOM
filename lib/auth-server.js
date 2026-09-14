import { createServerSupabase } from "@/lib/supabase/server";
import { getSql, queryTenant } from "@/lib/db";
import { hasRole } from "@/lib/auth";
import { env } from "@/lib/env";

/**
 * Server-side session + profile + tenant resolution.
 * Single source of truth for authN/authZ in route handlers and layouts.
 * Never trust tenant_id from the client — always derive from profile membership.
 */
export async function getRequestContext({ adminOnly = false } = {}) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { user: null, profile: null, tenant: null, error: "UNAUTHORIZED" };

  const sql = getSql();
  let [profile] = await sql`
    SELECT * FROM profiles WHERE user_id = ${user.id} LIMIT 1
  `;

  if (!profile) {
    const displayName = user.user_metadata?.name || user.email?.split("@")[0] || "Student";
    const tenant = await queryTenant(env.DEV_TENANT_SLUG || "demo-college");
    const [created] = await sql`
      INSERT INTO profiles (user_id, name, role, primary_domain, tenant_id)
      VALUES (${user.id}, ${displayName}, 'student', 'web', ${tenant?.id ?? null})
      ON CONFLICT (user_id) DO NOTHING
      RETURNING *
    `;
    profile = created || (await sql`SELECT * FROM profiles WHERE user_id = ${user.id} LIMIT 1`)[0] || null;
    // NOTE: no mirror row anywhere else — profiles is the single source of
    // truth for identity, role, and tenant (see migration 012).
  }

  if (!profile) return { user, profile: null, tenant: null, error: "PROFILE_NOT_FOUND" };

  // Backfill tenant membership for legacy rows
  let tenant = null;
  if (profile.tenant_id) {
    const [t] = await sql`SELECT * FROM tenants WHERE id = ${profile.tenant_id} LIMIT 1`;
    tenant = t || null;
  }
  if (!tenant) {
    tenant = await queryTenant(env.DEV_TENANT_SLUG || "demo-college");
    if (tenant && profile) {
      await sql`UPDATE profiles SET tenant_id = ${tenant.id} WHERE user_id = ${user.id} AND tenant_id IS NULL`;
      profile = { ...profile, tenant_id: tenant.id };
    }
  }

  // Platform admins bypass tenant role checks
  const [platformAdmin] = await sql`SELECT user_id FROM platform_admins WHERE user_id = ${user.id} LIMIT 1`;
  const effectiveRole = platformAdmin ? "admin" : profile.role;

  if (adminOnly && !hasRole({ role: effectiveRole }, "admin")) {
    return { user, profile: { ...profile, role: effectiveRole }, tenant, error: "FORBIDDEN" };
  }

  return { user, profile: { ...profile, role: effectiveRole }, tenant, sql, isPlatformAdmin: !!platformAdmin, error: null };
}

export async function writeAudit({ sql, actorId, tenantId, action, resource, resourceId, before = null, after = null }) {
  try {
    await sql`
      INSERT INTO audit_logs (actor_id, action, resource, resource_id, before, after, metadata)
      VALUES (${actorId}, ${action}, ${resource}, ${resourceId}, ${before ? sql.json(before) : null}, ${after ? sql.json(after) : null}, ${sql.json({ tenant_id: tenantId ?? null })})
    `;
  } catch { /* audit must never break the request */ }
}

export async function notify({ sql, tenantId, userId, type, title, body = null, link = null }) {
  try {
    await sql`
      INSERT INTO notifications (tenant_id, user_id, type, title, body, link)
      VALUES (${tenantId}, ${userId}, ${type}, ${title}, ${body}, ${link})
    `;
  } catch { /* notifications must never break the request */ }
}
