import { cache } from "react";
import { createServerSupabase } from "@/lib/supabase/server";
import { getSql, getAppSql, scopedSql, queryTenant } from "@/lib/db";
import { hasRole } from "@/lib/auth";
import { PRIMARY_DOMAINS } from "@/lib/domains";
import { env } from "@/lib/env";

/**
 * Server-side session + profile + tenant resolution.
 * Single source of truth for authN/authZ in route handlers and layouts.
 * Never trust tenant_id from the client — always derive from profile membership.
 */
/**
 * Is tenant-scoped request handling switched on?
 *
 * FAIL-SAFE BY DEFAULT. feature_flags is deliberately exempt from RLS (it must
 * be readable before any tenant is known), so this lookup always works. Any
 * error reading the flag returns false, which keeps the previous behaviour --
 * the owner connection, no scoping. Turning the rollout on therefore requires a
 * deliberate DB change, never an accident.
 */
async function rlsEnforced(sql) {
  try {
    const [row] = await sql`
      SELECT enabled FROM public.feature_flags
      WHERE tenant_id = (SELECT id FROM public.tenants WHERE slug = ${env.DEV_TENANT_SLUG || "demo-college"} LIMIT 1)
        AND key = 'tenant_rls_enforced'
      LIMIT 1
    `;
    return row?.enabled === true;
  } catch {
    return false;
  }
}

async function _getRequestContext({ adminOnly = false } = {}) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { user: null, profile: null, tenant: null, error: "UNAUTHORIZED" };

  const sql = getSql();

  // Read the rollout flag BEFORE opening any scoped connection. If it is on but
  // DATABASE_APP_URL is missing, getAppSql() silently falls back to the OWNER
  // connection, which has rolbypassrls = true -- so the app would keep serving
  // 200s while every policy stayed decorative. That is worse than being off,
  // because the admin UI would report enforcement as active. Refuse loudly.
  const enforce = await rlsEnforced(sql);
  if (enforce && !env.DATABASE_APP_URL_EXPLICIT) {
    throw new Error(
      "[rls] tenant_rls_enforced is ON but DATABASE_APP_URL is not set. " +
      "Request handling would fall back to the BYPASSRLS owner connection, " +
      "making the setting a silent no-op. Set DATABASE_APP_URL to the loom_app " +
      "connection string (node load/create-app-role.js), or turn the flag back off."
    );
  }

  // Tenant-scoped connection, when the rollout flag is on. Phase 1 sets only
  // app.user_id: the tenant is not known until we have read the profile, and
  // the profiles policy (migration 033) permits reading your own row on that
  // basis alone. Phase 2, below, re-scopes with app.tenant_id once resolved.
  const scoped = enforce ? scopedSql(getAppSql(), { "app.user_id": user.id }) : sql;

  let [profile] = await scoped`
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

    // The domain the member actually picked. This was hardcoded to 'web', so
    // selecting Blockchain at signup still produced a Web Development profile
    // -- the chosen domains fed department_memberships but never
    // primary_domain, which is what the roadmap resolves on.
    // Validated against PRIMARY_DOMAINS so a stale or junk value (one row was
    // literally "Blockchain ", capitalised with a trailing space) cannot be
    // written. First valid pick wins; null means "not chosen yet", which is
    // honest and lets the member pick later rather than silently defaulting.
    const pickedDomains = Array.isArray(meta.domains)
      ? meta.domains.filter((d) => typeof d === "string")
      : [];
    const primaryDomain = pickedDomains.find((d) => PRIMARY_DOMAINS.includes(d)) ?? null;

    const [created] = await sql`
      INSERT INTO profiles (user_id, name, role, primary_domain, tenant_id, roll_number, branch, year)
      VALUES (${user.id}, ${displayName}, 'student', ${primaryDomain}, ${tenant?.id ?? null}, ${meta.roll_number || null}, ${meta.branch || null}, ${year})
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

  // ---- Phase 2: the tenant is now known, so re-scope with app.tenant_id ---
  // Every statement below, and every statement the caller runs on ctx.sql,
  // carries BOTH GUCs. Writes are then permitted only where app.tenant_id
  // matches the row's tenant, which is exactly what WITH CHECK enforces.
  //
  // If the tenant could not be resolved we stay on the owner connection rather
  // than run scoped-but-unset, where every policy denies and the request would
  // fail closed for no useful reason.
  const db = (enforce && tenant)
    ? scopedSql(getAppSql(), { "app.user_id": user.id, "app.tenant_id": tenant.id })
    : sql;

  // First-login department memberships from signup metadata (best-effort;
  // auth must never break on org data).
  if (justCreated && tenant) {
    try {
      const picked = Array.isArray(user.user_metadata?.domains) ? user.user_metadata.domains.filter((d) => typeof d === "string") : [];
      if (picked.length) {
        const depts = await db`
          SELECT id FROM departments WHERE tenant_id = ${tenant.id} AND is_active AND slug = ANY(${picked})
        `;
        for (const d of depts) {
          await db`
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
    memberships = tenant ? await db`
      SELECT m.department_id, m.level, m.core_requested, m.joined_at, d.slug, d.name, d.vertical
      FROM department_memberships m JOIN departments d ON d.id = m.department_id
      WHERE m.user_id = ${user.id} AND d.tenant_id = ${tenant.id}
    ` : [];
  } catch { memberships = []; }
  profile = { ...profile, memberships };

  // Keep helper eligibility warm — active <=14d pool (best-effort, never break auth)
  if (tenant) {
    try {
      await db`
        INSERT INTO helper_profiles (user_id, tenant_id, available, last_active_at, updated_at)
        VALUES (${user.id}, ${tenant.id}::uuid, true, now(), now())
        ON CONFLICT (user_id) DO UPDATE SET last_active_at=now(), updated_at=now(), tenant_id=EXCLUDED.tenant_id
      `;
    } catch {}
  }

  // Platform admins bypass tenant role checks
  const [platformAdmin] = await db`SELECT user_id FROM platform_admins WHERE user_id = ${user.id} LIMIT 1`;
  const effectiveRole = platformAdmin ? "admin" : profile.role;

  if (adminOnly && !hasRole({ role: effectiveRole }, "admin")) {
    return { user, profile: { ...profile, role: effectiveRole }, tenant, error: "FORBIDDEN" };
  }

  return { user, profile: { ...profile, role: effectiveRole }, tenant, sql: db, isPlatformAdmin: !!platformAdmin, error: null };
}

export const getRequestContext = cache(_getRequestContext);

export async function writeAudit({ sql, actorId, tenantId, action, resource, resourceId, before = null, after = null }) {
  try {
    // tenant_id goes in the COLUMN as well as metadata. It used to live only in
    // metadata, which left all 53 existing rows NULL -- and therefore invisible
    // to the fail-closed RLS policy from 031. The metadata copy is kept because
    // /admin/audit reads it from there.
    await sql`
      INSERT INTO audit_logs (actor_id, tenant_id, action, resource, resource_id, before, after, metadata)
      VALUES (${actorId}, ${tenantId ?? null}, ${action}, ${resource}, ${resourceId}, ${before ? sql.json(before) : null}, ${after ? sql.json(after) : null}, ${sql.json({ tenant_id: tenantId ?? null })})
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
