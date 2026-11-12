// Mentor candidacy, computed from evidence — never from self-declaration.
// A student becomes eligible by proving they can already walk the path:
// substantial roadmap progress plus at least one public contribution
// (verified OSS merge, forum solution, or shipped project).

export const MENTOR_BAR = {
  roadmapPct: 40, // % of roadmap nodes completed
  publicProof: 1 // minimum of (verified OSS + solutions + projects)
};

export async function candidacyStats(sql, studentId, domain = undefined) {
  // The denominator is the roadmap the member is actually walking, not the
  // entire multi-domain catalogue. Counting every node made a finished domain
  // read as ~10% and silently disabled mentorship for everyone.
  let scope = domain;
  if (scope === undefined) {
    const [profile] = await sql`SELECT primary_domain FROM profiles WHERE user_id = ${studentId} LIMIT 1`;
    scope = profile?.primary_domain || null;
  }
  const [{ nodes = 0 } = {}] = scope
    ? await sql`SELECT COUNT(*)::int AS nodes FROM roadmap_nodes WHERE domain = ${scope}`
    : await sql`SELECT COUNT(*)::int AS nodes FROM roadmap_nodes`;
  // Both counts below filter on evidence_state = 'verified' (migration 037).
  // This function is the gate that decides who may mentor, so a self-declared
  // node or an unverified project must not move the bar: otherwise the same
  // one-click forgery that used to inflate the leaderboard would also decide
  // which juniors get paired with a mentor.
  const [{ done = 0 } = {}] = scope
    ? await sql`
        SELECT COUNT(*)::int AS done FROM student_roadmap_progress p
        JOIN roadmap_nodes n ON n.id = p.node_id
        WHERE p.student_id = ${studentId} AND p.status = 'completed'
          AND p.evidence_state = 'verified' AND n.domain = ${scope}
      `
    : await sql`
        SELECT COUNT(*)::int AS done FROM student_roadmap_progress
        WHERE student_id = ${studentId} AND status = 'completed' AND evidence_state = 'verified'
      `;
  const [{ oss = 0 } = {}] = await sql`
    SELECT COUNT(*)::int AS oss FROM student_oss_contributions
    WHERE student_id = ${studentId} AND status = 'verified'
  `;
  const [{ solutions = 0 } = {}] = await sql`
    SELECT COUNT(*)::int AS solutions FROM forum_replies
    WHERE author_id = ${studentId} AND is_answer = true AND status = 'visible'
  `;
  const [{ projects = 0 } = {}] = await sql`
    SELECT COUNT(*)::int AS projects FROM projects
    WHERE owner_id = ${studentId} AND evidence_state = 'verified'
  `;
  return { domain: scope, nodes, done, pct: progressPct(done, nodes), oss, solutions, projects, proof: oss + solutions + projects };
}

// Pure so the percentage rule can be pinned without a database. An empty
// catalogue is 0%, never NaN/Infinity.
export function progressPct(done, nodes) {
  if (!Number.isFinite(done) || !Number.isFinite(nodes) || nodes <= 0) return 0;
  return Math.round((Math.max(0, done) / nodes) * 1000) / 10;
}

// Pure decision so it stays unit-testable without a database.
export function meetsMentorBar(stats, bar = MENTOR_BAR) {
  const reasons = [];
  if (stats.pct < bar.roadmapPct) {
    reasons.push(`${stats.done}/${stats.nodes} milestones — ${bar.roadmapPct}% of the path needed`);
  }
  if (stats.proof < bar.publicProof) {
    reasons.push("no public proof yet — a merged PR, a marked solution, or a shipped project");
  }
  return { eligible: reasons.length === 0, reasons };
}

export async function eligibilityFor(sql, studentId, bar = MENTOR_BAR) {
  const stats = await candidacyStats(sql, studentId);
  return { stats, ...meetsMentorBar(stats, bar) };
}

// Milestone ladder: sustained motion becomes chapter achievements.
// Pure — the route handles idempotency and persistence.
export function milestoneFor(done, nodes) {
  if (!nodes || done < 1) return null;
  if (done >= nodes) return { key: "roadmap-complete", label: "Path complete", level: "gold" };
  if (done / nodes >= 0.5) return { key: "roadmap-halfway", label: "Halfway there", level: "silver" };
  return { key: "roadmap-first-step", label: "First step", level: "bronze" };
}

// Every milestone the current verified count supports. Milestones are
// cumulative, so a student at 60% still owns the first-step row as well as the
// halfway row; revocation must keep all of them and remove only the rest.
export function earnedMilestoneKeys(done, nodes) {
  if (!nodes || done < 1) return [];
  const keys = ["roadmap-first-step"];
  if (done / nodes >= 0.5) keys.push("roadmap-halfway");
  if (done >= nodes) keys.push("roadmap-complete");
  return keys;
}

export async function applyForMentorship({ sql, studentId, tenantId, statement, expertise }) {
  const eligibility = await eligibilityFor(sql, studentId);
  if (!eligibility.eligible) {
    const err = new Error("NOT_ELIGIBLE");
    err.reasons = eligibility.reasons;
    throw err;
  }
  const [existing] = await sql`
    SELECT id FROM mentor_applications WHERE student_id = ${studentId} AND status = 'pending' LIMIT 1
  `;
  if (existing) {
    const err = new Error("ALREADY_PENDING");
    throw err;
  }
  const [isMentor] = await sql`SELECT user_id FROM mentors WHERE user_id = ${studentId} LIMIT 1`;
  if (isMentor) {
    const err = new Error("ALREADY_MENTOR");
    throw err;
  }
  const [row] = await sql`
    INSERT INTO mentor_applications (student_id, tenant_id, statement, expertise, eligibility)
    VALUES (${studentId}, ${tenantId}, ${statement}, ${expertise}, ${sql.json({ stats: eligibility.stats, bar: MENTOR_BAR, checkedAt: new Date().toISOString() })})
    RETURNING *
  `;
  return { application: row, eligibility };
}

export async function reviewApplication({ sql, applicationId, tenantId, reviewerId, decision }) {
  // One approval is three writes: the mentor row, the role promotion, and the
  // application status. A failure between any two used to leave e.g. an active
  // mentor whose application was still pending (or a promoted `core` profile
  // with no mentor record). The whole decision is one transaction.
  return sql.begin(async (tx) => {
    const [app] = await tx`
      SELECT * FROM mentor_applications
      WHERE id = ${applicationId} AND status = 'pending'
        AND tenant_id = ${tenantId}::uuid
      LIMIT 1
    `;
    if (!app) {
      const err = new Error("NOT_FOUND");
      throw err;
    }
    if (decision === "approved") {
      await tx`
        INSERT INTO mentors (user_id, tenant_id, expertise, bio, available)
        VALUES (${app.student_id}, ${app.tenant_id}, ${app.expertise}, ${app.statement}, true)
        ON CONFLICT (user_id) DO UPDATE SET expertise = EXCLUDED.expertise, available = true
      `;
      await tx`UPDATE profiles SET role = 'core' WHERE user_id = ${app.student_id} AND role = 'student'`;
    }
    const [updated] = await tx`
      UPDATE mentor_applications
      SET status = ${decision === "approved" ? "approved" : "rejected"}, reviewer_id = ${reviewerId}, reviewed_at = NOW()
      WHERE id = ${applicationId}
      RETURNING *
    `;
    return updated;
  });
}
