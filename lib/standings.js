// Standings (PROVE pillar) — shared scoring + ranking logic.
//
// Single source of truth for the student Standings surface. Both the page
// (app/(app)/student/leaderboard/page.jsx) and the API
// (app/api/leaderboard/route.js) build their queries here so the weights,
// predicates, and rank semantics cannot drift apart.
//
// Scoring (documented weights, activity counts only):
//   score = commits x 5 + pull_requests x 20 + completed_nodes x 30 + projects x 25
// This is a simple view of *visible* progress, not a measure of ability.
// Achievements, verified OSS merges, contest results, and reviews are NOT
// part of this score today (see notes on fetchBoard).
//
// Ranking: competition ranking via RANK() OVER (ORDER BY score DESC) —
// equal scores share a rank, and the next rank skips accordingly
// (1, 2, 2, 4). Display order within a tied score is by name.
//
// Scope:  college (own tenant) | global (every tenant) | friends ("Circle":
//   the viewer plus profiles with a linked GitHub username — there is no
//   friendship graph, and the UI must say so).
// Period: all (lifetime) | 30d. The 30-day window applies ONLY to the
//   commit/PR aggregates (student_daily_activity.day). Roadmap nodes and
//   projects are lifetime totals in both periods — the UI disclosure states
//   this explicitly rather than pretending otherwise.
//
// Representation choices (no schema changes):
// - Service accounts stay off the board: profiles with role admin/platform_admin
//   are excluded. Every other rung of the student ladder (student, core,
//   dept_lead, vertical_lead) ranks — leads and mentors are students too.
// - Projects count every status except 'archived' (active + completed both
//   represent shipped work; creation defaults to 'active').
// - Tenant always comes from the caller's profile server-side, never from input.
//
// All queries are single parameterized statements (pooler-safe: prepare:false).
// Callers must await sequentially, never in Promise.all batches.

export const STANDINGS_WEIGHTS = {
  commit: 5,
  pullRequest: 20,
  roadmapNode: 30,
  project: 25,
};

// Roles that never appear on the board (service/ops accounts).
export const STANDINGS_EXCLUDED_ROLES = ["admin", "platform_admin"];

export const STANDINGS_SCOPES = ["college", "global", "friends"];
export const STANDINGS_PERIODS = ["all", "30d"];

// Window size: the board ranks the top slice of a scope, not the whole
// population. The UI must label counts as "of the board" vs "of students".
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

// Pure score from component counts. Mirrors the SQL expression exactly.
export function scoreStandings({ commits = 0, prs = 0, nodesDone = 0, projects = 0 } = {}) {
  return (
    commits * STANDINGS_WEIGHTS.commit +
    prs * STANDINGS_WEIGHTS.pullRequest +
    nodesDone * STANDINGS_WEIGHTS.roadmapNode +
    projects * STANDINGS_WEIGHTS.project
  );
}

// JS mirror of the SQL RANK() semantics (competition ranking): equal scores
// share a rank; the next distinct score skips ahead. Input rows need at
// least { score, name }. Returns new row objects with `rank` attached,
// ordered by score desc, name asc. Used by tests and any client-side
// re-slicing; the server board itself ranks in SQL.
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

// Shared CTE body: activity (optionally last-30d), completed nodes,
// non-archived projects. `sql` is the postgres.js client from context.
function activityCte(sql, period) {
  // day is a date column with (student_id, day DESC) + unique(student_id, day)
  // indexes, so the range filter stays cheap.
  const window = period === "30d" ? sql`WHERE day >= CURRENT_DATE - 30` : sql``;
  return sql`
    SELECT student_id, SUM(commits)::int AS commits, SUM(pull_requests)::int AS pull_requests
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

// Score fragment shared by both queries. Weights stay parameterized
// (bound from STANDINGS_WEIGHTS) — the constant is the single source,
// the SQL only references it.
function scoreColumns(sql) {
  return sql`
    COALESCE(a.commits, 0)::int AS commits,
    COALESCE(a.pull_requests, 0)::int AS prs,
    COALESCE(r.done, 0)::int AS nodes_done,
    COALESCE(prj.count, 0)::int AS projects,
    (COALESCE(a.commits, 0) * ${STANDINGS_WEIGHTS.commit}
      + COALESCE(a.pull_requests, 0) * ${STANDINGS_WEIGHTS.pullRequest}
      + COALESCE(r.done, 0) * ${STANDINGS_WEIGHTS.roadmapNode}
      + COALESCE(prj.count, 0) * ${STANDINGS_WEIGHTS.project})::int AS score
  `;
}

// Ranked board slice for a scope. RANK() is computed over the whole scope
// (pre-LIMIT) so ranks stay correct under limit/offset pagination.
export async function fetchBoard(
  sql,
  { viewerId, tenantId, scope = "college", period = "all", limit = STANDINGS_BOARD_SIZE, offset = 0, query = "" }
) {
  const q = String(query || "").trim().slice(0, 64);
  const search = q
    ? sql`AND (p.name ILIKE ${`%${q}%`} OR COALESCE(p.primary_domain, '') ILIKE ${`%${q}%`})`
    : sql``;
  const rows = await sql`
    WITH a AS (${activityCte(sql, period)}),
    r AS (
      SELECT student_id, COUNT(*)::int AS done
      FROM student_roadmap_progress WHERE status = 'completed' GROUP BY student_id
    ),
    prj AS (
      SELECT owner_id, COUNT(*)::int AS count
      FROM projects WHERE status <> 'archived' GROUP BY owner_id
    ),
    s AS (
      SELECT p.user_id, p.name, p.primary_domain, ${scoreColumns(sql)}
      FROM profiles p
      LEFT JOIN a ON a.student_id = p.user_id
      LEFT JOIN r ON r.student_id = p.user_id
      LEFT JOIN prj ON prj.owner_id = p.user_id
      WHERE ${scopePredicates(sql, { viewerId, tenantId, scope })} ${search}
    )
    SELECT s.*, RANK() OVER (ORDER BY s.score DESC)::int AS rank,
      up.username, up.is_public AS profile_public, up.tenant_id AS profile_tenant
    FROM s
    LEFT JOIN user_profiles up ON up.user_id = s.user_id
    ORDER BY s.score DESC, s.name ASC
    LIMIT ${limit} OFFSET ${offset}
  `;
  return rows;
}

// The viewer's own standing, computed independently of the LIMIT window so
// a student outside the visible board still sees their true rank.
// rank = 1 + (scope members scoring strictly above) — the same competition
// semantics as RANK(). Returns { ranked: false } when the viewer has no
// score row in scope (e.g. an admin-role account, which is excluded by
// design) — callers must render the honest unranked state, never a fake rank.
export async function fetchSelfStanding(sql, { viewerId, tenantId, scope = "college", period = "all" }) {
  const [row] = await sql`
    WITH a AS (${activityCte(sql, period)}),
    r AS (
      SELECT student_id, COUNT(*)::int AS done
      FROM student_roadmap_progress WHERE status = 'completed' GROUP BY student_id
    ),
    prj AS (
      SELECT owner_id, COUNT(*)::int AS count
      FROM projects WHERE status <> 'archived' GROUP BY owner_id
    ),
    s AS (
      SELECT p.user_id, ${scoreColumns(sql)}
      FROM profiles p
      LEFT JOIN a ON a.student_id = p.user_id
      LEFT JOIN r ON r.student_id = p.user_id
      LEFT JOIN prj ON prj.owner_id = p.user_id
      WHERE ${scopePredicates(sql, { viewerId, tenantId, scope })}
    ),
    mine AS (SELECT * FROM s WHERE user_id = ${viewerId} LIMIT 1)
    SELECT
      (SELECT score FROM mine) AS score,
      (SELECT commits FROM mine) AS commits,
      (SELECT prs FROM mine) AS prs,
      (SELECT nodes_done FROM mine) AS nodes_done,
      (SELECT projects FROM mine) AS projects,
      (SELECT COUNT(*)::int FROM s) AS total,
      CASE WHEN (SELECT score FROM mine) IS NULL THEN NULL
        ELSE ((SELECT COUNT(*)::int FROM s, mine WHERE s.score > mine.score) + 1) END AS rank
  `;
  if (!row || row.score === null || row.score === undefined) return { ranked: false };
  return {
    ranked: true,
    rank: row.rank,
    total: row.total,
    score: row.score,
    commits: row.commits,
    prs: row.prs,
    nodes_done: row.nodes_done,
    projects: row.projects,
  };
}
