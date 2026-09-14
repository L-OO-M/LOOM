import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { Display, Meta, PlainStat, ActionLink } from "@/components/loom/primitives";
import { Timeline, TimelineItem } from "@/components/loom/Timeline";
import { reputationFor } from "@/lib/reputation";
import { ProfileEditor, FollowButton, EndorseForm } from "./ProfileBits";

export const dynamic = "force-dynamic";

export default async function PublicProfilePage({ params }) {
  const ctx = await getRequestContext();
  if (ctx.error) redirect("/login");
  const { user, tenant, sql } = ctx;
  const { username } = await params;

  const [card] = await sql`SELECT * FROM user_profiles WHERE username = ${username.trim().toLowerCase()} LIMIT 1`;
  if (!card || (!card.is_public && card.user_id !== user.id)) notFound();
  // Chapter privacy: only same-chapter members (or the owner) may view.
  if (card.tenant_id && card.tenant_id !== tenant?.id && card.user_id !== user.id) notFound();

  const [profile] = await sql`SELECT name, primary_domain FROM profiles WHERE user_id = ${card.user_id} LIMIT 1`;
  const rep = await reputationFor(sql, card.user_id).catch(() => ({ score: 0, achievements: 0, ossVerified: 0, solutions: 0, wikiPages: 0, eventsAttended: 0, endorsements: 0 }));
  const [{ followers = 0 } = {}] = await sql`SELECT COUNT(*)::int AS followers FROM followers WHERE following_id = ${card.user_id}`;
  const skills = await sql`SELECT skill, COUNT(*)::int AS n FROM user_endorsements WHERE endorsee_id = ${card.user_id} GROUP BY skill ORDER BY n DESC LIMIT 8`;
  const [isFollowing] = card.user_id === user.id ? [true] : await sql`SELECT id FROM followers WHERE follower_id = ${user.id} AND following_id = ${card.user_id} LIMIT 1`;
  const achievements = await sql`
    SELECT a.*, b.name AS badge_name FROM student_achievements a
    LEFT JOIN skill_badges b ON b.id = a.badge_id
    WHERE a.student_id = ${card.user_id} ORDER BY a.earned_at DESC LIMIT 6
  `;
  const latestProject = await sql`SELECT id, title FROM projects WHERE owner_id = ${card.user_id} ORDER BY created_at DESC LIMIT 1`;
  const isSelf = card.user_id === user.id;
  const links = card.social_links || {};

  return (
    <AppShell area="student" tenant={tenant} user={user}>
      <main className="mx-auto max-w-3xl px-4 sm:px-6">
        <Link href="/student/discover" className="meta hover:underline" style={{ color: "var(--accent)" }}>← Discover</Link>
        <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
          <div>
            <Meta>{card.primary_domain || profile?.primary_domain || "student"}{card.location ? ` · ${card.location}` : ""}</Meta>
            <Display size="lg" className="mt-3">{profile?.name || card.username}</Display>
            <p className="meta mt-2">@{card.username}</p>
          </div>
          {!isSelf && <FollowButton username={card.username} initial={!!isFollowing} />}
        </div>
        {card.bio && <p className="lede mt-5">{card.bio}</p>}
        {latestProject[0] && (
          <p className="mt-4 text-sm" style={{ color: "var(--text-muted)" }}>
            Building: <Link href={`/student/projects/${latestProject[0].id}`} className="font-semibold hover:underline" style={{ color: "var(--text)" }}>{latestProject[0].title}</Link>
          </p>
        )}

        <div className="mt-8 grid grid-cols-3 gap-6 border-y py-6" style={{ borderColor: "var(--line)" }}>
          <PlainStat value={rep.score} unit="" label="reputation" />
          <PlainStat value={followers} unit="" label="followers" />
          <PlainStat value={rep.ossVerified} unit="" label="verified merges" />
        </div>

        <div className="mt-10 grid gap-10 sm:grid-cols-2">
          <section aria-label="Proof">
            <Meta>The proof</Meta>
            {achievements.length === 0 ? (
              <p className="narrative mt-3">{rep.solutions} solutions · {rep.wikiPages} wiki pages · {rep.eventsAttended} events attended. Badges land here as they're earned.</p>
            ) : (
              <Timeline className="mt-4">
                {achievements.map((a) => (
                  <TimelineItem
                    key={a.id}
                    state="done"
                    title={a.badge_name || `${a.source_type} achievement`}
                    meta={new Date(a.earned_at).toLocaleDateString("en-IN", { month: "short", year: "numeric" })}
                  />
                ))}
              </Timeline>
            )}
            <div className="mt-4 flex flex-wrap gap-4 text-sm">
              {links.github && <a href={links.github} target="_blank" rel="noreferrer" className="font-semibold hover:underline" style={{ color: "var(--accent)" }}>GitHub ↗</a>}
              {links.linkedin && <a href={links.linkedin} target="_blank" rel="noreferrer" className="font-semibold hover:underline" style={{ color: "var(--accent)" }}>LinkedIn ↗</a>}
            </div>
          </section>
          <section aria-label="Endorsements">
            <Meta>Endorsed for · {rep.endorsements}</Meta>
            {skills.length === 0 ? (
              <p className="narrative mt-3">No endorsements yet.</p>
            ) : (
              <ul className="mt-4 space-y-2.5">
                {skills.map((s) => (
                  <li key={s.skill}>
                    <div className="flex justify-between text-sm"><span style={{ color: "var(--text)" }}>{s.skill}</span><span className="font-mono" style={{ color: "var(--text-muted)" }}>×{s.n}</span></div>
                    <div className="mt-1 h-1 overflow-hidden rounded-full" style={{ background: "var(--bg-muted)" }}>
                      <div className="h-full rounded-full" style={{ width: `${Math.min(100, s.n * 25)}%`, background: "var(--accent)" }} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {!isSelf && <div className="mt-4"><EndorseForm username={card.username} /></div>}
          </section>
        </div>

        {isSelf && (
          <section className="mt-12 border-t pt-8" style={{ borderColor: "var(--line)" }} aria-label="Edit your card">
            <Meta>Yours to tend</Meta>
            <h2 className="h-product mt-2">Edit your card</h2>
            <div className="mt-4"><ProfileEditor initial={card} /></div>
          </section>
        )}
      </main>
    </AppShell>
  );
}
