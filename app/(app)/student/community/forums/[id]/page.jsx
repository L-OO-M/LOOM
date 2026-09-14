import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { Display, Meta } from "@/components/loom/primitives";
import { VoteButton, FlagButton } from "../../CommunityBits";
import { ReplyForm, SolveButton } from "../ForumsBits";

export const dynamic = "force-dynamic";

export default async function ThreadPage({ params }) {
  const ctx = await getRequestContext();
  if (ctx.error) redirect("/login?redirect=/student/community/forums");
  const { user, profile, tenant, sql } = ctx;
  const { id } = await params;

  const [thread] = await sql`
    SELECT t.*, p.name AS author_name FROM forum_threads t
    LEFT JOIN profiles p ON p.user_id = t.author_id
    WHERE t.id = ${id} AND t.tenant_id = ${tenant?.id ?? null}::uuid AND t.status = 'visible'
    LIMIT 1
  `;
  if (!thread) notFound();
  await sql`UPDATE forum_threads SET view_count = view_count + 1 WHERE id = ${id}`;
  const replies = await sql`
    SELECT r.*, p.name AS author_name FROM forum_replies r
    LEFT JOIN profiles p ON p.user_id = r.author_id
    WHERE r.thread_id = ${id} AND r.status = 'visible'
    ORDER BY r.is_answer DESC, r.upvote_count DESC, r.created_at ASC
    LIMIT 200
  `;
  const canSolve = thread.author_id === user.id || profile?.role === "admin";

  return (
    <AppShell area="student" tenant={tenant} user={user}>
      <main className="mx-auto max-w-3xl px-4 sm:px-6">
        <Link href="/student/community/forums" className="meta hover:underline" style={{ color: "var(--accent)" }}>← Forums</Link>
        <Meta className="mt-4">
          {thread.domain} · by {thread.author_name || "a student"} · {thread.view_count + 1} reads
          {thread.solved ? " · solved" : ""}
        </Meta>
        <Display size="md" className="mt-3">{thread.title}</Display>

        <article className="mt-6 border-y py-6" style={{ borderColor: "var(--line)" }}>
          <div className="flex items-start gap-4">
            <span className="pt-1"><VoteButton targetType="thread" targetId={thread.id} count={thread.upvote_count} /></span>
            <p className="lede whitespace-pre-wrap" style={{ color: "var(--text)" }}>{thread.body || "No details."}</p>
          </div>
          <div className="mt-4 flex justify-end"><FlagButton targetType="thread" targetId={thread.id} /></div>
        </article>

        <section className="mt-10" aria-label="Replies">
          <Meta>{replies.length} {replies.length === 1 ? "reply" : "replies"}</Meta>
          <ul className="mt-4 divide-y" style={{ borderColor: "var(--line)" }}>
            {replies.map((r) => (
              <li key={r.id} className="py-5" style={r.is_answer ? { borderLeft: "2px solid var(--accent)", paddingLeft: "1rem" } : undefined}>
                <div className="flex items-start gap-4">
                  <span className="pt-0.5"><VoteButton targetType="reply" targetId={r.id} count={r.upvote_count} /></span>
                  <div className="min-w-0 flex-1">
                    <p className="meta">
                      {r.author_name || "a student"}{r.is_answer ? <span style={{ color: "var(--accent)" }}> · ✓ solution</span> : ""}
                    </p>
                    <p className="mt-1.5 whitespace-pre-wrap text-[0.95rem] leading-7" style={{ color: "var(--text)" }}>{r.body}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
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
          <div className="mt-3"><ReplyForm threadId={thread.id} /></div>
        </section>
      </main>
    </AppShell>
  );
}
