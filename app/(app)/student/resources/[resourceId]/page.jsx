import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { PageHeader, Card } from "@/components/ui";
import { ResourceCompleteButton } from "@/components/actions";

export default async function ResourceDetailPage({ params }) {
  const { resourceId } = await params;
  const ctx = await getRequestContext();
  if (ctx.error) redirect(`/login?redirect=/student/resources/${resourceId}`);
  const { user, tenant, sql } = ctx;
  const [r] = await sql`SELECT * FROM resources WHERE id = ${resourceId} LIMIT 1`;
  if (!r) notFound();
  const [done] = await sql`SELECT * FROM resource_progress WHERE student_id = ${user.id} AND resource_id = ${resourceId} LIMIT 1`;
  return (
    <AppShell area="student" tenant={tenant} user={user}>
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <p className="text-xs" style={{ color: "var(--text-muted)" }}><Link href="/student/resources" style={{ color: "var(--accent)" }}>← Resources</Link></p>
        <PageHeader kicker={`${r.kind === "doc" ? "Doc" : r.kind === "video" ? "Video" : "Article"} · ${r.domain} · ${r.level}`} title={r.title} desc={`${r.minutes} minutes.`} action={<ResourceCompleteButton resourceId={r.id} completed={done?.status === "completed"} />} />
        <Card>
          {r.url ? (
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>External resource: <a href={r.url} target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>{r.url} ↗</a></p>
          ) : (
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>Internal resource. Content lives in R2 once attached; this record currently has no file.</p>
          )}
          <p className="mt-3 text-sm" style={{ color: "var(--text-muted)" }}>Status: {done?.status === "completed" ? "Completed" : "Not completed"}</p>
        </Card>
      </main>
    </AppShell>
  );
}
