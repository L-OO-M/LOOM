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
  onboardingCompleted: z.boolean().optional()
});

// githubUsername is deliberately NOT settable here.
//
// This route used to accept it, which was a second, unguarded writer for
// profiles.github_username. POST /api/github is the only legitimate path: it
// rejects a handle already claimed by another account, and it is the path
// migration 035's uniqueness constraint was written to protect.
//
// Because lib/github.js resolves webhook attribution from this column as a
// fallback, the duplicate writer let a student point the mirror at somebody
// else's handle and absorb their pushes and pull requests as their own score --
// the same silent misattribution class migration 035 closed, reopened through
// the settings form. Ownership of this column now lives in exactly one route.

export const dynamic = "force-dynamic";

export async function GET() {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { profile, tenant } = ctx;
  const res = ok({ profile, tenant: tenant ? { id: tenant.id, slug: tenant.slug, name: tenant.name } : null });
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  return res;
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
      onboarding_completed = COALESCE(${body.onboardingCompleted ?? null}, onboarding_completed),
      updated_at = NOW()
    WHERE user_id = ${user.id}
    RETURNING *
  `;
  await writeAudit({ sql, actorId: user.id, tenantId: tenant?.id, action: "updated_profile", resource: "profile", resourceId: user.id, before: { name: before?.name }, after: { name: updated?.name } });
  return ok({ profile: updated });
}
