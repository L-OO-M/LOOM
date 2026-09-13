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

export function validUsername(name) {
  return typeof name === "string" && /^[a-z0-9](?:[a-z0-9_-]{0,28}[a-z0-9])?$/i.test(name.trim()) && name.trim().length >= 2;
}
