import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { PageHeader, Card } from "@/components/ui";
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
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          <Link href="/student/community/forums" style={{ color: "var(--accent)" }}>← Forums</Link>
        </p>
        <PageHeader kicker={thread.domain} title={thread.title} desc={`by ${thread.author_name || "a student"} · ${thread.view_count + 1} views`} />
        <Card>
          <div className="flex items-start gap-3">
            <VoteButton targetType="thread" targetId={thread.id} count={thread.upvote_count} />
            <p className="whitespace-pre-wrap text-sm leading-6" style={{ color: "var(--text)" }}>{thread.body || "No details."}</p>
          </div>
          <div className="mt-3 flex justify-end"><FlagButton targetType="thread" targetId={thread.id} /></div>
        </Card>

        <h2 className="mt-8 font-medium" style={{ color: "var(--text)" }}>{replies.length} replies</h2>
        <ul className="mt-4 space-y-3">
          {replies.map((r) => (
            <li key={r.id}>
              <Card className={r.is_answer ? "!border-[var(--accent)]" : ""}>
                <div className="flex items-start gap-3">
                  <VoteButton targetType="reply" targetId={r.id} count={r.upvote_count} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                      {r.author_name || "a student"}{r.is_answer ? <span style={{ color: "var(--accent)" }}> · ✓ solution</span> : ""}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-sm leading-6" style={{ color: "var(--text)" }}>{r.body}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    {canSolve && !r.is_answer && <SolveButton threadId={thread.id} replyId={r.id} />}
                    <FlagButton targetType="reply" targetId={r.id} />
                  </div>
                </div>
              </Card>
            </li>
          ))}
        </ul>
        <Card className="mt-6">
          <h3 className="font-medium" style={{ color: "var(--text)" }}>Add a reply</h3>
          <ReplyForm threadId={thread.id} />
        </Card>
      </main>
    </AppShell>
  );
}
