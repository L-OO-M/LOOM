import Link from "next/link";
import { redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { PageHeader, Card, EmptyState } from "@/components/ui";
import { VoteButton } from "../CommunityBits";
import { ThreadForm } from "./ForumsBits";

export const dynamic = "force-dynamic";

const DOMAINS = ["", "general", "ai_ml", "web", "cybersecurity", "dsa", "blockchain"];

export default async function ForumsPage({ searchParams }) {
  const ctx = await getRequestContext();
  if (ctx.error) redirect("/login?redirect=/student/community/forums");
  const { tenant, user, sql } = ctx;
  const sp = await searchParams;
  const q = (sp?.q || "").trim();
  const domain = sp?.domain || "";
  const sort = sp?.sort === "top" ? "top" : "recent";

  const orderBy = sort === "top"
    ? sql`t.pinned DESC, t.upvote_count DESC, t.updated_at DESC`
    : sql`t.pinned DESC, t.updated_at DESC`;
  const threads = await sql`
    SELECT t.*, p.name AS author_name FROM forum_threads t
    LEFT JOIN profiles p ON p.user_id = t.author_id
    WHERE t.tenant_id = ${tenant?.id ?? null}::uuid AND t.status = 'visible'
      AND (${domain} = '' OR t.domain = ${domain})
      AND (${q} = '' OR (t.title ILIKE ${`%${q}%`} OR t.body ILIKE ${`%${q}%`}))
    ORDER BY ${orderBy}
    LIMIT 50
  `;

  return (
    <AppShell area="student" tenant={tenant} user={user}>
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          <Link href="/student/community" style={{ color: "var(--accent)" }}>← Community</Link>
        </p>
        <PageHeader kicker="Discuss" title="Forums" desc="Ask questions, share answers, mark solutions." action={<ThreadForm />} />
        <form method="get" className="flex flex-wrap gap-2">
          <input name="q" defaultValue={sp?.q || ""} placeholder="Search threads…" className="min-w-0 flex-1 rounded-xl border px-3 py-2 text-sm" style={{ borderColor: "var(--line)", background: "var(--bg-muted)", color: "var(--text)" }} />
          <select name="domain" defaultValue={domain} className="rounded-xl border px-3 py-2 text-sm" style={{ borderColor: "var(--line)", background: "var(--bg-muted)", color: "var(--text)" }}>
            {DOMAINS.map((d) => <option key={d} value={d}>{d === "" ? "All domains" : d}</option>)}
          </select>
          <select name="sort" defaultValue={sort} className="rounded-xl border px-3 py-2 text-sm" style={{ borderColor: "var(--line)", background: "var(--bg-muted)", color: "var(--text)" }}>
            <option value="recent">Recent</option>
            <option value="top">Top</option>
          </select>
          <button className="btn-ink" type="submit">Filter</button>
        </form>

        {threads.length === 0 ? (
          <div className="mt-4"><EmptyState title="No threads yet" body="Be the first to ask — someone in your chapter knows the answer." /></div>
        ) : (
          <ul className="mt-4 space-y-3">
            {threads.map((t) => (
              <li key={t.id}>
                <Card>
                  <div className="flex items-start gap-3">
                    <VoteButton targetType="thread" targetId={t.id} count={t.upvote_count} />
                    <div className="min-w-0 flex-1">
                      <Link href={`/student/community/forums/${t.id}`} className="font-medium hover:underline" style={{ color: "var(--text)" }}>
                        {t.pinned ? "📌 " : ""}{t.solved ? "✓ " : ""}{t.title}
                      </Link>
                      <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
                        {t.author_name || "a student"} · {t.domain} · {t.reply_count} replies · {t.view_count} views
                      </p>
                    </div>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </main>
    </AppShell>
  );
}
