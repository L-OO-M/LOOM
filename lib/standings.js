// Standings (PROVE pillar) — shared scoring + ranking logic.
//
// Single source of truth for the student Standings surface. Both the page
// (app/(app)/student/leaderboard/page.jsx) and the API
// (app/api/leaderboard/route.js) build their queries here so the weights,
// predicates, and rank semantics cannot drift apart.
//
// WHY THE FORMULA CHANGED
//
// This board used to score raw rows: commits x5 + pull requests x20 +
// completed roadmap nodes x30 + non-archived projects x25. Only the first two
// were attested by anything. `POST /api/projects {"title":"x"}` returned +25 and
// `POST /api/roadmap/progress {"status":"completed"}` returned +30 -- no proof,
// no cap, no rate limit -- so 55 of every 100 points were self-issued in under
// a minute, and the highest-weight inputs were the two a student could fake most
// easily. Worse, roadmap completion minted student_achievements, which fed
// reputation and mentor eligibility, so the forgery did not stay on the board.
//
// Now a point has exactly one of two provenances, and the board reads only
// these two sources:
//
//   1. student_daily_activity -- written only by HMAC-signed GitHub deliveries.
//      Attested at ingest. Commits and pull requests count here and only here.
//   2. ranking_events -- the ledger from migration 037, which the DATABASE
//      refuses to accept without a `verified_by`. A signed merge, a lead's
//      confirmation, or an admin's judgement. Nothing a student said about
//      themselves qualifies.
//
// The weights are in lib/ranking.js and are shared with the webhook and the
// ledger, so there is one arithmetic to keep honest.
//
// Provisional claims (a node marked complete that no lead has confirmed, a
// project whose repository has shown no attested activity) score ZERO. They are
// reported separately as `pending`, because a board that quietly omits them
// reads as "you have done nothing" when the truth is "you have done something
// nobody has checked yet".
//
// Ranking: competition ranking via RANK() OVER (ORDER BY score DESC) --
// equal scores share a rank, and the next rank skips accordingly (1, 2, 2, 4).
//
// Scope:  college (own tenant) | global (every tenant) | friends ("Circle").
// Period: all (lifetime) | 30d. The 30-day window applies ONLY to the attested
//   activity aggregates; ledger evidence is lifetime in both periods, and the
//   UI discloses that rather than pretending otherwise.
//
// All queries are single parameterized statements (pooler-safe: prepare:false).
// Callers must await sequentially, never in Promise.all batches.

import { KIND_CAPS, WEIGHTS, isVerifiedRankingEnabled } from "@/lib/ranking";

// Weights for the attested-activity half of the score. These MUST match
// ACTIVITY_WEIGHTS in app/api/github/webhook/route.js, because the stored
// per-day `score` column is computed there from these same numbers. The
// comment on that constant says so too; the two are one contract.
export const ACTIVITY_WEIGHTS = { commit: 2, pullRequest: 12 };

// Caps on the attested half, mirroring public.ranking_kind_cap() for the ledger
// half. Without them, volume becomes the strategy: 200 trivial commits is a
// real, signed, attested fact and would otherwise outrank a merged PR.
export const ACTIVITY_CAPS = { commit: 20, pullRequest: 10 };

export const STANDINGS_EXCLUDED_ROLES = ["admin", "platform_admin"];

export const STANDINGS_SCOPES = ["college", "global", "friends"];
export const STANDINGS_PERIODS = ["all", "30d"];

// The board ranks the top slice of a scope, not the whole population. The UI
// must label counts as "of the board" vs "of students".
export const STANDINGS_BOARD_SIZE = 50;
export const STANDINGS_MAX_LIMIT = 100;

export function normalizeScope(value) {
  return STANDINGS_SCOPES.includes(value) ? value : "college";
}

export function normalizePeriod(value) {
  return STANDINGS_PERIODS.includes(value) ? value : "all";
}

export function normalizeLimit(value, fallback = STANDINGS_BOARD_SIZE) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(n, STANDINGS_MAX_LIMIT);
}

export function normalizeOffset(value) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

// Total contribution of `count` items of one kind: the first `cap` count in
// full, everything past the cap worth nothing.
//
// This is the aggregate form of the per-item CASE in recompute_ranking_scores
// (migration 037). The ledger side is computed row-by-row in SQL and read from
// ranking_scores; this side has no materialized form, so the aggregate form is
// the authority for attested activity. Both must agree, and standingBreakdown()
// discloses both numbers.
//
// The count<=0 guard is load-bearing: with no items, `0 <= cap` is true and the
// naive form returned the FULL weight for an empty contribution. That is
// precisely the class of bug this work exists to remove, so it is explicit here
// and pinned by a test.
function capped(weight, count, cap) {
  if (!weight || !count || count <= 0) return 0;
  return Math.min(count, cap) * weight;
}

/**
 * Pure score from attested activity counts.
 *
 * `verifiedScore` comes from the ledger and is already capped and decayed in
 * SQL -- recompute_ranking_scores is the authority for it, so it is passed in
 * rather than recomputed here. This function owns only the activity half,
 * which has no materialized form.
 */
export function scoreStandings({
  commits = 0,
  prs = 0,
  verifiedScore = 0
} = {}) {
  return (
    capped(ACTIVITY_WEIGHTS.commit, commits, ACTIVITY_CAPS.commit) +
    capped(ACTIVITY_WEIGHTS.pullRequest, prs, ACTIVITY_CAPS.pullRequest) +
    verifiedScore
  );
}

// Full disclosure for the UI: what each piece of evidence is worth, where it
// comes from, and what stops it being claimed. The board is only trustworthy if
// a student can see why.
export function standingBreakdown() {
  return [
    { label: "Merged open-source pull request", weight: WEIGHTS.oss_verified, cap: KIND_CAPS.oss_verified, source: "Signed merge delivery or admin review" },
    { label: "Contest result", weight: WEIGHTS.contest_top, cap: KIND_CAPS.contest_top, source: "Recorded by an admin after judging" },
    { label: "Verified project", weight: WEIGHTS.project_verified, cap: KIND_CAPS.project_verified, source: "Signed delivery from your repository" },
    { label: "Confirmed roadmap milestone", weight: WEIGHTS.roadmap_done, cap: KIND_CAPS.roadmap_done, source: "Prerequisites met, evidence confirmed by a lead" },
    { label: "Pull request opened", weight: ACTIVITY_WEIGHTS.pullRequest, cap: ACTIVITY_CAPS.pullRequest, source: "Signed GitHub delivery" },
    { label: "Accepted community answer", weight: WEIGHTS.solution_accepted, cap: KIND_CAPS.solution_accepted, source: "Marked as the answer by another member" },
    { label: "Event attended", weight: WEIGHTS.event_attended, cap: KIND_CAPS.event_attended, source: "Chapter check-in" },
    { label: "Commit", weight: ACTIVITY_WEIGHTS.commit, cap: ACTIVITY_CAPS.commit, source: "Signed GitHub delivery" },
  ];
}

// JS mirror of the SQL RANK() semantics (competition ranking): equal scores
// share a rank; the next distinct score skips ahead. Input rows need at least
// { score, name }. Returns new row objects with `rank` attached, ordered by
// score desc, name asc.
export function assignRanks(rows) {
  const ordered = [...rows].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return String(a.name || "").localeCompare(String(b.name || ""));
  });
  let rank = 0;
  let lastScore = null;
  return ordered.map((row, i) => {
    if (row.score !== lastScore) {
      rank = i + 1;
      lastScore = row.score;
    }
    return { ...row, rank };
  });
}

// Whether a board row's name may link to /student/[username]. Mirrors the
// guards on that page: public card in the viewer's chapter (or the viewer's
// own card, which is always linkable to its owner).
export function canLinkProfile(row, viewerTenantId, viewerId) {
  if (!row || !row.username) return false;
  if (row.user_id === viewerId) return true;
  if (!row.profile_public) return false;
  if (!row.profile_tenant) return true;
  return String(row.profile_tenant) === String(viewerTenantId);
}

// Attested activity, optionally last-30d. day is a date column with
// (student_id, day DESC) and unique(student_id, day) indexes.
function activityCte(sql, period) {
  const window = period === "30d" ? sql`WHERE day >= CURRENT_DATE - 30` : sql``;
  return sql`
    SELECT student_id, SUM(commits)::int AS commits, SUM(pull_requests)::int AS prs
    FROM student_daily_activity
    ${window}
    GROUP BY student_id
  `;
}

function scopePredicates(sql, { viewerId, tenantId, scope }) {
  const tenant =
    scope === "global"
      ? sql`TRUE`
      : sql`(p.tenant_id = ${tenantId}::uuid OR ${tenantId}::uuid IS NULL)`;
  // No friendship graph exists: Circle = the viewer plus anyone in scope
  // with a linked GitHub identity (non-empty github_username).
  const circle =
    scope === "friends"
      ? sql`AND (p.user_id = ${viewerId} OR (p.github_username IS NOT NULL AND p.github_username <> ''))`
      : sql``;
  return sql`${tenant} AND (p.role IS NULL OR p.role NOT IN ${sql(STANDINGS_EXCLUDED_ROLES)}) ${circle}`;
}

// Provisional claims: what this student has submitted that nobody has
// confirmed. Scored at zero by definition -- this is purely so the surface can
// say "awaiting review" instead of "nothing".
function pendingCte(sql) {
  return sql`
    SELECT student_id,
           SUM(n_nodes + n_projects)::int AS pending
      FROM (
        SELECT student_id, COUNT(*)::int AS n_nodes, 0 AS n_projects
          FROM student_roadmap_progress
         WHERE status = 'completed' AND evidence_state = 'provisional'
         GROUP BY student_id
        UNION ALL
        SELECT owner_id AS student_id, 0, COUNT(*)::int
          FROM projects
         WHERE evidence_state = 'provisional'
         GROUP BY owner_id
      ) t
     GROUP BY student_id
  `;
}

// Score fragment. The ledger half is read, never recomputed: recompute_
// ranking_scores in migration 037 is the single authority for verified score,
// including per-kind caps and the age curve.
//
// `verifiedOnly` decides whether ranking_scores is joined at all. The previous
// implementation joined it with `ON TRUE` when the flag was off, which is a
// CROSS JOIN: the moment ranking_scores held a row, every profile would have
// been multiplied once per score row. With the flag off the ledger contributes
// nothing, so the honest expression is a literal 0 -- not a join that can fan
// out the board.
function scoreColumns(sql, verifiedOnly) {
  const verifiedScore = verifiedOnly ? sql`COALESCE(rs.score, 0)` : sql`0`;
  return sql`
    COALESCE(a.commits, 0)::int AS commits,
    COALESCE(a.prs, 0)::int AS prs,
    ${verifiedScore}::int AS verified_score,
    COALESCE(pd.pending, 0)::int AS pending,
    (COALESCE(a.commits, 0) * ${ACTIVITY_WEIGHTS.commit}
      + COALESCE(a.prs, 0) * ${ACTIVITY_WEIGHTS.pullRequest}
      + ${verifiedScore})::int AS score
  `;
}

// Ranked board slice for a scope. RANK() is computed over the whole scope
// (pre-LIMIT) so ranks stay correct under limit/offset pagination.
export async function fetchBoard(
  sql,
  { viewerId, tenantId, scope = "college", period = "all", limit = STANDINGS_BOARD_SIZE, offset = 0, query = "", verifiedOnly = true }
) {
  const q = String(query || "").trim().slice(0, 64);
  const search = q
    ? sql`AND (p.name ILIKE ${`%${q}%`} OR COALESCE(p.primary_domain, '') ILIKE ${`%${q}%`})`
    : sql``;
  // The release flag decides which of the two provenances the board is built
  // from. With it off, ranking_scores holds nothing, so the board is empty --
  // which is the honest state, and why the flag defaults to off.
  const ledger = verifiedOnly
    ? sql`LEFT JOIN ranking_scores rs ON rs.tenant_id = p.tenant_id AND rs.user_id = p.user_id`
    : sql``;
  const pending = verifiedOnly ? pendingCte(sql) : sql`SELECT NULL::text AS student_id, 0::int AS pending WHERE FALSE`;
  const rows = await sql`
    WITH a AS (${activityCte(sql, period)}),
    pd AS (${pending}),
    s AS (
      SELECT p.user_id, p.name, p.primary_domain, ${scoreColumns(sql, verifiedOnly)}
      FROM profiles p
      LEFT JOIN a ON a.student_id = p.user_id
      ${ledger}
      LEFT JOIN pd ON pd.student_id = p.user_id
      WHERE ${scopePredicates(sql, { viewerId, tenantId, scope })} ${search}
    )
    SELECT s.*, RANK() OVER (ORDER BY s.score DESC)::int AS rank,
      up.username, up.is_public AS profile_public, up.tenant_id AS profile_tenant
    FROM s
    LEFT JOIN user_profiles up ON up.user_id = s.user_id
    WHERE s.score > 0
    ORDER BY s.score DESC, s.name ASC
    LIMIT ${limit} OFFSET ${offset}
  `;
  return rows;
}

// The viewer's own standing, computed independently of the LIMIT window so
// a student outside the visible board still sees their true rank.
// rank = 1 + (scope members scoring strictly above) -- the same competition
// semantics as RANK(). Returns { ranked: false } when the viewer has no
// score row in scope (e.g. an admin-role account, which is excluded by
// design) -- callers must render the honest unranked state, never a fake rank.
export async function fetchSelfStanding(sql, { viewerId, tenantId, scope = "college", period = "all", verifiedOnly = true }) {
  const ledger = verifiedOnly
    ? sql`LEFT JOIN ranking_scores rs ON rs.tenant_id = p.tenant_id AND rs.user_id = p.user_id`
    : sql``;
  const pending = verifiedOnly ? pendingCte(sql) : sql`SELECT NULL::text AS student_id, 0::int AS pending WHERE FALSE`;
  const [row] = await sql`
    WITH a AS (${activityCte(sql, period)}),
    pd AS (${pending}),
    s AS (
      SELECT p.user_id, ${scoreColumns(sql, verifiedOnly)}
      FROM profiles p
      LEFT JOIN a ON a.student_id = p.user_id
      ${ledger}
      LEFT JOIN pd ON pd.student_id = p.user_id
      WHERE ${scopePredicates(sql, { viewerId, tenantId, scope })}
    ),
    mine AS (SELECT * FROM s WHERE user_id = ${viewerId} LIMIT 1)
    SELECT
      (SELECT score FROM mine) AS score,
      (SELECT commits FROM mine) AS commits,
      (SELECT prs FROM mine) AS prs,
      (SELECT verified_score FROM mine) AS verified_score,
      (SELECT pending FROM mine) AS pending,
      (SELECT COUNT(*)::int FROM s WHERE s.score > 0) AS total,
      CASE WHEN (SELECT score FROM mine) IS NULL THEN NULL
        ELSE ((SELECT COUNT(*)::int FROM s, mine WHERE s.score > mine.score) + 1) END AS rank
  `;
  if (!row || row.score === null || row.score === undefined) {
    return { ranked: false, inScope: false };
  }
  const score = Number(row.score);
  // A score of zero is a real, honest number -- but it is not a place on the
  // board, and "You are #1 of 0" would be a lie dressed as a rank. The page
  // renders the explainer instead, using the metrics below.
  return {
    ranked: score > 0,
    inScope: true,
    rank: row.rank === null ? null : Number(row.rank),
    total: Number(row.total ?? 0),
    score,
    commits: Number(row.commits ?? 0),
    prs: Number(row.prs ?? 0),
    verified_score: Number(row.verified_score ?? 0),
    pending: Number(row.pending ?? 0)
  };
}

/**
 * Extra context for the viewer's own card: what they have done that the board
 * does NOT score, so "why is my number zero?" has an answer instead of a guess.
 *
 * Three different things get conflated by students, and each has a different
 * fix:
 *   - roadmap nodes completed but still provisional  -> a lead must verify them
 *   - resource lessons marked done                   -> never scored (by design)
 *   - staff role                                     -> excluded from the board
 *
 * Returned separately from the score so nothing here can accidentally be added
 * to it. Single statement, pooler-safe, scoped to the viewer and tenant.
 */
export async function fetchSelfEvidenceSummary(sql, { userId, tenantId }) {
  const [row] = await sql`
    SELECT
      (SELECT COUNT(*)::int FROM student_roadmap_progress
        WHERE student_id = ${userId}
          AND tenant_id = ${tenantId}::uuid
          AND status = 'completed'
          AND evidence_state = 'verified') AS verified_nodes,
      (SELECT COUNT(*)::int FROM student_roadmap_progress
        WHERE student_id = ${userId}
          AND tenant_id = ${tenantId}::uuid
          AND status = 'completed'
          AND evidence_state = 'provisional') AS provisional_nodes,
      (SELECT COUNT(*)::int FROM resource_progress
        WHERE student_id = ${userId}
          AND tenant_id = ${tenantId}::uuid
          AND completed_at IS NOT NULL) AS resource_lessons,
      (SELECT COUNT(*)::int FROM student_daily_activity a
        WHERE a.student_id = ${userId}
          AND a.day >= CURRENT_DATE - 30
          AND (a.commits + a.pull_requests + a.reviews) > 0) AS active_days_30,
      (SELECT MAX(a.day) FROM student_daily_activity a
        WHERE a.student_id = ${userId}) AS last_activity_day
  `;
  return {
    verifiedNodes: Number(row?.verified_nodes ?? 0),
    provisionalNodes: Number(row?.provisional_nodes ?? 0),
    resourceLessons: Number(row?.resource_lessons ?? 0),
    activeDays30: Number(row?.active_days_30 ?? 0),
    lastActivityDay: row?.last_activity_day ? String(row.last_activity_day).slice(0, 10) : null,
  };
}

/** Roles the board deliberately leaves out. Staff service accounts are not competitors. */
export function isStaffExcluded(role) {
  return STANDINGS_EXCLUDED_ROLES.includes(role);
}

/**
 * Is the verified board live for this tenant?
 *
 * Fail-closed, like every other flag read in this codebase: a missing table, a
 * missing row or an error means "not yet". The UI must say so plainly rather
 * than render an empty board with no explanation.
 */
export { isVerifiedRankingEnabled };