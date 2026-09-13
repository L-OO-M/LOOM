import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { getRequestContext, writeAudit, notify } from "@/lib/auth-server";
import { awardOssBadges } from "@/lib/oss";

const reviewSchema = z.object({
  status: z.enum(["verified", "rejected"])
});

// Admin verifies (or rejects) a claimed contribution. Verifying awards badges.
export async function PATCH(request, { params }) {
  const ctx = await getRequestContext({ adminOnly: true });
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error === "FORBIDDEN") return fail("FORBIDDEN", "Admin access required", 403);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, tenant, sql } = ctx;
  const { id } = await params;
  let body;
  try {
    body = reviewSchema.parse(await request.json());
  } catch (e) {
    return validationError(e);
  }
  const [row] = await sql`
    SELECT * FROM student_oss_contributions WHERE id = ${id}
      AND (tenant_id IS NULL OR tenant_id = ${tenant?.id ?? null}::uuid)
    LIMIT 1
  `;
  if (!row) return fail("NOT_FOUND", "Contribution not found", 404);
  const [updated] = await sql`
    UPDATE student_oss_contributions
    SET status = ${body.status}, verified_at = CASE WHEN ${body.status} = 'verified' THEN now() ELSE verified_at END
    WHERE id = ${id} RETURNING *
  `;
  let granted = [];
  if (body.status === "verified") {
    granted = await awardOssBadges({ sql, studentId: updated.student_id, tenantId: updated.tenant_id, projectUrl: updated.repo_url });
    await notify({
      sql, tenantId: updated.tenant_id, userId: updated.student_id,
      type: "oss_verified", title: "OSS contribution verified",
      body: `Your contribution ${updated.pr_url} was verified${granted.length ? ` — badge earned: ${granted.join(", ")}` : ""}.`,
      link: "/student/opensource"
    });
  }
  await writeAudit({ sql, actorId: user.id, tenantId: tenant?.id, action: `oss_${body.status}`, resource: "oss_contribution", resourceId: id, after: { status: body.status } });
  return ok({ contribution: updated, granted });
}
