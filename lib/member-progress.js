import { classifyMany } from "@/lib/tiers";
import { fetchRankPositions } from "@/lib/standings";
import { proofCountsMany } from "@/lib/role-requests";

/**
 * One member's progress, assembled from the same sources the member sees.
 *
 * A lead's job includes knowing who is actually moving and who has gone quiet.
 * That answer already exists in four places -- the tier engine, the verified
 * proof counts, the Standings board and the attested GitHub activity -- so this
 * function joins them rather than inventing a fifth scoring rule. If the number
 * here disagreed with /student/roles or /student/leaderboard, a lead would make
 * a decision on a different truth than the member sees, which is worse than
 * showing nothing.
 *
 * Batched: one call per page, never one per row.
 */
export async function memberProgress(sql, { tenantId, userIds = [] }) {
  const ids = [...new Set((userIds || []).filter(Boolean).map(String))];
  const out = new Map();
  if (ids.length === 0) return out;

  const tiers = await classifyMany(sql, ids);
  const proof = await proofCountsMany(sql, { tenantId, userIds: ids });
  const positions = await fetchRankPositions(sql, { tenantId, userIds: ids });

  // Last 30 days of attested activity. A member with no rows has not linked
  // GitHub or has not pushed -- both are "no signal", not "zero effort", so the
  // UI must say "no activity recorded" rather than "0 commits".
  const activity = await sql`
    SELECT student_id AS id,
           MAX(day) AS last_day,
           SUM(commits)::int AS commits,
           SUM(pull_requests)::int AS prs
    FROM student_daily_activity
    WHERE student_id = ANY(${ids})
      AND tenant_id = ${tenantId}::uuid
      AND day >= CURRENT_DATE - 30
    GROUP BY student_id
  `;
  const activityMap = new Map(activity.map((r) => [String(r.id), r]));

  for (const id of ids) {
    const tier = tiers.get(id) || null;
    const counts = proof.get(id) || { nodes: 0, projects: 0, oss: 0, answers: 0, total: 0 };
    const position = positions.get(id) || null;
    const recent = activityMap.get(id) || null;
    out.set(id, {
      tier: tier?.tier || "beginner",
      tierScore: tier?.score ?? null,
      roadmapPct: tier?.roadmapPct ?? 0,
      resourcePct: tier?.resourcePct ?? 0,
      projects: tier?.projects ?? 0,
      ossVerified: tier?.ossVerified ?? 0,
      solutions: tier?.solutions ?? 0,
      proof: counts,
      proofTotal: counts.total,
      // null, not 0: an unranked member has no position, and "0 of 0" would
      // read as a rank rather than the absence of one.
      standing: position?.rank ? position : null,
      lastActive: recent?.last_day || null,
      // Precomputed on the server. A relative label derived during render would
      // be computed twice -- once in Node, once in the browser -- and can flip
      // across midnight, which React reports as a hydration mismatch.
      activity: activityLabel(recent?.last_day),
      commits30d: recent ? Number(recent.commits) || 0 : null,
      prs30d: recent ? Number(recent.prs) || 0 : null
    });
  }
  return out;
}

/** "3 days ago" / "today" / "no activity recorded" -- the honest short form. */
export function activityLabel(value) {
  if (!value) return "no activity recorded";
  const then = new Date(value);
  if (Number.isNaN(then.getTime())) return "no activity recorded";
  const days = Math.floor((Date.now() - then.getTime()) / 86400000);
  if (days <= 0) return "active today";
  if (days === 1) return "active yesterday";
  if (days < 30) return `active ${days} days ago`;
  if (days < 365) return `quiet for ${Math.floor(days / 30)} month${Math.floor(days / 30) === 1 ? "" : "s"}`;
  return "quiet for over a year";
}
