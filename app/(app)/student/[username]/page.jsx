import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { Display, Meta, PlainStat, ActionLink, StatusPill } from "@/components/loom/primitives";
import { Timeline, TimelineItem } from "@/components/loom/Timeline";
import { reputationFor } from "@/lib/reputation";
import { ProfileEditor, FollowButton, EndorseForm } from "./ProfileBits";

export const dynamic = "force-dynamic";

function initialsFor(name) {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function avatarTint(name) {
  const s = name || "?";
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 4;
  return [
    { background: "color-mix(in srgb, var(--accent) 16%, transparent)", color: "var(--accent)" },
    { background: "color-mix(in srgb, var(--accent) 9%, transparent)", color: "var(--text)" },
    { background: "var(--bg-muted)", color: "var(--text)" },
    { background: "color-mix(in srgb, var(--accent) 22%, transparent)", color: "var(--text)" }
  ][h];
}

function PersonAvatar({ name, avatarUrl, size = 56 }) {
  if (avatarUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={avatarUrl} alt={`Portrait of ${name}`} width={size} height={size} className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />;
  }
  return (
    <span aria-hidden="true" className="grid shrink-0 place-items-center rounded-full text-lg font-bold" style={{ width: size, height: size, ...avatarTint(name) }}>
      {initialsFor(name)}
    </span>
  );
}

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
  const guideRows = await sql`SELECT expertise FROM mentors WHERE user_id = ${card.user_id} LIMIT 1`;
  const isSelf = card.user_id === user.id;
  const links = card.social_links || {};
  const displayName = profile?.name || card.username;
  const proofCounts = [
    rep.solutions > 0 ? `${rep.solutions} solution${rep.solutions === 1 ? "" : "s"}` : null,
    rep.wikiPages > 0 ? `${rep.wikiPages} wiki page${rep.wikiPages === 1 ? "" : "s"}` : null,
    rep.eventsAttended > 0 ? `${rep.eventsAttended} event${rep.eventsAttended === 1 ? "" : "s"}` : null
  ].filter(Boolean);

  return (
    <AppShell area="student" tenant={tenant} user={user}>
      <main className="mx-auto max-w-3xl px-4 sm:px-6">
        <Link href="/student/discover" prefetch={false} className="meta hover:underline" style={{ color: "var(--accent)" }}>← Discover</Link>

        <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-4">
            <PersonAvatar name={displayName} avatarUrl={card.avatar_url} />
            <div className="min-w-0">
              <Meta>{card.primary_domain || profile?.primary_domain || "student"}{card.location ? ` · ${card.location}` : ""}</Meta>
              <Display size="lg" className="mt-2 break-words">{displayName}</Display>
              <p className="meta mt-2 truncate">@{card.username}{guideRows.length > 0 && <> · <StatusPill>Guide</StatusPill></>}</p>
            </div>
          </div>
          {!isSelf && <FollowButton username={card.username} initial={!!isFollowing} />}
        </div>

        {card.bio && (
          <section aria-labelledby="about-heading" className="mt-6">
            <h2 id="about-heading" className="meta">About</h2>
            <p className="lede mt-2">{card.bio}</p>
          </section>
        )}

        {latestProject[0] && (
          <section aria-labelledby="building-heading" className="mt-8">
            <h2 id="building-heading" className="meta">Building</h2>
            <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>
              Latest: <Link href={`/student/projects/${latestProject[0].id}`} prefetch={false} className="font-semibold hover:underline" style={{ color: "var(--text)" }}>{latestProject[0].title}</Link>
            </p>
          </section>
        )}

        <div className="mt-8 grid grid-cols-3 gap-6 border-y py-6" style={{ borderColor: "var(--line)" }}>
          <PlainStat value={rep.score} unit="" label="reputation" />
          <PlainStat value={followers} unit="" label="followers" />
          <PlainStat value={rep.ossVerified} unit="" label="verified merges" />
        </div>

        <div className="mt-10 grid gap-10 sm:grid-cols-2">
          <section aria-labelledby="proof-heading">
            <h2 id="proof-heading" className="meta">The proof</h2>
            {achievements.length === 0 ? (
              <p className="narrative mt-3">
                {proofCounts.length > 0 ? `${proofCounts.join(" · ")}.` : "No proof recorded yet."}{" "}
                Badges land here as they&apos;re earned.
              </p>
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
          <section aria-labelledby="known-for-heading">
            <h2 id="known-for-heading" className="meta">Known for · {rep.endorsements}</h2>
            {skills.length === 0 ? (
              <p className="narrative mt-3">No endorsements yet — vouch for a skill you&apos;ve seen in action.</p>
            ) : (
              <ul className="mt-4 space-y-2.5">
                {skills.map((s) => (
                  <li key={s.skill}>
                    <div className="flex justify-between gap-2 text-sm"><span className="min-w-0 truncate" style={{ color: "var(--text)" }}>{s.skill}</span><span className="font-mono shrink-0" style={{ color: "var(--text-muted)" }}>×{s.n}</span></div>
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

        <section aria-labelledby="around-heading" className="mt-12 border-t pt-8" style={{ borderColor: "var(--line)" }}>
          <h2 id="around-heading" className="meta">Around LOOM</h2>
          <ul className="mt-4 space-y-3 text-sm">
            <li><ActionLink href="/student/leaderboard">Where they stand</ActionLink></li>
            {rep.ossVerified > 0 && <li><ActionLink href="/student/opensource">Their open-source proof</ActionLink></li>}
            <li><ActionLink href="/student/community">Their community</ActionLink></li>
            <li><ActionLink href="/student/mentorship">{guideRows.length > 0 ? "Learn from them" : "Find a guide"}</ActionLink></li>
          </ul>
        </section>

        {isSelf && (
          <section className="mt-12 border-t pt-8" style={{ borderColor: "var(--line)" }} aria-labelledby="edit-card-heading">
            <Meta>Yours to tend</Meta>
            <h2 id="edit-card-heading" className="h-product mt-2">Edit your card</h2>
            <div className="mt-4"><ProfileEditor initial={card} /></div>
          </section>
        )}
      </main>
    </AppShell>
  );
}
