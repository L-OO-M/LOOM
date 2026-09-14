import Link from "next/link";
import { redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { reputationFor } from "@/lib/reputation";
import { Display, Meta, ActionLink } from "@/components/loom/primitives";
import { ActivityStream } from "@/components/loom/Evidence";
import { ClaimCard, MentorReviewForm } from "./DiscoverBits";

export const dynamic = "force-dynamic";

export default async function DiscoverPage() {
  const ctx = await getRequestContext();
  if (ctx.error) redirect("/login?redirect=/student/discover");
  const { user, tenant, sql } = ctx;
  const tid = tenant?.id ?? null;

  const [myCard] = await sql`SELECT username FROM user_profiles WHERE user_id = ${user.id} LIMIT 1`;
  const threads = await sql`
    SELECT t.id, t.title, t.upvote_count, t.reply_count, p.name AS author_name FROM forum_threads t
    LEFT JOIN profiles p ON p.user_id = t.author_id
    WHERE t.tenant_id = ${tid}::uuid AND t.status = 'visible' AND t.created_at >= now() - interval '7 days'
    ORDER BY t.upvote_count DESC LIMIT 5
  `;
  const mentors = await sql`
    SELECT m.user_id, m.expertise, p.name, COUNT(r.id)::int AS reviews,
      COALESCE(AVG(r.rating),0)::numeric AS avg_rating
    FROM mentors m
    LEFT JOIN profiles p ON p.user_id = m.user_id
    LEFT JOIN mentor_reviews r ON r.mentor_id = m.user_id
    WHERE m.tenant_id = ${tid}::uuid AND m.available = true
    GROUP BY m.user_id, m.expertise, p.name ORDER BY avg_rating DESC, reviews DESC LIMIT 3
  `;
  const students = await sql`
    SELECT up.username, up.user_id, up.bio, up.primary_domain, p.name
    FROM user_profiles up JOIN profiles p ON p.user_id = up.user_id
    WHERE up.tenant_id = ${tid}::uuid AND up.is_public = true AND up.user_id <> ${user.id} LIMIT 20
  `;
  const rising = [];
  for (const s of students) {
    const rep = await reputationFor(sql, s.user_id).catch(() => ({ score: 0 }));
    if (rep.score > 0) rising.push({ ...s, score: rep.score });
  }
  rising.sort((a, b) => b.score - a.score);
  const builders = rising.slice(0, 6);
  // What each builder is working on: their latest shipped project.
  for (const b of builders) {
    const [proj] = await sql`SELECT title FROM projects WHERE owner_id = ${b.user_id} ORDER BY created_at DESC LIMIT 1`;
    b.building = proj?.title || null;
  }

  // The living stream: launches, discussions, gatherings across the chapter.
  const launches = await sql`
    SELECT p.title, p.created_at, pr.name AS owner_name, up.username FROM projects p
    JOIN profiles pr ON pr.user_id = p.owner_id
    LEFT JOIN user_profiles up ON up.user_id = p.owner_id
    WHERE pr.tenant_id = ${tid}::uuid AND p.created_at >= now() - interval '14 days'
    ORDER BY p.created_at DESC LIMIT 4
  `;
  const gatherings = await sql`
    SELECT title, starts_at FROM events
    WHERE tenant_id = ${tid}::uuid AND starts_at >= NOW()
    ORDER BY starts_at ASC LIMIT 3
  `;
  const stream = [
    ...launches.map((l) => ({
      actor: l.owner_name, text: `published ${l.title}`,
      meta: new Date(l.created_at).toLocaleDateString("en-IN", { month: "short", day: "numeric" }) + " · project launch",
      href: l.username ? `/student/${l.username}` : null, hot: true
    })),
    ...threads.slice(0, 3).map((t) => ({
      actor: t.author_name || "A student", text: `asked “${t.title}”`,
      meta: `${t.reply_count} replies · forum`, href: `/student/community/forums/${t.id}`, hot: false
    })),
    ...gatherings.map((g) => ({
      text: `${g.title} is gathering people`,
      meta: new Date(g.starts_at).toLocaleDateString("en-IN", { weekday: "long", month: "short", day: "numeric" }) + " · event",
      href: "/student/events", hot: false
    }))
  ].slice(0, 7);

  return (
    <AppShell area="student" tenant={tenant} user={user}>
      <main className="mx-auto max-w-6xl px-4 sm:px-6">
        <Meta>Discover · your college, alive</Meta>
        <Display size="lg" className="mt-3">People building interesting things.</Display>
        <div className="mt-6 max-w-2xl"><ClaimCard hasCard={!!myCard} /></div>

        <div className="mt-12 grid gap-12 lg:grid-cols-[1.2fr_0.8fr]">
          <section aria-label="Builders">
            <div className="flex items-baseline justify-between">
              <Meta>Rising builders</Meta>
              <span className="meta">{builders.length} with proof</span>
            </div>
            {builders.length === 0 ? (
              <p className="narrative mt-4">
                No public profiles with proof yet. Earn some — finish a node, merge a PR, ship a project — then{" "}
                <Link href="/student/community" className="font-semibold hover:underline" style={{ color: "var(--accent)" }}>claim your card</Link>{" "}
                so the chapter can find you.
              </p>
            ) : (
              <ol className="mt-2">
                {builders.map((s) => (
                  <li key={s.user_id} className="border-b py-5" style={{ borderColor: "var(--line)" }}>
                    <Link href={`/student/${s.username}`} className="row-link block px-2 py-1">
                      <span className="flex items-baseline justify-between gap-3">
                        <span className="text-[1.02rem] font-semibold" style={{ color: "var(--text)" }}>{s.name}</span>
                        <span className="figure-mono text-sm font-semibold" style={{ color: "var(--accent)" }}>{s.score}</span>
                      </span>
                      <span className="mt-1 block text-sm" style={{ color: "var(--text-muted)" }}>
                        {s.building ? <>Building: <strong style={{ color: "var(--text)" }}>{s.building}</strong></> : s.bio || `Learning ${s.primary_domain || "across tracks"}`}
                      </span>
                      <span className="meta mt-1.5 block">@{s.username}{s.primary_domain ? ` · ${s.primary_domain}` : ""} · view journey →</span>
                    </Link>
                  </li>
                ))}
              </ol>
            )}

            {mentors.length > 0 && (
              <section className="mt-12" aria-label="Mentors worth your time">
                <div className="flex items-baseline justify-between">
                  <Meta>Guides worth your time</Meta>
                  <ActionLink href="/student/mentorship">All mentors</ActionLink>
                </div>
                <ul className="mt-4 space-y-5">
                  {mentors.map((m) => (
                    <li key={m.user_id} className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="text-sm" style={{ color: "var(--text)" }}>
                        <strong className="font-semibold">{m.name || "Mentor"}</strong>{" "}
                        <span style={{ color: "var(--text-muted)" }}>· {m.expertise || "general"}</span>
                      </p>
                      <p className="meta">{Number(m.reviews) > 0 ? `★${Number(m.avg_rating).toFixed(1)} (${m.reviews})` : "new guide"}</p>
                      <div className="w-full"><MentorReviewForm mentorId={m.user_id} /></div>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </section>

          <section aria-label="Happening now">
            <Meta>The stream</Meta>
            <div className="mt-2">
              {stream.length > 0 ? (
                <ActivityStream items={stream} />
              ) : (
                <p className="narrative mt-4">
                  Quiet right now.{" "}
                  <Link href="/student/community/forums" className="font-semibold hover:underline" style={{ color: "var(--accent)" }}>Start a thread</Link>{" "}
                  and give the chapter something to gather around.
                </p>
              )}
            </div>
            {threads.length > 0 && (
              <div className="mt-8">
                <Meta>Discussed this week</Meta>
                <ul className="mt-3 space-y-3">
                  {threads.slice(0, 4).map((t) => (
                    <li key={t.id}>
                      <Link href={`/student/community/forums/${t.id}`} className="text-sm font-medium hover:underline" style={{ color: "var(--text)" }}>{t.title}</Link>
                      <p className="meta mt-0.5">▲{t.upvote_count} · {t.reply_count} replies</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        </div>
      </main>
    </AppShell>
  );
}
