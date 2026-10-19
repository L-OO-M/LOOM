// Feature flags — the one place that answers "is this feature on?".
//
// Convention (already established by `isGithubEnabled` in lib/github.js):
// a per-chapter row in `feature_flags`, toggled by an admin at /admin/flags,
// read with a fail-closed helper. Missing row, missing table, or any error
// means OFF. Zen Mode follows the same rule and the same shape.
//
// Why a flag at all: Zen Learning Mode changes how a student opens a resource
// (overlay instead of the browser's own tab), which is a product decision, not
// a bug fix. It must therefore be opt-in per chapter and safe to turn off for
// everyone without a code change or a redeploy.
//
// The value is read on the server and passed down as a prop. It is never
// re-read on the client, so the server HTML and the hydrated tree always agree
// — no hydration mismatch, and no way for the two halves to disagree about
// whether the overlay may open.

export const ZEN_MODE_FLAG = "zen_mode";

/**
 * Fail-closed flag reader. Returns true only for an explicit, persisted
 * `enabled = true` row for this chapter.
 *
 * Development is the one exception: `next dev` serves the feature so it can be
 * worked on locally without writing to the shared flag. Everywhere else --
 * production included -- follows the persisted row and stays OFF by default.
 */
export async function isZenModeEnabled(sql, tenantId) {
  if (process.env.NODE_ENV === "development") return true;
  if (!sql || !tenantId) return false;
  try {
    const [row] = await sql`
      SELECT enabled FROM feature_flags
      WHERE tenant_id = ${tenantId} AND key = ${ZEN_MODE_FLAG} LIMIT 1
    `;
    return row?.enabled === true;
  } catch {
    // No feature_flags table, no connection, no row — either way: OFF.
    return false;
  }
}