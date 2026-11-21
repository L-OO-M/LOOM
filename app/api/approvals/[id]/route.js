import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { getRequestContext } from "@/lib/auth-server";
import { isAdmin } from "@/lib/permissions";
import {
  decideApproval,
  finalizeApprovalResource,
  supportsApprovalResource
} from "@/lib/approvals";

const decisionSchema = z.object({
  decision: z.enum(["approved", "rejected", "exception_approved"]),
  reason: z.string().min(3).max(1000).nullable().optional()
});

export async function GET(request, { params }) {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { id } = await params;
  const { user, profile, tenant, sql } = ctx;
  const [approval] = await sql`
    SELECT * FROM approval_requests
    WHERE id = ${id}::uuid AND tenant_id = ${tenant.id}::uuid
    LIMIT 1
  `;
  if (!approval) return fail("NOT_FOUND", "Approval request not found", 404);
  if (approval.requested_by !== user.id && !isAdmin({ role: profile.role })) {
    return fail("FORBIDDEN", "Only the requester or an admin can view this approval", 403);
  }
  const decisions = await sql`
    SELECT approver_id, decision, reason, created_at
    FROM approval_decisions
    WHERE approval_request_id = ${approval.id} AND tenant_id = ${tenant.id}::uuid
    ORDER BY created_at ASC
  `;
  return ok({ approval, decisions });
}

export async function POST(request, { params }) {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { id } = await params;
  const { user, profile, tenant, sql } = ctx;
  if (!isAdmin({ role: profile.role })) {
    return fail("FORBIDDEN", "Only an authorized independent approver can decide this request", 403);
  }
  let body;
  try {
    body = decisionSchema.parse(await request.json());
  } catch (error) {
    return validationError(error);
  }
  const [approval] = await sql`
    SELECT id, resource_type FROM approval_requests
    WHERE id = ${id}::uuid AND tenant_id = ${tenant.id}::uuid
    LIMIT 1
  `;
  if (!approval) return fail("NOT_FOUND", "Approval request not found", 404);
  if (!supportsApprovalResource(approval.resource_type)) {
    return fail(
      "UNSUPPORTED_APPROVAL_RESOURCE",
      "This approval must be decided through its owning workflow",
      409
    );
  }
  const result = await decideApproval({
    sql,
    tenantId: tenant.id,
    requestId: id,
    actorId: user.id,
    actorRole: profile.role,
    decision: body.decision,
    reason: body.reason || null,
    authorizationContext: { source: "approval_api" },
    onFinal: (tx, { request: finalRequest, status }) => finalizeApprovalResource(tx, {
      request: finalRequest,
      status,
      actorId: user.id
    })
  });
  if (!result.ok) {
    const status = result.reason === "NOT_FOUND" ? 404
      : result.reason === "ALREADY_DECIDED" || result.reason === "DUPLICATE_APPROVER" ? 409
      : 403;
    return fail(result.reason, result.reason.replaceAll("_", " ").toLowerCase(), status);
  }
  return ok(result);
}
