import Link from "next/link";
import { redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { PageHeader, Card, EmptyState } from "@/components/ui";
import { VoteButton } from "../CommunityBits";
import { SnippetForm } from "./SnippetBits";

export const dynamic = "force-dynamic";

export default async function SnippetsPage({ searchParams }) {
  const ctx = await getRequestContext();
  if (ctx.error) redirect("/login?redirect=/student/community/snippets");
  const { tenant, user, sql } = ctx;
  const sp = await searchParams;
  const q = (sp?.q || "").trim();

  const snippets = await sql`
    SELECT s.*, p.name AS author_name FROM code_snippets s
    LEFT JOIN profiles p ON p.user_id = s.author_id
    WHERE (s.tenant_id IS NULL OR s.tenant_id = ${tenant?.id ?? null}::uuid) AND s.status = 'visible'
      AND (${q} = '' OR (s.title ILIKE ${`%${q}%`} OR s.code ILIKE ${`%${q}%`} OR s.description ILIKE ${`%${q}%`}))
    ORDER BY s.upvote_count DESC, s.created_at DESC LIMIT 50
  `;

  return (
    <AppShell area="student" tenant={tenant} user={user}>
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          <Link href="/student/community" style={{ color: "var(--accent)" }}>← Community</Link>
        </p>
        <PageHeader kicker="Reuse" title="Snippets" desc="Copy-paste knowledge, ranked by the chapter." action={<SnippetForm />} />
        <form method="get" className="flex gap-2">
          <input name="q" defaultValue={sp?.q || ""} placeholder="Search snippets…" className="min-w-0 flex-1 rounded-xl border px-3 py-2 text-sm" style={{ borderColor: "var(--line)", background: "var(--bg-muted)", color: "var(--text)" }} />
          <button className="btn-ink" type="submit">Search</button>
        </form>
        {snippets.length === 0 ? (
          <div className="mt-4"><EmptyState title="No snippets yet" body="Share the helper you keep rewriting — hooks, queries, configs, scripts." /></div>
        ) : (
          <ul className="mt-4 space-y-3">
            {snippets.map((s) => (
              <li key={s.id}>
                <Card>
                  <div className="flex items-start gap-3">
                    <VoteButton targetType="snippet" targetId={s.id} count={s.upvote_count} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium" style={{ color: "var(--text)" }}>{s.title}</p>
                        <span className="rounded-full border px-2 py-0.5 font-mono text-xs" style={{ borderColor: "var(--line)", color: "var(--text-muted)" }}>{s.language}</span>
                      </div>
                      {s.description && <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>{s.description}</p>}
                      <pre className="mt-2 overflow-auto rounded-xl p-3 font-mono text-xs leading-5" style={{ background: "var(--bg-muted)", color: "var(--text)" }}>{s.code}</pre>
                      <p className="mt-2 text-xs" style={{ color: "var(--text-muted)" }}>by {s.author_name || "a student"}</p>
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
