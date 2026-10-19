// Evidence-based ranking — the rules, and the only sanctioned way to write a score.
//
// WHY THIS FILE IS A TRUST BOUNDARY
//
// A leaderboard is a claim. "You are ranked 4th" is only true if the things it
// counts were actually done, which means every point has to trace back to
// something a student could not simply assert.
//
// This codebase had two scoring systems. lib/standings.js was the live one, and
// it counted raw rows from two tables the student writes with one POST:
// `POST /api/projects {"title":"x"}` returned +25 and
// `POST /api/roadmap/progress {"status":"completed"}` returned +30, with no
// proof, no cap and no rate limit. 55 of every 100 points on the board were
// self-issued in under a minute. Worse, roadmap completion minted real
// student_achievements, so the forgery propagated into credentials, reputation
// and mentor eligibility.
//
// So: a point is only ever recorded here, and only ever with a `verifiedBy`.
// The database enforces it too — migration 037 installs a BEFORE INSERT trigger
// that rejects any ranking_events row without a verifier, for every role
// including the owner. There is no code path that awards a self-declared point,
// which is what makes the claim defensible.
//
// THE TWO ATTESTED SOURCES
//
// Exactly two things can vouch for a student:
//
//   1. A signed GitHub delivery. HMAC-verified, so commits, pull requests and
//      reviews are attested at ingest and land in student_daily_activity. They
//      are deliberately NOT ledger rows: one row per commit would turn a
//      200-commit push into 200 inserts on the ingest path for no extra trust.
//
//   2. A named human or a system rule, recorded in ranking_events with
//      verified_by — a lead confirming a roadmap node, an admin judging a
//      contest, the webhook proving a merge landed.
//
// Everything else is either verified or it does not score. That is the whole
// design; the weights below only decide what a verified thing is worth.

// Weights, inverted from the original formula.
//
// The previous board weighted self-declared rows highest (nodes x30, projects
// x25) and attested activity lowest (commits x5). That is backwards: it made
// clicking the cheapest possible action the most valuable one. Here, work
// another person or a signature had to confirm is worth the most, and raw
// volume is worth almost nothing — a student can push 200 trivial commits to an
// attested repo, but they cannot get 30 merged pull requests in tracked
// repositories.
//
// Weight is only half the question; migration 037 also caps each kind, so
// repetition past a threshold pays 10% per item.
export const WEIGHTS = {
  oss_verified: 30, // merged PR in a tracked repo — webhook or admin
  contest_top: 25, // judged result, recorded by an admin
  project_verified: 20, // repo ownership + attested activity in that repo
  roadmap_done: 18, // prerequisites met + evidence confirmed by a lead
  solution_accepted: 8, // a peer's reply marked as the answer
  event_attended: 3, // check-in scan
  commit: 2, // attested, but trivially inflated — deliberately near-worthless
  pull_request: 12, // attested; harder to fake than a commit
  // Self-tick on a "did you watch this" checkbox. Kept at zero on purpose: it
  // is the purest example of a row that proves nothing, and lib/tiers.js still
  // uses resource completion where a self-report is a reasonable signal.
  resource_done: 0,
};

// Per-kind caps. Must match public.ranking_kind_cap() in migration 037 — the SQL
// applies them inside recompute_ranking_scores, and these are what the UI
// discloses. Exported so the disclosure cannot drift from the arithmetic.
export const KIND_CAPS = {
  roadmap_done: 40,
  project_verified: 10,
  oss_verified: 15,
  contest_top: 5,
  solution_accepted: 15,
  event_attended: 20,
  commit: 20,
  pull_request: 10,
};

export const VERIFIED_KINDS = Object.entries(WEIGHTS)
  .filter(([, w]) => w > 0)
  .map(([k]) => k)
  .filter((k) => !["commit", "pull_request"].includes(k)); // those live in the activity table

// ---------------------------------------------------------------------------
// Roadmap prerequisites
// ---------------------------------------------------------------------------

/**
 * Which required predecessors of `nodeId` are not yet complete.
 *
 * Pure, so the gate is testable without a database and the UI can render the
 * same list the API refuses on.
 *
 * `edges` is the roadmap_edges relation as { from_id, to_id, kind }. Only
 * `kind === 'required'` blocks. `optional` and `alternative` edges are
 * deliberately exempt — they are routes around a node, not walls, and treating
 * them as walls would block a legitimate path.
 *
 * An optional node is never blocked: is_optional means "off the main line", so
 * requiring its prerequisites would be backwards.
 *
 * Returns node ids, not titles — the caller resolves titles for the message,
 * because the API must not leak a title it has not fetched.
 */
export function unmetPrerequisites({ nodeId, completedNodeIds, edges, nodeOptional = false } = {}) {
  if (!nodeId || nodeOptional) return [];
  const done = new Set((completedNodeIds || []).map(String));
  const required = (edges || []).filter(
    (e) => String(e.to_id) === String(nodeId) && e.kind === "required"
  );
  // De-duplicate: a re-seeded graph can carry the same edge twice, and the
  // student should be told "you need HTML5", not "you need HTML5, twice".
  const missing = new Set();
  for (const e of required) {
    const from = String(e.from_id);
    if (!done.has(from)) missing.add(from);
  }
  return [...missing];
}

/**
 * Is this whole-graph set of edges a DAG? A cycle would make the prerequisite
 * gate unsatisfiable: every node in the cycle would wait for another node in
 * the same cycle, and no student could ever complete them. Detected rather than
 * assumed, because the graph is seeded from edited JSON by hand.
 */
export function hasPrerequisiteCycle(edges = []) {
  const adj = new Map();
  for (const e of edges) {
    if (e.kind !== "required") continue;
    if (!adj.has(String(e.from_id))) adj.set(String(e.from_id), []);
    adj.get(String(e.from_id)).push(String(e.to_id));
  }
  const WHITE = 0, GREY = 1, BLACK = 2;
  const colour = new Map();
  const visit = (node) => {
    const c = colour.get(node) ?? WHITE;
    if (c === GREY) return true; // back edge -> cycle
    if (c === BLACK) return false;
    colour.set(node, GREY);
    for (const next of adj.get(node) || []) {
      if (visit(next)) return true;
    }
    colour.set(node, BLACK);
    return false;
  };
  for (const node of adj.keys()) {
    if (visit(node)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Repository identity
// ---------------------------------------------------------------------------

/**
 * Parse a GitHub repository URL into `owner/repo`.
 *
 * Accepts the forms students actually paste: https, ssh, with or without a
 * trailing path, with or without `.git`. Returns null for anything else rather
 * than guessing, because the owner segment is what the proof check compares
 * against — a permissive parser here would let a crafted URL through.
 */
export function parseGitHubRepo(url) {
  if (typeof url !== "string" || !url.trim()) return null;
  let text = url.trim();
  // git@github.com:owner/repo.git
  const ssh = /^git@([^:]+):(.+)$/.exec(text);
  if (ssh) {
    if (!/^github\.com$/i.test(ssh[1])) return null;
    text = ssh[2];
  } else {
    // Students paste schemeless URLs constantly ("github.com/a/b"). Prefixing
    // for the parser is safe precisely because the hostname is then checked
    // against github.com below — nothing is trusted that the URL itself asserts.
    const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`;
    let parsed;
    try {
      parsed = new URL(candidate);
    } catch {
      return null;
    }
    // Anchored at the end: "github.com.evil.com" must not pass.
    if (!/(^|\.)github\.com$/i.test(parsed.hostname)) return null;
    text = parsed.pathname;
  }
  const parts = text.replace(/^\/+/, "").replace(/\.git$/i, "").split("/").filter(Boolean);
  if (parts.length < 2) return null;
  const [owner, repo] = parts;
  if (!/^[A-Za-z0-9-]+$/.test(owner) || !/^[A-Za-z0-9._-]+$/.test(repo)) return null;
  return `${owner}/${repo}`;
}

export function repoOwner(fullName) {
  return typeof fullName === "string" ? fullName.split("/")[0] || null : null;
}

/**
 * May this student claim this repo as proof?
 *
 * The honest limit of this check: there is no GitHub OAuth in this project, so
 * "you own this repo" can only be ASSERTED, not proven. The strongest statement
 * available without a token is that the repo's owner matches the handle the
 * student has claimed and that nobody else holds that handle (migration 035 plus
 * the check in POST /api/github). Attestation of actual work in the repo comes
 * later and separately, from a signed delivery.
 */
export function repoOwnershipOk({ fullName, githubUsername } = {}) {
  if (!fullName || !githubUsername) return false;
  return String(repoOwner(fullName)).toLowerCase() === String(githubUsername).toLowerCase();
}

// ---------------------------------------------------------------------------
// Caps (JS mirror of the SQL, for display and tests)
// ---------------------------------------------------------------------------

/**
 * Contribution of the `seq`-th item of a kind, in tenths so the arithmetic is
 * exact rather than floating point. Mirrors recompute_ranking_scores: full
 * weight up to the cap, then 10% per item.
 */
export function cappedContribution({ weight, seq, cap }) {
  if (!weight || weight <= 0) return 0;
  if (seq <= cap) return weight;
  // Hard plateau: past the cap a kind is worth exactly nothing. A soft 10% tail
  // was tried and is wrong here — with a commit worth 2, "10% past the cap"
  // floors to 0 for one kind and 1 for another, so the rule we disclose to
  // students and the score we compute could disagree. A ceiling is also honest
  // and easy to state, and it removes any incentive to pad.
  return 0;
}

/** Score for a set of verified evidence rows. Pure, and what the unit tests pin. */
export function scoreEvidence(rows = []) {
  const seqByKind = new Map();
  let total = 0;
  for (const row of rows) {
    const kind = row.kind;
    const weight = WEIGHTS[kind] ?? 0;
    if (weight <= 0) continue;
    const seq = (seqByKind.get(kind) || 0) + 1;
    seqByKind.set(kind, seq);
    total += cappedContribution({ weight, seq, cap: KIND_CAPS[kind] ?? 0 });
  }
  return total;
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/**
 * Record one verified evidence row.
 *
 * `verifiedBy` is REQUIRED — this is the whole point. There is no default of
 * null here, unlike migration 027's writer, so a caller that forgets to pass a
 * verifier gets a TypeError at the call site rather than a silently unscored or,
 * worse, silently scored row.
 *
 * Errors propagate. 027's writer swallowed them with `catch {}`, which made a
 * failed award indistinguishable from a successful one: the student saw "done",
 * the ledger had no row, and nobody could tell. A routing error must be visible.
 */
export async function recordEvidence({
  sql,
  tenantId,
  userId,
  kind,
  refId,
  verifiedBy,
  source = "system",
  evidence = {},
}) {
  // `undefined` means the kind does not exist at all -- a programming error.
  // `0` means the kind exists but is deliberately worth nothing. These must be
  // distinguished: `!WEIGHTS[kind]` conflates them and makes the zero-weight
  // branch below unreachable, so a deliberate no-score silently became a throw.
  if (WEIGHTS[kind] === undefined) throw new Error(`recordEvidence: unknown kind "${kind}"`);
  if (WEIGHTS[kind] <= 0) return null; // deliberately does not score
  if (!tenantId) throw new Error("recordEvidence: tenantId is required");
  if (!userId) throw new Error("recordEvidence: userId is required");
  if (refId === undefined || refId === null || refId === "") {
    throw new Error("recordEvidence: refId is required");
  }
  // Trim before testing. `!verifiedBy` alone lets " " through -- a verifier that
// names nobody is exactly the failure this guard exists to prevent, and it is
// the sort of thing that arrives as an interpolated empty variable.
  if (verifiedBy === undefined || verifiedBy === null || String(verifiedBy).trim() === "") {
    throw new Error(
      `recordEvidence: verifiedBy is required for "${kind}" — a student never vouches for themselves`
    );
  }
  const [row] = await sql`
    INSERT INTO ranking_events
      (tenant_id, user_id, kind, ref_id, weight, verified_by, source, evidence, verified_at)
    VALUES (
      ${tenantId},
      ${userId},
      ${kind},
      ${String(refId)},
      ${WEIGHTS[kind]},
      ${String(verifiedBy)},
      ${source},
      ${sql.json(evidence)},
      NOW()
    )
    ON CONFLICT (tenant_id, kind, ref_id, user_id) DO UPDATE
      SET verified_by = EXCLUDED.verified_by,
          source = EXCLUDED.source,
          evidence = EXCLUDED.evidence,
          verified_at = NOW()
    RETURNING *
  `;
  return row;
}

/**
 * Remove a claim's evidence — used when an admin rejects it.
 *
 * Deleting rather than zeroing the weight is deliberate: a rejection must be
 * able to take points back, and a stored zero would still be a row the decay and
 * cap functions would count.
 */
export async function revokeEvidence({ sql, tenantId, userId, kind, refId }) {
  if (!tenantId || !userId || !kind || !refId) return null;
  const [row] = await sql`
    DELETE FROM ranking_events
    WHERE tenant_id = ${tenantId}
      AND user_id = ${userId}
      AND kind = ${kind}
      AND ref_id = ${String(refId)}
    RETURNING *
  `;
  return row || null;
}

/**
 * Recompute one user's materialized score inside a tenant.
 *
 * Scores are derived, never incremented, so a reversal is exact. Errors
 * propagate for the same reason recordEvidence does: a stale score is a silent
 * lie on a public board, and hiding the error is what made the previous system
 * untrustworthy.
 */
export async function recomputeScore(sql, tenantId, userId) {
  await sql`SELECT public.recompute_ranking_scores(${tenantId}::uuid)`;
  const [row] = await sql`
    SELECT * FROM ranking_scores WHERE tenant_id = ${tenantId}::uuid AND user_id = ${userId} LIMIT 1
  `;
  return row || null;
}

// ---------------------------------------------------------------------------
// Release flag
// ---------------------------------------------------------------------------

/**
 * Is verified ranking live for this tenant?
 *
 * Fail-closed on the read, matching lib/github.js: a missing table, a missing
 * row or an error means "not yet". Flipping this on retroactively withdraws
 * points students were shown as having earned, so the safe default is off.
 */
export async function isVerifiedRankingEnabled(sql, tenantId) {
  if (!tenantId) return false;
  try {
    const [row] = await sql`
      SELECT enabled FROM feature_flags
      WHERE tenant_id = ${tenantId} AND key = 'ranking_verified' LIMIT 1
    `;
    return row?.enabled === true;
  } catch {
    return false;
  }
}