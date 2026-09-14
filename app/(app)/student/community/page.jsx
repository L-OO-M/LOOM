import Link from "next/link";
import { redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { Display, Meta, ActionLink } from "@/components/loom/primitives";

export const dynamic = "force-dynamic";

export default async function CommunityPage() {
  const ctx = await getRequestContext();
  if (ctx.error) redirect("/login?redirect=/student/community");
  const { tenant, user, sql } = ctx;
  const tid = tenant?.id ?? null;

  const [{ threads = 0 } = {}] = await sql`SELECT COUNT(*)::int AS threads FROM forum_threads WHERE tenant_id = ${tid}::uuid AND status = 'visible'`;
  const [{ pages = 0 } = {}] = await sql`SELECT COUNT(*)::int AS pages FROM wiki_pages WHERE tenant_id = ${tid}::uuid AND status = 'published'`;
  const [{ snippets = 0 } = {}] = await sql`SELECT COUNT(*)::int AS snippets FROM code_snippets WHERE (tenant_id IS NULL OR tenant_id = ${tid}::uuid) AND status = 'visible'`;
  const recent = await sql`
    SELECT t.id, t.title, t.reply_count, t.upvote_count, t.solved, p.name AS author_name FROM forum_threads t
    LEFT JOIN profiles p ON p.user_id = t.author_id
    WHERE t.tenant_id = ${tid}::uuid AND t.status = 'visible'
    ORDER BY t.updated_at DESC LIMIT 5
  `;

  const rooms = [
    { href: "/student/community/forums", index: "01", title: "Forums", body: "Ask, answer, and mark solutions by domain. The fastest way to get unstuck.", count: `${threads} threads` },
    { href: "/student/community/wiki", index: "02", title: "Wiki", body: "The chapter's shared memory — setup guides, playbooks, hard-won notes.", count: `${pages} pages` },
    { href: "/student/community/snippets", index: "03", title: "Snippets", body: "Small code that saved someone an afternoon. Ranked by votes, searchable.", count: `${snippets} snippets` }
  ];

  return (
    <AppShell area="student" tenant={tenant} user={user}>
      <main className="mx-auto max-w-4xl px-4 sm:px-6">
        <Meta>Connect · your chapter, talking</Meta>
        <Display size="lg" className="mt-3">Rooms, not feeds.</Display>
        <p className="narrative mt-4" style={{ color: "var(--text)" }}>
          Three rooms, three jobs. Questions live in forums, knowledge compounds in the wiki, and useful code waits in snippets.
        </p>

        <ol className="mt-10">
          {rooms.map((r) => (
            <li key={r.href} className="border-b first:border-t" style={{ borderColor: "var(--line)" }}>
              <Link href={r.href} className="row-link flex items-baseline gap-5 px-2 py-6">
                <span className="index-num shrink-0">{r.index}</span>
                <span className="min-w-0 flex-1">
                  <span className="font-display block text-2xl font-medium" style={{ color: "var(--text)" }}>{r.title}</span>
                  <span className="mt-1 block max-w-xl text-sm leading-6" style={{ color: "var(--text-muted)" }}>{r.body}</span>
                </span>
                <span className="meta shrink-0">{r.count}</span>
              </Link>
            </li>
          ))}
        </ol>

        <section className="mt-12" aria-label="Recently active">
          <div className="flex items-baseline justify-between">
            <Meta>Recently active</Meta>
            <ActionLink href="/student/community/forums">All threads</ActionLink>
          </div>
          {recent.length === 0 ? (
            <p className="narrative mt-4">
              Silence. The good kind — waiting for a first question.{" "}
              <Link href="/student/community/forums" className="font-semibold hover:underline" style={{ color: "var(--accent)" }}>Ask it →</Link>
            </p>
          ) : (
            <ul className="mt-3 divide-y" style={{ borderColor: "var(--line)" }}>
              {recent.map((t) => (
                <li key={t.id}>
                  <Link href={`/student/community/forums/${t.id}`} className="row-link flex items-baseline gap-4 px-2 py-3">
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold" style={{ color: "var(--text)" }}>
                      {t.solved && <span style={{ color: "var(--accent)" }}>✓ </span>}{t.title}
                    </span>
                    <span className="meta shrink-0">▲{t.upvote_count} · {t.reply_count} · {t.author_name || "a student"}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </AppShell>
  );
}
