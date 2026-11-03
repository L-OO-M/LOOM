// Append-only history for department reports.
//
// `dept_reports` holds the live row; this table holds every version that was
// written. The revision number is computed in the same statement as the insert
// so two writers cannot both claim `n + 1`: the unique `(report_id, revision)`
// index turns the race into an error instead of a silently rewritten version.
import { scope } from "@/lib/tenant-scope";

export async function recordReportRevision({ sql, report, actorId }) {
  if (!report?.id) throw new Error("recordReportRevision: report.id is required");
  const [row] = await sql`
    INSERT INTO report_revisions (report_id, tenant_id, revision, status, draft, actor_id)
    SELECT
      ${report.id},
      ${report.tenant_id ?? null},
      COALESCE(MAX(revision), 0) + 1,
      ${report.status},
      ${sql.json(report.draft ?? {})},
      ${actorId ?? null}
    FROM report_revisions
    WHERE report_id = ${report.id}
    RETURNING revision, status, actor_id, created_at
  `;
  return row;
}

export async function listReportRevisions({ sql, reportId, tenantId, limit = 25 }) {
  return sql`
    SELECT revision, status, actor_id, created_at
    FROM report_revisions
    WHERE report_id = ${reportId}
      AND tenant_id = ${scope(tenantId)}::uuid
    ORDER BY revision DESC
    LIMIT ${limit}
  `;
}
