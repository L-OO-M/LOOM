import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { PageHeader, Card, Stat } from "@/components/ui";
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
  const [{ followingN = 0 } = {}] = await sql`SELECT COUNT(*)::int AS followingN FROM followers WHERE follower_id = ${card.user_id}`;
  const skills = await sql`SELECT skill, COUNT(*)::int AS n FROM user_endorsements WHERE endorsee_id = ${card.user_id} GROUP BY skill ORDER BY n DESC LIMIT 8`;
  const [isFollowing] = card.user_id === user.id ? [true] : await sql`SELECT id FROM followers WHERE follower_id = ${user.id} AND following_id = ${card.user_id} LIMIT 1`;
  const achievements = await sql`
    SELECT a.*, b.name AS badge_name FROM student_achievements a
    LEFT JOIN skill_badges b ON b.id = a.badge_id
    WHERE a.student_id = ${card.user_id} ORDER BY a.earned_at DESC LIMIT 6
  `;
  const isSelf = card.user_id === user.id;
  const links = card.social_links || {};

  return (
    <AppShell area="student" tenant={tenant} user={user}>
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <PageHeader kicker={card.primary_domain || profile?.primary_domain || "student"} title={profile?.name || card.username}
          desc={`@${card.username}${card.location ? ` · ${card.location}` : ""}`}
          action={!isSelf ? <FollowButton username={card.username} initial={!!isFollowing} /> : null} />
        {card.bio && <p className="mb-6 text-sm leading-6" style={{ color: "var(--text-muted)" }}>{card.bio}</p>}

        <div className="grid grid-cols-3 gap-3">
          <Stat label="Reputation" value={rep.score} />
          <Stat label="Followers" value={followers} />
          <Stat label="Following" value={followingN} />
        </div>

        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          <Card>
            <h2 className="font-medium" style={{ color: "var(--text)" }}>Proof</h2>
            <ul className="mt-2 space-y-1 text-sm" style={{ color: "var(--text-muted)" }}>
              <li>{rep.achievements} achievements · {rep.ossVerified} verified OSS merges</li>
              <li>{rep.solutions} forum solutions · {rep.wikiPages} wiki pages</li>
              <li>{rep.eventsAttended} events attended</li>
            </ul>
            {achievements.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {achievements.map((a) => (
                  <span key={a.id} className="rounded-full border px-2.5 py-1 text-xs capitalize" style={{ borderColor: "var(--line)", color: "var(--text)" }}>
                    {a.badge_name || `${a.source_type} · ${a.source_ref || "manual"}`}
                  </span>
                ))}
              </div>
            )}
            <div className="mt-3 flex flex-wrap gap-3 text-sm">
              {links.github && <a href={links.github} target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>GitHub ↗</a>}
              {links.linkedin && <a href={links.linkedin} target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>LinkedIn ↗</a>}
            </div>
          </Card>
          <Card>
            <h2 className="font-medium" style={{ color: "var(--text)" }}>Endorsements ({rep.endorsements})</h2>
            {skills.length === 0 ? (
              <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>No endorsements yet.</p>
            ) : (
              <ul className="mt-2 space-y-1 text-sm">
                {skills.map((s) => (
                  <li key={s.skill} className="flex justify-between gap-2">
                    <span style={{ color: "var(--text)" }}>{s.skill}</span>
                    <span className="font-mono" style={{ color: "var(--text-muted)" }}>×{s.n}</span>
                  </li>
                ))}
              </ul>
            )}
            {!isSelf && <EndorseForm username={card.username} />}
          </Card>
        </div>

        {isSelf && (
          <Card className="mt-6">
            <h2 className="font-medium" style={{ color: "var(--text)" }}>Edit your card</h2>
            <ProfileEditor initial={card} />
          </Card>
        )}
        <p className="mt-6 text-xs" style={{ color: "var(--text-muted)" }}>
          <Link href="/student/discover" style={{ color: "var(--accent)" }}>← Discover</Link>
        </p>
      </main>
    </AppShell>
  );
}
