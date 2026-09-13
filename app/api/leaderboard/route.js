import { ok, fail } from "@/lib/api";
import { getRequestContext } from "@/lib/auth-server";

export async function GET(request) {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, tenant, sql } = ctx;
  const { searchParams } = new URL(request.url);
  // scope=college (default, own tenant) | global (all tenants)
  const scope = searchParams.get("scope") === "global" ? "global" : "college";
  const tid = tenant?.id ?? null;

  // Ranking: activity score + roadmap completions + projects.
  // College scope binds to the caller's tenant membership; global spans tenants.
  const rows = await sql`
    SELECT p.user_id, p.name, p.primary_domain,
      COALESCE(a.commits, 0) AS commits,
      COALESCE(a.pull_requests, 0) AS prs,
      COALESCE(r.done, 0) AS nodes_done,
      COALESCE(prj.count, 0) AS projects,
      (COALESCE(a.commits,0) * 5 + COALESCE(a.pull_requests,0) * 20 + COALESCE(r.done,0) * 30 + COALESCE(prj.count,0) * 25) AS score
    FROM profiles p
    LEFT JOIN (
      SELECT student_id, SUM(commits)::int AS commits, SUM(pull_requests)::int AS pull_requests
      FROM student_daily_activity GROUP BY student_id
    ) a ON a.student_id = p.user_id
    LEFT JOIN (
      SELECT student_id, COUNT(*)::int AS done FROM student_roadmap_progress WHERE status = 'completed' GROUP BY student_id
    ) r ON r.student_id = p.user_id
    LEFT JOIN (
      SELECT owner_id, COUNT(*)::int AS count FROM projects GROUP BY owner_id
    ) prj ON prj.owner_id = p.user_id
    WHERE ${scope === "global" ? sql`TRUE` : sql`(p.tenant_id = ${tid}::uuid OR ${tid}::uuid IS NULL)`}
    ORDER BY score DESC, p.name ASC
    LIMIT 50
  `;
  const ranked = rows.map((r, i) => ({ rank: i + 1, ...r }));
  return ok({ scope, leaderboard: ranked, myRank: ranked.findIndex((r) => r.user_id === user.id) + 1 });
}
