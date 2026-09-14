import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
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
  const [prev] = await sql`SELECT * FROM roadmap_nodes WHERE sort_order < ${node.sort_order} ORDER BY sort_order DESC LIMIT 1`;
  const [position] = await sql`SELECT COUNT(*)::int AS c FROM roadmap_nodes WHERE sort_order <= ${node.sort_order}`;
  const [total] = await sql`SELECT COUNT(*)::int AS c FROM roadmap_nodes`;
  const totalMins = resources.reduce((s, r) => s + (r.minutes || 0), 0);
  const completed = progress?.status === "completed";

  return (
    <AppShell area="student" tenant={tenant} user={user}>
      <main className="mx-auto max-w-3xl px-4 sm:px-6">
        <Link href="/student/roadmap" prefetch={false} className="meta hover:underline" style={{ color: "var(--accent)" }}>← The path</Link>
        <p className="meta mt-6">
          Node {position?.c ?? "–"} of {total?.c ?? "–"} · {node.domain}{node.difficulty_level ? ` · ${node.difficulty_level}` : ""} · {completed ? "Completed" : "In progress"}
        </p>
        <h1 className="display display-lg mt-3">{node.title}</h1>
        <p className="lede mt-5">{node.description}</p>

        <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 border-y py-4" style={{ borderColor: "var(--line)" }}>
          <span className="meta">{resources.length} resources</span>
          <span className="meta">≈ {totalMins} min of material</span>
          {completed && progress?.completed_at && (
            <span className="meta">Finished {new Date(progress.completed_at).toLocaleDateString("en-IN", { month: "short", day: "numeric" })}</span>
          )}
          <span className="ml-auto"><MarkCompleteButton nodeId={node.id} completed={completed} /></span>
        </div>

        <section className="mt-10" aria-label="Study material">
          <h2 className="h-product">Study this</h2>
          <ol className="mt-5">
            {resources.map((r, i) => (
              <li key={r.id} className="border-b py-4 first:border-t" style={{ borderColor: "var(--line)" }}>
                <Link href={`/student/resources/${r.id}`} prefetch={false} className="row-link flex items-baseline gap-4 px-2 py-1">
                  <span className="index-num shrink-0">{String(i + 1).padStart(2, "0")}</span>
                  <span className="min-w-0 flex-1 truncate text-[0.95rem] font-medium" style={{ color: "var(--text)" }}>{r.title}</span>
                  <span className="meta shrink-0">{r.minutes} min</span>
                </Link>
              </li>
            ))}
            {resources.length === 0 && <p className="text-sm" style={{ color: "var(--text-muted)" }}>No linked material yet — mentors add it as the track matures.</p>}
          </ol>
        </section>

        <nav className="mt-10 flex items-center justify-between gap-3 border-t pt-6" style={{ borderColor: "var(--line)" }} aria-label="Path">
          {prev ? (
            <Link href={`/student/roadmap/${prev.id}`} prefetch={false} className="text-sm font-semibold hover:underline" style={{ color: "var(--text)" }}>
              ← {prev.title}
            </Link>
          ) : <span />}
          {next ? (
            <Link href={`/student/roadmap/${next.id}`} prefetch={false} className="text-sm font-semibold hover:underline" style={{ color: "var(--accent)" }}>
              {next.title} →
            </Link>
          ) : <span />}
        </nav>
      </main>
    </AppShell>
  );
}
