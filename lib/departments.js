import { getSql } from "@/lib/db";

/**
 * The public department directory: active departments with the names and photos
 * of their head and co-head. Photos prefer the lead directory row (the profile
 * they chose for public leadership) and fall back to their account photo.
 *
 * One query for all four surfaces that publish this list — /about, /domains,
 * /domains/[slug], and GET /api/public/departments.
 *
 * `tenantId: null` keeps the marketing pages working on an unresolved host by
 * listing every active chapter. Pass a slug to select one department.
 */
export async function listPublicDepartments(sql = getSql(), { tenantId = null, slug = null, withUpcoming = false } = {}) {
  const tid = tenantId ?? null;
  const rows = await sql`
    SELECT d.id, d.name, d.slug, d.vertical, d.description,
           hp.name AS head_name, cp.name AS co_head_name,
           COALESCE(hd.photo_url, hup.avatar_url) AS head_avatar,
           COALESCE(cd.photo_url, cup.avatar_url) AS co_head_avatar,
           (SELECT COUNT(*)::int FROM department_memberships m WHERE m.department_id = d.id) AS members,
           ${withUpcoming
             ? sql`(SELECT COUNT(*)::int FROM events e WHERE e.department_id = d.id AND e.starts_at >= NOW() AND e.status <> 'cancelled')`
             : sql`0`} AS upcoming
    FROM departments d
    LEFT JOIN profiles hp ON hp.user_id = d.head_user_id
    LEFT JOIN profiles cp ON cp.user_id = d.co_head_user_id
    LEFT JOIN user_profiles hup ON hup.user_id = d.head_user_id
    LEFT JOIN user_profiles cup ON cup.user_id = d.co_head_user_id
    LEFT JOIN LATERAL (
      SELECT ld.photo_url FROM lead_directory ld
      WHERE ld.user_id = d.head_user_id AND ld.tenant_id = d.tenant_id AND ld.is_active AND ld.photo_url IS NOT NULL
      ORDER BY ld.is_current DESC, ld.sort_order LIMIT 1
    ) hd ON true
    LEFT JOIN LATERAL (
      SELECT ld.photo_url FROM lead_directory ld
      WHERE ld.user_id = d.co_head_user_id AND ld.tenant_id = d.tenant_id AND ld.is_active AND ld.photo_url IS NOT NULL
      ORDER BY ld.is_current DESC, ld.sort_order LIMIT 1
    ) cd ON true
    WHERE (d.tenant_id = ${tid}::uuid OR ${tid}::uuid IS NULL)
      AND d.is_active
      ${slug ? sql`AND d.slug = ${slug}` : sql``}
    ORDER BY d.vertical, d.name
  `;
  return rows;
}
