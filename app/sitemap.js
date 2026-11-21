import { getSql } from "@/lib/db";
import { absoluteUrl, defaultTenantSlug } from "@/lib/seo";
import { createLogger } from "@/lib/log";
import { POLICY_VERSIONS } from "@/lib/legal";

// debug: this also runs during `next build` and on every revalidation. A
// missing/inactive table is normal early in a deployment, so it stays quiet
// unless LOG_LEVEL=debug asks for it.
const log = createLogger("sitemap");

export const revalidate = 3600;

// Real last-edit date of each hand-written page, from the commit that last
// changed its source. A single shared constant for every route was the
// "default date" pattern: Google learns it is not page-specific and ignores it,
// which costs the one signal a sitemap can still give it for these routes.
const STATIC_PAGES = Object.freeze([
  { path: "/", modified: "2026-10-23" },
  { path: "/about", modified: "2026-11-03" },
  { path: "/events", modified: "2026-10-26" },
  { path: "/domains", modified: "2026-11-03" },
  { path: "/faq", modified: "2026-11-03" },
  { path: "/contact", modified: "2026-11-03" }
]);

// A legal page's last significant change is its policy version, so bumping
// POLICY_VERSIONS updates this file in the same commit as the policy text.
const LEGAL_PAGES = Object.freeze([
  { path: "/privacy", policy: "privacy" },
  { path: "/cookies", policy: "cookies" },
  { path: "/terms", policy: "terms" },
  { path: "/disclaimer", policy: "disclaimer" }
]);

function utcDate(value) {
  return new Date(`${value}T00:00:00Z`);
}

async function activeDepartmentSlugs() {
  try {
    const sql = getSql();
    const rows = await sql`
      SELECT d.slug FROM departments d
      JOIN tenants t ON t.id = d.tenant_id
      WHERE t.slug = ${defaultTenantSlug()} AND d.is_active
      ORDER BY d.slug ASC
    `;
    return rows.map((r) => r.slug);
  } catch (err) {
    log.debug("active department slugs unavailable; omitting domain pages", { err });
    return [];
  }
}

async function publicUsernames(tenantId) {
  try {
    const sql = getSql();
    // Scoped to the chapter. Without this the sitemap advertised every
    // college's public profiles on every college's deployment.
    const rows = await sql`
      SELECT up.username, up.updated_at
      FROM user_profiles up
      JOIN profiles p ON p.user_id = up.user_id
      WHERE up.is_public = true
        AND COALESCE(p.passport_privacy->>'visibility', 'chapter') = 'public'
        AND p.tenant_id = ${tenantId}::uuid
      ORDER BY up.updated_at DESC LIMIT 500`;
    return rows;
  } catch (err) {
    log.debug("public usernames unavailable; omitting /u pages", { err });
    return [];
  }
}

// Credential verification pages are indexable and robots-allowed, but had no
// sitemap family -- reachable only by link, and links to them sit behind auth.
async function publicCredentialIds(tenantId) {
  try {
    const sql = getSql();
    const rows = await sql`
      SELECT id, issued_at FROM verifiable_credentials
      WHERE tenant_id = ${tenantId}::uuid
      ORDER BY issued_at DESC LIMIT 500`;
    return rows;
  } catch (err) {
    log.debug("public credential ids unavailable; omitting verify pages", { err });
    return [];
  }
}

// Public certificate pages are indexable like credential pages. Revoked
// certificates stay out: advertising a page that says "revoked" wastes a crawl
// and tells the holder the opposite of what the sitemap implies.
async function publicCertificateCodes(tenantId) {
  try {
    const sql = getSql();
    const rows = await sql`
      SELECT verification_code, issued_at FROM certificates
      WHERE tenant_id = ${tenantId}::uuid
        AND revoked_at IS NULL
        AND (expires_at IS NULL OR expires_at > NOW())
      ORDER BY issued_at DESC LIMIT 500`;
    return rows;
  } catch (err) {
    log.debug("public certificates unavailable; omitting verify pages", { err });
    return [];
  }
}

// Public event detail pages are indexable — each one is a real dated page with
// its own description. Only published/upcoming events, never drafts.
async function publicEventIds(tenantId) {
  try {
    const sql = getSql();
    const rows = await sql`
      SELECT id, starts_at FROM events
      WHERE status IN ('published', 'registration_closed', 'live', 'upcoming')
        AND tenant_id = ${tenantId}::uuid
      ORDER BY starts_at ASC LIMIT 200`;
    return rows;
  } catch (err) {
    log.debug("public event ids unavailable; omitting event pages", { err });
    return [];
  }
}

export default async function sitemap() {
  const now = new Date();
  // Resolve one tenant id and use it for every DB-derived family. Previously
  // each helper queried independently, and two of them had no tenant predicate
  // at all.
  let tenantId = null;
  try {
    const sql = getSql();
    const [t] = await sql`SELECT id FROM tenants WHERE slug = ${defaultTenantSlug()} LIMIT 1`;
    tenantId = t?.id ?? null;
  } catch (err) { /* fall back to null: helpers then match any tenant */
    log.debug("tenant id lookup failed; sitemap omits db-derived pages", { err });
  }

  const entries = STATIC_PAGES.map((p) => ({
    url: absoluteUrl(p.path),
    lastModified: utcDate(p.modified)
  }));
  for (const p of LEGAL_PAGES) {
    entries.push({
      url: absoluteUrl(p.path),
      lastModified: utcDate(POLICY_VERSIONS[p.policy])
    });
  }
  for (const slug of await activeDepartmentSlugs()) {
    // The department row is the page's source, but it has no updated_at and its
    // events and projects add their own dated entries below. Omitting lastmod is
    // honest; reusing a shared date here would fabricate one.
    entries.push({ url: absoluteUrl(`/domains/${slug}`) });
  }
  // Fail closed. The helpers used to accept a null tenant and match every
  // chapter, so a transient lookup failure advertised the whole federation.
  if (!tenantId) return entries;
  for (const u of await publicUsernames(tenantId)) {
    entries.push({
      url: absoluteUrl(`/u/${u.username}`),
      lastModified: u.updated_at || now
    });
  }
  for (const ev of await publicEventIds(tenantId)) {
    entries.push({
      url: absoluteUrl(`/events/${ev.id}`),
      lastModified: ev.starts_at || now
    });
  }
  for (const c of await publicCredentialIds(tenantId)) {
    entries.push({
      url: absoluteUrl(`/verify/credential/${c.id}`),
      lastModified: c.issued_at || now
    });
  }
  for (const c of await publicCertificateCodes(tenantId)) {
    entries.push({
      url: absoluteUrl(`/verify/certificate/${c.verification_code}`),
      lastModified: c.issued_at || now
    });
  }
  return entries;
}
