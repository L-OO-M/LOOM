import { redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { RoadmapJourney } from "@/app/(app)/student/roadmap/_components/RoadmapJourney";
import RoadmapGraph from "@/app/(app)/student/roadmap/_components/RoadmapGraph";

export default async function RoadmapPage() {
  const ctx = await getRequestContext();
  if (ctx.error) redirect("/login?redirect=/student/roadmap");
  const { user, tenant, sql } = ctx;

  const nodes = await sql`SELECT * FROM roadmap_nodes ORDER BY sort_order ASC`;
  // Graph edges — nullable for linear fallback (seed still linear)
  let edges = [];
  try {
    edges = await sql`SELECT id, from_id, to_id, kind, label FROM roadmap_edges ORDER BY from_id`;
  } catch {
    edges = [];
  }
  const done = await sql`SELECT node_id FROM student_roadmap_progress WHERE student_id = ${user.id} AND status = 'completed'`;
  const doneIds = done.map((d) => d.node_id);
  // Topological next: first uncompleted where all deps done, fallback linear
  let nextId = null;
  if (edges.length > 0) {
    const doneSet = new Set(doneIds);
    for (const n of nodes) {
      const preds = edges.filter((e) => e.to_id === n.id).map((e) => e.from_id);
      if (preds.every((p) => doneSet.has(p)) && !doneSet.has(n.id)) { nextId = n.id; break; }
    }
  } else {
    nextId = nodes.find((n) => !doneIds.includes(n.id))?.id ?? null;
  }

  const allResources = await sql`SELECT id, title, minutes, domain, kind, level, url FROM resources ORDER BY minutes ASC`;
  const resourcesByDomain = {};
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
      <div className="pt-4">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="meta">Roadmap.sh style · drag to pan · scroll to zoom · yellow = recommended path</p>
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center gap-1.5 text-xs" style={{ color: "var(--text-muted)" }}><span className="size-3 rounded border" style={{ background: "#fef08a", borderColor: "#eab308" }} /> recommended</span>
              <span className="inline-flex items-center gap-1.5 text-xs" style={{ color: "var(--text-muted)" }}><span className="size-3 rounded border" style={{ background: "#fef9c3", borderColor: "#fde68a" }} /> topic</span>
              <span className="inline-flex items-center gap-1.5 text-xs" style={{ color: "var(--text-muted)" }}><span className="size-3 rounded border" style={{ background: "white", borderColor: "var(--line)" }} /> group</span>
              <a href="#list" className="text-xs font-semibold hover:underline" style={{ color: "var(--accent)" }}>List view ↓</a>
            </div>
          </div>
          <RoadmapGraph nodes={nodes} edges={edges} doneIds={doneIds} nextId={nextId} />
          <div id="list" className="mt-10">
            <RoadmapJourney
              nodes={nodes}
              doneIds={doneIds}
              nextId={nextId}
              resourcesByDomain={resourcesByDomain}
              resourceDoneIds={resourceDoneIds}
              projectsByNode={projectsByNode}
            />
          </div>
        </div>
      </div>
    </AppShell>
  );
}
