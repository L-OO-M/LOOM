import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { getRequestContext, writeAudit, notify } from "@/lib/auth-server";
import { isAdmin } from "@/lib/permissions";

// Deciding a seat request.
//
// The applicant's record was snapshotted when they asked, so the decision is
// made against what they had then, not against whatever their score drifted to
// since. Approving applies the seat in the same shape the admin roster uses:
// profile role + membership level + (for a Head seat) the department's seat
// column. It refuses to displace an occupied seat -- that is a deliberate
// vacate, not a side effect of a request.

const decisionSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
  reason: z.string().trim().min(3).max(1000).optional()
});

function oneYearFromNow() {
  const end = new Date();
  end.setFullYear(end.getFullYear() + 1);
  return end;
}

export async function POST(request, { params }) {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, profile, tenant, sql } = ctx;
  if (!isAdmin({ role: profile.role })) {
    return fail("FORBIDDEN", "Only an admin can decide a seat request", 403);
  }

  const { id } = await params;
  let body;
  try {
    body = decisionSchema.parse(await request.json());
  } catch (error) {
    return validationError(error);
  }

  const [req] = await sql`
    SELECT * FROM role_requests
    WHERE id = ${id}::uuid AND tenant_id = ${tenant.id}::uuid
    LIMIT 1
  `;
  if (!req) return fail("NOT_FOUND", "Request not found", 404);
  if (req.status !== "open") return fail("ALREADY_DECIDED", "That request is already decided", 409);
  if (req.user_id === user.id) {
    return fail("SELF_DECISION", "You cannot decide your own request", 403);
  }

  if (body.decision === "rejected") {
    const [updated] = await sql`
      UPDATE role_requests
      SET status = 'rejected', decided_by = ${user.id}, decided_at = NOW(),
          decision_reason = ${body.reason || null}
      WHERE id = ${req.id} AND tenant_id = ${tenant.id}::uuid AND status = 'open'
      RETURNING id, status, decided_at
    `;
    if (!updated) return fail("ALREADY_DECIDED", "That request is already decided", 409);
    await writeAudit({
      sql,
      actorId: user.id,
      tenantId: tenant.id,
      action: "role_request.rejected",
      resource: "role_request",
      resourceId: req.id,
      before: { status: "open" },
      after: { status: "rejected", reason: body.reason || null },
      authorizationContext: { source: "admin_role_request_api" }
    });
    await notify({
      sql,
      tenantId: tenant.id,
      userId: req.user_id,
      type: "role_request",
      title: "Seat request declined",
      body: body.reason || "Your request was declined. You can ask again after the cooldown.",
      link: "/student/roles"
    });
    return ok({ request: updated });
  }

  // Approve. Refuse to displace a Head who is already in the seat.
  if (req.target_role === "dept_lead" && req.department_id) {
    const [dept] = await sql`
      SELECT id, name, head_user_id, co_head_user_id FROM departments
      WHERE id = ${req.department_id}::uuid AND tenant_id = ${tenant.id}::uuid
      LIMIT 1
    `;
    if (!dept) return fail("NOT_FOUND", "Department not found", 404);
    const seatTaken =
      (dept.head_user_id && dept.head_user_id !== req.user_id) ||
      (dept.co_head_user_id && dept.co_head_user_id !== req.user_id);
    if (seatTaken) {
      return fail(
        "SEAT_OCCUPIED",
        `${dept.name} already has a Head. Vacate that seat first, then approve.`,
        409
      );
    }
  }

  const result = await sql.begin(async (tx) => {
    const [updated] = await tx`
      UPDATE role_requests
      SET status = 'approved', decided_by = ${user.id}, decided_at = NOW(),
          decision_reason = ${body.reason || null}
      WHERE id = ${req.id} AND tenant_id = ${tenant.id}::uuid AND status = 'open'
      RETURNING id, status, decided_at
    `;
    if (!updated) return null;

    const termEnd = req.target_role === "dept_lead" ? oneYearFromNow() : null;
    await tx`
      UPDATE profiles
      SET role = ${req.target_role}, role_term_start = NOW(), role_term_end = ${termEnd}
      WHERE user_id = ${req.user_id} AND tenant_id = ${tenant.id}::uuid
    `;

    if (req.target_role === "dept_lead" && req.department_id) {
      await tx`
        INSERT INTO department_memberships
          (user_id, department_id, level, core_requested, term_start, term_end, tenant_id)
        VALUES (${req.user_id}, ${req.department_id}::uuid, 'dept_lead', false, NOW(), ${termEnd}, ${tenant.id}::uuid)
        ON CONFLICT (user_id, department_id) DO UPDATE
        SET level = 'dept_lead', core_requested = false,
            term_start = NOW(), term_end = ${termEnd}
      `;
      await tx`
        UPDATE departments
        SET head_user_id = CASE
          WHEN head_user_id IS NULL THEN ${req.user_id}
          ELSE head_user_id
        END
        WHERE id = ${req.department_id}::uuid AND tenant_id = ${tenant.id}::uuid
      `;
    }
    return updated;
  });

  if (!result) return fail("ALREADY_DECIDED", "That request is already decided", 409);

  await writeAudit({
    sql,
    actorId: user.id,
    tenantId: tenant.id,
    action: "role_request.approved",
    resource: "role_request",
    resourceId: req.id,
    before: { status: "open" },
    after: {
      status: "approved",
      target_role: req.target_role,
      department_id: req.department_id,
      user_id: req.user_id
    },
    authorizationContext: { source: "admin_role_request_api" }
  });
  await notify({
    sql,
    tenantId: tenant.id,
    userId: req.user_id,
    type: "role_request",
    title: "Seat request approved",
    body: `You are now ${req.target_role === "core" ? "a Core member" : "a Department Head"}.`,
    link: "/student/roles"
  });

  return ok({ request: result });
}
