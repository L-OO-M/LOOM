import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { getRequestContext, writeAudit } from "@/lib/auth-server";
import { createUserRepo, listWritableRepos, readAccessToken } from "@/lib/github-oauth";
import { confirmRepoGrant, githubTokenFailure } from "@/lib/github-grants";
import { rememberRepoMetadata } from "@/lib/github-repos";
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

const MAX_PAGE = 5;
// GitHub's maximum page size. `hasMore` is derived from this, not from a
// literal, so the two cannot drift apart if the request changes.
const PER_PAGE = 100;

export async function GET(request) {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, tenant, sql } = ctx;

  const token = await readAccessToken({ sql, userId: user.id });
  if (!token.ok) return githubTokenFailure(token.reason);

  const url = new URL(request.url);
  const page = Math.min(Math.max(Number(url.searchParams.get("page")) || 1, 1), MAX_PAGE);
  const listed = await listWritableRepos({
    accessToken: token.accessToken,
    page,
    perPage: PER_PAGE
  });
  if (!listed.ok) return githubTokenFailure(listed.reason);

  const [conn] = await sql`
    SELECT github_username, github_user_id FROM github_connections WHERE user_id = ${user.id} LIMIT 1
  `;
  const cached = await rememberRepoMetadata({
    sql,
    userId: user.id,
    tenantId: tenant?.id,
    login: conn?.github_username,
    githubUserId: conn?.github_user_id ?? token.githubUserId,
    repos: listed.repos
  });

  // Permission flags live on the GitHub listing, not on the cached row (the
  // cache is display metadata only), so keep them by name and attach them here.
  // Without them the picker can only say "a repository" when what the student
  // needs to know is whether they hold admin, push, or read on it.
  const permissions = new Map(
    listed.repos.map((r) => [String(r.fullName).toLowerCase(), { canPush: r.canPush, canAdmin: r.canAdmin }])
  );

  const linked = await sql`
    SELECT repo_full_name FROM projects
    WHERE owner_id = ${user.id} AND repo_full_name IS NOT NULL
  `;
  const linkedSet = new Set(linked.map((r) => String(r.repo_full_name).toLowerCase()));
  // What the student deliberately added, so the picker can mark it without
  // trusting a list rendered before the last add.
  const verifiedRows = await sql`
    SELECT lower(repo_full_name) AS repo FROM github_repo_grants
    WHERE user_id = ${user.id} AND tenant_id = ${tenant?.id ?? null}::uuid
  `;
  const verifiedSet = new Set(verifiedRows.map((r) => String(r.repo)));

  return ok({
    repos: cached.map((r) => {
      const perms = permissions.get(String(r.full_name).toLowerCase()) ?? null;
      return {
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
        canPush: perms?.canPush ?? null,
        canAdmin: perms?.canAdmin ?? null,
        alreadyLinked: linkedSet.has(String(r.full_name).toLowerCase()),
        verified: verifiedSet.has(String(r.full_name).toLowerCase())
      };
    }),
    page,
    // A full GitHub page means another page exists. This counts what GitHub
    // returned, not what survived the owned-repo filter, so the picker knows
    // there is more to ask for even when this page contained none of theirs.
    hasMore: page < MAX_PAGE && listed.repos.length >= PER_PAGE,
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
  if (!token.ok) return githubTokenFailure(token.reason);

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
    return githubTokenFailure(created.reason);
  }

  const [conn] = await sql`
    SELECT github_username, github_user_id FROM github_connections WHERE user_id = ${user.id} LIMIT 1
  `;
  const [saved] = await rememberRepoMetadata({
    sql,
    userId: user.id,
    tenantId: tenant?.id,
    login: conn?.github_username,
    repos: [created.repo]
  });

  // Creating a repository through LOOM is itself a deliberate add, so it gets a
  // grant now rather than making the student add their own new repository again.
  const grant =
    tenant?.id && conn?.github_username && conn.github_user_id != null
      ? await confirmRepoGrant({
          sql,
          accessToken: token.accessToken,
          userId: user.id,
          tenantId: tenant.id,
          login: conn.github_username,
          githubUserId: conn.github_user_id,
          fullName: created.repo.fullName
        })
      : { ok: false };

  await writeAudit({
    sql,
    actorId: user.id,
    tenantId: tenant?.id,
    action: "created_github_repo",
    resource: "github_repository",
    resourceId: saved?.id,
    after: { fullName: created.repo.fullName, private: created.repo.isPrivate, verified: grant.ok }
  });

  return ok(
    { repo: saved || null, fullName: created.repo.fullName, verified: grant.ok },
    { status: 201 }
  );
}
