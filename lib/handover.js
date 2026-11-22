import { can, effectiveRole, hasVerticalLeadGrant, termExpired } from "./permissions";
import { syncLeadershipScopedGrant } from "./scoped-grants";

export const HANDOVER_ROLES = ["dept_lead", "vertical_lead", "admin"];
export const HANDOVER_STATUSES = ["draft", "submitted", "completed", "cancelled", "rejected"];

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const ROLE_LABELS = {
  dept_lead: "Department Head",
  vertical_lead: "Vertical Lead",
  admin: "Super Admin"
};

/**
 * What each handover would move, and what it cannot move.
 *
 * `ownOpen` is the outgoing lead's own unfinished department work -- the rows a
 * transfer can follow. `unassigned` is work with no owner at all, which a
 * handover cannot fix because there is nobody to move it from; naming it while
 * someone can still act is the whole point of showing the count.
 *
 * One aggregate for the whole list, keyed by handover id, so a board of fifty
 * handovers costs the same as a board of one.
 *
 * @returns {Promise<Map<string, {ownOpen:number, unassigned:number}>>}
 */
export async function handoverWorkPreview(sql, { tenantId, handovers = [] }) {
  const preview = new Map();
  // Seed every handover, so callers never have to special-case a missing key.
  for (const h of handovers) preview.set(h.id, { ownOpen: 0, unassigned: 0 });

  const deptIds = [...new Set(handovers.map((h) => h.department_id).filter(Boolean))];
  if (deptIds.length === 0) return preview;

  const rows = await sql`
    SELECT department_id, assignee_id, COUNT(*)::int AS open
    FROM department_tasks
    WHERE tenant_id = ${tenantId}::uuid
      AND department_id = ANY(${deptIds}::uuid[])
      AND is_active
      AND status IN ('assigned', 'in_progress', 'blocked')
    GROUP BY department_id, assignee_id
  `;
  const byKey = new Map();
  for (const r of rows) byKey.set(`${r.department_id}:${r.assignee_id ?? ""}`, r.open);

  for (const h of handovers) {
    if (!h.department_id) continue;
    preview.set(h.id, {
      ownOpen: byKey.get(`${h.department_id}:${h.from_user_id}`) ?? 0,
      unassigned: byKey.get(`${h.department_id}:`) ?? 0
    });
  }
  return preview;
}

export function handoverScope(profile) {
  const role = effectiveRole(profile);
  if (!HANDOVER_ROLES.includes(role)) {
    return { error: "Only a department head, vertical lead or admin can hand over a seat." };
  }
  if (role === "dept_lead") {
    const led = (profile.memberships || []).filter((membership) =>
      membership.level === "dept_lead" && !termExpired(membership.term_end)
    );
    if (led.length === 0) return { error: "You do not lead a department." };
    if (led.length > 1) {
      return { error: "You lead more than one department. Ask an admin to reassign the extra seats before handing one over." };
    }
    return {
      role,
      departmentId: led[0].department_id,
      departmentName: led[0].name || null,
      vertical: led[0].vertical || null
    };
  }
  if (role === "vertical_lead") {
    const vertical = profile.vertical || (profile.memberships || []).find((m) => m.vertical)?.vertical || null;
    if (!vertical) return { error: "Your vertical is not set. Ask an admin to fix your profile first." };
    if (!hasVerticalLeadGrant({
      ...profile,
      tenantId: profile.tenantId ?? profile.tenant_id
    }, vertical)) {
      return { error: "Your vertical leadership grant is inactive or expired." };
    }
    return { role, vertical };
  }
  return { role };
}

export async function listCandidates(sql, { tenantId, scope, fromUserId }) {
  if (scope.role === "dept_lead" && scope.departmentId) {
    return sql`
      SELECT DISTINCT p.user_id, p.name, p.role, m.level
      FROM profiles p
      JOIN department_memberships m ON m.user_id = p.user_id
      WHERE p.tenant_id = ${tenantId}::uuid
        AND m.department_id = ${scope.departmentId}
        AND p.user_id <> ${fromUserId}
        AND p.role IN ('core', 'dept_lead')
        AND m.level IN ('core', 'dept_lead')
      ORDER BY p.name
    `;
  }
  if (scope.role === "vertical_lead" && scope.vertical) {
    return sql`
      SELECT DISTINCT p.user_id, p.name, p.role
      FROM profiles p
      WHERE p.tenant_id = ${tenantId}::uuid
        AND p.user_id <> ${fromUserId}
        AND p.role IN ('core', 'dept_lead', 'vertical_lead')
        AND (
          p.vertical = ${scope.vertical}
          OR EXISTS (
            SELECT 1 FROM department_memberships m
            JOIN departments d ON d.id = m.department_id
            WHERE m.user_id = p.user_id
              AND d.tenant_id = ${tenantId}::uuid
              AND d.vertical = ${scope.vertical}
              AND m.level IN ('core', 'dept_lead')
          )
        )
      ORDER BY p.name
    `;
  }
  return sql`
    SELECT p.user_id, p.name, p.role
    FROM profiles p
    WHERE p.tenant_id = ${tenantId}::uuid
      AND p.user_id <> ${fromUserId}
      AND p.role IN ('core', 'dept_lead', 'vertical_lead', 'admin')
    ORDER BY p.name
  `;
}

export async function findCandidate(sql, { tenantId, scope, fromUserId, toUserId }) {
  const rows = await listCandidates(sql, { tenantId, scope, fromUserId });
  return rows.find((row) => row.user_id === toUserId) || null;
}

export function assertTransferTarget(profile, candidate) {
  if (!can(profile, "manage_handover").ok) return "You cannot hand over a seat.";
  if (!candidate) return "Choose a successor inside your own scope.";
  return null;
}

export async function applyHandoverTransfer(tx, { tenantId, handover, actorId }) {
  const fromUserId = handover.from_user_id;
  const toUserId = handover.to_user_id;
  const role = handover.role;
  const departmentId = role === "dept_lead" ? handover.department_id : null;
  const vertical = role === "vertical_lead" ? handover.vertical : null;

  const termStart = new Date().toISOString().slice(0, 10);
  const termEndDate = new Date();
  termEndDate.setUTCFullYear(termEndDate.getUTCFullYear() + 1);
  const termEnd = termEndDate.toISOString().slice(0, 10);

  const [incoming] = await tx`
    UPDATE profiles
    SET role = ${role},
        vertical = ${vertical},
        role_term_start = ${termStart},
        role_term_end = ${termEnd},
        updated_at = NOW()
    WHERE user_id = ${toUserId} AND tenant_id = ${tenantId}::uuid
    RETURNING user_id, name, role
  `;
  if (!incoming) throw new Error("The successor left this chapter before the transfer completed.");

  await tx`
    UPDATE profiles
    SET role = 'core', vertical = NULL, role_term_start = NULL, role_term_end = NULL, updated_at = NOW()
    WHERE user_id = ${fromUserId} AND tenant_id = ${tenantId}::uuid
  `;

  await syncLeadershipScopedGrant(tx, {
    tenantId,
    userId: fromUserId,
    actorId,
    role: "core",
    revokeAllLeadership: true,
    reason: "leadership_handover"
  });
  await syncLeadershipScopedGrant(tx, {
    tenantId,
    userId: toUserId,
    actorId,
    role,
    vertical,
    departmentId,
    startsAt: termStart,
    expiresAt: termEnd,
    revokeAllLeadership: true,
    reason: "leadership_handover"
  });

  await tx`
    UPDATE leadership_terms
    SET status = 'ended', ended_reason = 'handover'
    WHERE tenant_id = ${tenantId}::uuid
      AND user_id IN (${fromUserId}, ${toUserId})
      AND status = 'active'
  `;

  if (role === "dept_lead" && departmentId) {
    await tx`
      UPDATE department_memberships
      SET level = 'core', term_end = COALESCE(term_end, CURRENT_DATE)
      WHERE user_id = ${toUserId} AND level = 'dept_lead' AND department_id <> ${departmentId}
    `;
    await tx`
      UPDATE departments
      SET head_user_id = CASE WHEN head_user_id = ${toUserId} THEN NULL ELSE head_user_id END,
          co_head_user_id = CASE WHEN co_head_user_id = ${toUserId} THEN NULL ELSE co_head_user_id END
      WHERE tenant_id = ${tenantId}::uuid AND id <> ${departmentId}
        AND (head_user_id = ${toUserId} OR co_head_user_id = ${toUserId})
    `;
  }

  await tx`
    INSERT INTO leadership_terms
      (tenant_id, user_id, role, vertical, department_id, starts_on, ends_on, appointed_by)
    VALUES
      (${tenantId}::uuid, ${toUserId}, ${role}, ${vertical}, ${departmentId}, ${termStart}, ${termEnd}, ${actorId})
  `;

  let membership = 0;
  let headSlot = 0;
  if (role === "dept_lead" && departmentId) {
    const demoted = await tx`
      UPDATE department_memberships
      SET level = 'core', term_end = COALESCE(term_end, CURRENT_DATE)
      WHERE user_id = ${fromUserId} AND department_id = ${departmentId} AND level = 'dept_lead'
      RETURNING id
    `;
    membership = demoted.length;

    await tx`
      INSERT INTO department_memberships
        (user_id, department_id, level, core_requested, succession_ready, term_start, term_end, tenant_id)
      VALUES (${toUserId}, ${departmentId}, 'dept_lead', false, false, ${termStart}, ${termEnd}, ${tenantId}::uuid)
      ON CONFLICT (user_id, department_id) DO UPDATE
        SET level = 'dept_lead', core_requested = false,
            term_start = EXCLUDED.term_start, term_end = EXCLUDED.term_end
    `;

    if (handover.transfer_head_slot) {
      const slots = await tx`
        UPDATE departments
        SET head_user_id = CASE WHEN head_user_id = ${fromUserId} THEN ${toUserId} ELSE head_user_id END,
            co_head_user_id = CASE WHEN co_head_user_id = ${fromUserId} THEN ${toUserId} ELSE co_head_user_id END
        WHERE id = ${departmentId} AND tenant_id = ${tenantId}::uuid
          AND (head_user_id = ${fromUserId} OR co_head_user_id = ${fromUserId})
        RETURNING id
      `;
      headSlot = slots.length;
      await tx`
        UPDATE departments
        SET co_head_user_id = NULL
        WHERE id = ${departmentId} AND co_head_user_id IS NOT NULL AND co_head_user_id = head_user_id
      `;
    }
  }

  let planner = 0;
  if (handover.transfer_planner) {
    // planner_sessions.owner_user_id is `text` (058 converted it from uuid):
    // account keys are not always UUIDs -- Auth0 issues `auth0|...`. Casting the
    // assignment to uuid made this UPDATE throw for exactly the ids the
    // migration existed to support.
    const rows = await tx`
      UPDATE planner_sessions
      SET owner_user_id = ${toUserId}, updated_at = now()
      WHERE tenant_id = ${tenantId}::uuid AND owner_user_id = ${fromUserId}
      RETURNING id
    `;
    planner = rows.length;
  }

  let eventOps = 0;
  if (handover.transfer_event_ops) {
    const rows = await tx`
      UPDATE event_ops_tasks
      SET owner_id = ${toUserId}, updated_at = now()
      WHERE tenant_id = ${tenantId}::uuid AND owner_id = ${fromUserId} AND is_active = true
      RETURNING id
    `;
    eventOps = rows.length;
  }

  // Only the outgoing head's own open work in the department being handed over.
  // Member assignments stay with their members -- a handover changes who leads,
  // not who does what -- and completed/cancelled rows are history, not load.
  let tasks = 0;
  if (handover.transfer_tasks && role === "dept_lead" && departmentId) {
    const rows = await tx`
      UPDATE department_tasks
      SET assignee_id = ${toUserId}, updated_at = NOW()
      WHERE tenant_id = ${tenantId}::uuid
        AND department_id = ${departmentId}::uuid
        AND assignee_id = ${fromUserId}
        AND is_active
        AND status IN ('assigned', 'in_progress', 'blocked')
      RETURNING id
    `;
    tasks = rows.length;
  }

  return { incoming, membership, headSlot, planner, eventOps, tasks, termStart, termEnd };
}
