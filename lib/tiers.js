// Student tiers — hidden from student UI, visible to admin/lead for work distribution.
// Not a tag on profile; computed live from evidence (like reputation) so it never drifts.
export const TIERS = {
  beginner: { label: "Beginner", need: "More support — foundations, small tasks, mentor pairing" },
  intermediate: { label: "Intermediate", need: "Guidance to start projects — review & starter issues" },
  advanced: { label: "Advanced", need: "Ready to build — own a feature or mentor" },
};

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

export async function classifyMany(sql, userIds) {
  const ids = [...new Set((userIds || []).filter(Boolean))];
  if (ids.length === 0) return new Map();
  // Batched aggregates — sequential per pooler rule
  const [{ totalNodes = 0 } = {}] = await sql`SELECT COUNT(*)::int AS totalNodes FROM roadmap_nodes`;
  const doneRows = await sql`SELECT student_id AS id, COUNT(*)::int AS n FROM student_roadmap_progress WHERE student_id = ANY(${ids}) AND status = 'completed' GROUP BY student_id`;
  const doneMap = new Map(doneRows.map((r) => [r.id, r.n]));
  const [{ totalRes = 0 } = {}] = await sql`SELECT COUNT(*)::int AS totalRes FROM resources`;
  const resDoneRows = await sql`SELECT student_id AS id, COUNT(*)::int AS n FROM resource_progress WHERE student_id = ANY(${ids}) AND status = 'completed' GROUP BY student_id`;
  const resDoneMap = new Map(resDoneRows.map((r) => [r.id, r.n]));
  const projRows = await sql`SELECT owner_id AS id, COUNT(*)::int AS n FROM projects WHERE owner_id = ANY(${ids}) GROUP BY owner_id`;
  const projMap = new Map(projRows.map((r) => [r.id, r.n]));
  const ossRows = await sql`SELECT student_id AS id, COUNT(*)::int AS n FROM student_oss_contributions WHERE student_id = ANY(${ids}) AND status = 'verified' GROUP BY student_id`;
  const ossMap = new Map(ossRows.map((r) => [r.id, r.n]));
  const solRows = await sql`SELECT author_id AS id, COUNT(*)::int AS n FROM forum_replies WHERE author_id = ANY(${ids}) AND is_answer = true AND status = 'visible' GROUP BY author_id`;
  const solMap = new Map(solRows.map((r) => [r.id, r.n]));
  const evtRows = await sql`SELECT student_id AS id, COUNT(*)::int AS n FROM event_registrations WHERE student_id = ANY(${ids}) AND status = 'attended' GROUP BY student_id`;
  const evtMap = new Map(evtRows.map((r) => [r.id, r.n]));

  const out = new Map();
  for (const id of ids) {
    const done = doneMap.get(id) || 0;
    const resDone = resDoneMap.get(id) || 0;
    const roadmapPct = totalNodes ? Math.round((done / totalNodes) * 100) : 0;
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
