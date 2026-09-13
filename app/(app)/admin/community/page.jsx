import Link from "next/link";
import { redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { PageHeader, Card, Stat } from "@/components/ui";
import { HideButton, PinButton, WikiReviewButtons } from "./AdminCommunity";

export const dynamic = "force-dynamic";

export default async function AdminCommunityPage() {
  const ctx = await getRequestContext({ adminOnly: true });
  if (ctx.error === "UNAUTHORIZED") redirect("/login?redirect=/admin/community");
  if (ctx.error === "FORBIDDEN") redirect("/student");
  if (ctx.error) redirect("/login?redirect=/admin/community");
  const { tenant, user, sql } = ctx;
  const tid = tenant?.id ?? null;

  const flaggedThreads = await sql`
    SELECT t.id, t.title, t.flag_count, t.pinned, p.name AS author_name FROM forum_threads t
    LEFT JOIN profiles p ON p.user_id = t.author_id
    WHERE t.tenant_id = ${tid}::uuid AND t.flag_count > 0 AND t.status = 'visible'
    ORDER BY t.flag_count DESC LIMIT 20
  `;
  const flaggedReplies = await sql`
    SELECT r.id, r.body, r.flag_count, r.thread_id, p.name AS author_name FROM forum_replies r
    JOIN forum_threads t ON t.id = r.thread_id
    LEFT JOIN profiles p ON p.user_id = r.author_id
    WHERE t.tenant_id = ${tid}::uuid AND r.flag_count > 0 AND r.status = 'visible'
    ORDER BY r.flag_count DESC LIMIT 20
  `;
  const pendingEdits = await sql`
    SELECT e.*, w.title AS page_title, w.slug, p.name AS requester_name FROM wiki_edit_requests e
    JOIN wiki_pages w ON w.id = e.page_id
    LEFT JOIN profiles p ON p.user_id = e.requester_id
    WHERE w.tenant_id = ${tid}::uuid AND e.status = 'pending'
    ORDER BY e.created_at DESC LIMIT 20
  `;
  const [{ pinned = 0 } = {}] = await sql`SELECT COUNT(*)::int AS pinned FROM forum_threads WHERE tenant_id = ${tid}::uuid AND pinned = true AND status = 'visible'`;

  return (
    <AppShell area="admin" tenant={tenant} user={user}>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <PageHeader kicker="Admin · Trust" title="Community moderation" desc="Flags, featured threads, and the wiki review queue." />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Stat label="Flagged threads" value={flaggedThreads.length} />
          <Stat label="Flagged replies" value={flaggedReplies.length} />
          <Stat label="Pending wiki edits" value={pendingEdits.length} />
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <Card>
            <h2 className="font-medium" style={{ color: "var(--text)" }}>Flagged threads</h2>
            {flaggedThreads.length === 0 ? (
              <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>Queue clear. {pinned} pinned thread{pinned === 1 ? "" : "s"} live.</p>
            ) : (
              <ul className="mt-3 space-y-3">
                {flaggedThreads.map((t) => (
                  <li key={t.id} className="flex items-start justify-between gap-3 rounded-xl border p-3" style={{ borderColor: "var(--line)" }}>
                    <div className="min-w-0 text-sm">
                      <Link href={`/student/community/forums/${t.id}`} className="font-medium hover:underline" style={{ color: "var(--text)" }}>{t.title}</Link>
                      <p className="text-xs" style={{ color: "var(--text-muted)" }}>{t.author_name || "a student"} · {t.flag_count} flags</p>
                    </div>
                    <span className="flex shrink-0 gap-3"><PinButton threadId={t.id} pinned={t.pinned} /><HideButton targetType="thread" targetId={t.id} /></span>
                  </li>
                ))}
              </ul>
            )}
            <h2 className="mt-6 font-medium" style={{ color: "var(--text)" }}>Flagged replies</h2>
            {flaggedReplies.length === 0 ? (
              <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>No flagged replies.</p>
            ) : (
              <ul className="mt-3 space-y-3">
                {flaggedReplies.map((r) => (
                  <li key={r.id} className="flex items-start justify-between gap-3 rounded-xl border p-3" style={{ borderColor: "var(--line)" }}>
                    <div className="min-w-0 text-sm">
                      <p className="truncate" style={{ color: "var(--text)" }}>{r.body}</p>
                      <p className="text-xs" style={{ color: "var(--text-muted)" }}>{r.author_name || "a student"} · {r.flag_count} flags · <Link href={`/student/community/forums/${r.thread_id}`} style={{ color: "var(--accent)" }}>thread →</Link></p>
                    </div>
                    <HideButton targetType="reply" targetId={r.id} />
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <h2 className="font-medium" style={{ color: "var(--text)" }}>Wiki review queue</h2>
            {pendingEdits.length === 0 ? (
              <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>No pending suggestions.</p>
            ) : (
              <ul className="mt-3 space-y-3">
                {pendingEdits.map((e) => (
                  <li key={e.id} className="rounded-xl border p-3" style={{ borderColor: "var(--line)" }}>
                    <p className="text-sm" style={{ color: "var(--text)" }}>
                      <Link href={`/student/community/wiki/${e.slug}`} className="font-medium hover:underline">{e.page_title}</Link>
                      <span style={{ color: "var(--text-muted)" }}> — {e.requester_name || "a student"}: {e.reason || "No reason"}</span>
                    </p>
                    <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap rounded-lg p-3 font-mono text-xs" style={{ background: "var(--bg-muted)", color: "var(--text-muted)" }}>{e.proposed_content.slice(0, 400)}</pre>
                    <div className="mt-2"><WikiReviewButtons slug={e.slug} editId={e.id} /></div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </main>
    </AppShell>
  );
}
