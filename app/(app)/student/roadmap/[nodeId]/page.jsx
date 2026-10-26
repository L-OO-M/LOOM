import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { WorkspaceMasthead, WorkspaceSection } from "@/components/loom/WorkspaceMasthead";
import { MarkCompleteButton } from "@/components/actions";
import { NodeStudyList } from "./_components/NodeStudyList";
import { isZenModeEnabled } from "@/lib/feature-flags";

export default async function RoadmapNodePage({ params }) {
  const { nodeId } = await params;
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") redirect(`/login?redirect=/student/roadmap/${nodeId}`);
  if (ctx.error) redirect(`/login?redirect=/student/roadmap/${nodeId}`);
  const { user, tenant, sql } = ctx;

  const [node] = await sql`SELECT * FROM roadmap_nodes WHERE id = ${nodeId} LIMIT 1`;
  if (!node) notFound();
  const [progress] = await sql`SELECT * FROM student_roadmap_progress WHERE student_id = ${user.id} AND node_id = ${nodeId} LIMIT 1`;
  // Explicit per-node shelf (036). Unmapped nodes intentionally yield no
  // rows here and render the honest empty state in NodeStudyList.
  const resources = await sql`
    SELECT r.* FROM resources r
    JOIN roadmap_node_resources m ON m.resource_id = r.id
    WHERE m.node_id = ${nodeId}
    ORDER BY m.sort_order ASC, r.minutes ASC LIMIT 6
  `;
  // Zen Mode stays OFF unless this chapter enabled the zen_mode flag. The
  // resource shelf above is NOT behind that flag — it is the node's study
  // material and renders either way.
  const zenEnabled = await isZenModeEnabled(sql, tenant?.id);
  const [next] = await sql`SELECT * FROM roadmap_nodes WHERE domain = ${node.domain} AND sort_order > ${node.sort_order} ORDER BY sort_order ASC LIMIT 1`;
  const [prev] = await sql`SELECT * FROM roadmap_nodes WHERE domain = ${node.domain} AND sort_order < ${node.sort_order} ORDER BY sort_order DESC LIMIT 1`;
  const [position] = await sql`SELECT COUNT(*)::int AS c FROM roadmap_nodes WHERE domain = ${node.domain} AND sort_order <= ${node.sort_order}`;
  const [total] = await sql`SELECT COUNT(*)::int AS c FROM roadmap_nodes WHERE domain = ${node.domain}`;
  const totalMins = resources.reduce((s, r) => s + (r.minutes || 0), 0);
  const completed = progress?.status === "completed";
  // "Completed" is a claim; only a lead-confirmed node is verified proof. Keep
  // the two visually distinct so the page never overstates what a student earned.
  const verified = progress?.evidence_state === "verified";

  return (
    <AppShell area="student" tenant={tenant} user={user}>
      <main className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="grid gap-8 lg:grid-cols-[1.7fr_0.6fr]">
          <div className="min-w-0">
            <Link href="/student/roadmap" prefetch={false} className="meta hover:underline" style={{ color: "var(--accent)" }}>← The path</Link>
            <WorkspaceMasthead
              kicker={`Roadmap / ${String(node.domain).replace(/_/g, " ")}`}
              title={node.title}
              lede={node.description}
              meta={`Node ${position?.c ?? "–"} of ${total?.c ?? "–"}${node.difficulty_level ? ` / ${node.difficulty_level}` : ""} / ${completed ? (verified ? "Completed" : "Completed · pending review") : "In progress"}`}
              tone="ledger"
              art="/storyloom/learning.png"
              artAlt=""
              stats={[
                { value: resources.length, label: "study resources" },
                { value: totalMins, unit: "min", label: "estimated reading" }
              ]}
            />
            <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 border-y py-4" style={{ borderColor: "var(--line)" }}>
              <span className="meta">{resources.length} resources · ≈ {totalMins} min</span>
              {completed && progress?.completed_at && <span className="meta">Finished {new Date(progress.completed_at).toLocaleDateString("en-IN", { month: "short", day: "numeric" })}</span>}
              <span className="ml-auto"><MarkCompleteButton nodeId={node.id} completed={completed} verified={verified} /></span>
            </div>
            <WorkspaceSection index="01" title="Study this" note={resources.length > 0 ? `${resources.length} resources on this node.` : "No resources mapped to this node yet."}>
              <NodeStudyList resources={resources} node={node} zenEnabled={zenEnabled} />
            </WorkspaceSection>
            <nav className="mt-10 flex justify-between gap-3 border-t pt-6" style={{ borderColor: "var(--line)" }}>
              {prev ? <Link href={`/student/roadmap/${prev.id}`} prefetch={false} className="text-sm font-semibold hover:underline" style={{ color: "var(--text)" }}>← {prev.title}</Link> : <span />}
              {next ? <Link href={`/student/roadmap/${next.id}`} prefetch={false} className="text-sm font-semibold hover:underline" style={{ color: "var(--accent)" }}>{next.title} →</Link> : <span />}
            </nav>
          </div>
          <aside className="hidden lg:block" aria-label="Roadmap context">
            <div className="sticky top-24 rounded-2xl border p-5" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
              <p className="meta">Your roadmap</p>
              <p className="mt-2 text-sm font-semibold" style={{ color: "var(--text)" }}>{position?.c ?? "–"} / {total?.c ?? "–"} complete</p>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full" style={{ background: "var(--line)" }}>
                <div className="h-full rounded-full" style={{ width: `${Math.round(((position?.c ?? 0) / Math.max(total?.c ?? 1, 1)) * 100)}%`, background: "var(--accent)" }} />
              </div>
              <p className="meta mt-4">{completed ? (verified ? "Completed · keep walking" : "Completed · awaiting a lead's review") : "Mark complete to advance"}</p>
              <Link href="/student/roadmap" prefetch={false} className="mt-3 inline-block text-xs font-semibold hover:underline" style={{ color: "var(--accent)" }}>Back to path →</Link>
            </div>
          </aside>
        </div>
      </main>
    </AppShell>
  );
}
