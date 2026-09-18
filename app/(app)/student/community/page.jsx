import Link from "next/link";
import { redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { Display, Meta, ActionLink, PlainStat } from "@/components/loom/primitives";
import { reputationFor } from "@/lib/reputation";

export const dynamic = "force-dynamic";

function ageLabel(value) {
  if (!value) return "";
  const t = new Date(value).getTime();
  if (Number.isNaN(t)) return "";
  const mins = Math.max(0, Math.floor((Date.now() - t) / 60000));
  if (mins < 60) return mins <= 1 ? "just now" : `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(t).toLocaleDateString("en-IN", { month: "short", day: "numeric" });
}

export default async function CommunityPage() {
  const ctx = await getRequestContext();
  if (ctx.error) redirect("/login?redirect=/student/community");
  const { tenant, user, profile, sql } = ctx;
  const tid = tenant?.id ?? null;

  const [{ threads = 0 } = {}] = await sql`SELECT COUNT(*)::int AS threads FROM forum_threads WHERE tenant_id = ${tid}::uuid AND status = 'visible'`;
  const [{ pages = 0 } = {}] = await sql`SELECT COUNT(*)::int AS pages FROM wiki_pages WHERE tenant_id = ${tid}::uuid AND status = 'published'`;
  const [{ snippets = 0 } = {}] = await sql`SELECT COUNT(*)::int AS snippets FROM code_snippets WHERE (tenant_id IS NULL OR tenant_id = ${tid}::uuid) AND status = 'visible'`;
  const recent = await sql`
    SELECT t.id, t.title, t.domain, t.reply_count, t.upvote_count, t.solved, t.updated_at, p.name AS author_name FROM forum_threads t
    LEFT JOIN profiles p ON p.user_id = t.author_id
    WHERE t.tenant_id = ${tid}::uuid AND t.status = 'visible'
    ORDER BY t.updated_at DESC LIMIT 5
  `;
  const domain = profile?.primary_domain || "general";
  const needsHelp = await sql`
    SELECT t.id, t.title, t.domain, t.created_at, t.upvote_count, p.name AS author_name FROM forum_threads t
    LEFT JOIN profiles p ON p.user_id = t.author_id
    WHERE t.tenant_id = ${tid}::uuid AND t.status = 'visible' AND t.reply_count = 0
    ORDER BY (t.domain = ${domain}) DESC, t.created_at DESC LIMIT 5
  `;
  const [{ solutions = 0 } = {}] = await sql`SELECT COUNT(*)::int AS solutions FROM forum_replies WHERE author_id = ${user.id} AND is_answer = true AND status = 'visible'`;
  const [{ wikiPages = 0 } = {}] = await sql`SELECT COUNT(*)::int AS wikiPages FROM wiki_pages WHERE author_id = ${user.id} AND status = 'published'`;
  const rep = await reputationFor(sql, user.id).catch(() => ({ score: 0 }));

  const rooms = [
    { href: "/student/community/forums", index: "01", title: "Forums", body: "Ask, answer, solve.", count: `${threads} threads` },
    { href: "/student/community/wiki", index: "02", title: "Wiki", body: "The chapter's durable memory.", count: `${pages} pages` },
    { href: "/student/community/snippets", index: "03", title: "Snippets", body: "Copy-paste knowledge.", count: `${snippets} snippets` }
  ];

  return (
    <AppShell area="student" tenant={tenant} user={user}>
      <main className="mx-auto max-w-4xl px-4 sm:px-6">
        <Meta>Connect · community knowledge</Meta>
        <Display size="lg" className="mt-3">Rooms, not feeds.</Display>
        <p className="narrative mt-4" style={{ color: "var(--text)" }}>
          Three rooms, three jobs. Ask in forums, preserve in the wiki, reuse from snippets.
        </p>

        <ol className="mt-10">
          {rooms.map((r) => (
            <li key={r.href} className="border-b first:border-t" style={{ borderColor: "var(--line)" }}>
              <Link href={r.href} prefetch={false} className="row-link flex items-baseline gap-5 px-2 py-6">
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

        <section className="mt-12" aria-label="Needs help now">
          <div className="flex items-baseline justify-between gap-3">
            <Meta>Needs help now</Meta>
            <ActionLink href="/student/community/forums?state=unanswered">Answer one</ActionLink>
          </div>
          <p className="mt-2 text-sm leading-6" style={{ color: "var(--text-muted)" }}>
            Unanswered questions first{domain ? ` — ${domain} first, then the rest` : ""}. Ask → answer → solve.
          </p>
          {needsHelp.length === 0 ? (
            <p className="narrative mt-4">Nothing waiting on an answer.</p>
          ) : (
            <ul className="mt-3 divide-y" style={{ borderColor: "var(--line)" }}>
              {needsHelp.map((t) => (
                <li key={t.id}>
                  <Link href={`/student/community/forums/${t.id}`} prefetch={false} className="row-link flex flex-wrap items-baseline gap-x-4 gap-y-1 px-2 py-3">
                    <span className="min-w-0 flex-1 basis-48 truncate text-sm font-semibold" style={{ color: "var(--text)" }}>
                      {t.title}
                    </span>
                    <span className="meta shrink-0">{t.domain} · {t.author_name || "a student"} · {ageLabel(t.created_at)}</span>
                    <span className="shrink-0 text-sm font-semibold" style={{ color: "var(--accent)" }}>Answer →</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mt-12" aria-label="Recently active">
          <div className="flex items-baseline justify-between">
            <Meta>Recently active</Meta>
            <ActionLink href="/student/community/forums">All threads</ActionLink>
          </div>
          {recent.length === 0 ? (
            <p className="narrative mt-4">
              Silence. The good kind — waiting for a first question.{" "}
              <Link href="/student/community/forums" prefetch={false} className="font-semibold hover:underline" style={{ color: "var(--accent)" }}>Ask it →</Link>
            </p>
          ) : (
            <ul className="mt-3 divide-y" style={{ borderColor: "var(--line)" }}>
              {recent.map((t) => (
                <li key={t.id}>
                  <Link href={`/student/community/forums/${t.id}`} prefetch={false} className="row-link flex flex-wrap items-baseline gap-x-4 gap-y-1 px-2 py-3">
                    <span className="min-w-0 flex-1 basis-48 truncate text-sm font-semibold" style={{ color: "var(--text)" }}>
                      {t.solved ? <span style={{ color: "var(--accent)" }}>✓ </span> : null}{t.title}
                    </span>
                    <span className="meta shrink-0">{t.domain} · {t.solved ? "solved" : "open"} · ▲{t.upvote_count} · {t.reply_count} replies · {t.author_name || "a student"} · {ageLabel(t.updated_at)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mt-12 border-t pt-6" style={{ borderColor: "var(--line)" }} aria-label="Your contributions">
          <Meta>Your contributions</Meta>
          <div className="mt-4 grid grid-cols-3 gap-6">
            <PlainStat value={solutions} unit="" label="solutions given" />
            <PlainStat value={wikiPages} unit="" label="wiki pages kept" />
            <PlainStat value={rep.score} unit="" label="reputation" />
          </div>
          <p className="mt-4 text-sm leading-6" style={{ color: "var(--text-muted)" }}>
            Solutions and wiki pages compound into reputation.{" "}
            <Link href="/student/community/forums?state=unsolved" prefetch={false} className="font-semibold hover:underline" style={{ color: "var(--accent)" }}>Help solve one</Link>
            {" · "}
            <Link href="/student/community/wiki" prefetch={false} className="font-semibold hover:underline" style={{ color: "var(--accent)" }}>Improve the wiki</Link>
          </p>
        </section>
      </main>
    </AppShell>
  );
}
