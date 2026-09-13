import Link from "next/link";
import { redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { PageHeader, Card } from "@/components/ui";

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
    SELECT t.id, t.title, t.reply_count, t.upvote_count, p.name AS author_name FROM forum_threads t
    LEFT JOIN profiles p ON p.user_id = t.author_id
    WHERE t.tenant_id = ${tid}::uuid AND t.status = 'visible'
    ORDER BY t.updated_at DESC LIMIT 5
  `;

  const cards = [
    { href: "/student/community/forums", title: "Forums", body: "Ask, answer, and mark solutions by domain.", count: `${threads} threads` },
    { href: "/student/community/wiki", title: "Wiki", body: "Collaborative knowledge base for your chapter.", count: `${pages} pages` },
    { href: "/student/community/snippets", title: "Snippets", body: "Searchable code library, ranked by votes.", count: `${snippets} snippets` }
  ];

  return (
    <AppShell area="student" tenant={tenant} user={user}>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <PageHeader kicker="Together" title="Community" desc="Your chapter's discussions, knowledge base, and code library." />
        <div className="grid gap-4 sm:grid-cols-3">
          {cards.map((c) => (
            <Link key={c.href} href={c.href}>
              <Card className="transition hover:-translate-y-0.5">
                <div className="flex items-center justify-between">
                  <h2 className="font-medium" style={{ color: "var(--text)" }}>{c.title}</h2>
                  <span className="font-mono text-xs" style={{ color: "var(--accent)" }}>{c.count}</span>
                </div>
                <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>{c.body}</p>
              </Card>
            </Link>
          ))}
        </div>
        <h2 className="mt-8 font-medium" style={{ color: "var(--text)" }}>Recently active threads</h2>
        <ul className="mt-4 space-y-3">
          {recent.map((t) => (
            <li key={t.id}>
              <Link href={`/student/community/forums/${t.id}`}>
                <Card>
                  <div className="flex items-center justify-between gap-3">
                    <p className="min-w-0 truncate font-medium" style={{ color: "var(--text)" }}>{t.title}</p>
                    <span className="shrink-0 font-mono text-xs" style={{ color: "var(--text-muted)" }}>▲{t.upvote_count} · {t.reply_count} replies</span>
                  </div>
                  <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>by {t.author_name || "a student"}</p>
                </Card>
              </Link>
            </li>
          ))}
          {recent.length === 0 && (
            <li><Card><p className="text-sm" style={{ color: "var(--text-muted)" }}>No threads yet — start the first discussion.</p></Card></li>
          )}
        </ul>
      </main>
    </AppShell>
  );
}
