// Student tiers — hidden from student UI, visible to admin/lead for work distribution.
// Not a tag on profile; computed live from evidence (like reputation) so it never drifts.
//
// Every source here filters on evidence_state = 'verified' where the underlying
// table has one. That is not cosmetic: these counts decide who gets offered
// mentoring and who is shown as advanced, so a self-declared node or an
// unverified project must not read as ability. Before migration 037 both tables
// were counted raw, which let the same forgery that inflated the leaderboard
// decide which juniors got a mentor.
export const TIERS = {
  beginner: { label: "Beginner", need: "More support — foundations, small tasks, mentor pairing" },
  intermediate: { label: "Intermediate", need: "Guidance to start projects — review & starter issues" },
  advanced: { label: "Advanced", need: "Ready to build — own a feature or mentor" },
};

// Resource completion is deliberately NOT filtered: there is no reviewer for a
// "did you watch this" tick and none is warranted, so it stays a weak signal in
// the places that accept weak signals (resourcePct, used only as a floor). It
// never appears in a ranking weight — WEIGHTS.resource_done is 0 for that reason.
export function classifyTier({ roadmapPct = 0, resourcePct = 0, projects = 0, ossVerified = 0, solutions = 0, eventsAttended = 0 } = {}) {
  const r = Number(roadmapPct) || 0;
  const p = Number(projects) || 0;
  const o = Number(ossVerified) || 0;
  const s = Number(solutions) || 0;
  const res = Number(resourcePct) || 0;

  // Advanced: strong independent signal — can directly build
  if (r >= 60 || p >= 2 || o >= 1 || s >= 3) {
    return { tier: "advanced", ...TIERS.advanced, score: Math.min(100, r * 0.5 + p * 15 + o * 20 + s * 5) };
  }
  // Intermediate: some traction — needs guidance to ship
  if (r >= 25 || p >= 1 || s >= 1 || res >= 30 || o >= 1) {
    return { tier: "intermediate", ...TIERS.intermediate, score: Math.min(100, r * 0.6 + p * 10 + res * 0.2) };
  }
  return { tier: "beginner", ...TIERS.beginner, score: r * 0.8 + res * 0.2 };
}

export const TIER_NAMES = Object.keys(TIERS);

export function normalizeTier(value) {
  return TIER_NAMES.includes(value) ? value : "";
}

export function tallyTiers(userIds, tierMap) {
  const counts = { beginner: 0, intermediate: 0, advanced: 0 };
  for (const id of userIds || []) {
    const tier = normalizeTier(tierMap?.get?.(id)?.tier) || "beginner";
    counts[tier] += 1;
  }
  return counts;
}

export function filterIdsByTier(userIds, tierMap, tier) {
  const wanted = normalizeTier(tier);
  if (!wanted) return [];
  return (userIds || []).filter((id) => {
    const tierName = normalizeTier(tierMap?.get?.(id)?.tier) || "beginner";
    return tierName === wanted;
  });
}

export async function rosterTierIndex(sql, { tenantId = null, q = "", role = "", dept = "", matchGithub = true } = {}) {
  const term = String(q || "").trim();
  const roleFilter = String(role || "");
  const deptFilter = String(dept || "");
  const pattern = `%${term}%`;
  const rows = await sql`
    SELECT p.user_id
    FROM profiles p
    WHERE (p.tenant_id = ${tenantId}::uuid OR ${tenantId}::uuid IS NULL)
      AND (${term} = '' OR p.name ILIKE ${pattern} OR p.user_id ILIKE ${pattern} OR (${matchGithub} AND COALESCE(p.github_username, '') ILIKE ${pattern}))
      AND (${roleFilter} = '' OR p.role = ${roleFilter})
      AND (${deptFilter} = '' OR EXISTS (SELECT 1 FROM department_memberships m JOIN departments d ON d.id = m.department_id WHERE m.user_id = p.user_id AND d.slug = ${deptFilter}))
  `;
  const ids = [...new Set(rows.map((r) => r.user_id).filter(Boolean))];
  try {
    const tierMap = await classifyMany(sql, ids);
    return { ids, tierMap, counts: tallyTiers(ids, tierMap), tierReady: true };
  } catch {
    return { ids, tierMap: new Map(), counts: { beginner: 0, intermediate: 0, advanced: 0 }, tierReady: false };
  }
}

export async function classifyMany(sql, userIds) {
  const ids = [...new Set((userIds || []).filter(Boolean))];
  if (ids.length === 0) return new Map();
  // Batched aggregates — sequential per pooler rule
  const [{ totalNodes = 0 } = {}] = await sql`SELECT COUNT(*)::int AS totalNodes FROM roadmap_nodes`;
  // Progress is a per-track claim, so the denominator is the member's primary
  // domain, not every node in the catalogue. The global count stays as a
  // fallback for members with no domain set or a domain with no rows.
  const domainRows = await sql`SELECT domain, COUNT(*)::int AS n FROM roadmap_nodes GROUP BY domain`;
  const domainTotals = new Map(
    (domainRows || []).filter((r) => r?.domain).map((r) => [r.domain, r.n])
  );
  const profileRows = await sql`SELECT user_id, primary_domain FROM profiles WHERE user_id = ANY(${ids})`;
  const primaryDomain = new Map(
    (profileRows || []).filter((r) => r?.user_id).map((r) => [r.user_id, r.primary_domain || null])
  );
  const doneRows = await sql`SELECT student_id AS id, COUNT(*)::int AS n FROM student_roadmap_progress WHERE student_id = ANY(${ids}) AND status = 'completed' AND evidence_state = 'verified' GROUP BY student_id`;
  const doneMap = new Map(doneRows.map((r) => [r.id, r.n]));
  const doneDomainRows = await sql`
    SELECT p.student_id AS id, n.domain, COUNT(*)::int AS n
    FROM student_roadmap_progress p
    JOIN roadmap_nodes n ON n.id = p.node_id
    WHERE p.student_id = ANY(${ids}) AND p.status = 'completed' AND p.evidence_state = 'verified'
    GROUP BY p.student_id, n.domain
  `;
  const doneByDomain = new Map();
  for (const row of doneDomainRows || []) {
    if (!row?.id || !row?.domain) continue;
    if (!doneByDomain.has(row.id)) doneByDomain.set(row.id, new Map());
    doneByDomain.get(row.id).set(row.domain, row.n);
  }
  const [{ totalRes = 0 } = {}] = await sql`SELECT COUNT(*)::int AS totalRes FROM resources`;
  const resDoneRows = await sql`SELECT student_id AS id, COUNT(*)::int AS n FROM resource_progress WHERE student_id = ANY(${ids}) AND status = 'completed' GROUP BY student_id`;
  const resDoneMap = new Map(resDoneRows.map((r) => [r.id, r.n]));
  const projRows = await sql`SELECT owner_id AS id, COUNT(*)::int AS n FROM projects WHERE owner_id = ANY(${ids}) AND evidence_state = 'verified' GROUP BY owner_id`;
  const projMap = new Map(projRows.map((r) => [r.id, r.n]));
  const ossRows = await sql`SELECT student_id AS id, COUNT(*)::int AS n FROM student_oss_contributions WHERE student_id = ANY(${ids}) AND status = 'verified' GROUP BY student_id`;
  const ossMap = new Map(ossRows.map((r) => [r.id, r.n]));
  const solRows = await sql`SELECT author_id AS id, COUNT(*)::int AS n FROM forum_replies WHERE author_id = ANY(${ids}) AND is_answer = true AND status = 'visible' GROUP BY author_id`;
  const solMap = new Map(solRows.map((r) => [r.id, r.n]));
  const evtRows = await sql`SELECT student_id AS id, COUNT(*)::int AS n FROM event_registrations WHERE student_id = ANY(${ids}) AND status = 'attended' GROUP BY student_id`;
  const evtMap = new Map(evtRows.map((r) => [r.id, r.n]));

  const out = new Map();
  for (const id of ids) {
    const domain = primaryDomain.get(id);
    const domainTotal = domain ? domainTotals.get(domain) : null;
    const done = domain
      ? doneByDomain.get(id)?.get(domain) || 0
      : doneMap.get(id) || 0;
    const denominator = domainTotal || totalNodes;
    const resDone = resDoneMap.get(id) || 0;
    const roadmapPct = denominator ? Math.round((done / denominator) * 100) : 0;
    const resourcePct = totalRes ? Math.round((resDone / totalRes) * 100) : 0;
    const tier = classifyTier({
      roadmapPct,
      resourcePct,
      projects: projMap.get(id) || 0,
      ossVerified: ossMap.get(id) || 0,
      solutions: solMap.get(id) || 0,
      eventsAttended: evtMap.get(id) || 0,
    });
    out.set(id, { ...tier, roadmapPct, resourcePct, projects: projMap.get(id) || 0, ossVerified: ossMap.get(id) || 0, solutions: solMap.get(id) || 0 });
  }
  return out;
}
