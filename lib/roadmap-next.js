// The single server-side answer to "what should this student do next?".
//
// Dashboard, roadmap page, and the progress API all used to answer it
// differently: the dashboard took the first uncompleted node in the whole
// catalogue, the map treated optional edges as required, and the API checked
// required edges only. One function, one answer.
//
// Progress here is the VERIFIED set only. A provisional claim is visible in the
// UI but must not unlock the next milestone.

import { PRIMARY_DOMAINS } from "@/lib/domains";
import { nextRoadmapNode } from "@/lib/roadmap";

export async function nextStepForStudent(sql, studentId, domain = null) {
  let scope = domain || null;
  if (!scope) {
    const [profile] = await sql`
      SELECT primary_domain FROM profiles WHERE user_id = ${studentId} LIMIT 1
    `;
    scope = profile?.primary_domain || null;
  }

  // Sequential queries only: the pooler runs with a single connection budget.
  const nodes = scope
    ? await sql`
        SELECT id, title, description, domain, sort_order, difficulty_level, is_optional, kind
        FROM roadmap_nodes WHERE domain = ${scope}
        ORDER BY sort_order ASC, title ASC
      `
    : await sql`
        SELECT id, title, description, domain, sort_order, difficulty_level, is_optional, kind
        FROM roadmap_nodes ORDER BY domain ASC, sort_order ASC, title ASC
      `;

  const nodeIds = nodes.map((n) => n.id);
  const edges = nodeIds.length
    ? await sql`
        SELECT from_id, to_id, kind FROM roadmap_edges
        WHERE from_id = ANY(${nodeIds}) AND to_id = ANY(${nodeIds})
      `
    : [];

  const verified = await sql`
    SELECT node_id FROM student_roadmap_progress
    WHERE student_id = ${studentId}
      AND status = 'completed'
      AND evidence_state = 'verified'
  `;
  const verifiedIds = verified.map((r) => r.node_id);
  const verifiedSet = new Set(verifiedIds.map(String));

  const node = nextRoadmapNode({
    nodes,
    edges,
    completedIds: verifiedIds,
    domainOrder: PRIMARY_DOMAINS
  });

  const prerequisites = node
    ? edges
        .filter((e) => String(e.to_id) === String(node.id) && e.kind === "required")
        .map((e) => e.from_id)
        .filter((id) => verifiedSet.has(String(id)))
        .map((id) => nodes.find((n) => String(n.id) === String(id)))
        .filter(Boolean)
    : [];

  return {
    domain: scope,
    node,
    prerequisites,
    reason: node
      ? prerequisites.length
        ? `All required prerequisites are verified (${prerequisites.map((p) => p.title).join(", ")}).`
        : "No required prerequisites are outstanding."
      : nodes.length === 0
        ? "No roadmap content is published for this domain yet."
        : verifiedIds.length >= nodes.length
          ? "Every node in this track is verified."
          : "No node is currently eligible; the graph may be cyclic."
  };
}
