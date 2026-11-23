import { scope } from "@/lib/tenant-scope";
import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { getRequestContext, writeAudit, notify } from "@/lib/auth-server";
import { can, isAdmin, roleRank } from "@/lib/permissions";

const grantSchema = z.object({ level: z.enum(["core", "general"]) });

// A head may also decline a Core request. It clears the legacy `core_requested`
// flag and closes the matching role_requests row with the reason the member
// will read. Approval stays where it was: granting the seat, admin, or the
// normal seat-request decision.
const declineSchema = z.object({
  declineCore: z.literal(true),
  reason: z.string().trim().min(3).max(500)
});

const bodySchema = z.union([grantSchema, declineSchema]);

// Department roster control.
//
// A Head and a Co-Head have identical authority inside their own department:
// grant Core, demote back to General, and remove someone. Leadership seats are
// deliberately not writable here: the admin role-management transaction owns
// the profile role, term history, membership term, head/co-head slot and scoped
// grant as one atomic lifecycle. Removal never deletes work history — the member
// rows go, the tasks/contributions they produced stay attributed to them.
export async function PATCH(request, { params }) {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, profile, tenant, sql } = ctx;
  const { id, userId } = await params;
  let body;
  try {
    body = bodySchema.parse(await request.json());
  } catch (e) {
    return validationError(e);
  }
  const [dept] = await sql`
    SELECT * FROM departments WHERE id = ${id}
      AND tenant_id = ${scope(tenant?.id ?? null)}::uuid
    LIMIT 1
  `;
  if (!dept) return fail("NOT_FOUND", "Department not found", 404);

  const admin = isAdmin({ role: profile.role });
  if (!admin && !can(profile, "manage_department_roster", { departmentId: dept.id }).ok) {
    return fail("FORBIDDEN", "Only this department's Head or Co-Head can change its roster", 403);
  }

  const [target] = await sql`
    SELECT * FROM profiles WHERE user_id = ${userId}
      AND tenant_id = ${scope(tenant?.id ?? null)}::uuid
    LIMIT 1
  `;
  if (!target) return fail("NOT_FOUND", "User not in your college", 404);

  const [existing] = await sql`
    SELECT * FROM department_memberships
    WHERE user_id = ${userId} AND department_id = ${dept.id}::uuid
    LIMIT 1
  `;
  // A Head's seat is an appointment, not a roster edit. Even an admin must use
  // PATCH /api/admin/students so every leadership record changes atomically.
  if (existing?.level === "dept_lead") {
    return fail(
      "LEADERSHIP_APPOINTMENT_REQUIRED",
      "Change a department Head through Admin role management",
      409
    );
  }

  if (body.declineCore) {
    return declineCoreRequest({ sql, user, tenant, dept, userId, reason: body.reason, existing });
  }

  const [membership] = await sql`
    INSERT INTO department_memberships (user_id, department_id, level, core_requested, tenant_id)
    VALUES (${userId}, ${dept.id}, ${body.level}, false, ${dept.tenant_id})
    ON CONFLICT (user_id, department_id) DO UPDATE SET level = EXCLUDED.level, core_requested = false
    RETURNING *
  `;

  // Upward-only role sync; demotion to General is handled below and only when
  // no elevated membership remains anywhere else.
  const wantRole = body.level === "core" ? "core" : null;
  if (wantRole && roleRank(target.role) < roleRank(wantRole)) {
    await sql`UPDATE profiles SET role = ${wantRole}, updated_at = NOW() WHERE user_id = ${userId}`;
  }
  const downgraded = body.level === "general" && target.role === "core"
    && !(await hasElevatedMembership(sql, { tenantId: tenant.id, userId, exceptDepartmentId: dept.id }));
  if (downgraded) {
    await sql`UPDATE profiles SET role = 'student', updated_at = NOW() WHERE user_id = ${userId}`;
  }

  // Granting the seat answers any request that was waiting for it. Without
  // this, the admin queue keeps showing a request for someone who is already
  // Core, and the member is told to wait for a decision that already happened.
  if (body.level === "core") {
    await sql`
      UPDATE role_requests
      SET status = 'approved', decided_by = ${user.id}, decided_at = NOW(),
          decision_reason = 'Granted directly from the department roster.'
      WHERE user_id = ${userId} AND department_id = ${dept.id}::uuid
        AND target_role = 'core' AND status = 'open'
        AND tenant_id = ${tenant.id}::uuid
    `;
  }

  await writeAudit({
    sql, actorId: user.id, tenantId: tenant?.id, action: "granted_membership",
    resource: "department", resourceId: dept.id,
    before: { role: target.role, level: existing?.level ?? null },
    after: { userId, level: body.level, slug: dept.slug, roleDowngraded: downgraded }
  });

  if (userId !== user.id) {
    await notify({
      sql, tenantId: tenant.id, userId, type: "department_membership",
      title: body.level === "core"
        ? `You are now Core in ${dept.name}`
        : `Your role in ${dept.name} changed to General`,
      body: null,
      link: "/student"
    });
  }

  return ok({ membership });
}

export async function DELETE(request, { params }) {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, profile, tenant, sql } = ctx;
  const { id, userId } = await params;

  const [dept] = await sql`
    SELECT id, name, slug FROM departments WHERE id = ${id}
      AND tenant_id = ${scope(tenant?.id ?? null)}::uuid
    LIMIT 1
  `;
  if (!dept) return fail("NOT_FOUND", "Department not found", 404);

  const admin = isAdmin({ role: profile.role });
  if (!admin && !can(profile, "manage_department_roster", { departmentId: dept.id }).ok) {
    return fail("FORBIDDEN", "Only this department's Head or Co-Head can change its roster", 403);
  }

  const [existing] = await sql`
    SELECT * FROM department_memberships
    WHERE user_id = ${userId} AND department_id = ${dept.id}::uuid
    LIMIT 1
  `;
  if (!existing) return fail("NOT_FOUND", "That person is not in this department", 404);
  if (existing.level === "dept_lead") {
    return fail(
      "LEADERSHIP_APPOINTMENT_REQUIRED",
      "Remove a department Head through Admin role management",
      409
    );
  }

  await sql`
    DELETE FROM department_memberships
    WHERE user_id = ${userId} AND department_id = ${dept.id}::uuid
      AND tenant_id = ${tenant?.id ?? null}::uuid
  `;

  // Their work stays attributed to them; only the seat is gone.
  const [target] = await sql`
    SELECT role FROM profiles
    WHERE user_id = ${userId} AND tenant_id = ${scope(tenant?.id ?? null)}::uuid
    LIMIT 1
  `;
  const downgraded = target?.role === "core"
    && !(await hasElevatedMembership(sql, { tenantId: tenant.id, userId, exceptDepartmentId: dept.id }));
  if (downgraded) {
    await sql`UPDATE profiles SET role = 'student', updated_at = NOW() WHERE user_id = ${userId}`;
  }

  await writeAudit({
    sql, actorId: user.id, tenantId: tenant?.id, action: "removed_membership",
    resource: "department", resourceId: dept.id,
    before: { userId, level: existing.level },
    after: { slug: dept.slug, roleDowngraded: downgraded }
  });

  if (userId !== user.id) {
    await notify({
      sql, tenantId: tenant.id, userId, type: "department_membership",
      title: `You were removed from ${dept.name}`,
      body: "Work you already recorded stays on your record.",
      link: "/student"
    });
  }

  return ok({ removed: true });
}

/** True when the member keeps Core/Head standing in another department. */
async function hasElevatedMembership(sql, { tenantId, userId, exceptDepartmentId }) {
  const [row] = await sql`
    SELECT 1 AS present FROM department_memberships
    WHERE tenant_id = ${tenantId}::uuid
      AND user_id = ${userId}
      AND department_id <> ${exceptDepartmentId}::uuid
      AND level IN ('core', 'dept_lead')
    LIMIT 1
  `;
  return !!row;
}

/**
 * Decline a Core request in this department.
 *
 * A request can exist in two shapes: the current `role_requests` row (with the
 * applicant's verified record attached) and the older `core_requested` flag on
 * the membership. Both are cleared together so the roster stops advertising a
 * request the head has already answered. The member is told the reason — a
 * decline with no explanation is what made the old flag easy to ignore.
 */
async function declineCoreRequest({ sql, user, tenant, dept, userId, reason, existing }) {
  const [open] = await sql`
    SELECT id FROM role_requests
    WHERE user_id = ${userId} AND department_id = ${dept.id}::uuid
      AND target_role = 'core' AND status = 'open'
      AND tenant_id = ${tenant.id}::uuid
    ORDER BY created_at ASC
    LIMIT 1
  `;

  if (!open && !existing?.core_requested) {
    return fail("NOT_FOUND", "That member has no open Core request", 404);
  }

  await sql.begin(async (tx) => {
    await tx`
      UPDATE department_memberships
      SET core_requested = false
      WHERE user_id = ${userId} AND department_id = ${dept.id}::uuid
        AND tenant_id = ${tenant.id}::uuid
    `;
    if (open) {
      await tx`
        UPDATE role_requests
        SET status = 'rejected', decided_by = ${user.id}, decided_at = NOW(),
            decision_reason = ${reason}
        WHERE id = ${open.id}::uuid AND status = 'open'
          AND tenant_id = ${tenant.id}::uuid
      `;
    }
  });

  await writeAudit({
    sql,
    actorId: user.id,
    tenantId: tenant.id,
    action: "core_request.declined",
    resource: "department",
    resourceId: dept.id,
    before: { core_requested: true },
    after: { userId, reason, requestId: open?.id ?? null },
    authorizationContext: { source: "department_roster" }
  });

  if (userId !== user.id) {
    await notify({
      sql,
      tenantId: tenant.id,
      userId,
      type: "role_request",
      title: `Core request declined in ${dept.name}`,
      body: reason,
      link: "/student/roles"
    });
  }

  return ok({ declined: true });
}
