import { ok, fail } from "@/lib/api";
import { getRequestContext } from "@/lib/auth-server";

// Authed federation view: every public chapter + my chapter + partnerships.
export async function GET() {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { tenant, sql } = ctx;
  const chapters = await sql`
    SELECT c.*, t.name AS tenant_name,
           (SELECT COUNT(*)::int FROM profiles p WHERE p.tenant_id = c.tenant_id) AS members,
           (SELECT COUNT(*)::int FROM student_oss_contributions o WHERE o.tenant_id = c.tenant_id AND o.status = 'verified') AS oss_merges,
           (SELECT COUNT(*)::int FROM projects pr WHERE pr.tenant_id = c.tenant_id) AS projects
    FROM chapter_profiles c
    JOIN tenants t ON t.id = c.tenant_id
    WHERE c.is_public = true
    ORDER BY members DESC
    LIMIT 50
  `;
  const partnerships = tenant ? await sql`
    SELECT p.*, ta.slug AS a_slug, tb.slug AS b_slug,
           ca.public_name AS a_name, cb.public_name AS b_name
    FROM chapter_partnerships p
    JOIN chapter_profiles ca ON ca.tenant_id = p.tenant_a_id
    JOIN chapter_profiles cb ON cb.tenant_id = p.tenant_b_id
    JOIN tenants ta ON ta.id = p.tenant_a_id
    JOIN tenants tb ON tb.id = p.tenant_b_id
    WHERE (p.tenant_a_id = ${tenant.id} OR p.tenant_b_id = ${tenant.id}) AND p.status = 'active'
    LIMIT 20
  ` : [];
  const [latest] = await sql`SELECT * FROM federation_metrics ORDER BY metric_date DESC LIMIT 1`;
  return ok({ chapters, partnerships, myTenantId: tenant?.id ?? null, latestMetrics: latest || null });
}
