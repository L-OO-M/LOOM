// The one scoring contract for attested GitHub activity.
//
// WHY THIS FILE EXISTS
//
// Two copies of the same arithmetic used to disagree. The webhook stored daily
// activity points with `{ commit: 5, pullRequest: 20 }` while the standings
// board computed from the raw counts with `{ commit: 2, pullRequest: 12 }`. The
// board never read the stored `score` column, so the visible points were the
// 2/12 board values, and the stored points were a second, contradictory answer.
//
// The canonical values are the ones the board actually served and that
// lib/ranking.js independently uses for its ledger kinds:
//
//   commit       weight 2,  cap 20   (attested GitHub delivery)
//   pullRequest  weight 12, cap 10   (attested GitHub delivery)
//   review       weight 2            (stored daily activity only; not on the board)
//
// Both halves import from here so a weight or cap can only change in one place.
// The unit tests pin the numbers and the parity between the webhook and
// standings so a future edit cannot silently re-split the contract.

export const ACTIVITY_WEIGHTS = Object.freeze({
  commit: 2,
  pullRequest: 12,
  review: 2,
});

// Caps on the attested half. They mirror the hard-ceiling rule used for ledger
// kinds in migration 037: full weight up to the cap, nothing past it. Without
// them, volume is the strategy -- 200 trivial commits (all signed and attested)
// would otherwise outrank a merged pull request.
export const ACTIVITY_CAPS = Object.freeze({
  commit: 20,
  pullRequest: 10,
});

/**
 * Points contributed by `count` items of one kind, capped at `cap`.
 *
 * The `count <= 0` guard is load-bearing: with no items, `Math.min(0, cap)`
 * is zero anyway, but the explicit guard keeps the empty contribution from ever
 * being computed as a full weight if the expression changes.
 */
export function cappedActivityPoints(weight, count, cap) {
  if (!weight || !count || count <= 0) return 0;
  return Math.min(count, cap) * weight;
}

/**
 * Aggregate score for attested activity counts (the board's half of the score).
 *
 * Reviews are deliberately absent: they are recorded in student_daily_activity
 * for the GitHub surface, but the standings board has never counted them and
 * this module does not change that semantics.
 */
export function scoreAttestedActivity({ commits = 0, prs = 0 } = {}) {
  return (
    cappedActivityPoints(ACTIVITY_WEIGHTS.commit, commits, ACTIVITY_CAPS.commit) +
    cappedActivityPoints(ACTIVITY_WEIGHTS.pullRequest, prs, ACTIVITY_CAPS.pullRequest)
  );
}

/**
 * Value of one delivery delta for the stored `student_daily_activity.score`.
 *
 * This is an incremental value, not a capped aggregate: caps are applied where
 * the counts are summed (the board's SQL), because a single delivery cannot know
 * the student's running total. It uses the same canonical weights so the stored
 * column and the board arithmetic finally agree.
 */
export function activityDeltaPoints({ commits = 0, pullRequests = 0, reviews = 0 } = {}) {
  return (
    commits * ACTIVITY_WEIGHTS.commit +
    pullRequests * ACTIVITY_WEIGHTS.pullRequest +
    reviews * ACTIVITY_WEIGHTS.review
  );
}
