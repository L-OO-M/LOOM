import Link from "next/link";
import { redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { Display, Meta } from "@/components/loom/primitives";
import { VoteButton } from "../CommunityBits";
import { SnippetForm, CopyButton } from "./SnippetBits";

export const dynamic = "force-dynamic";

const DOMAINS = ["", "general", "ai_ml", "web", "cybersecurity", "dsa", "blockchain"];

export default async function SnippetsPage({ searchParams }) {
  const ctx = await getRequestContext();
  if (ctx.error) redirect("/login?redirect=/student/community/snippets");
  const { tenant, user, sql } = ctx;
  const tid = tenant?.id ?? null;
  const sp = await searchParams;
  const q = (sp?.q || "").trim();
  const language = (sp?.language || "").trim().slice(0, 30);
  const domain = sp?.domain || "";

  const languages = await sql`
    SELECT DISTINCT s.language FROM code_snippets s
    WHERE (s.tenant_id IS NULL OR s.tenant_id = ${tid}::uuid) AND s.status = 'visible'
    ORDER BY s.language ASC LIMIT 30
  `;
  const langOptions = languages.map((r) => r.language).filter(Boolean);
  const snippets = await sql`
    SELECT s.*, p.name AS author_name FROM code_snippets s
    LEFT JOIN profiles p ON p.user_id = s.author_id
    WHERE (s.tenant_id IS NULL OR s.tenant_id = ${tid}::uuid) AND s.status = 'visible'
      AND (${language} = '' OR s.language = ${language})
      AND (${domain} = '' OR s.domain = ${domain})
      AND (${q} = '' OR (s.title ILIKE ${`%${q}%`} OR s.code ILIKE ${`%${q}%`} OR s.description ILIKE ${`%${q}%`}))
    ORDER BY s.upvote_count DESC, s.created_at DESC LIMIT 50
  `;
  let votedIds = new Set();
  if (snippets.length > 0) {
    const ids = snippets.map((s) => s.id);
    const votes = await sql`
      SELECT target_id FROM forum_votes
      WHERE student_id = ${user.id} AND target_type = 'snippet' AND target_id = ANY(${ids}::uuid[])
    `;
    votedIds = new Set(votes.map((v) => String(v.target_id)));
  }

  return (
    <AppShell area="student" tenant={tenant} user={user}>
      <main className="mx-auto max-w-4xl px-4 sm:px-6">
        <Link href="/student/community" prefetch={false} className="meta hover:underline" style={{ color: "var(--accent)" }}>← Community</Link>
        <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
          <div>
            <Meta>Room 03 · copy-paste knowledge</Meta>
            <Display size="lg" className="mt-3">Snippets.</Display>
            <p className="mt-2 max-w-xl text-sm leading-6" style={{ color: "var(--text-muted)" }}>
              Share useful code → copy it → reuse it. Ranked by upvotes.
            </p>
          </div>
          <SnippetForm languages={langOptions} />
        </div>
        <form method="get" className="mt-7 flex flex-col gap-2 sm:flex-row">
          <input name="q" defaultValue={sp?.q || ""} placeholder="Search snippets…" aria-label="Search snippets" className="min-w-0 flex-1 rounded-xl border px-3 py-2 text-sm" style={{ borderColor: "var(--line)", background: "var(--bg-muted)", color: "var(--text)" }} />
          <div className="flex gap-2">
            <select name="language" defaultValue={language} aria-label="Filter by language" className="min-w-0 flex-1 rounded-xl border px-3 py-2 text-sm sm:flex-none" style={{ borderColor: "var(--line)", background: "var(--bg-muted)", color: "var(--text)" }}>
              <option value="">All languages</option>
              {langOptions.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
            <select name="domain" defaultValue={domain} aria-label="Filter by domain" className="min-w-0 flex-1 rounded-xl border px-3 py-2 text-sm sm:flex-none" style={{ borderColor: "var(--line)", background: "var(--bg-muted)", color: "var(--text)" }}>
              {DOMAINS.map((d) => <option key={d} value={d}>{d === "" ? "All domains" : d}</option>)}
            </select>
            <button className="btn-ink !py-2" type="submit">Search</button>
          </div>
        </form>
        {snippets.length === 0 ? (
          <p className="narrative mt-8">No snippets yet. Share the helper you keep rewriting — hooks, queries, configs, scripts.</p>
        ) : (
          <ul className="mt-8 space-y-8">
            {snippets.map((s) => (
              <li key={s.id} id={`snippet-${s.id}`} className="scroll-mt-24 border-t pt-6" style={{ borderColor: "var(--line)" }}>
                <div className="flex items-start gap-3 sm:gap-4">
                  <span className="pt-0.5"><VoteButton targetType="snippet" targetId={s.id} count={s.upvote_count} initialVoted={votedIds.has(String(s.id))} /></span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <p className="text-[1.02rem] font-semibold" style={{ color: "var(--text)" }}>{s.title}</p>
                      <span className="meta">{s.language} · {s.domain} · by {s.author_name || "a student"}</span>
                    </div>
                    {s.description && <p className="mt-1.5 text-sm leading-6" style={{ color: "var(--text-muted)" }}>{s.description}</p>}
                    {Array.isArray(s.tags) && s.tags.length > 0 && (
                      <p className="mt-2 flex flex-wrap gap-1.5" aria-label="Tags">
                        {s.tags.map((tag) => (
                          <span key={tag} className="rounded-full border px-2 py-0.5 font-mono text-[11px]" style={{ borderColor: "var(--line)", color: "var(--text-muted)" }}>#{tag}</span>
                        ))}
                      </p>
                    )}
                    <div className="mt-3 overflow-hidden rounded-xl" style={{ background: "var(--bg-muted)" }}>
                      <div className="flex items-center justify-between gap-2 px-4 pt-3">
                        <span className="font-mono text-[11px]" style={{ color: "var(--text-muted)" }}>{s.language}</span>
                        <CopyButton code={s.code} />
                      </div>
                      <pre className="overflow-auto p-4 pt-2 font-mono text-xs leading-6" style={{ color: "var(--text)" }}>{s.code}</pre>
                    </div>
                    <p className="meta mt-2">
                      <Link href={`/student/community/snippets#snippet-${s.id}`} prefetch={false} className="hover:underline" style={{ color: "var(--text-muted)" }}>Link to this snippet →</Link>
                    </p>
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
