import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { getRequestContext, writeAudit, notify } from "@/lib/auth-server";
import { checklistProgress } from "@/lib/people";
import { assertAdminFloor, isLastAdminError } from "@/lib/last-admin";

const statusSchema = z.object({
  status: z.enum(["active", "suspended", "deactivated"]),
  reason: z.string().trim().max(500).optional().nullable(),
  confirm: z.boolean().optional()
});

export async function PATCH(request, { params }) {
  const ctx = await getRequestContext({ adminOnly: true });
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error === "FORBIDDEN") return fail("FORBIDDEN", "Admin only", 403);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, tenant, sql } = ctx;
  if (!tenant?.id) return fail("FORBIDDEN", "No chapter context", 403);

  const { id } = await params;
  let body;
  try {
    body = statusSchema.parse(await request.json());
  } catch (e) {
    return validationError(e);
  }

  const [target] = await sql`
    SELECT user_id, name, role, account_status, status_reason
    FROM profiles
    WHERE user_id = ${id} AND tenant_id = ${tenant.id}::uuid
    LIMIT 1
  `;
  if (!target) return fail("NOT_FOUND", "Member not in your chapter", 404);

  if (target.user_id === user.id) {
    return fail("FORBIDDEN", "You cannot change your own account status", 403);
  }

  const [founderSeat] = await sql`
    SELECT is_founder, locked, label FROM platform_admins WHERE user_id = ${target.user_id} LIMIT 1
  `;
  if (founderSeat) {
    return fail("FORBIDDEN", `${founderSeat.label || "A founder"} seat is permanent and cannot be suspended`, 403);
  }

  const current = target.account_status || "active";
  if (body.status === current) {
    return ok({ profile: target, changed: false });
  }

  const reason = (body.reason || "").trim();
  if (body.status !== "active" && reason.length < 3) {
    return fail("VALIDATION_ERROR", "Give a short reason for this status change", 400);
  }

  // Reactivation is deliberately explicit: a suspended account cannot slide
  // back to active through a role edit, a bulk action, or a stray request.
  if (body.status === "active" && body.confirm !== true) {
    return fail("CONFIRM_REQUIRED", "Confirm that this account should regain access", 400);
  }

  const removingAdminSeat = body.status !== "active" && target.role === "admin";

  let offboarding = null;
  if (body.status === "deactivated") {
    const rows = await sql`
      SELECT kind, item_key, done FROM people_checklist_items
      WHERE tenant_id = ${tenant.id}::uuid
        AND user_id = ${target.user_id}
        AND kind = 'offboarding'
        AND role = ${target.role}
    `;
    offboarding = checklistProgress(rows, target.role, "offboarding");
    if (offboarding.outstanding.length > 0) {
      return fail(
        "OFFBOARDING_OUTSTANDING",
        `Finish ${offboarding.outstanding.length} outstanding offboarding item${offboarding.outstanding.length === 1 ? "" : "s"} before closing this account`,
        409,
        { outstanding: offboarding.outstanding.map((i) => ({ key: i.key, label: i.label })) }
      );
    }
  }

  let updated;
  try {
    updated = await sql.begin(async (tx) => {
    if (removingAdminSeat) {
      await assertAdminFloor(tx, { tenantId: tenant.id, removingUserIds: [target.user_id] });
    }
    const [row] = await tx`
      UPDATE profiles
      SET account_status = ${body.status},
          status_reason = ${body.status === "active" ? null : reason},
          status_changed_at = NOW(),
          status_changed_by = ${user.id},
          updated_at = NOW()
      WHERE user_id = ${target.user_id} AND tenant_id = ${tenant.id}::uuid
      RETURNING user_id, name, role, account_status, status_reason, status_changed_at
    `;
    if (body.status !== "active") {
      // A paused account must also disappear from the public mentor directory
      // immediately. Reactivation does not silently re-advertise them.
      await tx`
        UPDATE mentors SET available = false
        WHERE user_id = ${target.user_id} AND tenant_id = ${tenant.id}::uuid
      `;
    }
    await writeAudit({
      sql: tx,
      actorId: user.id,
      tenantId: tenant.id,
      action: body.status === "active" ? "reactivated_account" : `marked_account_${body.status}`,
      resource: "profile",
      resourceId: target.user_id,
      before: { status: current, reason: target.status_reason },
      after: { status: body.status, reason: body.status === "active" ? null : reason }
    });
    if (body.status === "active") {
      await notify({
        sql: tx,
        tenantId: tenant.id,
        userId: target.user_id,
        type: "account_reactivated",
        title: "Your chapter access is restored",
        body: "An admin reactivated your account. Open your workspace to continue.",
        link: "/student"
      });
    }
    return row;
    });
  } catch (error) {
    if (isLastAdminError(error)) {
      return fail("FORBIDDEN", "Cannot suspend the last active admin in this chapter", 403);
    }
    throw error;
  }

  return ok({ profile: updated, offboarding });
}
