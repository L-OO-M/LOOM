import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { getRequestContext, writeAudit, notify } from "@/lib/auth-server";

const issueSchema = z.object({
  studentId: z.string().min(1).max(100),
  badgeId: z.string().uuid().nullable().optional(),
  sourceType: z.enum(["manual", "oss", "contest", "roadmap"]).default("manual"),
  sourceRef: z.string().max(200).nullable().optional(),
  level: z.enum(["bronze", "silver", "gold"]).default("gold"),
  evidenceUrl: z.string().url().max(500).nullable().optional()
});

// Admin issues an achievement to a student in their tenant.
export async function POST(request) {
  const ctx = await getRequestContext({ adminOnly: true });
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error === "FORBIDDEN") return fail("FORBIDDEN", "Admin access required", 403);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, tenant, sql } = ctx;
  let body;
  try {
    body = issueSchema.parse(await request.json());
  } catch (e) {
    return validationError(e);
  }
  const [student] = await sql`
    SELECT user_id FROM profiles WHERE user_id = ${body.studentId}
      AND (tenant_id IS NULL OR tenant_id = ${tenant?.id ?? null}::uuid)
    LIMIT 1
  `;
  if (!student) return fail("STUDENT_NOT_FOUND", "Student not found in your chapter", 404);
  if (body.badgeId) {
    const [badge] = await sql`
      SELECT id FROM skill_badges WHERE id = ${body.badgeId}
        AND (tenant_id IS NULL OR tenant_id = ${tenant?.id ?? null}::uuid)
      LIMIT 1
    `;
    if (!badge) return fail("BADGE_NOT_FOUND", "Badge not found", 404);
  }
  const [row] = await sql`
    INSERT INTO student_achievements (student_id, tenant_id, badge_id, source_type, source_ref, level, evidence_url)
    VALUES (${body.studentId}, ${tenant?.id ?? null}, ${body.badgeId || null}, ${body.sourceType}, ${body.sourceRef || null}, ${body.level}, ${body.evidenceUrl || null})
    ON CONFLICT DO NOTHING
    RETURNING *
  `;
  if (!row) return fail("DUPLICATE", "This achievement was already issued", 409);
  await notify({
    sql, tenantId: tenant?.id, userId: body.studentId,
    type: "achievement", title: "New achievement earned",
    body: "Your chapter issued you a new achievement. Share it as a verifiable credential.",
    link: "/student/credentials"
  });
  await writeAudit({ sql, actorId: user.id, tenantId: tenant?.id, action: "issued_achievement", resource: "achievement", resourceId: row.id, after: { student: body.studentId } });
  return ok({ achievement: row }, { status: 201 });
}
