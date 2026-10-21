import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { Display, Meta, PlainStat, ActionLink, StatusPill } from "@/components/loom/primitives";
import { reputationFor } from "@/lib/reputation";
import { absoluteUrl } from "@/lib/seo";
import { ProfileEditor, FollowButton, EndorseForm, EndorsementManager } from "./ProfileBits";
import ShareButtons from "@/app/u/[username]/ShareButtons";
import { ProfileSections } from "@/components/profile/ProfileSections";
import { PersonAvatar } from "@/components/loom/PersonAvatar";

export const dynamic = "force-dynamic";

export default async function PublicProfilePage({ params }) {
  const ctx = await getRequestContext();
  if (ctx.error) redirect("/login");
  const { user, tenant, sql } = ctx;
  const isLeadOrAbove = ["dept_lead", "vertical_lead", "admin", "platform_admin"].includes(ctx.profile?.role);
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
  // Opt-out: a member may hide endorsements from their public card. The owner
  // still sees them (and can remove individual ones).
  const showEndorsements = isSelf || card.endorsements_visible !== false;
  const endorsements = isSelf
    ? await sql`SELECT e.id, e.skill, p.name AS endorser_name FROM user_endorsements e LEFT JOIN profiles p ON p.user_id = e.endorser_id WHERE e.endorsee_id = ${card.user_id} ORDER BY e.endorsed_at DESC LIMIT 25`
    : [];
  const links = card.social_links || {};
  const displayName = profile?.name || card.username;
  const proofCounts = [
    rep.solutions > 0 ? `${rep.solutions} solution${rep.solutions === 1 ? "" : "s"}` : null,
    rep.wikiPages > 0 ? `${rep.wikiPages} wiki page${rep.wikiPages === 1 ? "" : "s"}` : null,
    rep.eventsAttended > 0 ? `${rep.eventsAttended} event${rep.eventsAttended === 1 ? "" : "s"}` : null
  ].filter(Boolean);

  return (
    <AppShell area="student" tenant={tenant} user={user}>
      <main className="mx-auto max-w-5xl px-4 sm:px-6">
        <Meta>Profile · Builder details</Meta>
        <Link href="/student/discover" prefetch={false} className="mono-tag mt-2 inline-block hover:underline" style={{ color: "var(--accent)" }}>← Discover</Link>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1.7fr_0.9fr]">
          <div className="flex min-w-0 items-start gap-5">
            <PersonAvatar name={displayName} avatarUrl={card.avatar_url} size={72} />
            <div className="min-w-0">
              <p className="mono-tag">@{String(card.username).toUpperCase()} · Handle</p>
              <Display size="lg" className="mt-1 break-words">{displayName}</Display>
              <p className="mono-tag mt-2">@{card.username}{guideRows.length > 0 && <span className="ml-2 rounded-full border px-2 py-0.5" style={{ borderColor: "var(--accent)", color: "var(--accent)" }}>Guide</span>}</p>
              <p className="meta mt-1">{card.primary_domain || profile?.primary_domain || "student"}{card.location ? ` · ${card.location}` : ""}</p>
              {!isSelf && <div className="mt-3"><FollowButton username={card.username} initial={!!isFollowing} /></div>}
              {card.bio && <p className="narrative mt-4 max-w-xl" style={{ color: "var(--text)" }}>{card.bio}</p>}
              {card.is_public && (
                <div className="mt-3">
                  <p className="meta">Public card: <Link href={`/u/${card.username}`} prefetch={false} className="font-semibold hover:underline" style={{ color: "var(--accent)" }}>loom.sh/u/{card.username} ↗</Link> · Share on Discord/Insta</p>
                  <div className="mt-2"><ShareButtons username={card.username} name={displayName} url={absoluteUrl(`/u/${card.username}`)} score={rep.score} /></div>
                </div>
              )}
            </div>
          </div>
          <div className="space-y-4">
            <div className="card-sheen rounded-[var(--radius-xl)] border p-5" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
              <p className="mono-tag flex items-center gap-1">Proof Score: <span className="rounded-full border px-1.5 py-0.5 text-[10px]" style={{ borderColor: "var(--line)" }}>ⓘ</span></p>
              <p className="figure-mono mt-2 text-3xl font-bold tabular-nums" style={{ color: "var(--text)" }}>{rep.score}</p>
              <p className="mono-tag mt-3">Earned skills</p>
              <p className="mt-2 flex flex-wrap gap-1.5">{skills.slice(0, 8).map((s)=> <span key={s.skill} className="grid size-6 place-items-center rounded-full text-[10px] font-bold" style={{ background: "var(--accent)", color: "#101314" }}>{String(s.skill).slice(0, 2).toUpperCase()}</span>)}{skills.length===0 && <span className="mono-tag">no endorsements yet</span>}</p>
              <p className="mono-tag mt-4">Connections</p>
              <p className="mono-tag mt-1" style={{ color: "var(--text-muted)" }}>{followers} follower{followers===1?"":"s"}{showEndorsements ? ` · ${rep.endorsements} endorsements` : ""}</p>
            </div>
          </div>
        </div>
        <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 border-y py-4" style={{ borderColor: "var(--line)" }}>
          <span className="text-sm font-semibold" style={{ color: "var(--text)" }}>Overview</span>
          <Link href={`/student/projects?owner=${card.user_id}`} prefetch={false} className="text-sm hover:underline" style={{ color: "var(--text-muted)" }}>Projects</Link>
          <Link href="/student/credentials" prefetch={false} className="text-sm hover:underline" style={{ color: "var(--text-muted)" }}>Proofs</Link>
          <Link href="/student/network" prefetch={false} className="text-sm hover:underline" style={{ color: "var(--text-muted)" }}>Network</Link>
        </div>

        {/* bio rendered in header card above */}

        <ProfileSections
          achievements={achievements}
          proofCounts={proofCounts}
          skills={skills}
          endorsementCount={rep.endorsements}
          latestProject={latestProject}
          showEndorsements={showEndorsements}
          projectHref={(p) => `/student/projects/${p.id}`}
          proofFooter={(
            <div className="mt-4 flex flex-wrap gap-4 text-sm">
              {links.github && <a href={links.github} target="_blank" rel="noreferrer" className="font-semibold hover:underline" style={{ color: "var(--accent)" }}>GitHub ↗</a>}
              {links.linkedin && <a href={links.linkedin} target="_blank" rel="noreferrer" className="font-semibold hover:underline" style={{ color: "var(--accent)" }}>LinkedIn ↗</a>}
            </div>
          )}
          endorsementFooter={(
            <>
              {isSelf && <EndorsementManager endorsements={endorsements} />}
              {!isSelf && showEndorsements && <div className="mt-4"><EndorseForm username={card.username} /></div>}
            </>
          )}
        />

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
            <div className="mt-4"><ProfileEditor initial={card} canPhoto={isLeadOrAbove} /></div>
          </section>
        )}
      </main>
    </AppShell>
  );
}
