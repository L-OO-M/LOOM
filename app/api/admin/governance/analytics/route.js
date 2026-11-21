import { ok, fail } from "@/lib/api";
import { getRequestContext } from "@/lib/auth-server";
import { outboxHealth } from "@/lib/outbox";

export async function GET() {
  const ctx = await getRequestContext({ adminOnly: true });
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error === "FORBIDDEN") return fail("FORBIDDEN", "Admin access required", 403);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { tenant, sql } = ctx;

  const [approvals] = await sql`
    SELECT
      COUNT(*) FILTER (WHERE status = 'pending')::int AS pending,
      COUNT(*) FILTER (WHERE status = 'approved')::int AS approved,
      COUNT(*) FILTER (WHERE status = 'rejected')::int AS rejected,
      COUNT(*) FILTER (WHERE status = 'pending' AND due_at < now())::int AS overdue,
      COALESCE(AVG(EXTRACT(EPOCH FROM (decided_at - created_at)) / 3600)
        FILTER (WHERE decided_at IS NOT NULL), 0)::numeric(10,2) AS average_decision_hours
    FROM approval_requests WHERE tenant_id = ${tenant.id}::uuid
  `;
  const workflows = await sql`
    SELECT status, COUNT(*)::int AS count
    FROM workflow_instances WHERE tenant_id = ${tenant.id}::uuid
    GROUP BY status ORDER BY status
  `;
  const handoffs = await sql`
    SELECT
      COUNT(*) FILTER (WHERE status IN ('pending', 'ready', 'in_progress', 'submitted', 'returned', 'blocked'))::int AS open,
      COUNT(*) FILTER (WHERE deadline < now() AND status NOT IN ('approved', 'cancelled'))::int AS overdue,
      COUNT(*) FILTER (WHERE status = 'approved')::int AS approved
    FROM workflow_handoffs WHERE tenant_id = ${tenant.id}::uuid
  `;
  const outbox = await outboxHealth(sql, { tenantId: tenant.id });
  return ok({ approvals, workflows, handoffs, outbox });
}
