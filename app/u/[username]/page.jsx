import Link from "next/link";
import { notFound } from "next/navigation";
import { getSql } from "@/lib/db";
import { reputationFor } from "@/lib/reputation";
import { absoluteUrl } from "@/lib/seo";
import { AppShell } from "@/components/AppShell";
import { getSessionIdentity } from "@/lib/auth-server";
import { ProfileSections } from "@/components/profile/ProfileSections";
import { FolioCover } from "@/components/profile/FolioCover";
import { FolioRail } from "@/components/profile/FolioRail";
import { FolioThread } from "@/components/profile/FolioThread";
import { ShareSheet } from "@/components/profile/ShareSheet";
import { domainLabel } from "@/lib/builderCard";
import { folioNumber } from "@/lib/profileFolio";
import { JsonLd, breadcrumbSchema, profilePageSchema } from "@/components/seo/JsonLd";
import "@/components/profile/folio.css";

export const revalidate = 300;

export async function generateMetadata({ params }) {
  const { username } = await params;
  const clean = String(username).trim().toLowerCase();
  try {
    const sql = getSql();
    const [card] = await sql`
      SELECT username, bio, is_public FROM user_profiles WHERE username = ${clean} LIMIT 1`;
    if (!card || !card.is_public) return { title: "Profile not found" };
    const [profile] = await sql`
      SELECT name, primary_domain FROM profiles
      WHERE user_id = (SELECT user_id FROM user_profiles WHERE username = ${clean} LIMIT 1) LIMIT 1`;
    const name = profile?.name || card.username;
    return {
      title: `${name} — LOOM`,
      description: card.bio
        || `${name} on LOOM — ${domainLabel(profile?.primary_domain)}. Proof, projects and reputation.`,
      openGraph: {
        title: `${name} — LOOM`,
        description: card.bio?.slice(0, 160) || `Builder @${card.username} on LOOM`,
        url: absoluteUrl(`/u/${clean}`),
        images: [{ url: absoluteUrl(`/u/${clean}/opengraph-image`), width: 1200, height: 630, alt: `${name} — LOOM` }]
      },
      twitter: {
        card: "summary_large_image",
        title: `${name} — LOOM`,
        images: [absoluteUrl(`/u/${clean}/opengraph-image`)]
      },
      alternates: { canonical: absoluteUrl(`/u/${clean}`) }
    };
  } catch {
    return { title: "LOOM Builder" };
  }
}

function AtAGlance({ rep, followers }) {
  return (
    <section aria-labelledby="glance-heading" className="folio-section">
      <div className="folio-section-head">
        <h2 id="glance-heading">At a glance</h2>
        <span className="folio-section-note">Read from the record</span>
      </div>
      <div className="folio-stats">
        <div className="folio-stat">
          <span className="folio-stat-value">{rep.score}</span>
          <span className="folio-stat-label">Proof score</span>
        </div>
        <div className="folio-stat">
          <span className="folio-stat-value">{followers}</span>
          <span className="folio-stat-label">Followers</span>
        </div>
        <div className="folio-stat">
          <span className="folio-stat-value">{rep.ossVerified}</span>
          <span className="folio-stat-label">Verified merges</span>
        </div>
        <div className="folio-stat">
          <span className="folio-stat-value">{rep.achievements}</span>
          <span className="folio-stat-label">Proofs</span>
        </div>
      </div>
    </section>
  );
}

function CardBody({ card, profile, displayName, url, rep, followers, skills, achievements, proofCounts, latestProject, isGuide, isOwn, showEndorsements = true }) {
  const clean = String(card.username).toLowerCase();
  const links = isOwn
    ? [
        { href: `/student/${clean}`, label: "Edit your card" },
        { href: "/student", label: "Your workspace" },
        { href: "/student/settings", label: "Account settings" }
      ]
    : [
        { href: "/about", label: "What is LOOM?" },
        { href: "/events", label: "Browse events" },
        { href: "/faq", label: "FAQ" },
        { href: "/register", label: "Create your card" }
      ];

  return (
    <div className="folio">
      {isOwn && (
        <div className="folio-topline">
          <span>Public card</span>
          <span aria-hidden="true">·</span>
          <span>This is exactly what others see</span>
          <Link href={`/student/${clean}`} prefetch={false} className="hover:underline">Edit</Link>
        </div>
      )}

      <FolioCover
        name={displayName}
        username={clean}
        avatarUrl={card.avatar_url}
        domain={domainLabel(card.primary_domain || profile?.primary_domain)}
        location={card.location || ""}
        bio={card.bio || ""}
        isGuide={isGuide}
        folio={folioNumber(clean)}
        actions={isOwn ? (
          <>
            <Link href={`/student/${clean}`} prefetch={false} className="btn-ink">Edit your card</Link>
            <a href="#share" className="btn-ghost">Share</a>
          </>
        ) : (
          <>
            <a href="#share" className="btn-ink">Share this card</a>
            <Link href="/register" prefetch={false} className="btn-ghost">Create your card</Link>
          </>
        )}
        note={isOwn ? (
          <div className="folio-self-note">
            <strong>Your card</strong>
            <span>This page is public and crawlable. Edit it from your workspace.</span>
          </div>
        ) : null}
        emptyBio={isOwn ? "No bio yet — add a line from your workspace." : "No bio yet — this builder hasn't written one."}
      />

      <div className="folio-body">
        <FolioThread className="folio-main">
          <AtAGlance rep={rep} followers={followers} />
          <ProfileSections
            achievements={achievements}
            proofCounts={proofCounts}
            skills={skills}
            endorsementCount={rep.endorsements}
            latestProject={latestProject}
            showEndorsements={showEndorsements}
            proofAction={(a) => a.credential_id ? (
              <a href={`/verify/credential/${a.credential_id}`} className="text-xs font-semibold hover:underline" style={{ color: "var(--accent)" }}>
                Verify ↗
              </a>
            ) : undefined}
          />
        </FolioThread>

        <FolioRail
          rep={rep}
          followers={followers}
          showScore={false}
          share={(
            <div id="share">
              <ShareSheet username={clean} name={displayName} url={url} score={rep.score} />
            </div>
          )}
          links={links}
        />
      </div>
    </div>
  );
}

export default async function PublicProfilePage({ params }) {
  const { username } = await params;
  const clean = String(username).trim().toLowerCase();
  const sql = getSql();

  const [card] = await sql`SELECT * FROM user_profiles WHERE username = ${clean} LIMIT 1`;
  if (!card || !card.is_public) notFound();

  const [profile] = await sql`SELECT name, primary_domain FROM profiles WHERE user_id = ${card.user_id} LIMIT 1`;
  const rep = await reputationFor(sql, card.user_id).catch(() => ({
    score: 0, achievements: 0, ossVerified: 0, solutions: 0, wikiPages: 0, eventsAttended: 0, endorsements: 0
  }));
  const [{ followers = 0 } = {}] = await sql`
    SELECT COUNT(*)::int AS followers FROM followers WHERE following_id = ${card.user_id}`;
  const skills = await sql`
    SELECT skill, COUNT(*)::int AS n FROM user_endorsements
    WHERE endorsee_id = ${card.user_id} GROUP BY skill ORDER BY n DESC LIMIT 8`;
  const achievements = await sql`
    SELECT a.*, b.name AS badge_name,
      (SELECT v.id FROM verifiable_credentials v
        WHERE v.achievement_id = a.id AND v.student_id = a.student_id
        ORDER BY v.issued_at DESC LIMIT 1) AS credential_id
    FROM student_achievements a
    LEFT JOIN skill_badges b ON b.id = a.badge_id
    WHERE a.student_id = ${card.user_id} ORDER BY a.earned_at DESC LIMIT 6`;
  const latestProject = await sql`
    SELECT id, title FROM projects WHERE owner_id = ${card.user_id} ORDER BY created_at DESC LIMIT 1`;
  const [isGuide] = await sql`
    SELECT 1 FROM mentors WHERE user_id = ${card.user_id} AND available = true LIMIT 1`;

  const displayName = profile?.name || card.username;
  const url = absoluteUrl(`/u/${clean}`).replace(/\/$/, "");
  const proofCounts = [
    rep.solutions > 0 ? `${rep.solutions} solution${rep.solutions === 1 ? "" : "s"}` : null,
    rep.wikiPages > 0 ? `${rep.wikiPages} wiki page${rep.wikiPages === 1 ? "" : "s"}` : null,
    rep.eventsAttended > 0 ? `${rep.eventsAttended} event${rep.eventsAttended === 1 ? "" : "s"}` : null
  ].filter(Boolean);
  const skillNames = skills.map((s) => s.skill).filter(Boolean);
  const cardImage = absoluteUrl(`/u/${clean}/opengraph-image`);

  const body = (
    <>
      <JsonLd
        data={profilePageSchema({
          username: clean,
          name: displayName,
          description: card.bio || null,
          imageUrl: cardImage,
          skills: skillNames
        })}
      />
      <JsonLd
        data={breadcrumbSchema([
          { name: "Home", url: absoluteUrl("/") },
          { name: displayName, url }
        ])}
      />
      <CardBody
        card={card} profile={profile} displayName={displayName} url={url}
        rep={rep} followers={followers} skills={skills} achievements={achievements}
        proofCounts={proofCounts} latestProject={latestProject} isGuide={!!isGuide}
        isOwn={false} showEndorsements={card.endorsements_visible !== false}
      />
    </>
  );

  // The member viewing their own card keeps the app chrome so they can move
  // around; everyone else gets the public shell.
  let viewer = null;
  let viewerTenant = null;
  let isOwn = false;
  try {
    // Unified identity (Auth0 or the Supabase fallback). A Supabase-only read
    // meant an Auth0 session was treated as a logged-out visitor, so members
    // never saw their own card with app chrome.
    const identity = await getSessionIdentity();
    if (identity?.userId) {
      viewer = { id: identity.userId, email: identity.email };
      isOwn = card.user_id === identity.userId;
      const [p] = await sql`SELECT tenant_id FROM profiles WHERE user_id = ${identity.userId} LIMIT 1`;
      if (p?.tenant_id) {
        const [t] = await sql`SELECT * FROM tenants WHERE id = ${p.tenant_id} LIMIT 1`;
        viewerTenant = t || null;
      }
    }
  } catch {
    /* public page must never depend on the session */
  }

  if (viewer && isOwn) {
    return (
      <AppShell area="student" tenant={viewerTenant} user={viewer}>
        <main className="pt-4">
          <CardBody
            card={card} profile={profile} displayName={displayName} url={url}
            rep={rep} followers={followers} skills={skills} achievements={achievements}
            proofCounts={proofCounts} latestProject={latestProject} isGuide={!!isGuide}
            isOwn showEndorsements={card.endorsements_visible !== false}
          />
        </main>
      </AppShell>
    );
  }

  return (
    <main className="folio-public">
      {body}

      <section className="folio-public-cta" aria-labelledby="cta-heading">
        <div className="folio-public-cta-inner">
          <div>
            <p className="folio-section-note">A record, not a poster</p>
            <h2 id="cta-heading" className="mt-2 text-lg font-semibold" style={{ color: "var(--text)" }}>
              Build in public. Prove it. Share the folio.
            </h2>
            <p className="mt-2">
              LOOM turns verified work into a shareable builder record. No follower
              counts to buy, no proof to fake.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/register" prefetch={false} className="btn-ink">Create your card →</Link>
            <Link href="/about" prefetch={false} className="btn-ghost">What is LOOM?</Link>
          </div>
        </div>
      </section>
    </main>
  );
}
