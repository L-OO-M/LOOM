import { getSql } from "@/lib/db";
import { absoluteUrl, defaultTenantSlug } from "@/lib/seo";

export const revalidate = 3600;

// Real last-edit time for the hand-written pages. Emitting `new Date()` on
// every regeneration told crawlers static copy changed daily; it never does.
const STATIC_PAGES_MODIFIED = new Date("2026-10-15T00:00:00Z");

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
  } catch {
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
        AND p.tenant_id = ${tenantId}::uuid
      ORDER BY up.updated_at DESC LIMIT 500`;
    return rows;
  } catch {
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
  } catch {
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
      WHERE tenant_id = ${tenantId}::uuid AND revoked_at IS NULL
      ORDER BY issued_at DESC LIMIT 500`;
    return rows;
  } catch {
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
      WHERE status IN ('upcoming', 'live')
        AND tenant_id = ${tenantId}::uuid
      ORDER BY starts_at ASC LIMIT 200`;
    return rows;
  } catch {
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
  } catch { /* fall back to null: helpers then match any tenant */ }

  const pages = [
    { path: "/", priority: 1.0, changeFrequency: "daily" },
    { path: "/about", priority: 0.8, changeFrequency: "monthly" },
    { path: "/events", priority: 0.9, changeFrequency: "daily" },
    { path: "/domains", priority: 0.8, changeFrequency: "weekly" },
    { path: "/faq", priority: 0.7, changeFrequency: "monthly" },
    { path: "/privacy", priority: 0.4, changeFrequency: "yearly" },
    { path: "/terms", priority: 0.4, changeFrequency: "yearly" },
    { path: "/contact", priority: 0.4, changeFrequency: "yearly" }
  ];
  const entries = pages.map((p) => ({
    url: absoluteUrl(p.path),
    // Not `now`. lastModified on every regeneration told crawlers these pages
    // changed daily when they never do, which is a fabricated freshness signal.
    lastModified: STATIC_PAGES_MODIFIED,
    changeFrequency: p.changeFrequency,
    priority: p.priority
  }));
  for (const slug of await activeDepartmentSlugs()) {
    entries.push({
      url: absoluteUrl(`/domains/${slug}`),
      lastModified: STATIC_PAGES_MODIFIED,
      changeFrequency: "weekly",
      priority: 0.7
    });
  }
  // Fail closed. The helpers used to accept a null tenant and match every
  // chapter, so a transient lookup failure advertised the whole federation.
  if (!tenantId) return entries;
  for (const u of await publicUsernames(tenantId)) {
    entries.push({
      url: absoluteUrl(`/u/${u.username}`),
      lastModified: u.updated_at || now,
      changeFrequency: "weekly",
      priority: 0.6
    });
  }
  for (const ev of await publicEventIds(tenantId)) {
    entries.push({
      url: absoluteUrl(`/events/${ev.id}`),
      lastModified: ev.starts_at || now,
      changeFrequency: "daily",
      priority: 0.7
    });
  }
  for (const c of await publicCredentialIds(tenantId)) {
    entries.push({
      url: absoluteUrl(`/verify/credential/${c.id}`),
      lastModified: c.issued_at || now,
      changeFrequency: "monthly",
      priority: 0.4
    });
  }
  for (const c of await publicCertificateCodes(tenantId)) {
    entries.push({
      url: absoluteUrl(`/verify/certificate/${c.verification_code}`),
      lastModified: c.issued_at || now,
      changeFrequency: "monthly",
      priority: 0.4
    });
  }
  return entries;
}
