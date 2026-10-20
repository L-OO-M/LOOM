import Link from "next/link";
import { notFound } from "next/navigation";
import { getSql } from "@/lib/db";
import { reputationFor } from "@/lib/reputation";
import { absoluteUrl } from "@/lib/seo";
import { BrandMark } from "@/components/BrandMark";
import { AppShell } from "@/components/AppShell";
import { getSessionIdentity } from "@/lib/auth-server";
import { Display, Meta, PlainStat } from "@/components/loom/primitives";
import { Timeline, TimelineItem } from "@/components/loom/Timeline";
import { initials, domainLabel } from "@/lib/builderCard";
import { JsonLd, breadcrumbSchema, profilePageSchema } from "@/components/seo/JsonLd";
import ShareButtons from "./ShareButtons";

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
      title: `${name} — L.O.O.M.`,
      description: card.bio
        || `${name} on L.O.O.M. — ${domainLabel(profile?.primary_domain)}. Proof, projects and reputation.`,
      openGraph: {
        title: `${name} — L.O.O.M.`,
        description: card.bio?.slice(0, 160) || `Builder @${card.username} on L.O.O.M.`,
        url: absoluteUrl(`/u/${clean}`),
        images: [{ url: absoluteUrl(`/u/${clean}/opengraph-image`), width: 1200, height: 630, alt: `${name} — L.O.O.M.` }]
      },
      twitter: {
        card: "summary_large_image",
        title: `${name} — L.O.O.M.`,
        images: [absoluteUrl(`/u/${clean}/opengraph-image`)]
      },
      alternates: { canonical: absoluteUrl(`/u/${clean}`) }
    };
  } catch {
    return { title: "L.O.O.M. Builder" };
  }
}

/** The whole card. One implementation, rendered in either shell. */
function CardBody({ card, profile, displayName, url, rep, followers, skills, achievements, proofCounts, latestProject, isGuide, isOwn, showEndorsements = true }) {
  return (
    <div className="mx-auto max-w-5xl px-4 pb-14 sm:px-6">
      {isOwn && (
        <p className="meta flex flex-wrap items-center gap-2">
          <span className="rounded-full px-2 py-0.5 text-[10px] font-bold"
            style={{ background: "var(--accent)", color: "var(--bg)" }}>
            YOUR CARD
          </span>
          <span>This is exactly what others see when they open {url}</span>
          <Link href={`/student/${card.username}`} prefetch={false}
            className="font-semibold hover:underline" style={{ color: "var(--accent)" }}>
            Edit
          </Link>
        </p>
      )}

      {/* Identity */}
      <div className="mt-6 flex flex-wrap items-start gap-5 sm:flex-nowrap">
        <span
          className="grid size-[76px] shrink-0 place-items-center rounded-full text-lg font-bold"
          style={{
            background: "color-mix(in srgb, var(--accent) 16%, var(--bg-muted))",
            color: "var(--accent)",
            boxShadow: "inset 0 0 0 1px color-mix(in srgb, var(--accent) 30%, transparent)"
          }}
        >
          {initials(displayName)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="mono-tag flex flex-wrap items-center gap-2">
            @{String(card.username).toLowerCase()}
            {isGuide && (
              <span className="rounded-full border px-2 py-0.5"
                style={{ borderColor: "var(--accent)", color: "var(--accent)" }}>
                Guide
              </span>
            )}
          </p>
          <Display size="lg" className="mt-1 break-words">{displayName}</Display>
          <p className="meta mt-1">
            {domainLabel(card.primary_domain || profile?.primary_domain)}
            {card.location ? ` · ${card.location}` : ""}
          </p>
          {card.bio ? (
            <p className="narrative mt-4 max-w-xl" style={{ color: "var(--text)" }}>{card.bio}</p>
          ) : (
            <p className="narrative mt-4 max-w-xl">
              No bio yet — a member can add one on their own card.
            </p>
          )}
          <div className="mt-4">
            <ShareButtons
              username={String(card.username).toLowerCase()}
              name={displayName}
              url={url}
              score={rep.score}
            />
          </div>
        </div>
      </div>

      {/* Proof at a glance */}
      <div className="mt-8 grid grid-cols-2 gap-6 border-y py-6 sm:grid-cols-4" style={{ borderColor: "var(--line)" }}>
        <PlainStat value={rep.score} unit="" label="reputation" />
        <PlainStat value={followers} unit="" label="followers" />
        <PlainStat value={rep.ossVerified} unit="" label="verified merges" />
        <PlainStat value={achievements.length} unit="" label="proofs" />
      </div>

      {latestProject[0] && (
        <section aria-labelledby="building-heading" className="mt-8">
          <h2 id="building-heading" className="meta">Building</h2>
          <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>
            Latest:{" "}
            {/* This CardBody renders for signed-out and non-owner viewers, so the
                latest project is named but not linked. The project detail route is
                authenticated; linking it here sent crawlers and visitors to login. */}
            <span className="font-semibold" style={{ color: "var(--text)" }}>
              {latestProject[0].title}
            </span>
          </p>
        </section>
      )}

      <div className="mt-10 grid gap-10 sm:grid-cols-2">
        <section aria-labelledby="proof-heading">
          <h2 id="proof-heading" className="meta">The proof</h2>
          {achievements.length === 0 ? (
            <p className="narrative mt-3">
              {proofCounts.length > 0
                ? `${proofCounts.join(" · ")}.`
                : "No proof recorded yet."}{" "}
              Badges land here as they are earned.
            </p>
          ) : (
            <Timeline className="mt-4">
              {achievements.map((a) => (
                <TimelineItem
                  key={a.id}
                  state="done"
                  title={a.badge_name || `${a.source_type} achievement`}
                  meta={new Date(a.earned_at).toLocaleDateString("en-IN", { month: "short", year: "numeric" })}
                  action={a.credential_id ? (
                    <a href={`/verify/credential/${a.credential_id}`} className="text-xs font-semibold hover:underline" style={{ color: "var(--accent)" }}>
                      Verify
                    </a>
                  ) : undefined}
                />
              ))}
            </Timeline>
          )}
        </section>

        <section aria-labelledby="known-for-heading">
          <h2 id="known-for-heading" className="meta">{showEndorsements ? `Known for · ${rep.endorsements}` : "Known for"}</h2>
          {!showEndorsements ? (
            <p className="narrative mt-3">This member has hidden their endorsements.</p>
          ) : skills.length === 0 ? (
            <p className="narrative mt-3">No endorsements yet — vouch for a skill you have seen in action.</p>
          ) : (
            <ul className="mt-4 space-y-2.5">
              {skills.map((s) => (
                <li key={s.skill}>
                  <div className="flex justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate" style={{ color: "var(--text)" }}>{s.skill}</span>
                    <span className="shrink-0 font-mono" style={{ color: "var(--text-muted)" }}>×{s.n}</span>
                  </div>
                  <div className="mt-1 h-1 overflow-hidden rounded-full" style={{ background: "var(--bg-muted)" }}>
                    <div className="h-full rounded-full"
                      style={{ width: `${Math.min(100, s.n * 25)}%`, background: "var(--accent)" }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
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
    rep.solutions > 0 ? `${rep.solutions} solutions` : null,
    rep.wikiPages > 0 ? `${rep.wikiPages} wiki` : null,
    rep.eventsAttended > 0 ? `${rep.eventsAttended} events` : null
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
    <main className="min-h-[100dvh]" style={{ background: "var(--bg)" }}>
      <header className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 sm:px-6">
        <BrandMark size={28} href="/" />
        {viewer ? (
          <Link href="/student" prefetch={false} className="btn-ghost !py-2 text-sm">Back to L.O.O.M.</Link>
        ) : (
          <Link href="/register" prefetch={false} className="btn-ink !py-2 text-sm">Join L.O.O.M.</Link>
        )}
      </header>

      <div>{body}</div>

      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="flex flex-wrap gap-3 border-t pt-6" style={{ borderColor: "var(--line)" }}>
          <Link href="/register" prefetch={false} className="btn-ink">Create your card →</Link>
          <Link href="/about" prefetch={false} className="btn-ghost">What is L.O.O.M.?</Link>
        </div>
      </div>
    </main>
  );
}
