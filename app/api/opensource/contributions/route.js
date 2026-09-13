import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { getRequestContext } from "@/lib/auth-server";
import { checkRateLimit } from "@/lib/rate-limit";
import { parseContributionUrl } from "@/lib/oss";

const claimSchema = z.object({
  prUrl: z.string().url().max(300),
  title: z.string().max(200).default(""),
  contributionType: z.enum(["pr", "issue", "review", "commit"]).default("pr")
});

export async function GET() {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, sql } = ctx;
  const contributions = await sql`
    SELECT c.*, p.owner, p.repo_name FROM student_oss_contributions c
    LEFT JOIN open_source_projects p ON p.id = c.project_id
    WHERE c.student_id = ${user.id}
    ORDER BY c.created_at DESC LIMIT 100
  `;
  const badges = await sql`SELECT * FROM oss_badges WHERE student_id = ${user.id} ORDER BY earned_at DESC`;
  return ok({ contributions, badges });
}

// Student claims a PR/issue against a TRACKED repo. Status stays 'claimed'
// until the GitHub webhook (merge) or an admin verifies it.
export async function POST(request) {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, tenant, sql } = ctx;
  const limited = checkRateLimit(`oss-claim:${user.id}`, { limit: 20, windowMs: 60000 });
  if (!limited.ok) return fail("RATE_LIMITED", "Too many claims — slow down", 429);
  let body;
  try {
    body = claimSchema.parse(await request.json());
  } catch (e) {
    return validationError(e);
  }
  const parsed = parseContributionUrl(body.prUrl);
  if (!parsed) return fail("INVALID_PR_URL", "URL must be a github.com pull or issue link", 400);
  const [project] = await sql`
    SELECT * FROM open_source_projects
    WHERE lower(owner) = lower(${parsed.owner}) AND lower(repo_name) = lower(${parsed.repo})
      AND (tenant_id IS NULL OR tenant_id = ${tenant?.id ?? null}::uuid)
    LIMIT 1
  `;
  if (!project) return fail("REPO_NOT_TRACKED", "This repo is not tracked yet — ask your chapter admin to curate it", 404);
  const [row] = await sql`
    INSERT INTO student_oss_contributions
      (student_id, tenant_id, project_id, repo_url, pr_url, pr_number, title, contribution_type, status)
    VALUES (${user.id}, ${tenant?.id ?? null}, ${project.id}, ${project.github_repo_url}, ${body.prUrl}, ${parsed.number}, ${body.title || `Contribution #${parsed.number}`}, ${body.contributionType}, 'claimed')
    ON CONFLICT (student_id, pr_url) DO UPDATE SET title = EXCLUDED.title RETURNING *
  `;
  return ok({ contribution: row }, { status: 201 });
}
