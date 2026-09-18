import { redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { RoadmapJourney } from "@/app/(app)/student/roadmap/_components/RoadmapJourney";

export default async function RoadmapPage() {
  const ctx = await getRequestContext();
  if (ctx.error) redirect("/login?redirect=/student/roadmap");
  const { user, tenant, sql } = ctx;

  const nodes = await sql`SELECT * FROM roadmap_nodes ORDER BY sort_order ASC`;
  const done = await sql`SELECT node_id FROM student_roadmap_progress WHERE student_id = ${user.id} AND status = 'completed'`;
  const doneIds = done.map((d) => d.node_id);
  // The honest "do this next": first uncompleted node in path order.
  const nextId = nodes.find((n) => !doneIds.includes(n.id))?.id ?? null;

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
        <RoadmapJourney
          nodes={nodes}
          doneIds={doneIds}
          nextId={nextId}
          resourcesByDomain={resourcesByDomain}
          resourceDoneIds={resourceDoneIds}
          projectsByNode={projectsByNode}
        />
      </div>
    </AppShell>
  );
}
