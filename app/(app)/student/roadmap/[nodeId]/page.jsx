import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { PageHeader, Card } from "@/components/ui";
import { MarkCompleteButton } from "@/components/actions";

export default async function RoadmapNodePage({ params }) {
  const { nodeId } = await params;
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") redirect(`/login?redirect=/student/roadmap/${nodeId}`);
  if (ctx.error) redirect(`/login?redirect=/student/roadmap/${nodeId}`);
  const { user, tenant, sql } = ctx;

  const [node] = await sql`SELECT * FROM roadmap_nodes WHERE id = ${nodeId} LIMIT 1`;
  if (!node) notFound();
  const [progress] = await sql`SELECT * FROM student_roadmap_progress WHERE student_id = ${user.id} AND node_id = ${nodeId} LIMIT 1`;
  const resources = await sql`SELECT * FROM resources WHERE domain = ${node.domain} ORDER BY minutes ASC LIMIT 6`;
  const [next] = await sql`SELECT * FROM roadmap_nodes WHERE sort_order > ${node.sort_order} ORDER BY sort_order ASC LIMIT 1`;

  return (
    <AppShell area="student" tenant={tenant} user={user}>
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <p className="text-xs" style={{ color: "var(--text-muted)" }}><Link href="/student/roadmap" style={{ color: "var(--accent)" }}>← Roadmap</Link></p>
        <PageHeader kicker={node.domain} title={node.title} desc={node.description} action={<MarkCompleteButton nodeId={node.id} completed={progress?.status === "completed"} />} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <p className="text-sm font-medium" style={{ color: "var(--text)" }}>Status</p>
            <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>{progress?.status === "completed" ? `Completed${progress.completed_at ? ` on ${new Date(progress.completed_at).toLocaleDateString("en-IN")}` : ""}` : "Not completed yet"}</p>
            {next && <p className="mt-3 text-sm" style={{ color: "var(--text-muted)" }}>Next: <Link href={`/student/roadmap/${next.id}`} style={{ color: "var(--accent)" }}>{next.title}</Link></p>}
          </Card>
          <Card>
            <p className="text-sm font-medium" style={{ color: "var(--text)" }}>Linked resources ({resources.length})</p>
            <div className="mt-3 space-y-2">
              {resources.map((r) => (
                <Link key={r.id} href={`/student/resources/${r.id}`} className="block truncate text-sm" style={{ color: "var(--accent)" }}>{r.title} · {r.minutes} min</Link>
              ))}
              {resources.length === 0 && <p className="text-sm" style={{ color: "var(--text-muted)" }}>No linked resources.</p>}
            </div>
          </Card>
        </div>
      </main>
    </AppShell>
  );
}
