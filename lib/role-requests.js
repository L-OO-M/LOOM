import { classifyMany } from "@/lib/tiers";

/**
 * Who may ask for a seat, and how often.
 *
 * The old flow accepted a request from anyone, any number of times, with no
 * evidence attached — so the queue was noise and leads stopped reading it. A
 * request is now an application: it carries a snapshot of the applicant's
 * VERIFIED record, and it can only exist if that record clears a bar.
 *
 * Two independent signals, because either alone is gameable:
 *
 *   - RANK  — the tier from lib/tiers.js, computed live from verified evidence.
 *             Unverified nodes, projects and OSS claims score nothing.
 *   - PROOF — a count of verified artefacts (roadmap nodes, projects, merged
 *             OSS contributions, accepted answers). Rank says "how far", proof
 *             says "how much of it was actually checked by someone".
 *
 * The rules live here as pure functions so the policy is testable without a
 * database, and the route only has to load the inputs.
 */

export const TARGET_ROLES = Object.freeze(["core", "dept_lead"]);

// 14 days: long enough that a rejection is a real answer rather than a step in a
// loop, short enough that a member who does the work is not punished for a year.
export const COOLDOWN_DAYS = 14;

export const REQUIREMENTS = Object.freeze({
  core: {
    label: "Core member",
    minProof: 3,
    allowedTiers: ["intermediate", "advanced"],
    requiresDepartment: true,
    needsDepartment: false,
    summary:
      "Core is the first seat with responsibility: you review others' work and hold a department thread. It needs 3 verified pieces of work and a rank above Beginner."
  },
  dept_lead: {
    label: "Department Head / Co-Head",
    minProof: 5,
    allowedTiers: ["advanced"],
    requiresDepartment: true,
    needsDepartment: true,
    summary:
      "A Head seat runs a department. It needs 5 verified pieces of work, Advanced rank, and membership of that department already."
  }
});

const ROLE_ORDER = ["student", "core", "dept_lead", "vertical_lead", "admin", "platform_admin"];

export function roleRank(role) {
  const index = ROLE_ORDER.indexOf(role);
  return index === -1 ? 0 : index;
}

export function proofTotal(proof = {}) {
  return (
    (Number(proof.nodes) || 0) +
    (Number(proof.projects) || 0) +
    (Number(proof.oss) || 0) +
    (Number(proof.answers) || 0)
  );
}

/**
 * Decide whether a request may be created. Pure: no clock, no database, no
 * surprise. `now` is injectable so the cooldown is testable.
 */
export function evaluateRoleRequest({
  targetRole,
  role = "student",
  tier = "beginner",
  proof = {},
  departmentMember = false,
  openRequest = false,
  lastDecisionAt = null,
  lastDecisionStatus = null,
  now = Date.now()
} = {}) {
  const rules = REQUIREMENTS[targetRole];
  if (!rules) {
    return { eligible: false, reasons: [{ code: "UNKNOWN_TARGET", message: "That seat does not exist." }], proof: { ...proof, total: proofTotal(proof) } };
  }

  const reasons = [];
  const total = proofTotal(proof);

  if (roleRank(role) >= roleRank(targetRole)) {
    reasons.push({
      code: "ALREADY_AT_ROLE",
      message: `You already hold ${rules.label} or higher.`
    });
  }

  if (openRequest) {
    reasons.push({
      code: "OPEN_REQUEST_EXISTS",
      message: "You already have a request waiting for a decision."
    });
  }

  if (lastDecisionAt) {
    const decidedAt = new Date(lastDecisionAt).getTime();
    const cooldownMs = COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
    const readyAt = decidedAt + cooldownMs;
    if (Number.isFinite(decidedAt) && readyAt > now) {
      reasons.push({
        code: "COOLDOWN",
        message: `Your last request was decided on ${new Date(decidedAt).toISOString().slice(0, 10)}${
          lastDecisionStatus ? ` (${lastDecisionStatus})` : ""
        }. You can ask again from ${new Date(readyAt).toISOString().slice(0, 10)}.`
      });
    }
  }

  if (!rules.allowedTiers.includes(tier)) {
    reasons.push({
      code: "RANK_TOO_LOW",
      message: `This seat needs ${rules.allowedTiers.join(" or ")} rank. Your verified rank is ${tier}.`
    });
  }

  if (total < rules.minProof) {
    reasons.push({
      code: "NOT_ENOUGH_PROOF",
      message: `This seat needs ${rules.minProof} verified pieces of work. You have ${total} (roadmap nodes ${Number(proof.nodes) || 0}, projects ${Number(proof.projects) || 0}, merged OSS ${Number(proof.oss) || 0}, accepted answers ${Number(proof.answers) || 0}).`
    });
  }

  if (rules.needsDepartment && !departmentMember) {
    reasons.push({
      code: "NOT_IN_DEPARTMENT",
      message: "Join that department first — a Head seat runs a department you are already part of."
    });
  }

  return { eligible: reasons.length === 0, reasons, proof: { ...proof, total } };
}

/**
 * The verified proof counts, in one round trip. Exported because the member card
 * and the seat screens must show the same numbers the gate uses -- two different
 * definitions of "proof" is how a member ends up told they qualify and then
 * refused.
 */
export async function proofCounts(sql, { tenantId, userId }) {
  const many = await proofCountsMany(sql, { tenantId, userIds: [userId] });
  return many.get(String(userId)) || { nodes: 0, projects: 0, oss: 0, answers: 0, total: 0 };
}

/**
 * The same counts for a whole roster, in four grouped queries instead of four
 * per person. A lead's roster is up to 300 rows; counting them one at a time
 * would be 1,200 round trips through the pooler to render a single page.
 */
export async function proofCountsMany(sql, { tenantId, userIds = [] }) {
  const ids = [...new Set((userIds || []).filter(Boolean).map(String))];
  const out = new Map();
  if (ids.length === 0) return out;

  const nodes = await sql`
    SELECT student_id AS id, COUNT(*)::int AS n FROM student_roadmap_progress
    WHERE student_id = ANY(${ids}) AND tenant_id = ${tenantId}::uuid
      AND status = 'completed' AND evidence_state = 'verified'
    GROUP BY student_id
  `;
  const projects = await sql`
    SELECT owner_id AS id, COUNT(*)::int AS n FROM projects
    WHERE owner_id = ANY(${ids}) AND tenant_id = ${tenantId}::uuid
      AND evidence_state = 'verified'
    GROUP BY owner_id
  `;
  const oss = await sql`
    SELECT student_id AS id, COUNT(*)::int AS n FROM student_oss_contributions
    WHERE student_id = ANY(${ids}) AND status = 'verified'
    GROUP BY student_id
  `;
  const answers = await sql`
    SELECT author_id AS id, COUNT(*)::int AS n FROM forum_replies
    WHERE author_id = ANY(${ids}) AND is_answer = true AND status = 'visible'
    GROUP BY author_id
  `;

  const index = (rows) => new Map(rows.map((r) => [String(r.id), Number(r.n) || 0]));
  const nodeMap = index(nodes);
  const projectMap = index(projects);
  const ossMap = index(oss);
  const answerMap = index(answers);

  for (const id of ids) {
    const proof = {
      nodes: nodeMap.get(id) || 0,
      projects: projectMap.get(id) || 0,
      oss: ossMap.get(id) || 0,
      answers: answerMap.get(id) || 0
    };
    out.set(id, { ...proof, total: proofTotal(proof) });
  }
  return out;
}

/**
 * The part of eligibility that does not depend on which seat is being asked for:
 * who you are, what rank you hold, what verified work you have, and which
 * departments you already belong to. Loaded once per page so the UI can evaluate
 * both seats without repeating the expensive tier computation.
 *
 * Sequential queries only: this runs through the pooler, where parallel
 * statements on one checkout are a documented hazard in this codebase.
 */
export async function loadRoleContext(sql, { tenantId, userId }) {
  const [profile] = await sql`
    SELECT role FROM profiles WHERE user_id = ${userId} AND tenant_id = ${tenantId}::uuid LIMIT 1
  `;

  const tiers = await classifyMany(sql, [userId]);
  const tier = tiers.get(userId)?.tier || "beginner";

  const proof = await proofCounts(sql, { tenantId, userId });

  const departments = await sql`
    SELECT m.department_id AS id, d.name, d.slug, m.level
    FROM department_memberships m
    JOIN departments d ON d.id = m.department_id
    WHERE m.user_id = ${userId} AND m.tenant_id = ${tenantId}::uuid
    ORDER BY d.name ASC
  `;

  return {
    role: profile?.role || "student",
    tier,
    proof,
    departments: departments || []
  };
}

/**
 * The seat-specific part: is a request already waiting, and when was the last
 * one decided (the cooldown clock).
 */
export async function loadRequestState(sql, { tenantId, userId, targetRole }) {
  const [open] = await sql`
    SELECT id FROM role_requests
    WHERE user_id = ${userId} AND tenant_id = ${tenantId}::uuid
      AND target_role = ${targetRole} AND status = 'open'
    LIMIT 1
  `;

  const [last] = await sql`
    SELECT status, decided_at FROM role_requests
    WHERE user_id = ${userId} AND tenant_id = ${tenantId}::uuid
      AND target_role = ${targetRole} AND status IN ('approved', 'rejected')
    ORDER BY decided_at DESC NULLS LAST
    LIMIT 1
  `;

  return {
    openRequest: Boolean(open),
    lastDecisionAt: last?.decided_at || null,
    lastDecisionStatus: last?.status || null
  };
}

/**
 * Everything `evaluateRoleRequest` needs for one seat. Used by the two write
 * routes, which only ever care about the seat being requested.
 */
export async function loadEligibility(sql, { tenantId, userId, targetRole, departmentId = null, now = Date.now() }) {
  const context = await loadRoleContext(sql, { tenantId, userId });
  const state = await loadRequestState(sql, { tenantId, userId, targetRole });
  const departmentMember = departmentId
    ? context.departments.some((d) => String(d.id) === String(departmentId))
    : false;
  return { ...context, ...state, departmentMember, now };
}
