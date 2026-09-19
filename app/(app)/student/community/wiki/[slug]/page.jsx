import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { Display, Meta } from "@/components/loom/primitives";
import { SuggestForm, CopyLinkButton } from "../WikiBits";

export const dynamic = "force-dynamic";

function dateLabel(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric" });
}

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
    SELECT e.id, e.page_id, e.requester_id, e.reason, e.status, e.created_at,
      p.name AS requester_name FROM wiki_edit_requests e
    LEFT JOIN profiles p ON p.user_id = e.requester_id
    WHERE e.page_id = ${page.id} ORDER BY e.created_at DESC LIMIT 20
  `;
  const isAdmin = profile?.role === "admin";
  const pendingCount = edits.filter((e) => e.status === "pending").length;
  const myPending = edits.filter((e) => e.status === "pending" && e.requester_id === user.id);
  const reviewList = isAdmin
    ? await sql`
      SELECT e.*, p.name AS requester_name FROM wiki_edit_requests e
      LEFT JOIN profiles p ON p.user_id = e.requester_id
      WHERE e.page_id = ${page.id} AND e.status = 'pending' ORDER BY e.created_at DESC LIMIT 20
    `
    : [];

  return (
    <AppShell area="student" tenant={tenant} user={user}>
      <main className="mx-auto max-w-3xl px-4 sm:px-6">
        <Link href="/student/community/wiki" prefetch={false} className="meta hover:underline" style={{ color: "var(--accent)" }}>← Wiki</Link>
        <Meta className="mt-4">{page.domain} · v{page.version} · by {page.author_name || "a student"} · {page.view_count + 1} reads · updated {dateLabel(page.updated_at)}</Meta>
        <Display size="md" className="mt-3">{page.title}</Display>
        <div className="mt-3"><CopyLinkButton /></div>
        <article className="mt-6 border-y py-7" style={{ borderColor: "var(--line)" }} aria-label="Page content">
          <p className="lede whitespace-pre-wrap" style={{ color: "var(--text)" }}>{page.content || "Empty page."}</p>
        </article>
        <section className="mt-8" aria-label="Improve this page">
          <h2 className="h-product">Improve this page</h2>
          <p className="mt-1 text-sm leading-6" style={{ color: "var(--text-muted)" }}>
            {isAdmin ? "Edits apply directly." : "Suggestions go to chapter review — nothing changes until approved."}
          </p>
          <div className="mt-3"><SuggestForm slug={page.slug} isAdmin={isAdmin} /></div>
        </section>
        {pendingCount > 0 && (
          <section className="mt-10" aria-label="Review state">
            <Meta>Review state · {pendingCount} pending</Meta>
            {isAdmin ? (
              <>
                <ul className="mt-3 space-y-3 text-sm">
                  {reviewList.map((e) => (
                    <li key={e.id} className="rounded-xl border p-3" style={{ borderColor: "var(--line)" }}>
                      <p style={{ color: "var(--text)" }}>{e.requester_name || "a student"}: {e.reason || "No reason given"}</p>
                      <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg p-3 font-mono text-xs" style={{ background: "var(--bg-muted)", color: "var(--text-muted)" }}>{String(e.proposed_content || "").slice(0, 600)}</pre>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-xs" style={{ color: "var(--text-muted)" }}>Review suggestions from the <Link href="/admin/community" prefetch={false} style={{ color: "var(--accent)" }}>moderation console</Link>.</p>
              </>
            ) : myPending.length > 0 ? (
              <p className="narrative mt-3">Your suggestion is under review. Nothing changes until a chapter admin approves it.</p>
            ) : (
              <p className="narrative mt-3">An edit is under review.</p>
            )}
          </section>
        )}
      </main>
    </AppShell>
  );
}
