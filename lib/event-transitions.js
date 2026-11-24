/**
 * Event Finite State Machine — authoritative transitions and validation.
 *
 * Every status change must go through decideEventTransition() so the API
 * cannot accidentally allow invalid sequences (e.g. cancelled -> live).
 * The function is pure, testable, and returns the exact new status or a denial.
 */

export const EVENT_STATUSES = [
  "draft",
  "submitted",
  "under_review",
  "approved",
  "published",
  "registration_closed",
  "live",
  "completed",
  "archived",
  "rejected",
  "cancelled",
  "postponed"
];

// Allowed transitions: from -> [to, ...]
export const EVENT_TRANSITIONS = {
  // Admin/vertical lead may publish a draft directly and unpublish it again;
  // the cases below enforce who may take those two shortcuts.
  draft: ["submitted", "published", "cancelled"],
  // under_review is optional for chapters that use direct lead/admin approval.
  submitted: ["under_review", "approved", "rejected", "draft"],
  under_review: ["approved", "rejected", "draft"],
  approved: ["published", "cancelled", "postponed"],
  published: ["registration_closed", "live", "cancelled", "postponed", "draft"],
  registration_closed: ["live", "cancelled", "postponed"],
  live: ["completed", "cancelled"],
  completed: ["archived"],
  archived: [],
  rejected: ["draft"],
  cancelled: [],
  postponed: ["draft", "submitted"]
};

/**
 * Check if a transition from currentStatus to targetStatus is valid.
 * Returns { ok: true, newStatus } or { ok: false, reason }.
 */
export function validateTransition(currentStatus, targetStatus) {
  if (!EVENT_STATUSES.includes(currentStatus)) {
    return { ok: false, reason: `invalid_current_status: ${currentStatus}` };
  }
  if (!EVENT_STATUSES.includes(targetStatus)) {
    return { ok: false, reason: `invalid_target_status: ${targetStatus}` };
  }
  if (currentStatus === targetStatus) {
    return { ok: false, reason: "no_change" };
  }
  const allowed = EVENT_TRANSITIONS[currentStatus] || [];
  if (!allowed.includes(targetStatus)) {
    return { ok: false, reason: `INVALID_TRANSITION` };
  }
  return { ok: true, newStatus: targetStatus };
}

/**
 * Decide an event status transition with full authorization and validation.
 *
 * @param {object} params
 * @param {object} params.event - { id, department_id, created_by, status, lock_version }
 * @param {string} params.targetStatus - Desired target status
 * @param {string} params.actorId - User ID making the transition
 * @param {string} [params.actorRole] - User's role
 * @param {boolean} [params.isOwningDeptLead] - Whether user is dept lead for event's department
 * @param {boolean} [params.isVerticalLead] - Whether user is vertical lead for event's vertical
 * @param {boolean} [params.isAdmin] - Whether user is admin/platform_admin
 * @param {string} [params.cancellationReason] - Reason for cancellation
 * @param {number} [params.expectedVersion] - Expected lock_version for optimistic locking
 * @returns {object} { ok, patch?, reason? }
 */
export function decideEventTransition({
  event,
  targetStatus,
  actorId,
  actorRole,
  isOwningDeptLead,
  isVerticalLead,
  isAdmin,
  cancellationReason,
  expectedVersion
}) {
  // 1. Validate transition is allowed by FSM
  const currentStatus = event?.status;
  const transition = validateTransition(currentStatus, targetStatus);
  if (!transition.ok) return { ok: false, reason: transition.reason };

  // 2. Optimistic lock check
  if (expectedVersion != null && event?.lock_version !== expectedVersion) {
    return { ok: false, reason: "CONCURRENCY_CONFLICT" };
  }

  // 3. Authorization by transition type
  const canAct = (requiredRoles) => {
    if (isAdmin) return true;
    if (isVerticalLead && requiredRoles.includes("vertical_lead")) return true;
    if (isOwningDeptLead && requiredRoles.includes("dept_lead")) return true;
    return false;
  };

  // Transition-specific rules
  switch (targetStatus) {
    case "submitted": {
      // Only the creator (dept lead) can submit a draft for approval
      if (event?.created_by !== actorId) {
        return { ok: false, reason: "FORBIDDEN" };
      }
      if (!["dept_lead", "core"].includes(actorRole)) {
        return { ok: false, reason: "FORBIDDEN" };
      }
      return { ok: true, patch: { status: targetStatus } };
    }

    case "under_review": {
      // Admin or vertical lead moves proposed -> under_review
      if (!canAct(["admin", "vertical_lead"])) {
        return { ok: false, reason: "FORBIDDEN" };
      }
      return { ok: true, patch: { status: targetStatus } };
    }

    case "approved": {
      // Admin or vertical lead approves
      if (!canAct(["admin", "vertical_lead"])) {
        return { ok: false, reason: "FORBIDDEN" };
      }
      return { ok: true, patch: { status: targetStatus } };
    }

    case "rejected": {
      // Admin or vertical lead rejects
      if (!canAct(["admin", "vertical_lead"])) {
        return { ok: false, reason: "FORBIDDEN" };
      }
      return { ok: true, patch: { status: targetStatus } };
    }

    case "published": {
      // Admin or vertical lead publishes approved event
      if (!canAct(["admin", "vertical_lead"])) {
        return { ok: false, reason: "FORBIDDEN" };
      }
      return { ok: true, patch: { status: targetStatus } };
    }

    case "registration_closed": {
      // Event organizer (creator, dept lead, vertical lead, admin) can close registration
      if (!canAct(["admin", "vertical_lead", "dept_lead"]) && event?.created_by !== actorId) {
        return { ok: false, reason: "FORBIDDEN" };
      }
      return { ok: true, patch: { status: targetStatus } };
    }

    case "live": {
      // Event starts automatically or organizer marks live
      if (!canAct(["admin", "vertical_lead", "dept_lead"]) && event?.created_by !== actorId) {
        return { ok: false, reason: "FORBIDDEN" };
      }
      return { ok: true, patch: { status: targetStatus } };
    }

    case "completed": {
      // Organizer marks complete after event ends
      if (!canAct(["admin", "vertical_lead", "dept_lead"]) && event?.created_by !== actorId) {
        return { ok: false, reason: "FORBIDDEN" };
      }
      return {
        ok: true,
        patch: {
          status: targetStatus,
          completed_at: new Date(),
          completed_by: actorId
        }
      };
    }

    case "archived": {
      // Admin archives completed events
      if (!isAdmin) {
        return { ok: false, reason: "FORBIDDEN" };
      }
      return { ok: true, patch: { status: targetStatus } };
    }

    case "cancelled": {
      // Creator, dept lead, vertical lead, admin can cancel
      if (!canAct(["admin", "vertical_lead", "dept_lead"]) && event?.created_by !== actorId) {
        return { ok: false, reason: "FORBIDDEN" };
      }
      return {
        ok: true,
        patch: {
          status: targetStatus,
          cancellation_reason: cancellationReason || "Cancelled"
        }
      };
    }

    case "postponed": {
      // Organizer postpones
      if (!canAct(["admin", "vertical_lead", "dept_lead"]) && event?.created_by !== actorId) {
        return { ok: false, reason: "FORBIDDEN" };
      }
      return { ok: true, patch: { status: targetStatus } };
    }

    case "draft": {
      // A creator may withdraw/rework a submitted, rejected or postponed event.
      // A reviewer may explicitly return an in-review event to draft, and an
      // admin or vertical lead may unpublish a live page back to draft to hide
      // it without destroying the record.
      const creatorReturn = ["submitted", "rejected", "postponed"].includes(currentStatus)
        && event?.created_by === actorId;
      const reviewerReturn = ["under_review", "approved", "published"].includes(currentStatus)
        && canAct(["admin", "vertical_lead"]);
      if (!creatorReturn && !reviewerReturn) {
        return { ok: false, reason: "FORBIDDEN" };
      }
      return { ok: true, patch: { status: targetStatus } };
    }

    default:
      return { ok: false, reason: `INVALID_TRANSITION` };
  }
}

/**
 * Get allowed target statuses for a given current status (for UI).
 */
export function allowedTargets(currentStatus) {
  return EVENT_TRANSITIONS[currentStatus] || [];
}

/**
 * Check if a status is terminal (no forward transitions).
 */
export function isTerminal(status) {
  return EVENT_TRANSITIONS[status]?.length === 0;
}
