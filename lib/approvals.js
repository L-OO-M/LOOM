// Shared approval infrastructure for events, tasks, assets, finance and handovers.
// State changes and their decision rows always share one transaction.

export function approvalRequirement(settings, { resourceType, amount = 0 } = {}) {
  if (resourceType === "expense") {
    const policy = settings?.dual_head_approval || {};
    const requireDual = policy.require_dual_on_budget !== false;
    const configuredThreshold = Number(policy.budget_threshold);
    const threshold = Number.isFinite(configuredThreshold) ? configuredThreshold : 10_000;
    if (requireDual && Number(amount) >= threshold) {
      return {
        policyKey: "finance.dual_head",
        requiredApprovals: 2,
        escalationHours: Number(policy.escalation_hours || 336),
        escalationRole: policy.independent_escalation_role || "admin"
      };
    }
  }
  return {
    policyKey: `${resourceType || "resource"}.standard`,
    requiredApprovals: 1,
    escalationHours: 168,
    escalationRole: "admin"
  };
}

export async function createApprovalRequest({
  sql,
  tenantId,
  policyKey,
  resourceType,
  resourceId,
  resourceVersion = 1,
  requestedBy,
  requiredApprovals = 1,
  snapshot,
  reason = null,
  escalationHours = null
}) {
  if (!sql || !tenantId || !resourceType || !resourceId || !requestedBy) {
    throw new Error("createApprovalRequest requires sql, tenant, resource and requester");
  }
  // The first request is the immutable decision snapshot. A transport retry may
  // return it, but must never rewrite the evidence after somebody has reviewed
  // or decided it.
  const [request] = await sql`
    WITH inserted AS (
      INSERT INTO approval_requests (
        tenant_id, policy_key, resource_type, resource_id, resource_version,
        requested_by, required_approvals, request_snapshot, reason, due_at
      ) VALUES (
        ${tenantId}::uuid, ${policyKey}, ${resourceType}, ${String(resourceId)},
        ${resourceVersion}, ${requestedBy}, ${requiredApprovals}, ${sql.json(snapshot || {})},
        ${reason},
        CASE WHEN ${escalationHours}::integer IS NULL THEN NULL
             ELSE now() + make_interval(hours => ${escalationHours}::integer) END
      )
      ON CONFLICT (tenant_id, resource_type, resource_id, resource_version, policy_key)
      DO NOTHING
      RETURNING *
    )
    SELECT * FROM inserted
    UNION ALL
    SELECT * FROM approval_requests
    WHERE tenant_id = ${tenantId}::uuid
      AND resource_type = ${resourceType}
      AND resource_id = ${String(resourceId)}
      AND resource_version = ${resourceVersion}
      AND policy_key = ${policyKey}
    LIMIT 1
  `;
  if (!request) throw new Error("approval request could not be created or loaded");
  return request;
}

export const APPROVAL_RESOURCE_TYPES = Object.freeze(["expense"]);

export function supportsApprovalResource(resourceType) {
  return APPROVAL_RESOURCE_TYPES.includes(resourceType);
}

/**
 * Move the governed resource in the same transaction as its final decision.
 * Adding a new approval resource requires adding its finalizer here first; the
 * generic approval endpoint otherwise fails closed instead of recording a
 * decision that leaves domain state unchanged.
 */
export async function finalizeApprovalResource(tx, { request, status, actorId }) {
  if (request?.resource_type !== "expense" || !["approved", "rejected"].includes(status)) {
    throw new Error(`unsupported approval finalizer: ${request?.resource_type || "unknown"}`);
  }
  const [expense] = await tx`
    UPDATE expenses
    SET status = ${status}, decided_by = ${actorId}
    WHERE id = ${request.resource_id}::uuid
      AND tenant_id = ${request.tenant_id}::uuid
      AND status = 'proposed'
      AND request_version = ${request.resource_version}
      AND approval_request_id = ${request.id}
    RETURNING *
  `;
  if (!expense) throw new Error("expense version changed during approval");
  return expense;
}

function participantIds(snapshot = {}) {
  return new Set([
    snapshot.createdBy,
    snapshot.requestedBy,
    snapshot.submittedBy,
    snapshot.assigneeId,
    snapshot.proposerId,
    ...(Array.isArray(snapshot.contributors) ? snapshot.contributors : [])
  ].filter(Boolean));
}

export async function decideApproval({
  sql,
  tenantId,
  requestId,
  actorId,
  actorRole,
  decision,
  reason = null,
  authorizationContext = {},
  onFinal = null
}) {
  if (typeof onFinal !== "function") {
    throw new Error("decideApproval requires an atomic resource finalizer");
  }
  return sql.begin(async (tx) => {
    const [request] = await tx`
      SELECT * FROM approval_requests
      WHERE id = ${requestId}::uuid AND tenant_id = ${tenantId}::uuid
      LIMIT 1 FOR UPDATE
    `;
    if (!request) return { ok: false, reason: "NOT_FOUND" };
    if (request.status !== "pending") return { ok: false, reason: "ALREADY_DECIDED" };
    if (participantIds(request.request_snapshot).has(actorId) || request.requested_by === actorId) {
      return { ok: false, reason: "SELF_APPROVAL_BLOCKED" };
    }

    const escalated = request.due_at && new Date(request.due_at).getTime() <= Date.now();
    if (decision === "exception_approved" && (!escalated || !reason?.trim())) {
      return { ok: false, reason: "INVALID_EXCEPTION" };
    }

    const [entry] = await tx`
      INSERT INTO approval_decisions (
        tenant_id, approval_request_id, approver_id, decision, reason, authorization_context
      ) VALUES (
        ${tenantId}::uuid, ${request.id}, ${actorId}, ${decision}, ${reason},
        ${tx.json({ ...authorizationContext, actorRole, escalated })}
      )
      ON CONFLICT (approval_request_id, approver_id) DO NOTHING
      RETURNING *
    `;
    if (!entry) return { ok: false, reason: "DUPLICATE_APPROVER" };

    const rows = await tx`
      SELECT decision FROM approval_decisions
      WHERE approval_request_id = ${request.id}
    `;
    const rejected = rows.some((row) => row.decision === "rejected");
    const approvedCount = rows.filter((row) =>
      row.decision === "approved" || row.decision === "exception_approved"
    ).length;
    const nextStatus = rejected
      ? "rejected"
      : approvedCount >= request.required_approvals
        ? "approved"
        : "pending";

    const [updated] = await tx`
      UPDATE approval_requests
      SET status = ${nextStatus},
          escalated_at = CASE WHEN ${decision === "exception_approved"} THEN now() ELSE escalated_at END,
          decided_at = CASE WHEN ${nextStatus !== "pending"} THEN now() ELSE NULL END
      WHERE id = ${request.id}
      RETURNING *
    `;

    const resource = nextStatus !== "pending"
      ? await onFinal(tx, { request: updated, status: nextStatus })
      : null;

    await tx`
      INSERT INTO audit_logs (
        actor_id, tenant_id, action, resource, resource_id, before, after,
        reason, authorization_context, metadata
      ) VALUES (
        ${actorId}, ${tenantId}::uuid, 'approval.decision', 'approval_request',
        ${request.id}::text, ${tx.json({ status: request.status })},
        ${tx.json({ status: nextStatus, decision, approvedCount })}, ${reason},
        ${tx.json({ ...authorizationContext, actorRole, escalated })},
        ${tx.json({ tenant_id: tenantId })}
      )
    `;
    return { ok: true, request: updated, decision: entry, approvedCount, resource };
  });
}
