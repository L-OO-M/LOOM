import { can } from "@/lib/permissions";
import { recordEvidence, recomputeScore } from "@/lib/ranking";
import {
  DAY_MS,
  IST_OFFSET_MS,
  computeCredits,
  historyCutoff,
  isReleased,
  monthBounds,
  rankMembers,
  weekStart
} from "@/lib/practice-domain";

function toMs(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  if (typeof value === "string" && value) return new Date(value).getTime();
  return null;
}

export function normalizeWeek(row) {
  return {
    id: String(row.id),
    title: row.title,
    startAt: toMs(row.start_at ?? row.startAt),
    endAt: toMs(row.end_at ?? row.endAt),
    status: row.status,
    createdAt: toMs(row.created_at ?? row.createdAt)
  };
}

function normalizeQuestion(row) {
  return {
    id: String(row.id),
    weekId: String(row.week_id ?? row.weekId),
    position: Number(row.position),
    title: row.title,
    slug: row.slug,
    difficulty: row.difficulty,
    topic: row.topic || ""
  };
}

function normalizeSolve(row) {
  return {
    userId: String(row.user_id ?? row.userId),
    questionId: String(row.question_id ?? row.questionId),
    externalId: row.external_id ?? row.externalId,
    slug: row.slug,
    acceptedAt: toMs(row.accepted_at ?? row.acceptedAt)
  };
}

function normalizeCorrection(row) {
  return {
    userId: String(row.user_id ?? row.userId),
    questionId: String(row.question_id ?? row.questionId),
    credited: row.credited === true,
    acceptedAt: row.accepted_at === null || row.accepted_at === undefined ? null : toMs(row.accepted_at ?? row.acceptedAt),
    evidenceUrl: row.evidence_url ?? row.evidenceUrl,
    reason: row.reason
  };
}

function normalizeConnection(row) {
  if (!row) return null;
  return {
    userId: String(row.user_id ?? row.userId),
    username: row.leetcode_username ?? row.username,
    active: row.active !== false,
    lastSyncAt: toMs(row.last_sync_at ?? row.lastSyncAt),
    lastAttemptAt: toMs(row.last_attempt_at ?? row.lastAttemptAt),
    nextSyncAt: toMs(row.next_sync_at ?? row.nextSyncAt),
    syncState: row.sync_state ?? row.syncState ?? "never",
    syncError: row.sync_error ?? row.syncError ?? null,
    failures: Number(row.failures || 0)
  };
}

function normalizeMember(row) {
  return {
    id: String(row.user_id ?? row.id),
    name: row.name || "Member",
    role: row.role || "student"
  };
}

async function loadMembers(sql, tenantId) {
  const rows = await sql`
    SELECT user_id, name, role
    FROM profiles
    WHERE tenant_id = ${tenantId}::uuid
      AND (role IS NULL OR role NOT IN ('admin', 'platform_admin'))
    ORDER BY name ASC
  `;
  return rows.map(normalizeMember);
}

async function loadConnections(sql, tenantId) {
  const rows = await sql`
    SELECT user_id, leetcode_username, active, last_sync_at, last_attempt_at,
           next_sync_at, sync_state, sync_error, failures
    FROM practice_connections
    WHERE tenant_id = ${tenantId}::uuid
    ORDER BY leetcode_username ASC
  `;
  return rows.map(normalizeConnection);
}

async function loadReleasedData(sql, tenantId, now) {
  const cutoff = historyCutoff(now);
  const weekRows = await sql`
    SELECT id, title, start_at, end_at, status, created_at
    FROM practice_weeks
    WHERE tenant_id = ${tenantId}::uuid
      AND status = 'scheduled'
      AND start_at <= ${new Date(now)}
      AND end_at > ${new Date(cutoff)}
    ORDER BY start_at DESC
  `;
  const weeks = weekRows.map(normalizeWeek);
  const questionRows = await sql`
    SELECT q.id, q.week_id, q.position, q.title, q.slug, q.difficulty, q.topic
    FROM practice_questions q
    JOIN practice_weeks w ON w.id = q.week_id
    WHERE q.tenant_id = ${tenantId}::uuid
      AND w.tenant_id = ${tenantId}::uuid
      AND w.status = 'scheduled'
      AND w.start_at <= ${new Date(now)}
      AND w.end_at > ${new Date(cutoff)}
    ORDER BY w.start_at DESC, q.position ASC
  `;
  const questions = questionRows.map(normalizeQuestion);
  const solveRows = await sql`
    SELECT s.user_id, s.question_id, s.external_id, s.slug, s.accepted_at
    FROM practice_solves s
    WHERE s.tenant_id = ${tenantId}::uuid
      AND s.accepted_at >= ${new Date(cutoff - 7 * DAY_MS)}
      AND s.accepted_at <= ${new Date(now)}
  `;
  const correctionRows = await sql`
    SELECT c.user_id, c.question_id, c.credited, c.accepted_at, c.evidence_url, c.reason
    FROM practice_corrections c
    JOIN practice_questions q ON q.id = c.question_id
    JOIN practice_weeks w ON w.id = q.week_id
    WHERE c.tenant_id = ${tenantId}::uuid
      AND w.tenant_id = ${tenantId}::uuid
      AND w.status = 'scheduled'
      AND w.start_at <= ${new Date(now)}
  `;
  return {
    weeks,
    questions,
    solves: solveRows.map(normalizeSolve),
    corrections: correctionRows.map(normalizeCorrection)
  };
}

export async function loadPracticeSnapshot(sql, { tenantId, userId, now = Date.now() }) {
  const members = await loadMembers(sql, tenantId);
  const connections = await loadConnections(sql, tenantId);
  const data = await loadReleasedData(sql, tenantId, now);
  const credits = computeCredits(data.weeks, data.questions, data.solves, data.corrections, now);
  const current = data.weeks.find((week) => week.startAt === weekStart(now)) || null;
  const [monthStart, monthEnd] = monthBounds(now);
  const connection = connections.find((item) => item.userId === String(userId)) || null;
  const usernames = new Map(connections.map((item) => [item.userId, item.username]));
  const boardMembers = members.map((member) => ({
    ...member,
    username: usernames.get(member.id) || null
  }));
  const weeklyRanking = rankMembers(boardMembers, credits, (credit) => current && credit.weekId === current.id);
  const monthlyRanking = rankMembers(
    boardMembers,
    credits,
    (credit) => credit.acceptedAt >= monthStart && credit.acceptedAt < monthEnd
  );
  const history = data.weeks.filter((week) => week.startAt < weekStart(now));
  const [background] = await sql`
    SELECT completed_at
    FROM practice_sync_runs
    WHERE tenant_id = ${tenantId}::uuid
      AND kind = 'automatic'
      AND completed_at IS NOT NULL
    ORDER BY started_at DESC
    LIMIT 1
  `;
  const [{ solve_count: solveCount = 0 } = {}] = await sql`
    SELECT COUNT(*)::int AS solve_count
    FROM practice_solves
    WHERE tenant_id = ${tenantId}::uuid
      AND user_id = ${userId}
  `;

  return {
    now,
    weekStart: weekStart(now),
    monthStart,
    monthEnd,
    current,
    history,
    weeks: data.weeks,
    questions: data.questions,
    credits,
    connection,
    members: boardMembers,
    weeklyRanking,
    monthlyRanking,
    lastBackgroundRunAt: toMs(background?.completed_at),
    staleAfterMs: 2 * 60 * 60_000,
    canRelink: Number(solveCount) === 0
  };
}

export async function loadPracticeAdminSnapshot(sql, { tenantId, now = Date.now() }) {
  const weekRows = await sql`
    SELECT id, title, start_at, end_at, status, created_at
    FROM practice_weeks
    WHERE tenant_id = ${tenantId}::uuid
    ORDER BY start_at DESC
  `;
  const questionRows = await sql`
    SELECT id, week_id, position, title, slug, difficulty, topic
    FROM practice_questions
    WHERE tenant_id = ${tenantId}::uuid
    ORDER BY week_id, position
  `;
  const correctionRows = await sql`
    SELECT c.id, c.user_id, c.question_id, c.credited, c.accepted_at, c.evidence_url,
           c.reason, c.updated_at, p.name AS member_name, q.title AS question_title,
           w.title AS week_title, w.start_at
    FROM practice_corrections c
    JOIN profiles p ON p.user_id = c.user_id AND p.tenant_id = c.tenant_id
    JOIN practice_questions q ON q.id = c.question_id AND q.tenant_id = c.tenant_id
    JOIN practice_weeks w ON w.id = q.week_id AND w.tenant_id = c.tenant_id
    WHERE c.tenant_id = ${tenantId}::uuid
    ORDER BY c.updated_at DESC
    LIMIT 100
  `;
  const runRows = await sql`
    SELECT id, kind, started_at, completed_at, checked, successful, failed, error_summary
    FROM practice_sync_runs
    WHERE tenant_id = ${tenantId}::uuid
    ORDER BY started_at DESC
    LIMIT 12
  `;
  const connectionRows = await sql`
    SELECT c.user_id, c.leetcode_username, c.active, c.last_sync_at, c.last_attempt_at,
           c.next_sync_at, c.sync_state, c.sync_error, c.failures, p.name
    FROM practice_connections c
    JOIN profiles p ON p.user_id = c.user_id AND p.tenant_id = c.tenant_id
    WHERE c.tenant_id = ${tenantId}::uuid
    ORDER BY p.name ASC
  `;
  const members = await loadMembers(sql, tenantId);
  const weeks = weekRows.map(normalizeWeek);
  const questions = questionRows.map(normalizeQuestion);
  const released = weeks.filter((week) => isReleased(week, now));

  return {
    now,
    members,
    weeks,
    questions,
    released,
    corrections: correctionRows.map((row) => ({
      id: String(row.id),
      userId: String(row.user_id),
      questionId: String(row.question_id),
      credited: row.credited === true,
      acceptedAt: toMs(row.accepted_at),
      evidenceUrl: row.evidence_url,
      reason: row.reason,
      updatedAt: toMs(row.updated_at),
      memberName: row.member_name,
      questionTitle: row.question_title,
      weekTitle: row.week_title,
      weekStartAt: toMs(row.start_at)
    })),
    runs: runRows.map((row) => ({
      id: String(row.id),
      kind: row.kind,
      startedAt: toMs(row.started_at),
      completedAt: toMs(row.completed_at),
      checked: Number(row.checked || 0),
      successful: Number(row.successful || 0),
      failed: Number(row.failed || 0),
      errorSummary: row.error_summary
    })),
    connections: connectionRows.map((row) => ({
      ...normalizeConnection(row),
      name: row.name
    }))
  };
}

export async function findPracticeDepartment(sql, tenantId) {
  const [department] = await sql`
    SELECT id, slug, name, vertical
    FROM departments
    WHERE tenant_id = ${tenantId}::uuid
      AND slug = 'dsa'
      AND is_active = true
    LIMIT 1
  `;
  return department || null;
}

export function canAuthorPractice(profile, department) {
  if (!department) return { ok: false, note: "missing_department" };
  return can(profile, "upload_roadmap", { departmentId: department.id });
}

export async function reconcilePracticeEvidence({
  sql,
  tenantId,
  userId,
  questionId,
  acceptedAt,
  source,
  verifiedBy,
  weekId
}) {
  return recordEvidence({
    sql,
    tenantId,
    userId,
    kind: "dsa_solved",
    refId: questionId,
    verifiedBy,
    source,
    evidence: {
      questionId,
      weekId,
      acceptedAt: new Date(acceptedAt).toISOString(),
      practice: true
    }
  });
}

export async function recomputePracticeScore(sql, tenantId, userId) {
  return recomputeScore(sql, tenantId, userId);
}

export function practiceWeekDateToMs(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return null;
  const time = new Date(`${value}T00:00:00+05:30`).getTime();
  return Number.isFinite(time) ? time : null;
}

export function practiceDateInput(value) {
  const time = toMs(value);
  if (!Number.isFinite(time)) return "";
  return new Date(time + IST_OFFSET_MS).toISOString().slice(0, 10);
}
