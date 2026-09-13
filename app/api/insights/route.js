import { ok, fail } from "@/lib/api";
import { getRequestContext } from "@/lib/auth-server";

// Personal insights: my latest snapshot + 14-day trend + anonymous peer
// comparison + a rule-based next recommendation (no ML, fully explainable).
export async function GET() {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, profile, tenant, sql } = ctx;

  const [latest] = await sql`
    SELECT * FROM student_analytics_snapshots
    WHERE student_id = ${user.id} ORDER BY snapshot_date DESC LIMIT 1
  `;
  const trend = await sql`
    SELECT snapshot_date, total_commits, total_prs, total_reviews, roadmap_completion_pct, consistency_score
    FROM student_analytics_snapshots
    WHERE student_id = ${user.id} ORDER BY snapshot_date DESC LIMIT 14
  `;
  const [peers] = await sql`
    SELECT COALESCE(AVG(consistency_score),0)::numeric AS avg_consistency,
           COALESCE(AVG(roadmap_completion_pct),0)::numeric AS avg_roadmap,
           COUNT(*)::int AS n
    FROM student_analytics_snapshots
    WHERE tenant_id = ${tenant?.id ?? null}::uuid AND snapshot_date = CURRENT_DATE AND student_id <> ${user.id}
  `;
  const [rank] = await sql`
    SELECT COUNT(*)::int + 1 AS rank FROM student_analytics_snapshots
    WHERE tenant_id = ${tenant?.id ?? null}::uuid AND snapshot_date = CURRENT_DATE
      AND roadmap_completion_pct > ${latest?.roadmap_completion_pct ?? 0}
  `;

  // Heuristic recommendation from the student's own signal.
  const domain = profile?.primary_domain || "web";
  const done = Number(latest?.roadmap_completion_pct || 0);
  const oss = latest?.oss_verified || 0;
  let recommendation;
  if (done < 30) {
    recommendation = { title: "Finish your foundations", body: `You are ${done}% through the roadmap. Complete the next node before branching out — depth beats breadth early.`, link: "/student/roadmap" };
  } else if (oss === 0) {
    recommendation = { title: "Ship your first open-source PR", body: `Strong roadmap progress (${done}%). Convert it into public proof with a beginner-friendly repo.`, link: "/student/opensource" };
  } else {
    recommendation = { title: `Go deeper in ${domain}`, body: "You have momentum and public proof. Pick the advanced track in your domain and mentor someone behind you.", link: "/student/resources" };
  }

  return ok({
    latest: latest || null,
    trend: trend.reverse(),
    peers: { avgConsistency: Number(peers?.avg_consistency || 0), avgRoadmap: Number(peers?.avg_roadmap || 0), n: peers?.n || 0 },
    rank: rank?.rank || 1,
    recommendation
  });
}
