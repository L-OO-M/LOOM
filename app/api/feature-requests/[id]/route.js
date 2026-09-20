import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { getRequestContext, writeAudit, notify } from "@/lib/auth-server";

const patchSchema = z.object({
  status: z.enum(["pending", "needs_info", "approved", "rejected", "in_progress", "built"]).optional(),
  decision_note: z.string().max(1000).nullable().optional(),
  assigned_to: z.string().nullable().optional(),
});

export async function GET(request, { params }) {
  const ctx = await getRequestContext();
  if (ctx.error) return fail(ctx.error, "Auth required", 401);
  const { id } = await params;
  const { tenant, sql } = ctx;
  const [row] = await sql`SELECT fr.*, p.name AS requester_name FROM feature_requests fr LEFT JOIN profiles p ON p.user_id = fr.requester_id WHERE fr.id = ${id}::uuid AND (fr.tenant_id = ${tenant?.id ?? null}::uuid OR ${tenant?.id ?? null}::uuid IS NULL) LIMIT 1`;
  if (!row) return fail("NOT_FOUND", "Not found", 404);
  const comments = await sql`SELECT c.*, p.name AS author_name FROM feature_request_comments c LEFT JOIN profiles p ON p.user_id = c.author_id WHERE c.request_id = ${id}::uuid ORDER BY c.created_at ASC`;
  return ok({ request: row, comments });
}

export async function PATCH(request, { params }) {
  const ctx = await getRequestContext();
  if (ctx.error) return fail(ctx.error, "Auth required", 401);
  if (ctx.profile?.role !== "admin") return fail("FORBIDDEN", "Admin only", 403);
  const { id } = await params;
  const { user, tenant, sql } = ctx;
  let body;
  try { body = patchSchema.parse(await request.json()); } catch (e) { return validationError(e); }
  const [existing] = await sql`SELECT * FROM feature_requests WHERE id = ${id}::uuid AND (tenant_id = ${tenant?.id ?? null}::uuid OR ${tenant?.id ?? null}::uuid IS NULL) LIMIT 1`;
  if (!existing) return fail("NOT_FOUND", "Not found", 404);
  const status = body.status ?? existing.status;
  const note = body.decision_note !== undefined ? body.decision_note : existing.decision_note;
  const assigned = body.assigned_to !== undefined ? body.assigned_to : existing.assigned_to;
  // If approving with assigned_to = requester, user builds it themselves
  const [updated] = await sql`
    UPDATE feature_requests SET status = ${status}, decision_note = ${note}, assigned_to = ${assigned}, decided_by = ${user.id}, updated_at = NOW()
    WHERE id = ${id}::uuid RETURNING *
  `;
  await writeAudit({ sql, actorId: user.id, tenantId: tenant?.id, action: `feature_request_${status}`, resource: "feature_request", resourceId: id, after: { status, assigned_to: assigned } });
  await notify({ sql, tenantId: tenant?.id, userId: existing.requester_id, type: "feature_request", title: `Your idea "${existing.title}" is now ${status}`, body: note || "", link: `/student/feature-requests` });
  return ok({ request: updated });
}
