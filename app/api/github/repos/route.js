import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { getRequestContext, writeAudit } from "@/lib/auth-server";
import { createUserRepo, listWritableRepos, readAccessToken } from "@/lib/github-oauth";
import { rememberRepos } from "@/lib/github-repos";
import { checkRateLimit } from "@/lib/rate-limit";

const createSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[A-Za-z0-9._-]+$/, "Use letters, numbers, dots, hyphens or underscores"),
  description: z.string().max(350).default(""),
  isPrivate: z.boolean().default(false)
});

function tokenFailure(reason) {
  if (reason === "NOT_LINKED") {
    return fail("GITHUB_NOT_LINKED", "Link your GitHub account first.", 409);
  }
  if (reason === "TOKEN_EXPIRED" || reason === "TOKEN_UNREADABLE") {
    return fail("GITHUB_RELINK_REQUIRED", "Your GitHub link has expired. Re-link it to continue.", 409, {
      authorizeUrl: "/api/github/oauth/start"
    });
  }
  if (reason === "SCOPE_MISSING" || reason === "TOKEN_REJECTED") {
    return fail(
      "GITHUB_SCOPE_MISSING",
      "Your GitHub token cannot read or create repositories. Re-link GitHub and approve repository access.",
      403,
      { authorizeUrl: "/api/github/oauth/start" }
    );
  }
  return fail("GITHUB_UNAVAILABLE", "GitHub could not be reached. Try again shortly.", 502);
}

export async function GET(request) {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, tenant, sql } = ctx;

  const token = await readAccessToken({ sql, userId: user.id });
  if (!token.ok) return tokenFailure(token.reason);

  const url = new URL(request.url);
  const page = Math.min(Math.max(Number(url.searchParams.get("page")) || 1, 1), 5);
  const listed = await listWritableRepos({
    accessToken: token.accessToken,
    page,
    perPage: 100
  });
  if (!listed.ok) return tokenFailure(listed.reason);

  const [conn] = await sql`
    SELECT github_username, github_user_id FROM github_connections WHERE user_id = ${user.id} LIMIT 1
  `;
  const cached = await rememberRepos({
    sql,
    userId: user.id,
    tenantId: tenant?.id,
    login: conn?.github_username,
    githubUserId: conn?.github_user_id ?? token.githubUserId,
    repos: listed.repos
  });

  const linked = await sql`
    SELECT repo_full_name FROM projects
    WHERE owner_id = ${user.id} AND repo_full_name IS NOT NULL
  `;
  const linkedSet = new Set(linked.map((r) => String(r.repo_full_name).toLowerCase()));

  return ok({
    repos: cached.map((r) => ({
      id: r.id,
      fullName: r.full_name,
      owner: r.owner,
      name: r.name,
      htmlUrl: r.html_url,
      description: r.description,
      language: r.language,
      stars: r.stars,
      forks: r.forks,
      openIssues: r.open_issues,
      topics: r.topics || [],
      isPrivate: r.is_private,
      isFork: r.is_fork,
      defaultBranch: r.default_branch,
      pushedAt: r.pushed_at,
      alreadyLinked: linkedSet.has(String(r.full_name).toLowerCase())
    })),
    page,
    hasMore: listed.repos.length === 100,
    // The scope is named in the UI only when GitHub rejects the call; this is
    // the expected scope for a healthy connection.
    expectedScopes: ["repo", "read:user"]
  });
}

export async function POST(request) {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, tenant, sql } = ctx;

  const limited = checkRateLimit(`github-repo-create:${user.id}`, { limit: 5, windowMs: 60_000 });
  if (!limited.ok) return fail("RATE_LIMITED", "Too many repository creations — wait a minute", 429);

  let body;
  try {
    body = createSchema.parse(await request.json());
  } catch (e) {
    return validationError(e);
  }

  const token = await readAccessToken({ sql, userId: user.id });
  if (!token.ok) return tokenFailure(token.reason);

  const created = await createUserRepo({
    accessToken: token.accessToken,
    name: body.name,
    description: body.description,
    isPrivate: body.isPrivate
  });
  if (!created.ok) {
    if (created.reason === "NAME_TAKEN") {
      return fail("REPO_NAME_TAKEN", "You already have a repository with that name.", 422);
    }
    return tokenFailure(created.reason);
  }

  const [conn] = await sql`
    SELECT github_username, github_user_id FROM github_connections WHERE user_id = ${user.id} LIMIT 1
  `;
  const [saved] = await rememberRepos({
    sql,
    userId: user.id,
    tenantId: tenant?.id,
    login: conn?.github_username,
    githubUserId: conn?.github_user_id ?? token.githubUserId,
    repos: [created.repo]
  });

  await writeAudit({
    sql,
    actorId: user.id,
    tenantId: tenant?.id,
    action: "created_github_repo",
    resource: "github_repository",
    resourceId: saved?.id,
    after: { fullName: created.repo.fullName, private: created.repo.isPrivate }
  });

  return ok({ repo: saved || null, fullName: created.repo.fullName }, { status: 201 });
}
