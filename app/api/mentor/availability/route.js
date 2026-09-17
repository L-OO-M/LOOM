import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { getRequestContext, writeAudit } from "@/lib/auth-server";

const slotSchema = z.object({
  day: z.number().int().min(0).max(6),
  start: z.string().regex(/^\d{2}:\d{2}$/),
  end: z.string().regex(/^\d{2}:\d{2}$/),
});
const putSchema = z.object({ slots: z.array(slotSchema).max(28) });

// Mentors manage their OWN weekly schedule. Replaces the whole week
// (simplest correct semantics; the UI always sends the full grid).
export async function PUT(request) {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, tenant, sql } = ctx;
  const [mentor] = await sql`SELECT * FROM mentors WHERE user_id = ${user.id} LIMIT 1`;
  if (!mentor) return fail("NOT_MENTOR", "Mentor profile not found", 403);
  let body;
  try {
    body = putSchema.parse(await request.json());
  } catch (e) {
    return validationError(e);
  }
  for (const s of body.slots) {
    if (s.start >= s.end) return fail("INVALID", "Each slot must end after it starts", 400);
  }
  await sql`DELETE FROM mentor_availability WHERE mentor_id = ${user.id}`;
  for (const s of body.slots) {
    await sql`
      INSERT INTO mentor_availability (mentor_id, day_of_week, start_time, end_time)
      VALUES (${user.id}, ${s.day}, ${s.start}, ${s.end})
      ON CONFLICT (mentor_id, day_of_week, start_time) DO UPDATE SET end_time = EXCLUDED.end_time
    `;
  }
  await writeAudit({ sql, actorId: user.id, tenantId: tenant?.id, action: "updated_availability", resource: "mentor", resourceId: mentor.id });
  const availability = await sql`
    SELECT * FROM mentor_availability WHERE mentor_id = ${user.id} ORDER BY day_of_week, start_time
  `;
  return ok({ availability });
}
