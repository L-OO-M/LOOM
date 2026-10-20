import { ok, fail } from "@/lib/api";
import { getRequestContext } from "@/lib/auth-server";
import { listWritableRepos, readAccessToken } from "@/lib/github-oauth";
import { rememberRepos } from "@/lib/github-repos";
import { checkRateLimit } from "@/lib/rate-limit";

// Refresh cached repository metadata (stars, open issues, language, last push)
// for the linked student. Capped at three pages: beyond 300 owned repositories
// the picker is no longer the right interface anyway.
export async function POST() {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, tenant, sql } = ctx;

  const limited = checkRateLimit(`github-sync:${user.id}`, { limit: 3, windowMs: 60_000 });
  if (!limited.ok) return fail("RATE_LIMITED", "Repository sync is rate limited — try again in a minute", 429);

  const token = await readAccessToken({ sql, userId: user.id });
  if (!token.ok) {
    if (token.reason === "NOT_LINKED") return fail("GITHUB_NOT_LINKED", "Link your GitHub account first.", 409);
    return fail("GITHUB_RELINK_REQUIRED", "Re-link GitHub to refresh repositories.", 409, {
      authorizeUrl: "/api/github/oauth/start"
    });
  }

  const [conn] = await sql`
    SELECT github_username, github_user_id FROM github_connections WHERE user_id = ${user.id} LIMIT 1
  `;
  let total = 0;
  for (let page = 1; page <= 3; page += 1) {
    const listed = await listWritableRepos({ accessToken: token.accessToken, page, perPage: 100 });
    if (!listed.ok) {
      return fail(
        listed.reason === "SCOPE_MISSING" ? "GITHUB_SCOPE_MISSING" : "GITHUB_UNAVAILABLE",
        "GitHub could not list your repositories. Re-link GitHub if this repeats.",
        listed.reason === "SCOPE_MISSING" ? 403 : 502
      );
    }
    const saved = await rememberRepos({
      sql,
      userId: user.id,
      tenantId: tenant?.id,
      login: conn?.github_username,
      githubUserId: conn?.github_user_id ?? token.githubUserId,
      repos: listed.repos
    });
    total += saved.length;
    if (listed.repos.length < 100) break;
  }

  return ok({ refreshed: total });
}
