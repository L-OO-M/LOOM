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
export function nextRoadmapNode({ nodes = [], edges = [], completedIds = [] } = {}) {
  const done = new Set((completedIds || []).map(String));
  const ordered = [...nodes].sort(
    (a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0)
  );
  const ids = new Set(ordered.map((n) => String(n.id)));
  const scopedEdges = (edges || []).filter(
    (e) => ids.has(String(e.from_id)) && ids.has(String(e.to_id))
  );

  for (const node of ordered) {
    if (done.has(String(node.id))) continue;
    const predecessors = scopedEdges
      .filter((e) => String(e.to_id) === String(node.id))
      .map((e) => String(e.from_id));
    if (predecessors.every((id) => done.has(id))) return node;
  }

  return ordered.find((n) => !done.has(String(n.id))) || null;
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
