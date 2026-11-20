import { ZodError, z } from "zod";
import { ok, fail } from "@/lib/api";
import { getRequestContext, writeAudit } from "@/lib/auth-server";
import { PRIMARY_DOMAINS, normalizeDomainKey } from "@/lib/domains";

// The onboarding form and the settings form both write here, and both are
// filled by people, not by a machine: a trailing space, a year typed as "3",
// or a display label like "Web Development" is a normal thing to send. The
// schema below normalises those shapes before validating, so a harmless input
// no longer fails with the old opaque "Request body is invalid".
//
// Absent, null and blank all mean "leave this field alone" because the UPDATE
// uses COALESCE. That is the behaviour both forms already relied on.

const optionalText = (max, label) =>
  z.preprocess(
    (value) => {
      if (value === undefined || value === null) return undefined;
      if (typeof value !== "string") return value;
      const trimmed = value.trim();
      return trimmed === "" ? undefined : trimmed;
    },
    z
      .string()
      .max(max, `${label} must be ${max} characters or fewer`)
      .optional()
  );

const yearField = z.preprocess(
  (value) => {
    if (value === undefined || value === null) return undefined;
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed) return undefined;
      const parsed = Number(trimmed);
      return Number.isFinite(parsed) ? parsed : value;
    }
    return value;
  },
  z
    .number({ error: "Year must be a number" })
    .int("Year must be a whole number")
    .min(1, "Year must be between 1 and 6")
    .max(6, "Year must be between 1 and 6")
    .optional()
);

const domainField = z.preprocess(
  (value) => {
    if (value === undefined || value === null) return undefined;
    if (typeof value !== "string") return value;
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    // Accept the stored key ("web") and the display label ("Web Development"),
    // then let the enum reject anything that is not a real primary track.
    return normalizeDomainKey(trimmed) ?? trimmed;
  },
  z
    .enum(PRIMARY_DOMAINS, {
      error: "Pick one of the available tracks"
    })
    .optional()
);

const booleanField = z.preprocess(
  (value) => {
    if (value === "true") return true;
    if (value === "false") return false;
    return value;
  },
  z.boolean({ error: "Expected true or false" }).optional()
);

const patchSchema = z.object({
  name: z.preprocess(
    (value) => {
      if (typeof value !== "string") return value;
      const trimmed = value.trim();
      return trimmed === "" ? undefined : trimmed;
    },
    z
      .string()
      .min(2, "Name must be at least 2 characters")
      .max(80, "Name must be 80 characters or fewer")
      .optional()
  ),
  enrollmentNumber: optionalText(40, "Enrollment number"),
  department: optionalText(80, "Branch"),
  rollNumber: optionalText(40, "Roll number"),
  branch: optionalText(80, "Branch"),
  year: yearField,
  primaryDomain: domainField,
  onboardingCompleted: booleanField
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

/**
 * Turn a validation failure into a message a person can act on.
 *
 * The old handler returned "Request body is invalid" for every field, so a
 * member could not tell whether their name, year or track was the problem.
 * `details.field` lets the client focus the offending control.
 */
function profileValidationError(error) {
  if (!(error instanceof ZodError)) {
    return fail("VALIDATION_ERROR", "Send your profile as a JSON body", 400, { field: null });
  }
  const issue = error.issues?.[0];
  return fail(
    "VALIDATION_ERROR",
    issue?.message || "Some details need attention",
    400,
    { field: issue?.path?.[0] ?? null }
  );
}

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
  } catch (error) {
    return profileValidationError(error);
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
