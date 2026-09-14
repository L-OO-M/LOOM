import Link from "next/link";
import { redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { Display, Meta } from "@/components/loom/primitives";
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
      <main className="mx-auto max-w-4xl px-4 sm:px-6">
        <Link href="/student/community" className="meta hover:underline" style={{ color: "var(--accent)" }}>← Community</Link>
        <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
          <div>
            <Meta>Room 03 · copy-paste knowledge</Meta>
            <Display size="lg" className="mt-3">Snippets.</Display>
          </div>
          <SnippetForm />
        </div>
        <form method="get" className="mt-7 flex gap-2">
          <input name="q" defaultValue={sp?.q || ""} placeholder="Search snippets…" aria-label="Search snippets" className="min-w-0 flex-1 rounded-xl border px-3 py-2 text-sm" style={{ borderColor: "var(--line)", background: "var(--bg-muted)", color: "var(--text)" }} />
          <button className="btn-ink !py-2" type="submit">Search</button>
        </form>
        {snippets.length === 0 ? (
          <p className="narrative mt-8">No snippets yet. Share the helper you keep rewriting — hooks, queries, configs, scripts.</p>
        ) : (
          <ul className="mt-8 space-y-8">
            {snippets.map((s) => (
              <li key={s.id} className="border-t pt-6" style={{ borderColor: "var(--line)" }}>
                <div className="flex items-start gap-4">
                  <span className="pt-0.5"><VoteButton targetType="snippet" targetId={s.id} count={s.upvote_count} /></span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <p className="text-[1.02rem] font-semibold" style={{ color: "var(--text)" }}>{s.title}</p>
                      <span className="meta">{s.language} · by {s.author_name || "a student"}</span>
                    </div>
                    {s.description && <p className="mt-1.5 text-sm leading-6" style={{ color: "var(--text-muted)" }}>{s.description}</p>}
                    <pre className="mt-3 overflow-auto rounded-xl p-4 font-mono text-xs leading-6" style={{ background: "var(--bg-muted)", color: "var(--text)" }}>{s.code}</pre>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </AppShell>
  );
}
