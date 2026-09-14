import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { getRequestContext, writeAudit, notify } from "@/lib/auth-server";
import { reviewApplication } from "@/lib/mentorship";

export async function GET() {
  const ctx = await getRequestContext({ adminOnly: true });
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error === "FORBIDDEN") return fail("FORBIDDEN", "Admin access required", 403);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { tenant, sql } = ctx;
  const rows = await sql`
    SELECT a.*, p.name AS applicant_name FROM mentor_applications a
    LEFT JOIN profiles p ON p.user_id = a.student_id
    WHERE a.tenant_id = ${tenant?.id ?? null}::uuid OR ${tenant?.id ?? null}::uuid IS NULL
    ORDER BY CASE WHEN a.status = 'pending' THEN 0 ELSE 1 END, a.created_at DESC
    LIMIT 50
  `;
  return ok({ applications: rows });
}

const reviewSchema = z.object({
  id: z.string().uuid(),
  decision: z.enum(["approved", "rejected"])
});

export async function POST(request) {
  const ctx = await getRequestContext({ adminOnly: true });
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error === "FORBIDDEN") return fail("FORBIDDEN", "Admin access required", 403);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, tenant, sql } = ctx;
  let body;
  try {
    body = reviewSchema.parse(await request.json());
  } catch (e) {
    return validationError(e);
  }
  try {
    const updated = await reviewApplication({
      sql, applicationId: body.id, tenantId: tenant?.id ?? null,
      reviewerId: user.id, decision: body.decision
    });
    await writeAudit({
      sql, actorId: user.id, tenantId: tenant?.id,
      action: body.decision === "approved" ? "approved_mentor" : "rejected_mentor_application",
      resource: "mentor_application", resourceId: body.id,
      after: { student: updated.student_id, decision: body.decision }
    });
    await notify({
      sql, tenantId: tenant?.id, userId: updated.student_id,
      type: "mentor_application",
      title: body.decision === "approved" ? "You're a mentor now" : "Mentor application reviewed",
      body: body.decision === "approved"
        ? "Your proof spoke. Juniors can now find you — the loop continues through you."
        : "Not yet — keep building public proof and apply again.",
      link: "/student/mentorship"
    });
    return ok({ application: updated });
  } catch (e) {
    if (e.message === "NOT_FOUND") return fail("NOT_FOUND", "Pending application not found", 404);
    throw e;
  }
}
