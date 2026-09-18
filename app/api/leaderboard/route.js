import { ok, fail } from "@/lib/api";
import { getRequestContext } from "@/lib/auth-server";
import {
  STANDINGS_BOARD_SIZE,
  canLinkProfile,
  fetchBoard,
  fetchSelfStanding,
  normalizeLimit,
  normalizeOffset,
  normalizePeriod,
  normalizeScope,
} from "@/lib/standings";

// GET /api/leaderboard?scope=college|global|friends&period=all|30d&q=&limit=&offset=
// Ranking shares lib/standings.js with the student Standings page so the two
// can never disagree on weights, predicates, or rank semantics.
// Tenant always derives from the caller's profile; `friends` is the honest
// Circle (viewer + GitHub-linked builders), never a client-supplied list.
export async function GET(request) {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, tenant, sql } = ctx;
  const { searchParams } = new URL(request.url);

  const scope = normalizeScope(searchParams.get("scope"));
  const period = normalizePeriod(searchParams.get("period"));
  const query = (searchParams.get("q") || "").trim().slice(0, 64);

  const rawLimit = searchParams.get("limit");
  const rawOffset = searchParams.get("offset");
  if (rawLimit !== null && !/^\d+$/.test(rawLimit)) {
    return fail("VALIDATION_ERROR", "limit must be a positive integer", 400);
  }
  if (rawOffset !== null && !/^\d+$/.test(rawOffset)) {
    return fail("VALIDATION_ERROR", "offset must be a non-negative integer", 400);
  }
  const limit = normalizeLimit(rawLimit ?? STANDINGS_BOARD_SIZE, STANDINGS_BOARD_SIZE);
  const offset = normalizeOffset(rawOffset ?? 0);
  const tid = tenant?.id ?? null;

  // Sequential by pooler convention.
  const board = await fetchBoard(sql, {
    viewerId: user.id,
    tenantId: tid,
    scope,
    period,
    limit,
    offset,
    query,
  });
  const self = await fetchSelfStanding(sql, { viewerId: user.id, tenantId: tid, scope, period });

  const leaderboard = board.map((r) => {
    const linkable = canLinkProfile(r, tid, user.id);
    return {
      rank: Number(r.rank),
      user_id: r.user_id,
      name: r.name,
      primary_domain: r.primary_domain,
      // The public username travels only when the name may actually link to
      // /student/[username] (public card in the viewer's chapter, or self).
      username: linkable ? r.username : null,
      commits: Number(r.commits),
      prs: Number(r.prs),
      nodes_done: Number(r.nodes_done),
      projects: Number(r.projects),
      score: Number(r.score),
    };
  });

  return ok({
    scope,
    period,
    leaderboard,
    self,
    // Legacy shape kept for any existing readers: full board + viewer rank.
    myRank: self.ranked ? self.rank : 0,
  });
}
