import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { getRequestContext, writeAudit, notify } from "@/lib/auth-server";

const attendSchema = z.object({
  checkInCode: z.string().min(4).max(20)
  // or studentId for manual override:
}).or(z.object({ studentId: z.string().min(1).max(100) }));

// Check in an attendee by door code (or student id override), mark attended,
// and issue their certificate exactly once.
export async function POST(request, { params }) {
  const ctx = await getRequestContext({ adminOnly: true });
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error === "FORBIDDEN") return fail("FORBIDDEN", "Admin access required", 403);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, tenant, sql } = ctx;
  const { id } = await params;
  let body;
  try {
    body = attendSchema.parse(await request.json());
  } catch (e) {
    return validationError(e);
  }
  const [event] = await sql`SELECT * FROM events WHERE id = ${id} AND tenant_id = ${tenant?.id ?? null}::uuid LIMIT 1`;
  if (!event) return fail("NOT_FOUND", "Event not found", 404);

  const [reg] = "checkInCode" in body
    ? await sql`SELECT * FROM event_registrations WHERE event_id = ${id} AND check_in_code = ${body.checkInCode} LIMIT 1`
    : await sql`SELECT * FROM event_registrations WHERE event_id = ${id} AND student_id = ${body.studentId} LIMIT 1`;
  if (!reg) return fail("NOT_FOUND", "No registration matches", 404);

  await sql`UPDATE event_registrations SET status = 'attended', attended_at = now() WHERE id = ${reg.id}`;
  const code = `CERT-${randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase()}`;
  const [cert] = await sql`
    INSERT INTO certificates (event_id, student_id, tenant_id, title, verification_code)
    VALUES (${id}, ${reg.student_id}, ${tenant?.id ?? null}, ${`Participation — ${event.title}`}, ${code})
    ON CONFLICT (verification_code) DO NOTHING RETURNING *
  `;
  // One certificate per student per event.
  const existing = cert || (await sql`SELECT * FROM certificates WHERE event_id = ${id} AND student_id = ${reg.student_id} LIMIT 1`)[0];
  await notify({
    sql, tenantId: tenant?.id, userId: reg.student_id, type: "certificate",
    title: `Certificate issued: ${event.title}`,
    body: "Your participation certificate is ready to view and print.",
    link: `/student/certificates/${existing.verification_code}`
  });
  await writeAudit({ sql, actorId: user.id, tenantId: tenant?.id, action: "checked_in_attendee", resource: "event", resourceId: id, after: { student: reg.student_id } });
  return ok({ attended: true, certificate: existing });
}
