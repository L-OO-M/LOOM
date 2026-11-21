import { ZodError, z } from "zod";
import { ok, fail } from "@/lib/api";
import { getRequestContext, writeAudit } from "@/lib/auth-server";
import { getSql } from "@/lib/db";
import { PRIMARY_DOMAINS, normalizeDomainKey } from "@/lib/domains";
import { matchChapterForInstitution } from "@/lib/chapters";

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
  institution: optionalText(120, "Institution"),
  location: optionalText(80, "Location"),
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
      institution = COALESCE(${body.institution ?? null}, institution),
      location = COALESCE(${body.location ?? null}, location),
      onboarding_completed = COALESCE(${body.onboardingCompleted ?? null}, onboarding_completed),
      updated_at = NOW()
    WHERE user_id = ${user.id}
    RETURNING *
  `;
  await writeAudit({ sql, actorId: user.id, tenantId: tenant?.id, action: "updated_profile", resource: "profile", resourceId: user.id, before: { name: before?.name }, after: { name: updated?.name } });

  // A profile whose chapter is empty has nothing to move; nothing to report.
  const chapter = await placeInChapter({
    userId: user.id,
    before,
    institution: body.institution ?? null
  });

  return ok({ profile: chapter.moved ? { ...updated, tenant_id: chapter.chapter.id } : updated, chapter });
}

/**
 * Read the institution the member named and, when it belongs to a different
 * chapter, move the account there.
 *
 * This is the only writer that changes profiles.tenant_id from a user action,
 * so the guards are the feature:
 *
 *   - only while onboarding is unfinished. After that a chapter change is a
 *     governance decision (members, reports and history live in the old one),
 *     so the request is reported back and left alone;
 *   - never for someone holding a position. A core/dept_lead membership or a
 *     platform_admin seat is authority inside one chapter; silently re-homing
 *     it would either drop the seat or carry it somewhere it was never granted;
 *   - never when the chapter cannot be resolved, because guessing would move a
 *     real account on a typo.
 *
 * The move itself runs on the owner connection: crossing tenants is exactly
 * what a tenant-scoped connection must refuse, so using it here is deliberate
 * rather than an accident of the flag being off.
 */
async function placeInChapter({ userId, before, institution }) {
  const name = institution;
  if (!name) return { moved: false, reason: "no_institution" };
  if (!before) return { moved: false, reason: "no_profile" };

  const owner = getSql();
  const target = await matchChapterForInstitution(owner, name);
  if (!target) return { moved: false, reason: "chapter_unknown", institution: name };
  if (target.id === before.tenant_id) return { moved: false, reason: "already_there", chapter: target };

  if (before.onboarding_completed !== false) {
    return { moved: false, reason: "onboarding_complete", chapter: target, institution: name };
  }
  if (!before.tenant_id) return { moved: false, reason: "chapter_unknown", chapter: target };

  const [state] = await owner`
    SELECT
      (SELECT COUNT(*)::int
         FROM department_memberships m
         JOIN departments d ON d.id = m.department_id
        WHERE m.user_id = ${userId}
          AND d.tenant_id = ${before.tenant_id}::uuid
          AND m.level <> 'general') AS elevated,
      (SELECT COUNT(*)::int FROM platform_admins WHERE user_id = ${userId}) AS platform_admin
  `;
  if ((state?.elevated ?? 0) > 0 || (state?.platform_admin ?? 0) > 0) {
    return { moved: false, reason: "holds_position", chapter: target, institution: name };
  }

  await owner.begin(async (tx) => {
    await tx`
      UPDATE profiles SET tenant_id = ${target.id}::uuid, updated_at = NOW()
      WHERE user_id = ${userId}
    `;
    // Carry the member's department choices across by slug. Chapters share the
    // catalogue, so "Web Development" means the same thing in both; a slug the
    // new chapter has archived is simply not carried.
    await tx`
      INSERT INTO department_memberships (user_id, department_id, level, tenant_id)
      SELECT ${userId}, nd.id, m.level, nd.tenant_id
        FROM department_memberships m
        JOIN departments od ON od.id = m.department_id
        JOIN departments nd
          ON nd.tenant_id = ${target.id}::uuid
         AND nd.slug = od.slug
         AND nd.is_active
       WHERE m.user_id = ${userId}
         AND od.tenant_id = ${before.tenant_id}::uuid
      ON CONFLICT (user_id, department_id) DO NOTHING
    `;
    await tx`
      DELETE FROM department_memberships
       WHERE user_id = ${userId}
         AND department_id IN (
           SELECT id FROM departments WHERE tenant_id = ${before.tenant_id}::uuid
         )
    `;
  });

  await writeAudit({
    sql: owner,
    actorId: userId,
    tenantId: target.id,
    action: "changed_chapter",
    resource: "profile",
    resourceId: userId,
    before: { tenant_id: before.tenant_id, institution: before.institution },
    after: { tenant_id: target.id, institution: name }
  });

  return { moved: true, reason: "moved", chapter: target, institution: name, from: before.tenant_id };
}
