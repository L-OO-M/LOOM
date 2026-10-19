import { redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { RoadmapJourney } from "@/app/(app)/student/roadmap/_components/RoadmapJourney";
import RoadmapTabs from "@/app/(app)/student/roadmap/_components/RoadmapTabs";
import { orderDomains, resolveDomain } from "@/lib/domains";

// Every roadmap is scoped to one domain. All 300+ nodes used to render as a
// single graph, which made the map unreadable and made "next step" meaningless
// (a node in Embedded could be "next" for a web member).
export default async function RoadmapPage({ searchParams }) {
  const ctx = await getRequestContext();
  if (ctx.error) redirect("/login?redirect=/student/roadmap");
  const { user, profile, tenant, sql } = ctx;

  const sp = (await searchParams) || {};
  const allNodes = await sql`SELECT * FROM roadmap_nodes ORDER BY sort_order ASC, title ASC`;
  const done = await sql`SELECT node_id, evidence_state FROM student_roadmap_progress WHERE student_id = ${user.id} AND status = 'completed'`;
  const doneIds = done.map((d) => d.node_id);
  // Progression counts every claim; "verified" is the subset a lead confirmed.
  const verifiedIds = done.filter((d) => d.evidence_state === "verified").map((d) => d.node_id);

  const available = [...new Set(allNodes.map((n) => n.domain))];
  const domain = resolveDomain({
    requested: typeof sp.domain === "string" ? sp.domain : null,
    primary: profile?.primary_domain || null,
    available,
  });
  if (!domain) {
    return (
      <AppShell area="student" tenant={tenant} user={user}>
        <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
          <p className="meta">Roadmap</p>
          <h1 className="mt-2 text-2xl font-semibold">No roadmap published yet</h1>
          <p className="narrative mt-3">Your chapter hasn&apos;t published roadmap content. Once it does, your path appears here — one domain at a time.</p>
        </div>
      </AppShell>
    );
  }

  // Scope nodes, edges and progress to the chosen domain only.
  const nodes = allNodes.filter((n) => n.domain === domain);
  const nodeIds = new Set(nodes.map((n) => n.id));

  let allEdges = [];
  try {
    allEdges = await sql`SELECT id, from_id, to_id, kind, label FROM roadmap_edges ORDER BY from_id`;
  } catch {
    allEdges = [];
  }
  const edges = allEdges.filter((e) => nodeIds.has(e.from_id) && nodeIds.has(e.to_id));

  // Topological "next" inside this domain: first uncompleted node whose
  // prerequisites are all done. Falls back to the first uncompleted node.
  const doneSet = new Set(doneIds);
  let nextId = null;
  if (edges.length > 0) {
    for (const n of nodes) {
      if (doneSet.has(n.id)) continue;
      const preds = edges.filter((e) => e.to_id === n.id).map((e) => e.from_id);
      if (preds.every((p) => doneSet.has(p))) { nextId = n.id; break; }
    }
  }
  if (!nextId) nextId = nodes.find((n) => !doneSet.has(n.id))?.id ?? null;

  // Per-domain counts drive the switcher rail, so a member can see the shape of
  // every track before switching into it.
  const domains = orderDomains(available).map((d) => {
    const ids = new Set(allNodes.filter((n) => n.domain === d).map((n) => n.id));
    const dDone = [...ids].filter((id) => doneSet.has(id)).length;
    return { domain: d, total: ids.size, done: dDone };
  });

  const allResources = await sql`SELECT id, title, minutes, domain, kind, level, url, node_id FROM resources ORDER BY minutes ASC`;
  const resourcesByDomain = {};
  // Node-pinned material (migration 045) takes precedence over the domain
  // fallback on the map, so a node card shows what it is actually about.
  const resourcesByNode = {};
  for (const r of allResources) {
    if (!r.node_id) continue;
    resourcesByNode[r.node_id] ??= [];
    if (resourcesByNode[r.node_id].length < 12) resourcesByNode[r.node_id].push(r);
  }
  for (const r of allResources) {
    resourcesByDomain[r.domain] ??= [];
    if (resourcesByDomain[r.domain].length < 12) resourcesByDomain[r.domain].push(r);
  }

  const resourceDone = await sql`SELECT resource_id FROM resource_progress WHERE student_id = ${user.id} AND status = 'completed'`;
  const resourceDoneIds = resourceDone.map((d) => d.resource_id);

  const myProjects = await sql`SELECT id, title, status, roadmap_node_id FROM projects WHERE owner_id = ${user.id} ORDER BY created_at DESC LIMIT 50`;
  const projectsByNode = {};
  for (const p of myProjects) {
    if (!p.roadmap_node_id) continue;
    projectsByNode[p.roadmap_node_id] ??= [];
    projectsByNode[p.roadmap_node_id].push(p);
  }

  return (
    <AppShell area="student" tenant={tenant} user={user}>
      <div className="pt-2">
        <RoadmapTabs
          domain={domain}
          domains={domains}
          nodes={nodes}
          edges={edges}
          doneIds={doneIds}
          verifiedIds={verifiedIds}
          nextId={nextId}
          resourcesByDomain={resourcesByDomain}
          resourcesByNode={resourcesByNode}
          resourceDoneIds={resourceDoneIds}
          projectsByNode={projectsByNode}
        />
      </div>
    </AppShell>
  );
}