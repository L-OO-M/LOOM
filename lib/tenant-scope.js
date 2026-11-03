/**
 * Tenant scope helper — the ONE approved way to build a tenant predicate.
 *
 * Strict (tenant-owned) tables MUST be filtered with plain equality:
 *
 *     WHERE tenant_id = ${scope(tenantId)}::uuid
 *
 * `scope()` deliberately does NOT widen to NULL. The old
 * `(tenant_id = $tid OR $tid IS NULL)` idiom was fail-open: a null/undefined
 * tenant silently matched every chapter. Request handling already fails closed
 * (`getRequestContext` returns TENANT_UNRESOLVED), so a null here is a bug, not
 * a legitimate "all tenants" request.
 *
 * Returning `null` (rather than throwing) is intentional: the generated
 * predicate is `tenant_id = NULL`, which matches zero rows. Callers that can
 * recover should check the tenant themselves; this keeps a missing tenant a
 * closed door instead of a crash mid-render.
 *
 * The only genuinely global catalogue is `open_source_projects`, whose rows are
 * intentionally tenant-less. That table uses `GLOBAL_TABLES` and the RLS policy
 * in migration 031 (`tenant_id IS NULL OR tenant_id = ...`). No other table may
 * keep the NULL arm; `tests/tenant-scoping-gate.test.js` enforces it.
 */

/** Tables whose NULL tenant_id means "global row", not "unknown tenant". */
export const GLOBAL_TABLES = Object.freeze(["open_source_projects"]);

export function scope(tenantId) {
  if (tenantId === undefined || tenantId === "" || tenantId === null) return null;
  return tenantId;
}

export function isGlobalCatalog(table) {
  return GLOBAL_TABLES.includes(table);
}

/**
 * Predicate for a genuinely global catalogue. Only allowed for tables in
 * GLOBAL_TABLES; throws for anything else so the escape hatch cannot be
 * copy-pasted onto a strict table.
 */
export function globalCatalogScope(sql, tenantId, table, column = "tenant_id") {
  if (!isGlobalCatalog(table)) {
    throw new Error(`[scope] ${table} is not a global catalogue; use scope(tenantId)`);
  }
  return sql`(${sql(column)} IS NULL OR ${sql(column)} = ${scope(tenantId)}::uuid)`;
}
