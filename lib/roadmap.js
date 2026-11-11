// One definition of "the next node" and "how far through a domain".
//
// The roadmap page used claims (`status = completed`) while tiers, mentorship
// and the public profile used verified evidence. Two answers to "how far am I"
// is a trust defect: a claim could read as progress on one surface and not on
// another. These helpers take the verified set explicitly so every caller is
// forced to decide, and both roadmap surfaces share the same topological walk.

/**
 * First uncompleted node whose required predecessors are all complete.
 *
 * `nodes` must already be scoped to one domain. Edges are global rows; any edge
 * pointing outside the scoped set is ignored by the predecessor lookup because
 * only `to_id` nodes in the set are considered. Falls back to the first
 * uncompleted node in sort order when no edge is satisfiable (a cycle or a
 * graph with no edges).
 */
export const DIFFICULTY_ORDER = {
  beginner: 0,
  foundation: 0,
  intermediate: 1,
  foundation_plus: 1,
  advanced: 2
};

function difficultyRank(node) {
  return DIFFICULTY_ORDER[node?.difficulty_level] ?? 1;
}

/**
 * Every not-yet-verified node whose *required* predecessors are all verified,
 * ordered by domain order, then difficulty, then the authored sort order.
 * Optional/alternative edges are routes around a node, not walls, so they never
 * block eligibility. Returns [] for a cycle rather than pointing at a blocked
 * node.
 */
export function eligibleRoadmapNodes({ nodes = [], edges = [], completedIds = [], domainOrder = [] } = {}) {
  const done = new Set((completedIds || []).map(String));
  const ids = new Set(nodes.map((n) => String(n.id)));
  const scopedEdges = (edges || []).filter(
    (e) => ids.has(String(e.from_id)) && ids.has(String(e.to_id))
  );
  const domainRank = new Map((domainOrder || []).map((d, i) => [String(d), i]));

  return nodes
    .filter((node) => {
      if (done.has(String(node.id))) return false;
      const required = scopedEdges.filter(
        (e) => String(e.to_id) === String(node.id) && e.kind === "required"
      );
      return required.every((e) => done.has(String(e.from_id)));
    })
    .sort((a, b) => {
      const domainDelta =
        (domainRank.get(String(a.domain)) ?? Number.MAX_SAFE_INTEGER) -
        (domainRank.get(String(b.domain)) ?? Number.MAX_SAFE_INTEGER);
      if (domainDelta) return domainDelta;
      const difficultyDelta = difficultyRank(a) - difficultyRank(b);
      if (difficultyDelta) return difficultyDelta;
      const orderDelta = (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0);
      if (orderDelta) return orderDelta;
      return String(a.title || a.id).localeCompare(String(b.title || b.id), "en");
    });
}

export function nextRoadmapNode(options = {}) {
  return eligibleRoadmapNodes(options)[0] || null;
}

/**
 * Split roadmap rows into verified progress and provisional claims. A
 * self-declared completion is deliberately NOT in `verifiedIds`: it is visible
 * to the student as "awaiting review", but it must never move a percentage or
 * appear in the proof rail.
 */
export function splitVerifiedProgress(rows = []) {
  const completed = (rows || []).filter((r) => r.status === "completed");
  const verified = completed.filter((r) => r.evidence_state === "verified");
  return {
    claimedIds: completed.map((r) => r.node_id),
    verifiedIds: verified.map((r) => r.node_id),
    provisionalIds: completed.filter((r) => r.evidence_state !== "verified").map((r) => r.node_id)
  };
}

/**
 * Verified progress for one domain. `total` is the domain's node count, never
 * the whole catalogue, so a 12-node track is not reported against 300 nodes.
 */
export function domainProgress({ nodes = [], verifiedIds = [] } = {}) {
  const verified = new Set((verifiedIds || []).map(String));
  const total = nodes.length;
  const done = nodes.filter((n) => verified.has(String(n.id))).length;
  return {
    total,
    done,
    remaining: Math.max(0, total - done),
    percent: total > 0 ? Math.round((done / total) * 100) : 0
  };
}
