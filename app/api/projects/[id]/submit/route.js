import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { getRequestContext, writeAudit, notify } from "@/lib/auth-server";

const submitSchema = z.object({
  note: z.string().max(500).optional()
});

export async function POST(request, { params }) {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, profile, tenant, sql } = ctx;
  const { id } = await params;

  const [project] = await sql`
    SELECT * FROM projects
    WHERE id = ${id} AND tenant_id = ${tenant?.id ?? null}::uuid
    LIMIT 1
  `;
  if (!project) return fail("NOT_FOUND", "Project not found", 404);
  if (profile.role !== "admin" && project.owner_id !== user.id) {
    return fail("FORBIDDEN", "Only the owner can submit this project", 403);
  }
  if (project.status === "archived") {
    return fail("PROJECT_ARCHIVED", "Unarchive the project before submitting it", 409);
  }
  if (!project.repo_url) {
    return fail("REPO_REQUIRED", "Link a repository before submitting for review", 409);
  }
  if (project.evidence_state === "verified") {
    return fail("ALREADY_VERIFIED", "This project is already verified", 409);
  }

  let body = {};
  try {
    body = submitSchema.parse(await request.json().catch(() => ({})));
  } catch (e) {
    return validationError(e);
  }

  const [updated] = await sql`
    UPDATE projects SET
      status = 'in_review',
      evidence_state = 'provisional',
      submitted_at = NOW(),
      reviewed_at = NULL,
      review_note = ${body.note || null},
      updated_at = NOW()
    WHERE id = ${id}
      AND tenant_id = ${tenant?.id ?? null}::uuid
    RETURNING *
  `;

  const admins = await sql`
    SELECT user_id FROM profiles
    WHERE tenant_id = ${tenant?.id ?? null}::uuid
      AND role IN ('admin', 'platform_admin')
  `;
  for (const admin of admins) {
    await notify({
      sql, tenantId: tenant?.id, userId: admin.user_id,
      type: "project_review",
      title: "Project awaiting review",
      body: `${profile?.name || "A student"} submitted "${project.title}" for verification.`,
      link: `/admin/projects?status=in_review`
    });
  }

  await writeAudit({
    sql, actorId: user.id, tenantId: tenant?.id,
    action: "submitted_project_for_review", resource: "project", resourceId: id,
    after: { status: updated.status, note: body.note || null }
  });
  return ok({ project: updated });
}
