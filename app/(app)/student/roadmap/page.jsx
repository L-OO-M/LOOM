import { redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { PageHeader, EmptyState } from "@/components/ui";
import { RoadmapGraph } from "@/components/RoadmapGraph";

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

  if (nodes.length === 0) {
    return (
      <AppShell area="student" tenant={tenant} user={user}>
        <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
          <PageHeader kicker="Roadmap" title="Your learning path" desc="No roadmap nodes published yet." />
          <EmptyState title="Roadmap unavailable" body="Your college has not published roadmap content yet. Check back soon." />
        </main>
      </AppShell>
    );
  }

  const completedCount = doneIds.length;

  return (
    <AppShell area="student" tenant={tenant} user={user}>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <PageHeader
          kicker="Roadmap"
          title="Your learning path"
          desc={`${completedCount} of ${nodes.length} nodes completed. Select any node to open its detail, linked resources, and completion action.`}
        />
        <div className="mb-5 flex flex-wrap items-center gap-x-5 gap-y-2" aria-label="Map legend">
          <span className="flex items-center gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
            <span className="inline-block size-2.5 rounded-full" style={{ background: "var(--accent)" }} /> Completed
          </span>
          <span className="flex items-center gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
            <span className="inline-block size-2.5 rounded-full" style={{ background: "var(--text)" }} /> Up next
          </span>
          <span className="flex items-center gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
            <span className="inline-block size-2.5 rounded-full border" style={{ borderColor: "var(--line)" }} /> Upcoming
          </span>
          <span className="ml-auto font-mono text-xs" style={{ color: "var(--text-muted)" }}>
            SCROLL TO PAN · DRAG TO MOVE · CLICK A NODE
          </span>
        </div>
        <RoadmapGraph nodes={nodes} doneIds={doneIds} nextId={nextId} resourcesByDomain={resourcesByDomain} />
      </main>
    </AppShell>
  );
}
