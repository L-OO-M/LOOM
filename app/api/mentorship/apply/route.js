import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { getRequestContext, writeAudit, notify } from "@/lib/auth-server";
import { applyForMentorship } from "@/lib/mentorship";

const applySchema = z.object({
  statement: z.string().min(20).max(1000),
  expertise: z.string().min(2).max(200)
});

export async function GET() {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, sql } = ctx;
  const rows = await sql`
    SELECT * FROM mentor_applications WHERE student_id = ${user.id}
    ORDER BY created_at DESC LIMIT 5
  `;
  const [isMentor] = await sql`SELECT user_id FROM mentors WHERE user_id = ${user.id} LIMIT 1`;
  return ok({ applications: rows, isMentor: !!isMentor });
}

export async function POST(request) {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, tenant, sql } = ctx;
  let body;
  try {
    body = applySchema.parse(await request.json());
  } catch (e) {
    return validationError(e);
  }
  try {
    const { application } = await applyForMentorship({
      sql, studentId: user.id, tenantId: tenant?.id ?? null,
      statement: body.statement, expertise: body.expertise
    });
    await writeAudit({
      sql, actorId: user.id, tenantId: tenant?.id,
      action: "applied_for_mentorship", resource: "mentor_application", resourceId: application.id,
      after: { expertise: body.expertise }
    });
    // Reviewers are chapter admins — they decide on proof, not promises.
    const admins = await sql`
      SELECT user_id FROM profiles
      WHERE role = 'admin' AND (tenant_id = ${tenant?.id ?? null}::uuid OR ${tenant?.id ?? null}::uuid IS NULL)
      LIMIT 10
    `;
    const [applicant] = await sql`SELECT name FROM profiles WHERE user_id = ${user.id} LIMIT 1`;
    for (const a of admins) {
      await notify({
        sql, tenantId: tenant?.id, userId: a.user_id, type: "mentor_application",
        title: `Mentor application: ${applicant?.name || "a student"}`,
        body: "Review their evidence trail and approve or decline.",
        link: "/admin/mentors"
      });
    }
    return ok({ application }, { status: 201 });
  } catch (e) {
    if (e.message === "NOT_ELIGIBLE") {
      return fail("NOT_ELIGIBLE", "Not yet eligible to mentor", 422, { reasons: e.reasons || [] });
    }
    if (e.message === "ALREADY_PENDING") return fail("ALREADY_PENDING", "Your application is already under review", 409);
    if (e.message === "ALREADY_MENTOR") return fail("ALREADY_MENTOR", "You are already a mentor", 409);
    throw e;
  }
}
