/**
 * Leadership directory — read helpers.
 *
 * The chapter's own roster of leads and heads, including past tenure holders.
 * Queries take a tenantId and filter on it with plain equality (AGENTS.md
 * tenant rule); routes call these after a requireCan() gate.
 */

export function listDirectory(sql, { tenantId, departmentId = null, vertical = null, current = false, q = "" }) {
  const term = `%${String(q).trim()}%`;
  const text = String(q).trim();
  return sql`
    SELECT d.id, d.user_id, d.name, d.title, d.department_id, d.vertical, d.email,
           d.linkedin_url, d.photo_url, d.bio, d.tenure_start, d.tenure_end, d.is_current, d.sort_order,
           d.created_at, d.updated_at,
           dept.name AS department_name,
           p.role AS account_role, up.avatar_url AS account_avatar
    FROM lead_directory d
    LEFT JOIN departments dept ON dept.id = d.department_id
    LEFT JOIN profiles p ON p.user_id = d.user_id
    LEFT JOIN user_profiles up ON up.user_id = d.user_id
    WHERE d.tenant_id = ${tenantId}::uuid AND d.is_active
      AND (${departmentId}::uuid IS NULL OR d.department_id = ${departmentId}::uuid)
      AND (${vertical}::text IS NULL OR d.vertical = ${vertical}::text)
      AND (${current}::boolean = false OR d.is_current = true)
      AND (${text} = '' OR d.name ILIKE ${term} OR d.title ILIKE ${term})
    ORDER BY d.is_current DESC, d.sort_order, d.name
    LIMIT 300
  `;
}

export async function getEntry(sql, { tenantId, id }) {
  const [entry] = await sql`
    SELECT d.*, dept.name AS department_name, p.role AS account_role, up.avatar_url AS account_avatar
    FROM lead_directory d
    LEFT JOIN departments dept ON dept.id = d.department_id
    LEFT JOIN profiles p ON p.user_id = d.user_id
    LEFT JOIN user_profiles up ON up.user_id = d.user_id
    WHERE d.id = ${id}::uuid AND d.tenant_id = ${tenantId}::uuid
    LIMIT 1
  `;
  return entry || null;
}
