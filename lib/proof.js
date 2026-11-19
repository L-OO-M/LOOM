/**
 * Proof read model — "what can this member actually prove, and who vouches?"
 *
 * One contract, two consumers: the member's own proof surface and the admin
 * review queue. It is a PURE READ MODEL. There are no INSERT/UPDATE/DELETE
 * statements in this file. A human decision is written by
 * `POST /api/admin/proof` and read back from `proof_reviews`.
 *
 * Trust rule: `verified` is true only when an authoritative, machine-checkable
 * source backs the item —
 *
 *   project      a matching github_repo_grants row with can_push = true
 *   oss          student_oss_contributions.status = 'verified' (webhook merge)
 *   leetcode     LeetCode's own API (or the local table it populated)
 *   certificate  an issued certificate row
 *   activity     signed GitHub webhook deliveries in student_daily_activity
 *   review       a durable human approval in proof_reviews
 *
 * The last case is the semi-autonomous part: a lead does not have to rebuild
 * trust from scratch, they record a decision once and it sticks. Rejection is
 * recorded too, but it never deletes the evidence underneath.
 *
 * Defensive by construction: every source is read inside its own try/catch.
 * A missing table or a column a later migration adds (for example
 * practice_connections.leetcode_stats) degrades to an empty result, never a
 * thrown request.
 */

const ACTIVITY_WINDOW_DAYS = 120;

const EMPTY_COUNTS = Object.freeze({
  verifiedProjects: 0,
  mergedPrs: 0,
  solvedProblems: 0,
  certificates: 0,
  activeDays: 0
});

function emptyProof() {
  return { counts: { ...EMPTY_COUNTS }, items: [] };
}

async function readRows(run) {
  try {
    const rows = await run();
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

function first(rows) {
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

function iso(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function safeInt(value, fallback = 0) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function reviewMap(rows) {
  const map = new Map();
  for (const row of rows) {
    if (row?.signal && (row.decision === "approved" || row.decision === "rejected")) {
      map.set(row.signal, row);
    }
  }
  return map;
}

/**
 * Apply a review decision to an item that is not machine-verified.
 * - approved upgrades it and names the human source;
 * - rejected keeps it unverified (the evidence is still shown, never deleted).
 * A machine-verified item is never downgraded by a human row.
 */
function withReview(verified, source, review) {
  if (verified || !review) return { verified, source };
  if (review.decision === "approved") return { verified: true, source: "review" };
  return { verified: false, source: review.decision === "rejected" ? "review" : source };
}

function sortNewestFirst(items) {
  return items.sort((a, b) => {
    if (!a.at && !b.at) return 0;
    if (!a.at) return 1;
    if (!b.at) return -1;
    return b.at.localeCompare(a.at);
  });
}

export async function buildProof(sql, { userId, tenantId } = {}) {
  if (!sql || !userId || !tenantId) return emptyProof();

  // Decisions are read once, separately from the source tables. Keeping this
  // query on its own means a deployment that has not applied migration 081 yet
  // still renders every machine-verified item instead of losing the whole page.
  const reviews = reviewMap(
    await readRows(() => sql`
      SELECT signal, decision, note, decided_at
      FROM proof_reviews
      WHERE tenant_id = ${tenantId}::uuid AND user_id = ${userId}
    `)
  );

  const items = [];

  // ---- 1. Projects: ownership proven by a push grant ---------------------
  const projects = await readRows(() => sql`
    SELECT p.id, p.title, p.repo_full_name, p.evidence_state, p.created_at, p.updated_at,
           EXISTS (
             SELECT 1
             FROM github_repo_grants g
             WHERE g.user_id = p.owner_id
               AND g.tenant_id = p.tenant_id
               AND g.can_push = true
               AND lower(g.repo_full_name) = lower(p.repo_full_name)
           ) AS push_grant
    FROM projects p
    WHERE p.tenant_id = ${tenantId}::uuid AND p.owner_id = ${userId}
    ORDER BY p.created_at DESC
  `);

  for (const p of projects) {
    const repo = p.repo_full_name || null;
    const machineVerified = p.push_grant === true && Boolean(repo);
    const { verified, source } = withReview(
      machineVerified,
      machineVerified ? "github" : "project",
      reviews.get(`project:${p.id}`)
    );
    items.push({
      id: p.id,
      kind: "project",
      label: p.title || "Untitled project",
      detail: repo
        ? machineVerified
          ? `${repo} · push access confirmed by GitHub`
          : repo
        : "No repository linked",
      href: repo ? `https://github.com/${repo}` : null,
      verified,
      source,
      at: iso(p.updated_at || p.created_at)
    });
  }

  // ---- 2. Open-source contributions: only a merged PR is proof -----------
  const contributions = await readRows(() => sql`
    SELECT id, repo_url, pr_url, pr_number, title, status, merged_at, verified_at, created_at
    FROM student_oss_contributions
    WHERE tenant_id = ${tenantId}::uuid AND student_id = ${userId}
    ORDER BY COALESCE(merged_at, verified_at, created_at) DESC
  `);

  for (const c of contributions) {
    const machineVerified = c.status === "verified";
    const { verified, source } = withReview(
      machineVerified,
      machineVerified ? "github" : "student_claim",
      reviews.get(`oss:${c.id}`)
    );
    const fallbackLabel = c.pr_number ? `Pull request #${c.pr_number}` : "Open-source contribution";
    items.push({
      id: c.id,
      kind: "oss",
      label: c.title || fallbackLabel,
      detail: c.repo_url || (c.pr_url ? "Merged contribution" : "Claimed contribution"),
      href: c.pr_url || null,
      verified,
      source,
      at: iso(c.merged_at || c.verified_at || c.created_at)
    });
  }

  // ---- 3. LeetCode: reported by LeetCode, not self-declared --------------
  // `leetcode_stats` is added by a later migration. If it is absent the query
  // throws, and the local practice_solves table (populated from the same API)
  // is used instead. A missing column must never break the whole page.
  const connection = first(
    await readRows(() => sql`
      SELECT leetcode_username AS username,
             (leetcode_stats->>'total') AS total,
             COALESCE(
               leetcode_stats->>'syncedAt',
               leetcode_stats->>'lastSyncedAt',
               leetcode_stats->>'last_synced_at',
               stats_synced_at::text
             ) AS synced_at
      FROM practice_connections
      WHERE tenant_id = ${tenantId}::uuid AND user_id = ${userId}
      LIMIT 1
    `)
  );
  const solveRow = first(
    await readRows(() => sql`
      SELECT COUNT(*)::int AS total, MAX(accepted_at) AS last_at
      FROM practice_solves
      WHERE tenant_id = ${tenantId}::uuid AND user_id = ${userId}
    `)
  );
  const reportedTotal = safeInt(connection?.total, 0);
  const localTotal = safeInt(solveRow?.total, 0);
  // Both are authoritative copies of the same API answer. Taking the larger
  // means a stale stats snapshot cannot hide solves already recorded locally.
  const solved = Math.max(reportedTotal, localTotal);
  if (solved > 0) {
    const username = connection?.username || null;
    items.push({
      id: "leetcode",
      kind: "leetcode",
      label: `${solved} problem${solved === 1 ? "" : "s"} solved on LeetCode`,
      detail: username ? `@${username} · reported by LeetCode` : "Reported by LeetCode",
      href: username ? `https://leetcode.com/u/${encodeURIComponent(username)}/` : "https://leetcode.com/",
      verified: true,
      source: "leetcode",
      at: iso(connection?.synced_at || solveRow?.last_at),
      count: solved
    });
  }

  // ---- 4. Certificates: an issued, verifiable row ------------------------
  const certificates = await readRows(() => sql`
    SELECT id, title, verification_code, issued_at
    FROM certificates
    WHERE tenant_id = ${tenantId}::uuid AND student_id = ${userId}
    ORDER BY issued_at DESC
  `);

  for (const c of certificates) {
    items.push({
      id: c.id,
      kind: "certificate",
      label: c.title || "Certificate",
      detail: "Verifiable certificate",
      href: c.verification_code ? `/verify/certificate/${encodeURIComponent(c.verification_code)}` : null,
      verified: true,
      source: "certificate",
      at: iso(c.issued_at)
    });
  }

  // ---- 5. Activity: recorded from signed webhook deliveries --------------
  const activity = first(
    await readRows(() => sql`
      SELECT COUNT(*)::int AS active_days,
             MAX(day) AS last_day,
             COALESCE(SUM(commits), 0)::int AS commits,
             COALESCE(SUM(pull_requests), 0)::int AS pull_requests,
             COALESCE(SUM(reviews), 0)::int AS reviews
      FROM student_daily_activity
      WHERE tenant_id = ${tenantId}::uuid
        AND student_id = ${userId}
        AND day >= CURRENT_DATE - ${ACTIVITY_WINDOW_DAYS}::int
        AND (commits > 0 OR pull_requests > 0 OR reviews > 0 OR score > 0)
    `)
  );
  const activeDays = safeInt(activity?.active_days, 0);
  if (activeDays > 0) {
    const commits = safeInt(activity?.commits, 0);
    const pullRequests = safeInt(activity?.pull_requests, 0);
    const reviewsDone = safeInt(activity?.reviews, 0);
    items.push({
      id: "activity",
      kind: "activity",
      label: `${activeDays} active day${activeDays === 1 ? "" : "s"} in the last ${ACTIVITY_WINDOW_DAYS}`,
      detail: `${commits} commit${commits === 1 ? "" : "s"} · ${pullRequests} pull request${pullRequests === 1 ? "" : "s"} · ${reviewsDone} review${reviewsDone === 1 ? "" : "s"}`,
      href: "/student/insights",
      verified: true,
      source: "webhook",
      at: iso(activity?.last_day),
      count: activeDays
    });
  }

  sortNewestFirst(items);

  // Derived from the exact rows above, never counted separately. This is what
  // makes it impossible for the headline number to disagree with the ledger.
  const counts = {
    verifiedProjects: items.reduce(
      (n, item) => n + (item.kind === "project" && item.verified ? 1 : 0),
      0
    ),
    mergedPrs: items.reduce(
      (n, item) => n + (item.kind === "oss" && item.verified ? 1 : 0),
      0
    ),
    solvedProblems: items.reduce(
      (n, item) => n + (item.kind === "leetcode" ? safeInt(item.count, 0) : 0),
      0
    ),
    certificates: items.reduce((n, item) => n + (item.kind === "certificate" ? 1 : 0), 0),
    activeDays: items.reduce(
      (n, item) => n + (item.kind === "activity" ? safeInt(item.count, 0) : 0),
      0
    )
  };

  return { counts, items };
}

/**
 * The admin queue: items in this chapter that still have no machine backing and
 * no human decision. Flat by design — the UI groups by student, and a flat list
 * is also what a script or export wants.
 *
 * A rejected project is excluded (`evidence_state = 'rejected'`) because it has
 * already had a decision; a rejected proof_reviews row is excluded by the same
 * NOT EXISTS. Rejection never deletes the row, it only removes it from the
 * queue.
 */
export async function listPendingProof(sql, { tenantId, userId = null, limit = 100 } = {}) {
  if (!sql || !tenantId) return [];
  const capped = Math.min(Math.max(safeInt(limit, 100), 1), 200);

  const projects = await readRows(() => sql`
    SELECT p.id, p.owner_id AS user_id, p.title, p.repo_full_name, p.created_at, p.updated_at,
           COALESCE(pr.name, p.owner_id) AS student_name
    FROM projects p
    LEFT JOIN profiles pr ON pr.user_id = p.owner_id
    WHERE p.tenant_id = ${tenantId}::uuid
      AND p.evidence_state <> 'rejected'
      AND (${userId}::text IS NULL OR p.owner_id = ${userId}::text)
      AND NOT EXISTS (
        SELECT 1
        FROM github_repo_grants g
        WHERE g.user_id = p.owner_id
          AND g.tenant_id = p.tenant_id
          AND g.can_push = true
          AND lower(g.repo_full_name) = lower(p.repo_full_name)
      )
      AND NOT EXISTS (
        SELECT 1
        FROM proof_reviews r
        WHERE r.tenant_id = p.tenant_id
          AND r.user_id = p.owner_id
          AND r.signal = 'project:' || p.id::text
      )
    ORDER BY p.created_at DESC
    LIMIT ${capped}
  `);

  const contributions = await readRows(() => sql`
    SELECT c.id, c.student_id AS user_id, c.title, c.repo_url, c.pr_url, c.pr_number,
           c.status, c.created_at, COALESCE(pr.name, c.student_id) AS student_name
    FROM student_oss_contributions c
    LEFT JOIN profiles pr ON pr.user_id = c.student_id
    WHERE c.tenant_id = ${tenantId}::uuid
      -- Only an undecided claim needs a human. A rejected row and a verified
      -- row have both already been decided by a source or a person.
      AND c.status = 'claimed'
      AND (${userId}::text IS NULL OR c.student_id = ${userId}::text)
      AND NOT EXISTS (
        SELECT 1
        FROM proof_reviews r
        WHERE r.tenant_id = c.tenant_id
          AND r.user_id = c.student_id
          AND r.signal = 'oss:' || c.id::text
      )
    ORDER BY c.created_at DESC
    LIMIT ${capped}
  `);

  const items = [
    ...projects.map((p) => ({
      userId: p.user_id,
      studentName: p.student_name,
      signal: `project:${p.id}`,
      kind: "project",
      label: p.title || "Untitled project",
      detail: p.repo_full_name || "No repository linked",
      href: p.repo_full_name ? `https://github.com/${p.repo_full_name}` : null,
      source: "project",
      at: iso(p.updated_at || p.created_at)
    })),
    ...contributions.map((c) => ({
      userId: c.user_id,
      studentName: c.student_name,
      signal: `oss:${c.id}`,
      kind: "oss",
      label: c.title || (c.pr_number ? `Pull request #${c.pr_number}` : "Open-source contribution"),
      detail: c.repo_url || c.pr_url || c.status,
      href: c.pr_url || null,
      source: "student_claim",
      at: iso(c.created_at)
    }))
  ];

  return sortNewestFirst(items);
}
