import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { reputationFor } from "@/lib/reputation";
import { absoluteUrl } from "@/lib/seo";
import { domainLabel } from "@/lib/builderCard";
import { folioNumber, roleLabel } from "@/lib/profileFolio";
import { ProfileEditor, FollowButton, EndorseForm, EndorsementManager } from "./ProfileBits";
import { ProfileSections } from "@/components/profile/ProfileSections";
import { FolioCover } from "@/components/profile/FolioCover";
import { FolioRail } from "@/components/profile/FolioRail";
import { FolioThread } from "@/components/profile/FolioThread";
import { ShareSheet } from "@/components/profile/ShareSheet";
import "@/components/profile/folio.css";

export const dynamic = "force-dynamic";

export default async function PublicProfilePage({ params }) {
  const ctx = await getRequestContext();
  if (ctx.error) redirect("/login");
  const { user, tenant, sql } = ctx;
  const role = ctx.profile?.role;
  const isOperator = ["dept_lead", "vertical_lead", "admin", "platform_admin"].includes(role);
  const isAdmin = ["admin", "platform_admin"].includes(role);
  const { username } = await params;

  const [card] = await sql`SELECT * FROM user_profiles WHERE username = ${username.trim().toLowerCase()} LIMIT 1`;
  if (!card || (!card.is_public && card.user_id !== user.id)) notFound();
  // Chapter privacy: only same-chapter members (or the owner) may view.
  if (card.tenant_id && card.tenant_id !== tenant?.id && card.user_id !== user.id) notFound();

  const [profile] = await sql`
    SELECT name, primary_domain, role, branch, year, vertical, role_term_end
    FROM profiles WHERE user_id = ${card.user_id} LIMIT 1`;
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
  const showOperator = isOperator && !isSelf;
  const operatorMemberships = showOperator
    ? await sql`
        SELECT d.name, d.slug FROM department_memberships m
        JOIN departments d ON d.id = m.department_id
        WHERE m.user_id = ${card.user_id} ORDER BY d.name`
    : [];
  // Opt-out: a member may hide endorsements from their public card. The owner
  // still sees them (and can remove individual ones).
  const showEndorsements = isSelf || card.endorsements_visible !== false;
  const endorsements = isSelf
    ? await sql`SELECT e.id, e.skill, p.name AS endorser_name FROM user_endorsements e LEFT JOIN profiles p ON p.user_id = e.endorser_id WHERE e.endorsee_id = ${card.user_id} ORDER BY e.endorsed_at DESC LIMIT 25`
    : [];
  const links = card.social_links || {};
  const displayName = profile?.name || card.username;
  const cleanUsername = String(card.username).toLowerCase();
  const publicUrl = absoluteUrl(`/u/${cleanUsername}`).replace(/\/$/, "");
  const proofCounts = [
    rep.solutions > 0 ? `${rep.solutions} solution${rep.solutions === 1 ? "" : "s"}` : null,
    rep.wikiPages > 0 ? `${rep.wikiPages} wiki page${rep.wikiPages === 1 ? "" : "s"}` : null,
    rep.eventsAttended > 0 ? `${rep.eventsAttended} event${rep.eventsAttended === 1 ? "" : "s"}` : null
  ].filter(Boolean);

  const exploreLinks = [
    { href: `/student/projects?owner=${card.user_id}`, label: "Projects" },
    { href: "/student/credentials", label: "Proofs" },
    { href: "/student/network", label: "Network" },
    { href: "/student/leaderboard", label: "Where they stand" },
    ...(rep.ossVerified > 0 ? [{ href: "/student/opensource", label: "Open-source proof" }] : []),
    { href: "/student/community", label: "Community" },
    { href: "/student/mentorship", label: guideRows.length > 0 ? "Learn from them" : "Find a guide" }
  ];

  const coverActions = isSelf ? (
    <>
      {card.is_public ? (
        <a className="btn-ink" href={`/u/${cleanUsername}`} target="_blank" rel="noreferrer">
          View public card ↗
        </a>
      ) : null}
      <a className="btn-ghost" href="#tend">Edit my card</a>
    </>
  ) : (
    <>
      <FollowButton username={card.username} initial={!!isFollowing} />
      {card.is_public ? <a className="btn-ghost" href="#share">Share</a> : null}
      {showEndorsements ? <a className="btn-ghost" href="#known-for-heading">Endorse a skill</a> : null}
    </>
  );

  const shareCard = card.is_public ? (
    <ShareSheet username={cleanUsername} name={displayName} url={publicUrl} score={rep.score} />
  ) : (
    <div className="folio-rail-card">
      <h3>Private folio</h3>
      <p className="folio-note">
        Only you can see this card right now. Turn on “Public profile” below and
        your link and share card become available.
      </p>
    </div>
  );

  const operator = showOperator ? (
    <section className="folio-operator" aria-labelledby="operator-heading">
      <div className="folio-operator-head">
        <h2 id="operator-heading">Chapter record</h2>
        {isAdmin ? (
          <Link href={`/admin/students/${card.user_id}`} prefetch={false} className="font-semibold hover:underline" style={{ color: "var(--accent)", fontSize: "0.72rem" }}>
            Admin record ↗
          </Link>
        ) : (
          <span className="folio-section-note">Visible to chapter leads</span>
        )}
      </div>
      <p>Operator context, kept separate from the public folio. Private activity stays in the console.</p>
      <dl>
        <div>
          <dt>Role</dt>
          <dd>{roleLabel(profile?.role)}</dd>
        </div>
        <div>
          <dt>Term ends</dt>
          <dd>{profile?.role_term_end ? new Date(profile.role_term_end).toLocaleDateString("en-IN", { month: "short", year: "numeric" }) : "—"}</dd>
        </div>
        <div>
          <dt>Branch</dt>
          <dd>{profile?.branch || "—"}</dd>
        </div>
        <div>
          <dt>Year</dt>
          <dd>{profile?.year ? `Year ${profile.year}` : "—"}</dd>
        </div>
        <div>
          <dt>Vertical</dt>
          <dd>{profile?.vertical ? String(profile.vertical).replaceAll("_", " ") : "—"}</dd>
        </div>
        <div>
          <dt>Departments</dt>
          <dd>{operatorMemberships.length > 0 ? operatorMemberships.map((m) => m.name).join(", ") : "—"}</dd>
        </div>
      </dl>
    </section>
  ) : null;

  return (
    <AppShell area="student" tenant={tenant} user={user}>
      <main className="folio">
        <div className="folio-topline">
          <Link href="/student/discover" prefetch={false} className="hover:underline">← Discover</Link>
          <span aria-hidden="true">·</span>
          <span>Profile</span>
          {isSelf && <span>· This is your folio</span>}
        </div>

        <FolioCover
          name={displayName}
          username={cleanUsername}
          avatarUrl={card.avatar_url}
          domain={domainLabel(card.primary_domain || profile?.primary_domain)}
          location={card.location || ""}
          bio={card.bio || ""}
          isGuide={guideRows.length > 0}
          folio={folioNumber(cleanUsername)}
          actions={coverActions}
          note={isSelf ? (
            <div className="folio-self-note">
              <strong>Your card</strong>
              <span>This is what others see. {card.is_public ? "Share it, or edit it below." : "It is private until you publish it."}</span>
            </div>
          ) : null}
          emptyBio={isSelf ? "No bio yet — add a line about what you are building below." : "No bio yet — this builder hasn't written one."}
        />

        <div className="folio-body">
          <FolioThread className="folio-main">
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
          </FolioThread>

          <FolioRail
            rep={rep}
            followers={followers}
            share={shareCard}
            links={exploreLinks}
            operator={operator}
          />
        </div>

        {isSelf && (
          <details className="folio-tend" id="tend">
            <summary>
              <strong>Edit your card</strong>
              <span>Handle, bio, links, visibility — changes go live immediately.</span>
            </summary>
            <div className="folio-tend-body">
              <ProfileEditor initial={card} name={displayName} canPhoto={isOperator} />
            </div>
          </details>
        )}
      </main>
    </AppShell>
  );
}
