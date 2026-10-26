import { cache } from "react";
import { createServerSupabase } from "@/lib/supabase/server";
import { auth0 } from "@/lib/auth0";
import { resolveUserIdForAuth0, resolveUserIdForSupabase } from "@/lib/user-identities";
import { getSql, getAppSql, scopedSql, queryTenant } from "@/lib/db";
import { hasRole } from "@/lib/auth";
import { effectiveRole as governingRole, termExpired as isTermExpired } from "@/lib/permissions";
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
/**
 * Per-user throttle for the helper-profile heartbeat.
 *
 * The peer-matching pool treats "active in the last 14 days" as the eligibility
 * signal, so refreshing that timestamp more than once a day changes nothing
 * observable. Module-level state is correct here: worst case a warm Lambda
 * refreshes slightly more often, and a cold one slightly less — both are far
 * inside the 14-day window this feeds.
 */
const HELPER_REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;
const helperRefreshedAt = new Map();

export function shouldRefreshHelperProfile(userId) {
  const now = Date.now();
  const last = helperRefreshedAt.get(userId);
  if (last && now - last < HELPER_REFRESH_INTERVAL_MS) return false;
  helperRefreshedAt.set(userId, now);
  // Bound the map on a long-lived server instance.
  if (helperRefreshedAt.size > 5000) {
    for (const [k, v] of helperRefreshedAt) {
      if (now - v > HELPER_REFRESH_INTERVAL_MS) helperRefreshedAt.delete(k);
    }
  }
  return true;
}

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

/**
 * Resolve the acting identity from whichever front door holds a session.
 *
 * Auth0 is primary. Supabase remains a fallback so (a) legacy sessions created
 * before the migration keep working and (b) the E2E suite's programmatic login
 * path is unaffected. Both resolve to ONE canonical user_id via
 * lib/user-identities.js, so nothing downstream needs to know which door was used.
 */
async function resolveIdentity() {
  // Auth0 is null when unconfigured (lib/auth0.js) -- skip straight to Supabase.
  if (auth0) {
    try {
      const session = await auth0.getSession();
      if (session?.user) {
        const userId = await resolveUserIdForAuth0(session.user);
        if (userId) {
          // The ID token carries only the standard profile claims -- no
          // user_metadata -- so first-login seeding uses `name` when present.
          // The register form's roll/branch/year/domains are Supabase-path only;
          // Auth0 signups complete the same fields in onboarding instead.
          return {
            userId,
            email: session.user.email || null,
            metadata: session.user.name ? { name: session.user.name } : {},
            source: "auth0"
          };
        }
      }
    } catch {
      // A missing/invalid Auth0 cookie or misconfiguration must never break the
      // request -- fall through to the Supabase session check instead.
    }
  }

  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const userId = await resolveUserIdForSupabase(user);
  return { userId, email: user.email || null, metadata: user.user_metadata || {}, source: "supabase" };
}

async function _getRequestContext({ adminOnly = false } = {}) {
  const identity = await resolveIdentity();
  if (!identity) return { user: null, profile: null, tenant: null, error: "UNAUTHORIZED" };
  const { userId, metadata, email } = identity;
  // A local shim keeps every downstream `user.id` reference working unchanged,
  // whether the session came from Auth0 or Supabase.
  const user = { id: userId, email };

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
    const meta = metadata || {};
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

  // ---- FAIL CLOSED when the tenant cannot be resolved -------------------------
  // Roughly forty queries across the API are written as
  //     WHERE (tenant_id = ${tenant?.id ?? null}::uuid OR ${tenant?.id ?? null}::uuid IS NULL)
  // That idiom is only safe while `tenant` is ALWAYS a real uuid: the
  // `IS NULL` arm is a deliberate escape hatch for global tables, and it
  // silently becomes a cross-tenant read for everything else the moment
  // `tenant` is null.
  //
  // So rather than auditing all forty call sites, guarantee the precondition
  // once, here. A profile that exists but cannot be placed in a chapter is a
  // broken/half-provisioned state, not a request we should serve with a
  // widened query scope. Failing loudly is the safe outcome; returning a null
  // tenant is what made these queries hazardous in the first place.
  if (!tenant) {
    console.error(
      `[auth] refusing to build a request context: profile ${user.id} has no resolvable tenant ` +
      `(profile.tenant_id=${profile.tenant_id ?? "null"}, fallback slug=${env.DEV_TENANT_SLUG || "demo-college"}). ` +
      `Serving this request would widen every tenant-scoped query in it.`
    );
    return { user, profile: null, tenant: null, error: "TENANT_UNRESOLVED" };
  }

  // ---- Phase 2: the tenant is now known, so re-scope with app.tenant_id ---
  // Every statement below, and every statement the caller runs on ctx.sql,
  // carries BOTH GUCs. Writes are then permitted only where app.tenant_id
  // matches the row's tenant, which is exactly what WITH CHECK enforces.
  //
  // `tenant` is guaranteed non-null by the guard above, so `enforce` is now the
  // only condition: there is no longer a "scoped-but-unset" state to avoid.
  const db = enforce
    ? scopedSql(getAppSql(), { "app.user_id": user.id, "app.tenant_id": tenant.id })
    : sql;

  // First-login department memberships from signup metadata (best-effort;
  // auth must never break on org data).
  if (justCreated && tenant) {
    try {
      const picked = Array.isArray(metadata?.domains) ? metadata.domains.filter((d) => typeof d === "string") : [];
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
  let platformAdmin = null;
  let founder = false;
  let platformLocked = false;
  try {
    // Memberships and the platform-admin flag in ONE statement. Both are keyed
    // on user_id and are needed by every request, so they belong together.
    const [row] = tenant
      ? await db`
          SELECT
            (SELECT json_agg(json_build_object(
                      'department_id', m.department_id,
                      'level', m.level,
                      'core_requested', m.core_requested,
                      'joined_at', m.joined_at,
                      'term_start', m.term_start,
                      'term_end', m.term_end,
                      'slug', d.slug,
                      'name', d.name,
                      'vertical', d.vertical
                    ) ORDER BY d.name)
             FROM department_memberships m JOIN departments d ON d.id = m.department_id
             WHERE m.user_id = ${user.id} AND d.tenant_id = ${tenant.id}
            ) AS memberships,
            EXISTS (SELECT 1 FROM platform_admins pa WHERE pa.user_id = ${user.id}) AS platform_admin,
            COALESCE((SELECT pa.is_founder FROM platform_admins pa WHERE pa.user_id = ${user.id} LIMIT 1), false) AS founder,
            COALESCE((SELECT pa.locked FROM platform_admins pa WHERE pa.user_id = ${user.id} LIMIT 1), false) AS platform_locked
        `
      : [];
    memberships = (row?.memberships ?? []) || [];
    platformAdmin = !!row?.platform_admin;
    founder = !!row?.founder;
    platformLocked = !!row?.platform_locked;
  } catch {
    memberships = [];
    platformAdmin = false;
    founder = false;
    platformLocked = false;
  }

  // A non-founder whose term has ended keeps the historical role value but is
  // governed as a core member until an admin reappoints or extends the term.
  // Founder platform admins never expire.
  const roleTermEnd = profile.role_term_end ?? null;
  const expired = !platformAdmin && isTermExpired(roleTermEnd);
  const effectiveRole = platformAdmin ? "admin" : governingRole({ ...profile, roleTermEnd, isPlatformAdmin: platformAdmin });

  profile = {
    ...profile,
    memberships,
    roleTermEnd,
    termExpired: expired,
    effectiveRole,
    isPlatformAdmin: !!platformAdmin,
    isFounder: founder,
    platformLocked
  };

  // Helper eligibility pool.
  //
  // This used to INSERT available = true for EVERY authenticated request, which
  // silently enrolled every member as a "help helper" with no UI, no notice and
  // no way to opt out — the opt-out endpoint (/api/help/profile) existed but
  // nothing in the app could reach it.
  //
  // It now only refreshes LAST_ACTIVE_AT for members who already opted in, and
  // creates the row as available = false for everyone else. Opting in is an
  // explicit act from /student/help. `available` is what findHelpers() filters
  // on, so a member who never asked to be a helper is never surfaced as one.
  //
  // It is also THROTTLED. This used to be a write on literally every request,
  // purely to bump a timestamp. Under tenant RLS that write costs its own
  // transaction (~288ms measured), so it dominated the cost of loading any
  // page. The pool only cares about "active within 14 days", so once a day is
  // indistinguishable from once a request -- and ~1/1000th of the write volume.
  if (tenant && shouldRefreshHelperProfile(user.id)) {
    try {
      await db`
        INSERT INTO helper_profiles (user_id, tenant_id, available, last_active_at, updated_at)
        VALUES (${user.id}, ${tenant.id}::uuid, false, now(), now())
        ON CONFLICT (user_id) DO UPDATE SET last_active_at=now(), updated_at=now(), tenant_id=EXCLUDED.tenant_id
      `;
    } catch {}
  }

  // Platform admins bypass tenant role checks. Folded into the memberships
  // query above as a subquery rather than issued separately.
  //
  // Under tenant RLS every scoped statement costs its own transaction
  // (BEGIN + set_config + query + COMMIT). Measured against the Supabase
  // pooler that is ~288ms versus ~57ms unscoped, so a query that can ride along
  // with another one is pure latency. Keeping the same result set while
  // removing a round-trip is the difference between a page that loads and one
  // that does not.
  if (adminOnly && !hasRole({ role: effectiveRole }, "admin")) {
    return { user, profile: { ...profile, role: effectiveRole }, tenant, error: "FORBIDDEN" };
  }

  return { user, profile: { ...profile, role: effectiveRole }, tenant, sql: db, isPlatformAdmin: !!platformAdmin, error: null };
}

export const getRequestContext = cache(_getRequestContext);

/**
 * Session identity only (no profile/tenant lookup).
 *
 * Use this where a caller needs "who is signed in" but cannot assume a profile
 * row exists yet -- /setup before the first admin claim, public pages that only
 * want to know whether to show app chrome. Returns the same canonical user_id
 * for either front door (Auth0 or the Supabase fallback), so callers never need
 * to know which one is configured.
 */
export async function getSessionIdentity() {
  return resolveIdentity();
}

export async function writeAudit({ sql, actorId, tenantId, action, resource, resourceId, before = null, after = null }) {
  try {
    // tenant_id goes in the COLUMN (authoritative). It used to live only in
    // metadata, which left all existing rows NULL -- invisible to both the
    // fail-closed RLS policy from 031 and the /admin/audit reader. Readers now
    // filter on the column, so direct inserts (GitHub webhook, claim-first)
    // are visible too. The metadata copy remains for backward compatibility.
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
