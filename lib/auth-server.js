import { cache } from "react";
import { createServerSupabase } from "@/lib/supabase/server";
import { getSql, queryTenant } from "@/lib/db";
import { hasRole } from "@/lib/auth";
import { env } from "@/lib/env";

/**
 * Server-side session + profile + tenant resolution.
 * Single source of truth for authN/authZ in route handlers and layouts.
 * Never trust tenant_id from the client — always derive from profile membership.
 */
async function _getRequestContext({ adminOnly = false } = {}) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { user: null, profile: null, tenant: null, error: "UNAUTHORIZED" };

  const sql = getSql();
  let [profile] = await sql`
    SELECT * FROM profiles WHERE user_id = ${user.id} LIMIT 1
  `;

  // Signup metadata (roll_number, branch, year, domains) is captured on the
  // register form and consumed here once, at first login — membership in the
  // chosen departments is instant and approval-free (Plan Section 6).
  let justCreated = false;
  if (!profile) {
    const meta = user.user_metadata || {};
    const displayName = meta.name || user.email?.split("@")[0] || "Student";
    const year = Number.isInteger(meta.year) && meta.year >= 1 && meta.year <= 6 ? meta.year : null;
    const tenant = await queryTenant(env.DEV_TENANT_SLUG || "demo-college");
    const [created] = await sql`
      INSERT INTO profiles (user_id, name, role, primary_domain, tenant_id, roll_number, branch, year)
      VALUES (${user.id}, ${displayName}, 'student', 'web', ${tenant?.id ?? null}, ${meta.roll_number || null}, ${meta.branch || null}, ${year})
      ON CONFLICT (user_id) DO NOTHING
      RETURNING *
    `;
    profile = created || (await sql`SELECT * FROM profiles WHERE user_id = ${user.id} LIMIT 1`)[0] || null;
    justCreated = !!created;
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

  // First-login department memberships from signup metadata (best-effort;
  // auth must never break on org data).
  if (justCreated && tenant) {
    try {
      const picked = Array.isArray(user.user_metadata?.domains) ? user.user_metadata.domains.filter((d) => typeof d === "string") : [];
      if (picked.length) {
        const depts = await sql`
          SELECT id FROM departments WHERE tenant_id = ${tenant.id} AND is_active AND slug = ANY(${picked})
        `;
        for (const d of depts) {
          await sql`
            INSERT INTO department_memberships (user_id, department_id, level)
            VALUES (${user.id}, ${d.id}, 'general')
            ON CONFLICT (user_id, department_id) DO NOTHING
          `;
        }
      }
    } catch { /* membership seeding must never break first login */ }
  }

  // Department memberships ride on the profile so permission checks stay
  // single-query for callers (shape matches lib/permissions.js).
  let memberships = [];
  try {
    memberships = tenant ? await sql`
      SELECT m.department_id, m.level, m.core_requested, m.joined_at, d.slug, d.name, d.vertical
      FROM department_memberships m JOIN departments d ON d.id = m.department_id
      WHERE m.user_id = ${user.id} AND d.tenant_id = ${tenant.id}
    ` : [];
  } catch { memberships = []; }
  profile = { ...profile, memberships };

  // Keep helper eligibility warm — active <=14d pool (best-effort, never break auth)
  if (tenant) {
    try {
      await sql`
        INSERT INTO helper_profiles (user_id, tenant_id, available, last_active_at, updated_at)
        VALUES (${user.id}, ${tenant.id}::uuid, true, now(), now())
        ON CONFLICT (user_id) DO UPDATE SET last_active_at=now(), updated_at=now(), tenant_id=EXCLUDED.tenant_id
      `;
    } catch {}
  }

  // Platform admins bypass tenant role checks
  const [platformAdmin] = await sql`SELECT user_id FROM platform_admins WHERE user_id = ${user.id} LIMIT 1`;
  const effectiveRole = platformAdmin ? "admin" : profile.role;

  if (adminOnly && !hasRole({ role: effectiveRole }, "admin")) {
    return { user, profile: { ...profile, role: effectiveRole }, tenant, error: "FORBIDDEN" };
  }

  return { user, profile: { ...profile, role: effectiveRole }, tenant, sql, isPlatformAdmin: !!platformAdmin, error: null };
}

export const getRequestContext = cache(_getRequestContext);

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
