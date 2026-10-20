import { ok } from "@/lib/api";
import { aeoSummary } from "@/lib/aeo";
import { getSql } from "@/lib/db";
import { getTenantFromRequest } from "@/lib/tenant";

// Public, aggregate-only facts for answer engines.
//
// Why this exists: an assistant answering "how big is this chapter?" should be
// able to read a number instead of inferring one. Everything returned here is
// either static product copy (lib/aeo.js) or a COUNT over rows that are already
// public. No names, usernames, emails, or per-member rows.
export const dynamic = "force-dynamic";

export async function GET(request) {
  let tenant = null;
  try {
    tenant = await getTenantFromRequest(request);
  } catch {
    tenant = null;
  }
  const tid = tenant?.id ?? null;

  const about = aeoSummary();
  if (!tid) {
    // Tenant resolution failed even after the configured fallback. Return the
    // static copy and no counts rather than widening to every chapter.
    return ok(
      { about, chapter: null, counts: null, generatedAt: new Date().toISOString() },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  const sql = getSql();
  let counts = { departments: 0, upcomingEvents: 0, publicBuilders: 0, projects: 0 };
  try {
    const [row] = await sql`
      SELECT
        (SELECT COUNT(*)::int FROM departments d
          WHERE d.tenant_id = ${tid}::uuid AND d.is_active) AS departments,
        (SELECT COUNT(*)::int FROM events e
          WHERE e.tenant_id = ${tid}::uuid
            AND e.status IN ('upcoming', 'live')
            AND e.starts_at >= NOW() - INTERVAL '2 hours') AS upcoming_events,
        (SELECT COUNT(*)::int FROM user_profiles up
          WHERE up.tenant_id = ${tid}::uuid AND up.is_public) AS public_builders,
        (SELECT COUNT(*)::int FROM projects p
          JOIN user_profiles up ON up.user_id = p.owner_id AND up.tenant_id = p.tenant_id
          WHERE p.tenant_id = ${tid}::uuid AND up.is_public) AS projects
    `;
    counts = {
      departments: Number(row?.departments ?? 0),
      upcomingEvents: Number(row?.upcoming_events ?? 0),
      publicBuilders: Number(row?.public_builders ?? 0),
      projects: Number(row?.projects ?? 0),
    };
  } catch {
    // A schema hiccup must not turn a public read into a 500. Zeroes are honest
    // here only because the about copy explains that a chapter may have nothing
    // published yet.
    counts = { departments: 0, upcomingEvents: 0, publicBuilders: 0, projects: 0 };
  }

  return ok(
    {
      about,
      chapter: { name: tenant.name, slug: tenant.slug },
      counts,
      generatedAt: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "public, max-age=60, s-maxage=300" } }
  );
}
