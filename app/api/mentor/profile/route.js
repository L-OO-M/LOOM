import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { getRequestContext, writeAudit } from "@/lib/auth-server";

const profileSchema = z.object({
  headline: z.string().max(120).optional(),
  bio: z.string().max(1000).optional(),
  skills: z.string().max(300).optional(),
  expertise: z.string().max(300).optional(),
  experience_years: z.number().int().min(0).max(60).nullable().optional(),
  languages: z.string().max(200).optional(),
  timezone: z.string().max(80).optional().nullable(),
  hourly_rate: z.number().int().min(0).max(100000).nullable().optional(),
  session_minutes: z.number().int().refine((n) => [30, 60].includes(n)).optional(),
  available: z.boolean().optional(),
});

// Mentors edit their OWN profile only. Admins use /admin/mentors.
export async function PATCH(request) {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, tenant, sql } = ctx;
  const [mentor] = await sql`SELECT * FROM mentors WHERE user_id = ${user.id} LIMIT 1`;
  if (!mentor) return fail("NOT_MENTOR", "Mentor profile not found", 403);
  let body;
  try {
    body = profileSchema.parse(await request.json());
  } catch (e) {
    return validationError(e);
  }
  const [updated] = await sql`
    UPDATE mentors SET
      headline = COALESCE(${body.headline ?? null}, headline),
      bio = COALESCE(${body.bio ?? null}, bio),
      skills = COALESCE(${body.skills ?? null}, skills),
      expertise = COALESCE(${body.expertise ?? null}, expertise),
      experience_years = COALESCE(${body.experience_years ?? null}, experience_years),
      languages = COALESCE(${body.languages ?? null}, languages),
      timezone = COALESCE(${body.timezone ?? null}, timezone),
      hourly_rate = COALESCE(${body.hourly_rate ?? null}, hourly_rate),
      session_minutes = COALESCE(${body.session_minutes ?? null}, session_minutes),
      available = COALESCE(${body.available ?? null}, available)
    WHERE user_id = ${user.id} RETURNING *
  `;
  await writeAudit({ sql, actorId: user.id, tenantId: tenant?.id, action: "updated_mentor_profile", resource: "mentor", resourceId: mentor.id });
  return ok({ mentor: updated });
}
