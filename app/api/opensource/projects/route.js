import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { getRequestContext, writeAudit } from "@/lib/auth-server";
import { fetchRepoMeta } from "@/lib/oss";

const curateSchema = z.object({
  owner: z.string().min(1).max(100),
  repo: z.string().min(1).max(100),
  difficulty: z.enum(["beginner", "intermediate", "advanced"]).default("beginner"),
  primaryDomain: z.string().min(1).max(40).default("web")
});

// Visible projects: global curated (tenant_id NULL) + this tenant's own.
export async function GET() {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, tenant, sql } = ctx;
  const projects = await sql`
    SELECT * FROM open_source_projects
    WHERE tenant_id IS NULL OR tenant_id = ${tenant?.id ?? null}::uuid
    ORDER BY is_curated DESC, stars DESC
    LIMIT 100
  `;
  const mine = await sql`
    SELECT project_id, status, COUNT(*)::int AS n FROM student_oss_contributions
    WHERE student_id = ${user.id} AND project_id IS NOT NULL
    GROUP BY project_id, status
  `;
  return ok({ projects, myContributions: mine });
}

export async function POST(request) {
  const ctx = await getRequestContext({ adminOnly: true });
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error === "FORBIDDEN") return fail("FORBIDDEN", "Admin access required", 403);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, tenant, sql } = ctx;
  let body;
  try {
    body = curateSchema.parse(await request.json());
  } catch (e) {
    return validationError(e);
  }
  const meta = await fetchRepoMeta({ owner: body.owner, repo: body.repo });
  if (!meta) return fail("REPO_NOT_FOUND", "GitHub repo not found or unreachable", 404);
  const url = `https://github.com/${body.owner}/${body.repo}`;
  const [project] = await sql`
    INSERT INTO open_source_projects
      (tenant_id, github_repo_url, owner, repo_name, description, difficulty, primary_domain, language, stars, is_curated, created_by)
    VALUES (${tenant?.id ?? null}, ${url}, ${body.owner}, ${body.repo}, ${meta.description}, ${body.difficulty}, ${body.primaryDomain}, ${meta.language}, ${meta.stars}, true, ${user.id})
    ON CONFLICT (github_repo_url) DO UPDATE SET
      tenant_id = COALESCE(open_source_projects.tenant_id, EXCLUDED.tenant_id),
      difficulty = EXCLUDED.difficulty,
      primary_domain = EXCLUDED.primary_domain,
      description = EXCLUDED.description,
      language = EXCLUDED.language,
      stars = EXCLUDED.stars,
      is_curated = true
    RETURNING *
  `;
  await writeAudit({ sql, actorId: user.id, tenantId: tenant?.id, action: "curated_oss_project", resource: "oss_project", resourceId: project.id, after: { url } });
  return ok({ project }, { status: 201 });
}
