import { withTenant } from "@/lib/db";

// Scoring: 0.5 topic + 0.3 activity + 0.2 tier
function activityScore(lastActiveAt) {
  if (!lastActiveAt) return 0;
  const days = (Date.now() - new Date(lastActiveAt).getTime()) / (24 * 60 * 60 * 1000);
  if (days <= 2) return 1;
  if (days <= 7) return 0.7;
  if (days <= 14) return 0.4;
  return 0;
}

function tierScore(tier) {
  if (tier === "advanced") return 1;
  if (tier === "intermediate") return 0.6;
  return 0.2;
}

export async function findHelpers({ sql, tenantId, kind, refId, excludeUserId }) {
  // Candidates: same tenant, available=true, active <=14d, has proof for this node/topic
  // Proof = completed same roadmap node OR solution accepted on same topic
  const candidates = await sql`
    SELECT hp.user_id, hp.last_active_at, rs.tier, rs.score,
           p.name, p.github_username
    FROM helper_profiles hp
    JOIN profiles p ON p.user_id = hp.user_id
    LEFT JOIN ranking_scores rs ON rs.user_id = hp.user_id
    WHERE hp.tenant_id = ${tenantId}::uuid
      AND hp.available = true
      AND hp.last_active_at > now() - interval '14 days'
      AND hp.user_id != ${excludeUserId}
      AND (
        EXISTS (SELECT 1 FROM student_roadmap_progress srp WHERE srp.student_id = hp.user_id AND srp.node_id = ${String(refId)} AND srp.status='completed')
        OR EXISTS (SELECT 1 FROM resource_progress rp WHERE rp.student_id = hp.user_id AND rp.resource_id = ${String(refId)} AND rp.status='completed')
        OR EXISTS (SELECT 1 FROM ranking_events re WHERE re.user_id = hp.user_id AND re.ref_id = ${String(refId)} AND re.tenant_id = ${tenantId}::uuid)
      )
    ORDER BY hp.last_active_at DESC
    LIMIT 20
  `;

  // Enforce 2/week cap per helper (active pending/accepted in last 7d <2)
  const filtered = [];
  for (const c of candidates) {
    const [cnt] = await sql`
      SELECT COUNT(*)::int AS n FROM help_matches WHERE helper_id = ${c.user_id} AND created_at > now() - interval '7 days' AND status IN ('pending','accepted')
    `;
    if (cnt.n >= 2) continue;
    const act = activityScore(c.last_active_at);
    const tierS = tierScore(c.tier || "beginner");
    // TopicMatch is 1 if proof exists (we already filtered), else 0 — so 0.5 base
    const score = 0.5 * 1 + 0.3 * act + 0.2 * tierS;
    filtered.push({ ...c, matchScore: score });
  }
  filtered.sort((a, b) => b.matchScore - a.matchScore);
  return filtered.slice(0, 3);
}

export async function upsertSignal({ sql, tenantId, userId, kind, refId }) {
  const [row] = await sql`
    INSERT INTO help_signals (tenant_id, user_id, kind, ref_id, failures_count, last_failed_at, status, updated_at)
    VALUES (${tenantId}::uuid, ${userId}, ${kind}, ${String(refId)}, 1, now(), 'open', now())
    ON CONFLICT (tenant_id, user_id, kind, ref_id) DO UPDATE SET
      failures_count = help_signals.failures_count + 1,
      last_failed_at = now(),
      updated_at = now(),
      status = CASE WHEN help_signals.failures_count + 1 >= 2 THEN 'open' ELSE help_signals.status END
    RETURNING *
  `;
  return row;
}
