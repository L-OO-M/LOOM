import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { Display, Meta } from "@/components/loom/primitives";
import { ResourceCompleteButton } from "@/components/actions";

export default async function ResourceDetailPage({ params }) {
  const { resourceId } = await params;
  const ctx = await getRequestContext();
  if (ctx.error) redirect(`/login?redirect=/student/resources/${resourceId}`);
  const { user, tenant, sql } = ctx;
  const [r] = await sql`SELECT * FROM resources WHERE id = ${resourceId} LIMIT 1`;
  if (!r) notFound();
  const [done] = await sql`SELECT * FROM resource_progress WHERE student_id = ${user.id} AND resource_id = ${resourceId} LIMIT 1`;
  const kindLabel = r.kind === "doc" ? "Doc" : r.kind === "video" ? "Video" : r.kind === "course" ? "Course" : "Article";

  return (
    <AppShell area="student" tenant={tenant} user={user}>
      <main className="mx-auto max-w-3xl px-4 sm:px-6">
        <Link href="/student/resources" className="meta hover:underline" style={{ color: "var(--accent)" }}>← Library</Link>
        <Meta className="mt-4">{kindLabel} · {r.domain} · {r.level?.replace("_", " ")} · {r.minutes} minutes</Meta>
        <Display size="lg" className="mt-3">{r.title}</Display>

        <div className="mt-8 border-y py-6" style={{ borderColor: "var(--line)" }}>
          {r.url ? (
            <a href={r.url} target="_blank" rel="noreferrer" className="btn-ink">
              Open {kindLabel.toLowerCase()} ↗
            </a>
          ) : (
            <p className="narrative">Internal resource — content attaches here once mentors upload it. Check back soon.</p>
          )}
          <div className="mt-5 flex flex-wrap items-center gap-4">
            <ResourceCompleteButton resourceId={r.id} completed={done?.status === "completed"} />
            <span className="meta">{done?.status === "completed" ? "on your record" : "mark it when finished — it stays on your record"}</span>
          </div>
        </div>

        <p className="narrative mt-8">
          Reading compounds. <Link href="/student/roadmap" className="font-semibold hover:underline" style={{ color: "var(--accent)" }}>Return to your path →</Link>
        </p>
      </main>
    </AppShell>
  );
}
