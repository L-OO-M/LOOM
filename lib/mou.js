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
export const MOU_EXPIRING_DAYS = 30;

export function listMous(sql, { tenantId, status = null, expiring = false, q = "" }) {
  const term = `%${String(q).trim()}%`;
  const text = String(q).trim();
  return sql`
    SELECT m.id, m.title, m.partner_name, m.partner_type, m.status, m.vertical,
           m.value_amount, m.value_currency, m.signed_on, m.starts_on, m.ends_on,
           m.owner_id, m.is_active, m.created_at, m.updated_at,
           p.name AS owner_name,
           (SELECT count(*)::int FROM mou_documents d
             WHERE d.mou_id = m.id AND d.tenant_id = m.tenant_id) AS document_count
    FROM mous m
    LEFT JOIN profiles p ON p.user_id = m.owner_id
    WHERE m.tenant_id = ${tenantId}::uuid AND m.is_active
      AND (${status}::text IS NULL OR m.status = ${status}::text)
      AND (${expiring}::boolean = false OR (
        m.status = 'active' AND m.ends_on IS NOT NULL
        AND m.ends_on <= (CURRENT_DATE + (${MOU_EXPIRING_DAYS}::int * INTERVAL '1 day'))
      ))
      AND (${text} = '' OR m.title ILIKE ${term} OR m.partner_name ILIKE ${term})
    ORDER BY (m.ends_on IS NULL), m.ends_on, m.created_at DESC
    LIMIT 200
  `;
}

export async function getMou(sql, { tenantId, id }) {
  const [mou] = await sql`
    SELECT m.*, p.name AS owner_name
    FROM mous m
    LEFT JOIN profiles p ON p.user_id = m.owner_id
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
  return { ...mou, documents };
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
