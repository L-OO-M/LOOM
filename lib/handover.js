import { can, effectiveRole } from "./permissions";

export const HANDOVER_ROLES = ["dept_lead", "vertical_lead", "admin"];
export const HANDOVER_STATUSES = ["draft", "submitted", "completed", "cancelled", "rejected"];

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const ROLE_LABELS = {
  dept_lead: "Department Head",
  vertical_lead: "Vertical Lead",
  admin: "Super Admin"
};

export function handoverScope(profile) {
  const role = effectiveRole(profile);
  if (!HANDOVER_ROLES.includes(role)) {
    return { error: "Only a department head, vertical lead or admin can hand over a seat." };
  }
  if (role === "dept_lead") {
    const led = (profile.memberships || []).filter((m) => m.level === "dept_lead");
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
        (user_id, department_id, level, core_requested, succession_ready, term_start, term_end)
      VALUES (${toUserId}, ${departmentId}, 'dept_lead', false, false, ${termStart}, ${termEnd})
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
    const rows = await tx`
      UPDATE planner_sessions
      SET owner_user_id = ${toUserId}::uuid, updated_at = now()
      WHERE tenant_id = ${tenantId}::uuid AND owner_user_id::text = ${fromUserId}
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

  return { incoming, membership, headSlot, planner, eventOps, termStart, termEnd };
}
