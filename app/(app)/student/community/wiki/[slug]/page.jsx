import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { PageHeader, Card } from "@/components/ui";
import { SuggestForm } from "../WikiBits";

export const dynamic = "force-dynamic";

export default async function WikiDetailPage({ params }) {
  const ctx = await getRequestContext();
  if (ctx.error) redirect("/login?redirect=/student/community/wiki");
  const { tenant, user, profile, sql } = ctx;
  const { slug } = await params;

  const [page] = await sql`
    SELECT w.*, p.name AS author_name FROM wiki_pages w
    LEFT JOIN profiles p ON p.user_id = w.author_id
    WHERE w.tenant_id = ${tenant?.id ?? null}::uuid AND w.slug = ${slug} AND w.status = 'published'
    LIMIT 1
  `;
  if (!page) notFound();
  await sql`UPDATE wiki_pages SET view_count = view_count + 1 WHERE id = ${page.id}`;
  const edits = await sql`
    SELECT e.*, p.name AS requester_name FROM wiki_edit_requests e
    LEFT JOIN profiles p ON p.user_id = e.requester_id
    WHERE e.page_id = ${page.id} ORDER BY e.created_at DESC LIMIT 20
  `;
  const isAdmin = profile?.role === "admin";
  const pending = edits.filter((e) => e.status === "pending");

  return (
    <AppShell area="student" tenant={tenant} user={user}>
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          <Link href="/student/community/wiki" style={{ color: "var(--accent)" }}>← Wiki</Link>
        </p>
        <PageHeader kicker={`${page.domain} · v${page.version}`} title={page.title} desc={`by ${page.author_name || "a student"} · ${page.view_count + 1} views`} />
        <Card>
          <p className="whitespace-pre-wrap text-sm leading-7" style={{ color: "var(--text)" }}>{page.content || "Empty page."}</p>
        </Card>
        <Card className="mt-6">
          <h2 className="font-medium" style={{ color: "var(--text)" }}>Improve this page</h2>
          <SuggestForm slug={page.slug} isAdmin={isAdmin} />
        </Card>
        {pending.length > 0 && (
          <Card className="mt-6">
            <h2 className="font-medium" style={{ color: "var(--text)" }}>Pending suggestions ({pending.length})</h2>
            <ul className="mt-3 space-y-3 text-sm">
              {pending.map((e) => (
                <li key={e.id} className="rounded-xl border p-3" style={{ borderColor: "var(--line)" }}>
                  <p style={{ color: "var(--text)" }}>{e.requester_name || "a student"}: {e.reason || "No reason given"}</p>
                  <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg p-3 font-mono text-xs" style={{ background: "var(--bg-muted)", color: "var(--text-muted)" }}>{e.proposed_content.slice(0, 600)}</pre>
                  {!isAdmin && <p className="mt-2 text-xs" style={{ color: "var(--text-muted)" }}>Awaiting admin review.</p>}
                </li>
              ))}
            </ul>
            {isAdmin && <p className="mt-3 text-xs" style={{ color: "var(--text-muted)" }}>Review suggestions from the <Link href="/admin/community" style={{ color: "var(--accent)" }}>moderation console</Link>.</p>}
          </Card>
        )}
      </main>
    </AppShell>
  );
}
