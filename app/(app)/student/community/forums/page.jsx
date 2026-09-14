import Link from "next/link";
import { redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { Display, Meta } from "@/components/loom/primitives";
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
      <main className="mx-auto max-w-4xl px-4 sm:px-6">
        <Link href="/student/community" className="meta hover:underline" style={{ color: "var(--accent)" }}>← Community</Link>
        <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
          <div>
            <Meta>Room 01 · ask, answer, solve</Meta>
            <Display size="lg" className="mt-3">Forums.</Display>
          </div>
          <ThreadForm />
        </div>

        <form method="get" className="mt-7 flex flex-wrap gap-2">
          <input name="q" defaultValue={sp?.q || ""} placeholder="Search threads…" aria-label="Search threads" className="min-w-0 flex-1 rounded-xl border px-3 py-2 text-sm" style={{ borderColor: "var(--line)", background: "var(--bg-muted)", color: "var(--text)" }} />
          <select name="domain" defaultValue={domain} aria-label="Filter by domain" className="rounded-xl border px-3 py-2 text-sm" style={{ borderColor: "var(--line)", background: "var(--bg-muted)", color: "var(--text)" }}>
            {DOMAINS.map((d) => <option key={d} value={d}>{d === "" ? "All domains" : d}</option>)}
          </select>
          <select name="sort" defaultValue={sort} aria-label="Sort threads" className="rounded-xl border px-3 py-2 text-sm" style={{ borderColor: "var(--line)", background: "var(--bg-muted)", color: "var(--text)" }}>
            <option value="recent">Recent</option>
            <option value="top">Top</option>
          </select>
          <button className="btn-ink !py-2" type="submit">Filter</button>
        </form>

        {threads.length === 0 ? (
          <p className="narrative mt-8">No threads match. Be the first to ask — someone in your chapter knows the answer.</p>
        ) : (
          <ul className="mt-6 divide-y" style={{ borderColor: "var(--line)" }}>
            {threads.map((t) => (
              <li key={t.id} className="flex items-start gap-4 border-t py-4 first:border-t" style={{ borderColor: "var(--line)" }}>
                <span className="pt-0.5"><VoteButton targetType="thread" targetId={t.id} count={t.upvote_count} /></span>
                <Link href={`/student/community/forums/${t.id}`} className="min-w-0 flex-1">
                  <span className="block text-[0.98rem] font-semibold leading-6 hover:underline" style={{ color: "var(--text)" }}>
                    {t.pinned && <span className="meta mr-2" style={{ color: "var(--accent)" }}>pinned</span>}
                    {t.solved && <span style={{ color: "var(--accent)" }}>✓ </span>}{t.title}
                  </span>
                  <span className="meta mt-1 block">
                    {t.author_name || "a student"} · {t.domain} · {t.reply_count} replies · {t.view_count} views
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </AppShell>
  );
}
