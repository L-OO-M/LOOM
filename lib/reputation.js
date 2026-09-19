// Reputation is computed live from source tables — no counters to drift.
// Weights are documented here so the score stays explainable.
export const REPUTATION_WEIGHTS = {
  achievement: 10, // per student_achievements row
  ossVerified: 20, // per verified OSS contribution
  solution: 15, // per forum reply marked as the answer
  wikiPage: 10, // per published wiki page authored
  eventAttended: 5, // per attended event
  endorsement: 2 // per skill endorsement received
};

export function scoreReputation({ achievements = 0, ossVerified = 0, solutions = 0, wikiPages = 0, eventsAttended = 0, endorsements = 0 } = {}) {
  return (
    achievements * REPUTATION_WEIGHTS.achievement +
    ossVerified * REPUTATION_WEIGHTS.ossVerified +
    solutions * REPUTATION_WEIGHTS.solution +
    wikiPages * REPUTATION_WEIGHTS.wikiPage +
    eventsAttended * REPUTATION_WEIGHTS.eventAttended +
    endorsements * REPUTATION_WEIGHTS.endorsement
  );
}

export async function reputationFor(sql, studentId) {
  const [{ achievements = 0 } = {}] = await sql`SELECT COUNT(*)::int AS achievements FROM student_achievements WHERE student_id = ${studentId}`;
  const [{ ossVerified = 0 } = {}] = await sql`SELECT COUNT(*)::int AS ossVerified FROM student_oss_contributions WHERE student_id = ${studentId} AND status = 'verified'`;
  const [{ solutions = 0 } = {}] = await sql`SELECT COUNT(*)::int AS solutions FROM forum_replies WHERE author_id = ${studentId} AND is_answer = true AND status = 'visible'`;
  const [{ wikiPages = 0 } = {}] = await sql`SELECT COUNT(*)::int AS wikiPages FROM wiki_pages WHERE author_id = ${studentId} AND status = 'published'`;
  const [{ eventsAttended = 0 } = {}] = await sql`SELECT COUNT(*)::int AS eventsAttended FROM event_registrations WHERE student_id = ${studentId} AND status = 'attended'`;
  const [{ endorsements = 0 } = {}] = await sql`SELECT COUNT(*)::int AS endorsements FROM user_endorsements WHERE endorsee_id = ${studentId}`;
  const parts = { achievements, ossVerified, solutions, wikiPages, eventsAttended, endorsements };
  return { ...parts, score: scoreReputation(parts) };
}

// Batched variant of reputationFor: same six source tables, same weights,
// same semantics — one GROUP BY query per source instead of six per student.
// Sequential awaits keep it pooler-safe (no parallel fan-out). Returns a Map
// keyed by student id; unknown ids map to all-zero parts plus a score.
export async function reputationForMany(sql, studentIds) {
  const ids = [...new Set((studentIds || []).filter(Boolean))];
  const zero = () => ({ achievements: 0, ossVerified: 0, solutions: 0, wikiPages: 0, eventsAttended: 0, endorsements: 0 });
  const out = new Map(ids.map((id) => [id, zero()]));
  if (ids.length === 0) return out;
  const achievements = await sql`SELECT student_id AS id, COUNT(*)::int AS n FROM student_achievements WHERE student_id = ANY(${ids}) GROUP BY student_id`;
  for (const r of achievements) out.get(r.id).achievements = r.n;
  const oss = await sql`SELECT student_id AS id, COUNT(*)::int AS n FROM student_oss_contributions WHERE student_id = ANY(${ids}) AND status = 'verified' GROUP BY student_id`;
  for (const r of oss) out.get(r.id).ossVerified = r.n;
  const solutions = await sql`SELECT author_id AS id, COUNT(*)::int AS n FROM forum_replies WHERE author_id = ANY(${ids}) AND is_answer = true AND status = 'visible' GROUP BY author_id`;
  for (const r of solutions) out.get(r.id).solutions = r.n;
  const wiki = await sql`SELECT author_id AS id, COUNT(*)::int AS n FROM wiki_pages WHERE author_id = ANY(${ids}) AND status = 'published' GROUP BY author_id`;
  for (const r of wiki) out.get(r.id).wikiPages = r.n;
  const events = await sql`SELECT student_id AS id, COUNT(*)::int AS n FROM event_registrations WHERE student_id = ANY(${ids}) AND status = 'attended' GROUP BY student_id`;
  for (const r of events) out.get(r.id).eventsAttended = r.n;
  const endorsements = await sql`SELECT endorsee_id AS id, COUNT(*)::int AS n FROM user_endorsements WHERE endorsee_id = ANY(${ids}) GROUP BY endorsee_id`;
  for (const r of endorsements) out.get(r.id).endorsements = r.n;
  for (const parts of out.values()) parts.score = scoreReputation(parts);
  return out;
}

// Single-segment static routes under /student/<segment> win over the
// [username] dynamic route, so these names can never resolve to a profile.
// Usernames are matched case-insensitively (stored lowercased), hence the
// lowercase comparison in validUsername.
export const RESERVED_USERNAMES = [
  "certificates",
  "community",
  "contests",
  "credentials",
  "discover",
  "events",
  "github",
  "insights",
  "leaderboard",
  "mentorship",
  "network",
  "notifications",
  "onboarding",
  "opensource",
  "privacy",
  "projects",
  "resources",
  "roadmap",
  "settings"
];

export function validUsername(name) {
  if (typeof name !== "string") return false;
  const trimmed = name.trim();
  if (!/^[a-z0-9](?:[a-z0-9_-]{0,28}[a-z0-9])?$/i.test(trimmed) || trimmed.length < 2) return false;
  return !RESERVED_USERNAMES.includes(trimmed.toLowerCase());
}
