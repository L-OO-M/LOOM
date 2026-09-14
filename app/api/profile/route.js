import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { getRequestContext, writeAudit } from "@/lib/auth-server";

const patchSchema = z.object({
  name: z.string().min(2).max(80).optional(),
  enrollmentNumber: z.string().max(40).nullable().optional(),
  department: z.string().max(80).nullable().optional(),
  rollNumber: z.string().max(40).nullable().optional(),
  branch: z.string().max(80).nullable().optional(),
  year: z.number().int().min(1).max(6).nullable().optional(),
  primaryDomain: z.string().max(40).nullable().optional(),
  githubUsername: z.string().max(39).nullable().optional(),
  onboardingCompleted: z.boolean().optional()
});

export async function GET() {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { profile, tenant } = ctx;
  return ok({ profile, tenant: tenant ? { id: tenant.id, slug: tenant.slug, name: tenant.name } : null });
}

export async function PATCH(request) {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, tenant, sql } = ctx;
  let body;
  try {
    body = patchSchema.parse(await request.json());
  } catch (e) {
    return validationError(e);
  }
  const [before] = await sql`SELECT * FROM profiles WHERE user_id = ${user.id} LIMIT 1`;
  const [updated] = await sql`
    UPDATE profiles SET
      name = COALESCE(${body.name ?? null}, name),
      enrollment_number = COALESCE(${body.enrollmentNumber ?? null}, enrollment_number),
      department = COALESCE(${body.department ?? null}, department),
      roll_number = COALESCE(${body.rollNumber ?? null}, roll_number),
      branch = COALESCE(${body.branch ?? null}, branch),
      year = COALESCE(${body.year ?? null}, year),
      primary_domain = COALESCE(${body.primaryDomain ?? null}, primary_domain),
      github_username = COALESCE(${body.githubUsername ?? null}, github_username),
      onboarding_completed = COALESCE(${body.onboardingCompleted ?? null}, onboarding_completed),
      updated_at = NOW()
    WHERE user_id = ${user.id}
    RETURNING *
  `;
  await writeAudit({ sql, actorId: user.id, tenantId: tenant?.id, action: "updated_profile", resource: "profile", resourceId: user.id, before: { name: before?.name }, after: { name: updated?.name } });
  return ok({ profile: updated });
}
