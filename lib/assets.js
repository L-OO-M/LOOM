/**
 * Creative asset library — read helpers and small pure utilities.
 *
 * All queries take a tenantId and filter on it with plain equality (AGENTS.md
 * tenant rule). The routes call these after a requireCan() gate; nothing here
 * does authorization.
 */

export const ASSET_KINDS = ["logo", "signature", "template", "document", "image", "link", "other"];

/**
 * Accept tags from JSON (array) or a form field (comma/space separated string)
 * and return a clean, de-duplicated, bounded array. Never throws.
 */
export function normalizeTags(value, max = 8) {
  const raw = Array.isArray(value)
    ? value
    : String(value || "").split(/[,\n]/);
  const seen = new Set();
  const out = [];
  for (const item of raw) {
    const tag = String(item).trim().slice(0, 30);
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
    if (out.length >= max) break;
  }
  return out;
}

export function listCategories(sql, tenantId) {
  return sql`
    SELECT id, name, slug, sort_order
    FROM asset_categories
    WHERE tenant_id = ${tenantId}::uuid
    ORDER BY sort_order, name
  `;
}

export function listAssets(sql, { tenantId, categoryId = null, kind = null, q = "" }) {
  const term = `%${String(q).trim()}%`;
  const text = String(q).trim();
  return sql`
    SELECT a.id, a.title, a.description, a.kind, a.tags, a.storage_path, a.external_url,
           a.mime_type, a.size_bytes, a.current_version, a.category_id, a.created_at,
           c.name AS category_name, c.slug AS category_slug, p.name AS created_by_name
    FROM media_assets a
    LEFT JOIN asset_categories c ON c.id = a.category_id
    LEFT JOIN profiles p ON p.user_id = a.created_by
    WHERE a.tenant_id = ${tenantId}::uuid AND a.is_active
      AND (${categoryId}::uuid IS NULL OR a.category_id = ${categoryId}::uuid)
      AND (${kind}::text IS NULL OR a.kind = ${kind}::text)
      AND (${text} = '' OR a.title ILIKE ${term} OR a.description ILIKE ${term})
    ORDER BY a.created_at DESC
    LIMIT 200
  `;
}

export async function getAsset(sql, { tenantId, id }) {
  const [asset] = await sql`
    SELECT * FROM media_assets
    WHERE id = ${id}::uuid AND tenant_id = ${tenantId}::uuid
    LIMIT 1
  `;
  if (!asset) return null;
  const versions = await sql`
    SELECT v.id, v.version, v.file_name, v.mime_type, v.size_bytes, v.uploaded_by, v.created_at,
           p.name AS uploaded_by_name
    FROM asset_versions v
    LEFT JOIN profiles p ON p.user_id = v.uploaded_by
    WHERE v.asset_id = ${id}::uuid AND v.tenant_id = ${tenantId}::uuid
    ORDER BY v.version DESC
  `;
  return { ...asset, versions };
}

/** True when the category id is one of the tenant's own categories. */
export async function categoryBelongsToTenant(sql, tenantId, categoryId) {
  if (!categoryId) return true;
  const [row] = await sql`
    SELECT id FROM asset_categories
    WHERE id = ${categoryId}::uuid AND tenant_id = ${tenantId}::uuid
    LIMIT 1
  `;
  return !!row;
}
