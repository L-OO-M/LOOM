import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { Display, Meta, StatusPill } from "@/components/loom/primitives";
import { VoteButton, FlagButton } from "../../CommunityBits";
import { ReplyForm, SolveButton } from "../ForumsBits";

export const dynamic = "force-dynamic";

function dateLabel(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric" });
}

export default async function ThreadPage({ params }) {
  const ctx = await getRequestContext();
  if (ctx.error) redirect("/login?redirect=/student/community/forums");
  const { user, profile, tenant, sql } = ctx;
  const tid = tenant?.id ?? null;
  const { id } = await params;

  const [thread] = await sql`
    SELECT t.*, p.name AS author_name,
      up.username AS author_username, up.is_public AS author_public
    FROM forum_threads t
    LEFT JOIN profiles p ON p.user_id = t.author_id
    LEFT JOIN user_profiles up ON up.user_id = t.author_id AND up.tenant_id = ${tid}::uuid AND up.is_public = true
    WHERE t.id = ${id} AND t.tenant_id = ${tid}::uuid AND t.status = 'visible'
    LIMIT 1
  `;
  if (!thread) notFound();
  await sql`UPDATE forum_threads SET view_count = view_count + 1 WHERE id = ${id}`;
  const replies = await sql`
    SELECT r.*, p.name AS author_name,
      up.username AS author_username, up.is_public AS author_public
    FROM forum_replies r
    LEFT JOIN profiles p ON p.user_id = r.author_id
    LEFT JOIN user_profiles up ON up.user_id = r.author_id AND up.tenant_id = ${tid}::uuid AND up.is_public = true
    WHERE r.thread_id = ${id} AND r.status = 'visible'
    ORDER BY r.is_answer DESC, r.upvote_count DESC, r.created_at ASC
    LIMIT 200
  `;
  let votedIds = new Set();
  {
    const ids = [thread.id, ...replies.map((r) => r.id)];
    if (ids.length > 0) {
      const votes = await sql`
        SELECT target_id FROM forum_votes
        WHERE student_id = ${user.id} AND target_type IN ('thread', 'reply') AND target_id = ANY(${ids}::uuid[])
      `;
      votedIds = new Set(votes.map((v) => String(v.target_id)));
    }
  }
  const canSolve = thread.author_id === user.id || profile?.role === "admin";
  const solution = replies.find((r) => r.is_answer) || null;

  return (
    <AppShell area="student" tenant={tenant} user={user}>
      <main className="mx-auto max-w-3xl px-4 sm:px-6">
        <Link href="/student/community/forums" prefetch={false} className="meta hover:underline" style={{ color: "var(--accent)" }}>← Forums</Link>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <StatusPill tone={thread.solved ? "ok" : ""}>{thread.solved ? "✓ solved" : "open"}</StatusPill>
          {thread.pinned ? <StatusPill tone="warn">pinned</StatusPill> : null}
          <Meta as="span">{thread.domain}</Meta>
        </div>
        <Display size="md" className="mt-3">{thread.title}</Display>
        <p className="meta mt-2">
          by{" "}
          {thread.author_username && thread.author_public ? (
            <Link href={`/student/${thread.author_username}`} prefetch={false} className="font-semibold hover:underline" style={{ color: "var(--text)" }}>{thread.author_name || `@${thread.author_username}`}</Link>
          ) : (
            <span>{thread.author_name || "a student"}</span>
          )}
          {` · asked ${dateLabel(thread.created_at)} · ${thread.view_count + 1} reads · ${replies.length} ${replies.length === 1 ? "reply" : "replies"}`}
        </p>
        {Array.isArray(thread.tags) && thread.tags.length > 0 && (
          <p className="mt-2 flex flex-wrap gap-1.5" aria-label="Tags">
            {thread.tags.map((tag) => (
              <span key={tag} className="rounded-full border px-2 py-0.5 font-mono text-[11px]" style={{ borderColor: "var(--line)", color: "var(--text-muted)" }}>#{tag}</span>
            ))}
          </p>
        )}

        <article className="mt-6 border-y py-6" style={{ borderColor: "var(--line)" }} aria-label="Question">
          <div className="flex items-start gap-4">
            <span className="pt-1"><VoteButton targetType="thread" targetId={thread.id} count={thread.upvote_count} initialVoted={votedIds.has(String(thread.id))} /></span>
            <p className="lede min-w-0 flex-1 whitespace-pre-wrap" style={{ color: "var(--text)" }}>{thread.body || "No details."}</p>
          </div>
          <div className="mt-4 flex justify-end"><FlagButton targetType="thread" targetId={thread.id} /></div>
        </article>

        {thread.solved && solution ? (
          <section className="mt-8 rounded-2xl border p-4 sm:p-5" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }} aria-label="Solution">
            <Meta>This answer was marked as the solution</Meta>
            <p className="mt-2 whitespace-pre-wrap text-[0.95rem] leading-7" style={{ color: "var(--text)" }}>{solution.body}</p>
            <p className="meta mt-3">
              by {solution.author_name || "a student"} · solutions compound into reputation — one marked answer is worth +15.
            </p>
          </section>
        ) : null}

        <section className="mt-10" aria-label="Replies">
          <Meta>{replies.length} {replies.length === 1 ? "reply" : "replies"}</Meta>
          <ul className="mt-4 divide-y" style={{ borderColor: "var(--line)" }}>
            {replies.map((r) => (
              <li key={r.id} className="py-5" style={r.is_answer ? { borderLeft: "2px solid var(--accent)", paddingLeft: "1rem" } : undefined}>
                <div className="flex items-start gap-3 sm:gap-4">
                  <span className="pt-0.5"><VoteButton targetType="reply" targetId={r.id} count={r.upvote_count} initialVoted={votedIds.has(String(r.id))} /></span>
                  <div className="min-w-0 flex-1">
                    <p className="meta">
                      {r.author_username && r.author_public ? (
                        <Link href={`/student/${r.author_username}`} prefetch={false} className="font-semibold hover:underline" style={{ color: "var(--text)" }}>{r.author_name || `@${r.author_username}`}</Link>
                      ) : (
                        <span>{r.author_name || "a student"}</span>
                      )}
                      {` · ${dateLabel(r.created_at)}`}
                      {r.is_answer ? <span style={{ color: "var(--accent)" }}> · ✓ solution</span> : ""}
                    </p>
                    <p className="mt-1.5 whitespace-pre-wrap text-[0.95rem] leading-7" style={{ color: "var(--text)" }}>{r.body}</p>
                  </div>
                  <div className="flex w-24 shrink-0 flex-col items-end gap-2 sm:w-auto">
                    {canSolve && !r.is_answer && <SolveButton threadId={thread.id} replyId={r.id} />}
                    <FlagButton targetType="reply" targetId={r.id} />
                  </div>
                </div>
              </li>
            ))}
          </ul>
          {replies.length === 0 && <p className="narrative mt-4">No replies yet. A good answer here helps the whole chapter.</p>}
        </section>

        <section className="mt-10 border-t pt-6" style={{ borderColor: "var(--line)" }} aria-label="Reply">
          <h2 className="h-product">Add your answer</h2>
          <p className="mt-1 text-sm leading-6" style={{ color: "var(--text-muted)" }}>
            Helpful answers get marked as the solution — and solutions build your reputation.
          </p>
          <div className="mt-3"><ReplyForm threadId={thread.id} /></div>
        </section>
      </main>
    </AppShell>
  );
}
