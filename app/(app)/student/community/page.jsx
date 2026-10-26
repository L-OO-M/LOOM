import Link from "next/link";
import { redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { ActionLink } from "@/components/loom/primitives";
import { Reveal } from "@/components/motion/Reveal";
import { ConnectTabs } from "@/components/student/SectionRails";
import { reputationFor } from "@/lib/reputation";
import "../_components/student-folio.css";
import "./community.css";

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
  const [{ snippets = 0 } = {}] = await sql`SELECT COUNT(*)::int AS snippets FROM code_snippets WHERE tenant_id = ${tid}::uuid AND status = 'visible'`;
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
    {
      href: "/student/community/forums",
      number: "01",
      label: "Forums",
      count: threads,
      unit: threads === 1 ? "thread" : "threads",
      title: "Ask the room.",
      copy: "Questions, answers, and the arguments that make the work clearer.",
      action: "Open forums",
    },
    {
      href: "/student/community/wiki",
      number: "02",
      label: "Wiki",
      count: pages,
      unit: pages === 1 ? "page" : "pages",
      title: "Keep what works.",
      copy: "The chapter's living reference: decisions, patterns, and hard-won detail.",
      action: "Read the wiki",
    },
    {
      href: "/student/community/snippets",
      number: "03",
      label: "Snippets",
      count: snippets,
      unit: snippets === 1 ? "snippet" : "snippets",
      title: "Reuse the good part.",
      copy: "Small pieces of working code, kept with context so nobody starts from zero.",
      action: "Browse snippets",
    },
  ];

  return (
    <AppShell area="student" tenant={tenant} user={user}>
      <main className="desk reading-room mx-auto max-w-6xl px-4 pb-4 sm:px-6">
        <Reveal>
          <section className="desk-hero reading-room-hero" aria-labelledby="reading-room-title">
            <div className="desk-hero-inner">
              <div className="desk-hero-main">
                <p className="desk-kicker">
                  <span>Connect</span>
                  <span>Community knowledge</span>
                </p>
                <h1 id="reading-room-title" className="desk-title">The reading room.</h1>
                <p className="desk-lede">
                  Three rooms, three jobs. Ask in forums, preserve in the wiki, reuse from snippets.
                  The point is not a feed; it is a chapter that remembers.
                </p>
                <p className="desk-meta-line">
                  {threads} threads &middot; {pages} wiki pages &middot; {snippets} snippets
                </p>
                <div className="desk-actions">
                  <Link href="/student/community/forums" prefetch={false} className="btn-ink">
                    Ask a question
                  </Link>
                  <Link href="/student/community/wiki" prefetch={false} className="btn-ghost">
                    Read the wiki
                  </Link>
                </div>
              </div>

              <aside className="desk-pass reading-room-pass" aria-label="Your contribution record">
                <p className="desk-label">Your margin</p>
                <p className="desk-pass-value">
                  {rep.score}
                  <span>reputation</span>
                </p>
                <p className="desk-pass-note">
                  {solutions + wikiPages === 0
                    ? "Answers and wiki pages compound into reputation."
                    : "Every answer and page leaves the room better than you found it."}
                </p>
                <dl className="desk-pass-list">
                  <div>
                    <dt>Solved</dt>
                    <dd>{solutions} answers</dd>
                  </div>
                  <div>
                    <dt>Kept</dt>
                    <dd>{wikiPages} wiki pages</dd>
                  </div>
                  <div>
                    <dt>Focus</dt>
                    <dd>{domain}</dd>
                  </div>
                </dl>
              </aside>
            </div>
          </section>
        </Reveal>

        <div className="reading-room-tabs">
          <ConnectTabs active="/student/community" />
        </div>

        <section className="room-index" aria-label="Community rooms">
          <div className="room-index-head">
            <p className="room-index-label">Three rooms</p>
            <p className="room-index-note">Pick the room that fits the job.</p>
          </div>
          <div className="room-grid">
            {rooms.map((room) => (
              <Link key={room.href} href={room.href} prefetch={false} className="room-card">
                <span className="room-number">{room.number}</span>
                <span className="room-label">{room.label}</span>
                <span className="room-title">{room.title}</span>
                <span className="room-copy">{room.copy}</span>
                <span className="room-foot">
                  <span>
                    {room.count} {room.unit}
                  </span>
                  <span aria-hidden="true">&rarr;</span>
                </span>
              </Link>
            ))}
          </div>
        </section>

        <section className="reading-help" aria-labelledby="reading-help-title">
          <div className="reading-section-head">
            <div>
              <p className="reading-section-kicker">Needs help now</p>
              <h2 id="reading-help-title" className="reading-section-title">Questions with no answer yet.</h2>
            </div>
            <ActionLink href="/student/community/forums?state=unanswered">Answer one</ActionLink>
          </div>
          <p className="reading-section-lede">
            Unanswered questions first{domain ? `, ${domain} before the rest` : ""}. Ask, answer, solve.
          </p>
          {needsHelp.length === 0 ? (
            <p className="reading-empty">Nothing waiting on an answer. The room is current.</p>
          ) : (
            <ol className="reading-help-list">
              {needsHelp.map((t, i) => (
                <li key={t.id}>
                  <Link href={`/student/community/forums/${t.id}`} prefetch={false} className="reading-help-row">
                    <span className="reading-help-index">{String(i + 1).padStart(2, "0")}</span>
                    <span className="reading-help-main">
                      <span className="reading-help-title">{t.title}</span>
                      <span className="reading-help-meta">
                        {t.domain} &middot; {t.author_name || "a student"} &middot; {ageLabel(t.created_at)}
                        {t.upvote_count > 0 ? ` · ${t.upvote_count} upvote${t.upvote_count === 1 ? "" : "s"}` : ""}
                      </span>
                    </span>
                    <span className="reading-help-answer">Answer <span aria-hidden="true">&rarr;</span></span>
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="reading-margin" aria-labelledby="reading-margin-title">
          <div className="reading-margin-head">
            <p className="reading-section-kicker">Your contributions</p>
            <h2 id="reading-margin-title" className="reading-margin-title">The margin you keep.</h2>
          </div>
          <div className="reading-margin-grid">
            <div className="reading-margin-stat">
              <p className="reading-margin-value">{solutions}</p>
              <p className="reading-margin-label">solutions given</p>
            </div>
            <div className="reading-margin-stat">
              <p className="reading-margin-value">{wikiPages}</p>
              <p className="reading-margin-label">wiki pages kept</p>
            </div>
            <div className="reading-margin-stat">
              <p className="reading-margin-value">{rep.score}</p>
              <p className="reading-margin-label">reputation</p>
            </div>
          </div>
          <p className="reading-margin-copy">
            Solutions and wiki pages compound into reputation.{" "}
            <Link href="/student/community/forums?state=unsolved" prefetch={false}>Help solve one</Link>
            <span aria-hidden="true"> / </span>
            <Link href="/student/community/wiki" prefetch={false}>Improve the wiki</Link>
          </p>
        </section>
      </main>
    </AppShell>
  );
}
