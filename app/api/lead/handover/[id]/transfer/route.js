import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { getRequestContext, writeAudit, notify } from "@/lib/auth-server";
import { homeForRole } from "@/lib/auth";
import { handoverScope, findCandidate, applyHandoverTransfer, ROLE_LABELS } from "@/lib/handover";

const schema = z.object({
  note: z.string().max(1000).default("")
});

export async function POST(request, { params }) {
  const ctx = await getRequestContext({ adminOnly: true });
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error === "FORBIDDEN") return fail("FORBIDDEN", "Admin only", 403);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, tenant, sql } = ctx;

  let body;
  try {
    body = schema.parse(await request.json());
  } catch (e) {
    return validationError(e);
  }

  const { id } = await params;

  let result;
  try {
    result = await sql.begin(async (tx) => {
      const [handover] = await tx`
        SELECT * FROM lead_handovers
        WHERE id = ${id} AND tenant_id = ${tenant.id}::uuid
        FOR UPDATE
      `;
      if (!handover) return { res: fail("NOT_FOUND", "Handover not found", 404) };
      if (handover.status !== "submitted") {
        return { res: fail("CONFLICT", "Only a submitted handover can be approved", 409) };
      }
      if (handover.from_user_id === user.id) {
        return { res: fail("FORBIDDEN", "You cannot approve your own handover", 403) };
      }
      if (handover.to_user_id === user.id) {
        return { res: fail("FORBIDDEN", "You cannot approve a handover to yourself", 403) };
      }

      const [founderSeat] = await tx`
        SELECT label FROM platform_admins WHERE user_id = ${handover.from_user_id} LIMIT 1
      `;
      if (founderSeat) {
        return { res: fail("FORBIDDEN", `${founderSeat.label || "A founder"} seat is permanent`, 403) };
      }

      const [outgoing] = await tx`
        SELECT p.*,
          (SELECT json_agg(json_build_object(
             'department_id', m.department_id,
             'level', m.level,
             'name', d.name,
             'vertical', d.vertical,
             'term_end', m.term_end
           ) ORDER BY d.name)
           FROM department_memberships m
           JOIN departments d ON d.id = m.department_id
           WHERE m.user_id = p.user_id AND d.tenant_id = ${tenant.id}::uuid
          ) AS memberships
        FROM profiles p
        WHERE p.user_id = ${handover.from_user_id} AND p.tenant_id = ${tenant.id}::uuid
        LIMIT 1
      `;
      if (!outgoing) {
        return { res: fail("CONFLICT", "The outgoing lead is no longer in this chapter", 409) };
      }

      const scope = handoverScope({
        ...outgoing,
        roleTermEnd: outgoing.role_term_end,
        memberships: outgoing.memberships || []
      });
      if (scope.error) return { res: fail("CONFLICT", scope.error, 409) };
      if (scope.role !== handover.role
        || (scope.departmentId ?? null) !== (handover.department_id ?? null)
        || (scope.vertical ?? null) !== (handover.vertical ?? null)) {
        return { res: fail("CONFLICT", "The outgoing seat changed after this handover was filed", 409) };
      }

      const candidate = await findCandidate(tx, {
        tenantId: tenant.id,
        scope,
        fromUserId: handover.from_user_id,
        toUserId: handover.to_user_id
      });
      if (!candidate) {
        return { res: fail("CONFLICT", "The nominated successor is no longer eligible. Send the handover back.", 409) };
      }

      const counts = await applyHandoverTransfer(tx, {
        tenantId: tenant.id,
        handover,
        actorId: user.id
      });

      const [completed] = await tx`
        UPDATE lead_handovers
        SET status = 'completed',
            review_note = ${body.note},
            reviewed_at = NOW(),
            reviewed_by = ${user.id},
            completed_at = NOW(),
            completed_by = ${user.id},
            updated_at = NOW()
        WHERE id = ${handover.id} AND tenant_id = ${tenant.id}::uuid
        RETURNING *
      `;

      await writeAudit({
        sql: tx,
        actorId: user.id,
        tenantId: tenant.id,
        action: "completed_handover",
        resource: "lead_handover",
        resourceId: handover.id,
        before: { from: handover.from_user_id, to: handover.to_user_id, status: "submitted" },
        after: { status: "completed", role: handover.role, ...counts }
      });

      const label = ROLE_LABELS[handover.role] || handover.role;
      await notify({
        sql: tx,
        tenantId: tenant.id,
        userId: handover.to_user_id,
        type: "handover_received",
        title: `You are now ${label}`,
        body: `${outgoing.name || "The outgoing lead"} handed you the seat. Read the brief and open your console.`,
        link: homeForRole(handover.role)
      });
      await notify({
        sql: tx,
        tenantId: tenant.id,
        userId: handover.from_user_id,
        type: "handover_completed",
        title: "Handover complete",
        body: `${candidate.name || "Your successor"} now holds the ${label.toLowerCase()} seat. Thank you for filing a real brief.`,
        link: "/student"
      });

      return { handover: completed, counts, candidate };
    });
  } catch (e) {
    console.error("[handover] transfer failed", e);
    return fail("CONFLICT", "The transfer could not be completed. No changes were saved.", 409);
  }

  if (result.res) return result.res;
  return ok(result);
}
