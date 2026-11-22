import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { getRequestContext, writeAudit, notify } from "@/lib/auth-server";
import {
  TARGET_ROLES,
  evaluateRoleRequest,
  loadEligibility,
  REQUIREMENTS
} from "@/lib/role-requests";

// Asking for a seat, with proof.
//
// GET  /api/role-requests?target=core|dept_lead&departmentId=...
//      -> the applicant's own eligibility, reasons, and history for that seat.
// POST /api/role-requests
//      -> create one request. Refused unless the VERIFIED record clears the bar
//         in lib/role-requests.js, and refused while another request for the
//         same seat is open or the cooldown is running.
//
// The gate is the point. A request used to be free, so the queue was noise.

const createSchema = z.object({
  target_role: z.enum(TARGET_ROLES),
  department_id: z.string().uuid().nullable().optional(),
  statement: z.string().trim().min(40).max(2000)
});

export async function GET(request) {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, tenant, sql } = ctx;

  const params = new URL(request.url).searchParams;
  const targetRole = params.get("target");
  if (!TARGET_ROLES.includes(targetRole)) {
    return fail("INVALID_TARGET", "target must be core or dept_lead", 400);
  }
  const departmentId = params.get("departmentId") || null;

  const inputs = await loadEligibility(sql, {
    tenantId: tenant.id,
    userId: user.id,
    targetRole,
    departmentId
  });
  const verdict = evaluateRoleRequest({ targetRole, ...inputs });

  const history = await sql`
    SELECT id, target_role, department_id, status, decision_reason, created_at, decided_at
    FROM role_requests
    WHERE user_id = ${user.id} AND tenant_id = ${tenant.id}::uuid
    ORDER BY created_at DESC
    LIMIT 10
  `;

  return ok({
    target: targetRole,
    requirement: REQUIREMENTS[targetRole],
    ...verdict,
    history
  });
}

export async function POST(request) {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, profile, tenant, sql } = ctx;

  let body;
  try {
    body = createSchema.parse(await request.json());
  } catch (error) {
    return validationError(error);
  }

  const rules = REQUIREMENTS[body.target_role];
  const departmentId = body.department_id || null;
  if (rules.requiresDepartment && !departmentId) {
    return fail(
      "DEPARTMENT_REQUIRED",
      body.target_role === "dept_lead"
        ? "Pick the department you want to lead"
        : "Pick the department you want to hold Core in",
      400
    );
  }

  const inputs = await loadEligibility(sql, {
    tenantId: tenant.id,
    userId: user.id,
    targetRole: body.target_role,
    departmentId
  });
  const verdict = evaluateRoleRequest({ targetRole: body.target_role, ...inputs });

  if (!verdict.eligible) {
    // 409 for a state conflict (already asked, cooldown, already hold the role);
    // 403 for "your record does not clear the bar". The distinction matters to
    // the client: one is "wait", the other is "do the work".
    const stateCodes = new Set(["ALREADY_AT_ROLE", "OPEN_REQUEST_EXISTS", "COOLDOWN"]);
    const stateConflict = verdict.reasons.some((r) => stateCodes.has(r.code));
    return fail(
      verdict.reasons[0]?.code || "NOT_ELIGIBLE",
      verdict.reasons.map((r) => r.message).join(" "),
      stateConflict ? 409 : 403
    );
  }

  let created;
  try {
    [created] = await sql`
      INSERT INTO role_requests (
        tenant_id, user_id, target_role, department_id, statement,
        score_at_request, tier_at_request, proof_at_request
      )
      VALUES (
        ${tenant.id}::uuid, ${user.id}, ${body.target_role}, ${departmentId}::uuid,
        ${body.statement}, ${verdict.proof.total}, ${inputs.tier},
        ${sql.json(verdict.proof)}
      )
      RETURNING id, target_role, department_id, status, created_at
    `;
  } catch (error) {
    // The partial unique index is the real single-open guard: two tabs posting
    // at once cannot both win, and the loser gets an honest answer.
    if (String(error?.code) === "23505") {
      return fail("OPEN_REQUEST_EXISTS", "You already have a request waiting for a decision.", 409);
    }
    // The database repeats the proof check (migration 099) so a bug in this
    // route cannot create a request with no evidence behind it. If it fires,
    // the API's own count and the database's disagree -- fail closed and say so
    // in the same shape the API would have.
    if (String(error?.code) === "23514" && String(error?.message).includes("BELOW_BAR")) {
      return fail("NOT_ENOUGH_PROOF", "Your verified record does not clear the bar for that seat yet.", 403);
    }
    throw error;
  }

  await writeAudit({
    sql,
    actorId: user.id,
    tenantId: tenant.id,
    action: "role_request.created",
    resource: "role_request",
    resourceId: created.id,
    after: {
      target_role: body.target_role,
      department_id: departmentId,
      tier: inputs.tier,
      proof: verdict.proof
    },
    authorizationContext: { source: "role_request_api" }
  });

  // Core lives on the membership row (the lead console reads `core_requested`),
  // so a request made here has to raise the same flag the department button does.
  if (body.target_role === "core") {
    await sql`
      INSERT INTO department_memberships (user_id, department_id, level, core_requested, tenant_id)
      VALUES (${user.id}, ${departmentId}::uuid, 'general', true, ${tenant.id}::uuid)
      ON CONFLICT (user_id, department_id) DO UPDATE SET core_requested = true
    `;
  }

  const leads = await sql`
    SELECT user_id FROM profiles
    WHERE tenant_id = ${tenant.id}::uuid AND role IN ('admin', 'vertical_lead')
    LIMIT 20
  `;
  for (const lead of leads) {
    await notify({
      sql,
      tenantId: tenant.id,
      userId: lead.user_id,
      type: "role_request",
      title: "Seat request waiting",
      body: `${profile.name || "A member"} asked for ${REQUIREMENTS[body.target_role].label}.`,
      link: "/admin/requests"
    });
  }

  return ok({ request: created, proof: verdict.proof }, { status: 201 });
}

