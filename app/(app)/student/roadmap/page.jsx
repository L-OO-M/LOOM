import { redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { RoadmapJourney } from "@/components/RoadmapJourney";

export default async function RoadmapPage() {
  const ctx = await getRequestContext();
  if (ctx.error) redirect("/login?redirect=/student/roadmap");
  const { user, tenant, sql } = ctx;

  const nodes = await sql`SELECT * FROM roadmap_nodes ORDER BY sort_order ASC`;
  const done = await sql`SELECT node_id FROM student_roadmap_progress WHERE student_id = ${user.id} AND status = 'completed'`;
  const doneIds = done.map((d) => d.node_id);
  // The honest "do this next": first uncompleted node in path order.
  const nextId = nodes.find((n) => !doneIds.includes(n.id))?.id ?? null;

  const allResources = await sql`SELECT id, title, minutes, domain FROM resources ORDER BY minutes ASC`;
  const resourcesByDomain = {};
  for (const r of allResources) {
    resourcesByDomain[r.domain] ??= [];
    if (resourcesByDomain[r.domain].length < 6) resourcesByDomain[r.domain].push(r);
  }

  return (
    <AppShell area="student" tenant={tenant} user={user}>
      <div className="pt-4">
        <RoadmapJourney nodes={nodes} doneIds={doneIds} nextId={nextId} resourcesByDomain={resourcesByDomain} />
      </div>
    </AppShell>
  );
}
