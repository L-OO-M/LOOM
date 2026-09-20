// Evidence weights — tunable via feature_flags if needed
export const WEIGHTS = {
  roadmap_done: 3,
  resource_done: 1,
  project_verified: 12,
  oss_verified: 20,
  contest_top: 25, // winner; top10 handled as 12 in route
  event_attended: 2,
  solution_accepted: 5,
};

export function decayedWeight(weight, createdAt) {
  const d = new Date(createdAt);
  const ageMs = Date.now() - d.getTime();
  const ninety = 90 * 24 * 60 * 60 * 1000;
  return ageMs > ninety ? Math.round(weight * 0.7) : weight;
}

// Call from API routes when evidence is verified (projects/oss/contest/solution/roadmap/resource)
export async function recordRankingEvent({ sql, tenantId, userId, kind, refId, verifiedBy = null }) {
  const w = WEIGHTS[kind];
  if (!w || !tenantId || !userId || !refId) return;
  try {
    await sql`
      INSERT INTO ranking_events (tenant_id, user_id, kind, ref_id, weight, verified_by)
      VALUES (${tenantId}, ${userId}, ${kind}, ${String(refId)}, ${w}, ${verifiedBy})
      ON CONFLICT (tenant_id, kind, ref_id, user_id) DO NOTHING
    `;
  } catch {}
}

// Recompute scores for a tenant (called after batch or via cron)
export async function recomputeScores(sql, tenantId) {
  try {
    await sql`SELECT public.recompute_ranking_scores(${tenantId}::uuid)`;
  } catch {}
}
