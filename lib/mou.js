/**
 * MoU database — read helpers and constants.
 *
 * Every query takes a tenantId and filters on it with plain equality (AGENTS.md
 * tenant rule). Routes call these after a requireCan() gate; nothing here does
 * authorization. Document bytes live in Supabase Storage; these rows are
 * metadata only.
 */

export const MOU_PARTNER_TYPES = ["sponsor", "company", "college", "community", "government", "other"];
export const MOU_STATUSES = ["draft", "sent", "active", "expired", "terminated"];
export const MOU_EXPIRING_DAYS = Number(process.env.MOU_RENEWAL_WINDOW_DAYS) > 0
  ? Number(process.env.MOU_RENEWAL_WINDOW_DAYS)
  : 30;

export function listMous(sql, { tenantId, status = null, expiring = false, q = "", vertical = null }) {
  const term = `%${String(q).trim()}%`;
  const text = String(q).trim();
  return sql`
    SELECT m.id, m.title, m.partner_name, m.partner_type, m.status, m.vertical,
           m.value_amount, m.value_currency, m.signed_on, m.starts_on, m.ends_on,
           m.owner_id, m.sponsorship_id, m.is_active, m.created_at, m.updated_at,
           p.name AS owner_name,
           s.name AS sponsor_name,
           (SELECT count(*)::int FROM mou_documents d
             WHERE d.mou_id = m.id AND d.tenant_id = m.tenant_id) AS document_count,
           (SELECT row_to_json(t) FROM (
              SELECT id, owner_id, next_action, due_on, status, created_at
              FROM mou_renewal_tasks
              WHERE mou_id = m.id AND tenant_id = m.tenant_id AND status = 'open'
              LIMIT 1
            ) t) AS renewal_task
    FROM mous m
    LEFT JOIN profiles p ON p.user_id = m.owner_id
    LEFT JOIN sponsorships s ON s.id = m.sponsorship_id AND s.tenant_id = m.tenant_id
    WHERE m.tenant_id = ${tenantId}::uuid AND m.is_active
      AND (${status}::text IS NULL OR m.status = ${status}::text)
      AND (${expiring}::boolean = false OR (
        m.status = 'active' AND m.ends_on IS NOT NULL
        AND m.ends_on <= (CURRENT_DATE + (${MOU_EXPIRING_DAYS}::int * INTERVAL '1 day'))
      ))
      AND (${text} = '' OR m.title ILIKE ${term} OR m.partner_name ILIKE ${term})
      AND (${vertical}::text IS NULL OR ${vertical}::text = '' OR m.vertical = ${vertical}::text)
    ORDER BY (m.ends_on IS NULL), m.ends_on, m.created_at DESC
    LIMIT 200
  `;
}

export async function listRenewals(sql, { tenantId, vertical = null }) {
  return sql`
    SELECT t.id, t.mou_id, t.owner_id, t.next_action, t.due_on, t.status,
           t.created_at, t.closed_by, t.closed_at,
           m.title AS mou_title, m.partner_name, m.ends_on, m.vertical,
           p.name AS owner_name, s.name AS sponsor_name
    FROM mou_renewal_tasks t
    JOIN mous m ON m.id = t.mou_id AND m.tenant_id = t.tenant_id
    LEFT JOIN profiles p ON p.user_id = t.owner_id
    LEFT JOIN sponsorships s ON s.id = m.sponsorship_id AND s.tenant_id = m.tenant_id
    WHERE t.tenant_id = ${tenantId}::uuid AND t.status = 'open' AND m.is_active
      AND (${vertical}::text IS NULL OR ${vertical}::text = '' OR m.vertical = ${vertical}::text)
    ORDER BY (t.due_on IS NULL), t.due_on, m.ends_on NULLS LAST
    LIMIT 200
  `;
}

export async function getMou(sql, { tenantId, id }) {
  const [mou] = await sql`
    SELECT m.*, p.name AS owner_name, s.name AS sponsor_name
    FROM mous m
    LEFT JOIN profiles p ON p.user_id = m.owner_id
    LEFT JOIN sponsorships s ON s.id = m.sponsorship_id AND s.tenant_id = m.tenant_id
    WHERE m.id = ${id}::uuid AND m.tenant_id = ${tenantId}::uuid
    LIMIT 1
  `;
  if (!mou) return null;
  const documents = await sql`
    SELECT d.id, d.label, d.version, d.file_name, d.mime_type, d.size_bytes,
           d.uploaded_by, d.created_at, p.name AS uploaded_by_name
    FROM mou_documents d
    LEFT JOIN profiles p ON p.user_id = d.uploaded_by
    WHERE d.mou_id = ${id}::uuid AND d.tenant_id = ${tenantId}::uuid
    ORDER BY d.label, d.version DESC
  `;
  const renewal_tasks = await sql`
    SELECT t.*, p.name AS owner_name, c.name AS closed_by_name
    FROM mou_renewal_tasks t
    LEFT JOIN profiles p ON p.user_id = t.owner_id
    LEFT JOIN profiles c ON c.user_id = t.closed_by
    WHERE t.mou_id = ${id}::uuid AND t.tenant_id = ${tenantId}::uuid
    ORDER BY t.created_at DESC
  `;
  return { ...mou, documents, renewal_tasks };
}

/** Next version number for a labelled document on this MoU (labels version independently). */
export async function nextDocumentVersion(sql, { tenantId, mouId, label }) {
  const [row] = await sql`
    SELECT COALESCE(MAX(version), 0) + 1 AS next
    FROM mou_documents
    WHERE tenant_id = ${tenantId}::uuid AND mou_id = ${mouId}::uuid AND label = ${label}
  `;
  return Number(row?.next || 1);
}
