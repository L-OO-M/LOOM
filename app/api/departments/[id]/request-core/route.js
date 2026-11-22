import { scope } from "@/lib/tenant-scope";
import { ok, fail } from "@/lib/api";
import { getRequestContext, writeAudit } from "@/lib/auth-server";
import { checkRateLimit } from "@/lib/rate-limit";
import { evaluateRoleRequest, loadEligibility } from "@/lib/role-requests";

// Core Member request from a department page (Plan Section 6). Joining as
// General stays instant, so a missing membership is created first -- never a
// dead end.
//
// What changed: this used to be a free one-click flag. Anyone could set
// `core_requested = true` as often as the per-minute rate limit allowed, with
// nothing attached to it, so the lead queue filled with names and no evidence
// and leads stopped reading it. The request now has to clear the bar in
// lib/role-requests.js (verified rank + verified proof), it records a
// `role_requests` row so the lead sees a snapshot of the record at request time,
// and the cooldown there stops the same person asking again every week.
export async function POST(request, { params }) {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, tenant, sql } = ctx;
  const { id } = await params;
  const limited = checkRateLimit(`request-core:${user.id}`, { limit: 10, windowMs: 60_000 });
  if (!limited.ok) return fail("RATE_LIMITED", "Too many requests — slow down", 429);
  const [dept] = await sql`
    SELECT * FROM departments WHERE id = ${id}
      AND is_active AND tenant_id = ${scope(tenant?.id ?? null)}::uuid
    LIMIT 1
  `;
  if (!dept) return fail("NOT_FOUND", "Department not found", 404);
  const [existing] = await sql`
    SELECT * FROM department_memberships WHERE user_id = ${user.id} AND department_id = ${dept.id} LIMIT 1
  `;
  if (existing && existing.level !== "general") {
    return ok({ membership: existing, alreadyElevated: true });
  }

  const inputs = await loadEligibility(sql, {
    tenantId: tenant?.id,
    userId: user.id,
    targetRole: "core",
    departmentId: dept.id
  });
  const verdict = evaluateRoleRequest({ targetRole: "core", ...inputs });
  if (!verdict.eligible) {
    // 409 = a state conflict (already asked, cooldown, already Core); 403 = the
    // record itself does not clear the bar. The client needs to tell those apart:
    // one means "wait", the other means "do the work".
    const stateCodes = new Set(["ALREADY_AT_ROLE", "OPEN_REQUEST_EXISTS", "COOLDOWN"]);
    const stateConflict = verdict.reasons.some((r) => stateCodes.has(r.code));
    return fail(
      verdict.reasons[0]?.code || "NOT_ELIGIBLE",
      verdict.reasons.map((r) => r.message).join(" "),
      stateConflict ? 409 : 403,
      { reasons: verdict.reasons, proof: verdict.proof }
    );
  }

  const statement = `Asked for Core in ${dept.name} from the department page.`;
  let created = null;
  let membership = null;
  try {
    [created] = await sql`
      INSERT INTO role_requests (
        tenant_id, user_id, target_role, department_id, statement,
        score_at_request, tier_at_request, proof_at_request
      )
      VALUES (
        ${dept.tenant_id}::uuid, ${user.id}, 'core', ${dept.id}::uuid,
        ${statement}, ${verdict.proof.total}, ${inputs.tier},
        ${sql.json(verdict.proof)}
      )
      ON CONFLICT DO NOTHING
      RETURNING id, target_role, department_id, status, created_at
    `;

    [membership] = await sql`
      INSERT INTO department_memberships (user_id, department_id, level, core_requested, tenant_id)
      VALUES (${user.id}, ${dept.id}, 'general', true, ${dept.tenant_id})
      ON CONFLICT (user_id, department_id) DO UPDATE SET core_requested = true
      RETURNING *
    `;
  } catch (error) {
    // Migration 099 repeats the proof check in the database. If it fires, the
    // two counts disagree -- refuse rather than write a request with no
    // evidence behind it.
    if (String(error?.code) === "23514" && String(error?.message).includes("BELOW_BAR")) {
      return fail("NOT_ENOUGH_PROOF", "Core needs 3 verified pieces of work. Yours does not clear the bar yet.", 403, {
        proof: verdict.proof
      });
    }
    throw error;
  }

  await writeAudit({ sql, actorId: user.id, tenantId: tenant?.id, action: "requested_core", resource: "department", resourceId: dept.id, after: { slug: dept.slug, tier: inputs.tier, proof: verdict.proof } });
  return ok({ membership, request: created || null, proof: verdict.proof }, { status: 201 });
}
