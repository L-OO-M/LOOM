import { cache } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getSql } from "@/lib/db";
import { reputationFor } from "@/lib/reputation";
import { absoluteUrl, canonicalFor } from "@/lib/seo";
import { AppShell } from "@/components/AppShell";
import { getSessionIdentity } from "@/lib/auth-server";
import { ProfileSections } from "@/components/profile/ProfileSections";
import { FolioCover } from "@/components/profile/FolioCover";
import { FolioRail } from "@/components/profile/FolioRail";
import { FolioThread } from "@/components/profile/FolioThread";
import { ShareSheet } from "@/components/profile/ShareSheet";
import { Heatmap } from "@/components/loom/Heatmap";
import { summarizeActivity } from "@/lib/github-activity";
import { buildProof } from "@/lib/proof";
import { loadIdentityStatus } from "@/lib/identity";
import { domainLabel } from "@/lib/builderCard";
import {
  folioNumber,
  leetcodeStats,
  monthYear,
  normalizeGithubHandle,
  normalizeLeetCodeHandle,
  profileLinkList,
  socialLinksForDisplay
} from "@/lib/profileFolio";
import { JsonLd, breadcrumbSchema, profilePageSchema } from "@/components/seo/JsonLd";
import "@/components/profile/folio.css";

export const revalidate = 300;

const ACTIVITY_WINDOW_DAYS = 120;

function asInt(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/**
 * "At a glance" is the only place numbers are summarised, and every one of them
 * is filtered out when it is zero. An absent stat is left off the page rather
 * than printed as a confident 0.
 */
function glanceItems({ rep, followers, reposVerified, counts, projectCount }) {
  const items = [
    { key: "score", label: "Proof score", value: asInt(rep.score) },
    { key: "merges", label: "Merged PRs", value: counts.mergedPrs },
    { key: "solved", label: "LeetCode solved", value: counts.solvedProblems },
    { key: "days", label: "Active days", value: counts.activeDays },
    { key: "repos", label: "Repos verified", value: reposVerified },
    { key: "followers", label: "Followers", value: asInt(followers) },
    { key: "projects", label: "Projects", value: projectCount },
    { key: "certificates", label: "Certificates", value: counts.certificates }
  ];
  return items.filter((item, index) => index === 0 || item.value > 0).slice(0, 6);
}

function AtAGlance({ items }) {
  return (
    <section aria-labelledby="glance-heading" className="folio-section">
      <div className="folio-section-head">
        <h2 id="glance-heading">At a glance</h2>
        <span className="folio-section-note">Read from the record</span>
      </div>
      <div className="folio-stats">
        {items.map((item) => (
          <div className="folio-stat" key={item.key}>
            <span className="folio-stat-value">{item.value}</span>
            <span className="folio-stat-label">{item.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function GitHubActivity({ github, summary, rows, reposVerified }) {
  // `contributions` is the per-day max of webhook and calendar; `commits` alone
  // is invisible for a member whose work GitHub sees but no webhook recorded.
  const total = summary.contributions;
  const username = normalizeGithubHandle(github?.github_username);
  if (!username && total === 0) return null;
  return (
    <div className="folio-activity-block">
      <div className="folio-activity-head">
        <span className="folio-activity-title">
          GitHub{github?.verified || reposVerified > 0 ? " · verified" : ""}
        </span>
        <span className="folio-activity-note">
          {username ? `@${username}` : "Activity recorded by the webhook"}
        </span>
      </div>
      <Heatmap rows={rows} weeks={16} />
      <div className="folio-activity-rows">
        <div className="folio-activity-row">
          <span className="folio-activity-value">{summary.contributions}</span>
          <span className="folio-activity-label">Contributions</span>
        </div>
        <div className="folio-activity-row">
          <span className="folio-activity-value">{summary.pullRequests}</span>
          <span className="folio-activity-label">Pull requests</span>
        </div>
        <div className="folio-activity-row">
          <span className="folio-activity-value">{summary.reviews}</span>
          <span className="folio-activity-label">Reviews</span>
        </div>
        <div className="folio-activity-row">
          <span className="folio-activity-value">{summary.activeDays}</span>
          <span className="folio-activity-label">Active days</span>
        </div>
        <div className="folio-activity-row">
          <span className="folio-activity-value">{summary.currentStreak}</span>
          <span className="folio-activity-label">Day streak</span>
        </div>
      </div>
    </div>
  );
}

function LeetCodeActivity({ stats, username }) {
  if (!stats) return null;
  const bars = [
    { label: "Easy", solved: stats.easy, total: stats.totalEasy },
    { label: "Medium", solved: stats.medium, total: stats.totalMedium },
    { label: "Hard", solved: stats.hard, total: stats.totalHard }
  ].filter((b) => b.solved > 0 || b.total > 0);
  const calendarRows = Object.entries(stats.calendar || {})
    .map(([day, count]) => ({ day, count: Number(count) || 0 }))
    .filter((row) => row.count > 0);
  return (
    <div className="folio-activity-block">
      <div className="folio-activity-head">
        <span className="folio-activity-title">LeetCode</span>
        <span className="folio-activity-note">
          {username ? `@${username}` : "Synced from practice"}
          {stats.syncedAt ? ` · ${monthYear(stats.syncedAt)}` : ""}
        </span>
      </div>
      <div className="folio-activity-rows">
        <div className="folio-activity-row">
          <span className="folio-activity-value">{stats.total}</span>
          <span className="folio-activity-label">Solved</span>
        </div>
        {stats.ranking > 0 ? (
          <div className="folio-activity-row">
            <span className="folio-activity-value">#{stats.ranking}</span>
            <span className="folio-activity-label">Ranking</span>
          </div>
        ) : null}
        {stats.streak > 0 ? (
          <div className="folio-activity-row">
            <span className="folio-activity-value">{stats.streak}</span>
            <span className="folio-activity-label">Day streak</span>
          </div>
        ) : null}
      </div>
      {bars.length > 0 ? (
        <div className="folio-progress">
          {bars.map((bar) => {
            const percent = bar.total > 0 ? Math.min(100, Math.round((bar.solved / bar.total) * 100)) : 0;
            return (
              <div className="folio-progress-row" key={bar.label}>
                <span>{bar.label}</span>
                <span className="folio-progress-track" aria-hidden="true">
                  <span className="folio-progress-fill" style={{ width: `${percent}%`, display: "block" }} />
                </span>
                <span className="folio-progress-value">
                  {bar.total > 0 ? `${bar.solved} / ${bar.total}` : bar.solved}
                </span>
              </div>
            );
          })}
        </div>
      ) : null}
      {calendarRows.length > 0 ? (
        <div style={{ marginTop: "0.9rem" }}>
          <Heatmap rows={calendarRows} weeks={18} valueField="count" unit="submission" />
        </div>
      ) : null}
    </div>
  );
}

function ActivityBlock({ github, summary, rows, reposVerified, leetcode, leetcodeUsername }) {
  const leetcodeBlock = <LeetCodeActivity stats={leetcode} username={leetcodeUsername} />;
  const githubBlock = <GitHubActivity github={github} summary={summary} rows={rows} reposVerified={reposVerified} />;
  const hasAny = Boolean(leetcode) || summary.contributions > 0 || Boolean(github?.github_username);
  return (
    <div className="folio-activity">
      {githubBlock}
      {leetcodeBlock}
      {!hasAny ? (
        <p className="folio-empty">
          No synced code activity yet. Connect GitHub or practice once and this
          record fills itself — nothing to re-type.
        </p>
      ) : null}
    </div>
  );
}

function CardBody({
  card,
  profile,
  displayName,
  url,
  rep,
  followers,
  skills,
  projects,
  proofItems,
  proofCounts,
  glance,
  chips,
  profileLinks,
  activity,
  isGuide,
  isOwn,
  showEndorsements = true
}) {
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
        chips={chips}
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
          <AtAGlance items={glance} />
          <ProfileSections
            proofItems={proofItems}
            proofCounts={proofCounts}
            projects={projects}
            skills={skills}
            endorsementCount={rep.endorsements}
            showEndorsements={showEndorsements}
            activity={activity}
            links={profileLinks}
          />
        </FolioThread>

        <FolioRail
          rep={rep}
          followers={followers}
          showScore={false}
          share={(
            <div id="share">
              <ShareSheet username={clean} name={displayName} url={url} />
            </div>
          )}
          links={links}
        />
      </div>
    </div>
  );
}

/* One card read per request, shared by the metadata export and the page.
   `cache` is per-request in the App Router, so this removes the duplicate query
   generateMetadata would otherwise add. */
const cardFor = cache(async (clean) => {
  const sql = getSql();
  const [card] = await sql`SELECT * FROM user_profiles WHERE username = ${clean} LIMIT 1`;
  return card || null;
});

/**
 * Every profile is a public page, so it owns its head: a real title, a real
 * description, and — critically — its own canonical. Without this the page
 * inherited the root layout's `/` canonical, which told search engines that
 * every member profile was the homepage.
 */
export async function generateMetadata({ params }) {
  const { username } = await params;
  const clean = String(username).trim().toLowerCase();
  const fallback = {
    title: "Profile not found",
    robots: { index: false, follow: false }
  };

  try {
    const card = await cardFor(clean);
    if (!card || !card.is_public) return fallback;

    const sql = getSql();
    const [profile] = await sql`
      SELECT name, primary_domain FROM profiles WHERE user_id = ${card.user_id} LIMIT 1`;
    const name = profile?.name || card.username;
    const bio = String(card.bio || "").replace(/\s+/g, " ").trim();
    const description =
      bio ||
      `${name} on LOOM — proof of work synced from GitHub and LeetCode, shipped projects, and verified contributions.`;
    const path = `/u/${clean}`;

    return {
      title: `${name} (@${card.username})`,
      description,
      ...canonicalFor(path),
      openGraph: {
        type: "profile",
        title: `${name} | LOOM`,
        description,
        url: absoluteUrl(path),
        images: [absoluteUrl(`${path}/opengraph-image`)]
      },
      twitter: {
        card: "summary_large_image",
        title: `${name} | LOOM`,
        description
      }
    };
  } catch {
    // A metadata failure must never take the page down; the page itself
    // degrades honestly if the database is unavailable.
    return fallback;
  }
}

export default async function PublicProfilePage({ params }) {
  const { username } = await params;
  const clean = String(username).trim().toLowerCase();

  const card = await cardFor(clean);
  if (!card || !card.is_public) notFound();

  const sql = getSql();

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
  const projects = await sql`
    SELECT id, title, status, repo_url FROM projects
    WHERE owner_id = ${card.user_id} ORDER BY created_at DESC LIMIT 6`;
  const ossMerges = await sql`
    SELECT id, title, repo_url, pr_url, merged_at, created_at
    FROM student_oss_contributions
    WHERE student_id = ${card.user_id} AND status = 'verified'
    ORDER BY merged_at DESC NULLS LAST LIMIT 6`;
  const certificates = await sql`
    SELECT id, title, verification_code, issued_at FROM certificates
    WHERE student_id = ${card.user_id} ORDER BY issued_at DESC LIMIT 6`;

  // GitHub: the handle comes from the OAuth connection, never from a typed
  // field, so the card cannot show an account the member does not control.
  let github = null;
  try {
    const [row] = await sql`
      SELECT github_username, (github_user_id IS NOT NULL) AS verified
      FROM github_connections WHERE user_id = ${card.user_id} LIMIT 1`;
    github = row || null;
  } catch {
    try {
      const [row] = await sql`
        SELECT github_username FROM github_connections WHERE user_id = ${card.user_id} LIMIT 1`;
      github = row ? { ...row, verified: false } : null;
    } catch {
      github = null;
    }
  }

  let reposVerified = 0;
  try {
    const [row] = await sql`
      SELECT COUNT(*)::int AS n FROM github_repo_grants
      WHERE user_id = ${card.user_id} AND can_push = true`;
    reposVerified = row?.n || 0;
  } catch {
    reposVerified = 0;
  }

  let activityRows = [];
  try {
    activityRows = await sql`
      SELECT day, commits, pull_requests, reviews, github_contributions FROM student_daily_activity
      WHERE student_id = ${card.user_id}
        AND day >= CURRENT_DATE - INTERVAL '120 days'
      ORDER BY day`;
  } catch {
    activityRows = [];
  }
  const activity = summarizeActivity(activityRows, { days: ACTIVITY_WINDOW_DAYS });

  // LeetCode progress is a jsonb written by the practice sync. A missing column
  // or table must never break the public card, so this read is isolated.
  let leetcodeUsername = null;
  let leetcode = null;
  try {
    const [practice] = await sql`
      SELECT leetcode_username, leetcode_stats FROM practice_connections
      WHERE user_id = ${card.user_id} LIMIT 1`;
    leetcodeUsername = practice?.leetcode_username || null;
    leetcode = leetcodeStats(practice?.leetcode_stats);
  } catch {
    leetcodeUsername = null;
    leetcode = null;
  }

  // Shared proof contract: lib/proof.js decides what counts and what each item's
  // verification state is. If it throws, the page falls back to the rows it
  // already loaded -- it never invents a verified item.
  let proof = null;
  try {
    proof = await buildProof(sql, { userId: card.user_id, tenantId: card.tenant_id || null });
  } catch {
    proof = null;
  }

  const fallbackItems = [
    ...ossMerges.map((m) => ({
      id: `merge-${m.id}`,
      kind: "merge",
      label: m.title || "Verified contribution",
      detail: "Verified merge",
      href: m.pr_url || m.repo_url || null,
      verified: true,
      source: "GitHub",
      at: m.merged_at || m.created_at
    })),
    ...achievements.map((a) => ({
      id: `achievement-${a.id}`,
      kind: "achievement",
      label: a.badge_name || (a.source_type ? `${a.source_type} achievement` : "Achievement"),
      detail: "Achievement",
      href: a.credential_id ? `/verify/credential/${a.credential_id}` : null,
      verified: true,
      source: "LOOM",
      at: a.earned_at
    })),
    ...certificates.map((c) => ({
      id: `certificate-${c.id}`,
      kind: "certificate",
      label: c.title,
      detail: "Certificate",
      href: c.verification_code ? `/verify/certificate/${c.verification_code}` : null,
      verified: true,
      source: "LOOM",
      at: c.issued_at
    }))
  ];
  const proofItems = Array.isArray(proof?.items) && proof.items.length > 0 ? proof.items : fallbackItems;
  const counts = proof?.counts
    ? {
        verifiedProjects: asInt(proof.counts.verifiedProjects),
        mergedPrs: asInt(proof.counts.mergedPrs),
        solvedProblems: asInt(proof.counts.solvedProblems),
        certificates: asInt(proof.counts.certificates),
        activeDays: asInt(proof.counts.activeDays)
      }
    : {
        verifiedProjects: 0,
        mergedPrs: ossMerges.length,
        solvedProblems: leetcode?.total || 0,
        certificates: certificates.length,
        activeDays: activity.activeDays
      };

  const [isGuide] = await sql`
    SELECT 1 FROM mentors WHERE user_id = ${card.user_id} AND available = true LIMIT 1`;

  const displayName = profile?.name || card.username;
  const url = absoluteUrl(`/u/${clean}`).replace(/\/$/, "");

  // Linked identity: social_links first, synced accounts override what was typed.
  const identityStatus = await loadIdentityStatus(sql, { userId: card.user_id, tenantId: card.tenant_id });
  const displayLinks = socialLinksForDisplay(card, identityStatus);
  if (github?.github_username) {
    const handle = normalizeGithubHandle(github.github_username);
    if (handle) displayLinks.github = { url: `https://github.com/${handle}`, handle, note: null };
  }
  if (leetcodeUsername) {
    const handle = normalizeLeetCodeHandle(leetcodeUsername);
    if (handle) {
      // Sync confirms the account exists and its stats are real; it does not
      // prove who owns it, so no LOOM tick here (see lib/identity.js tiers).
      displayLinks.leetcode = { url: `https://leetcode.com/u/${handle}/`, handle, note: null };
    }
  }
  const verifiedKeys = new Set(
    Object.entries(identityStatus).filter(([, status]) => status === "verified").map(([key]) => key)
  );
  // A signed push is proof of control even without an identity row.
  if (displayLinks.github && (github?.verified || reposVerified > 0)) verifiedKeys.add("github");
  const chips = profileLinkList(displayLinks).map((link) => ({
    ...link,
    verified: verifiedKeys.has(link.key)
  }));

  const proofCounts = [
    counts.mergedPrs > 0 ? `${counts.mergedPrs} merged PR${counts.mergedPrs === 1 ? "" : "s"}` : null,
    counts.certificates > 0 ? `${counts.certificates} certificate${counts.certificates === 1 ? "" : "s"}` : null,
    counts.activeDays > 0 ? `${counts.activeDays} active day${counts.activeDays === 1 ? "" : "s"}` : null
  ].filter(Boolean);

  const glance = glanceItems({
    rep,
    followers,
    reposVerified,
    counts,
    projectCount: projects.length
  });

  const activityNode = (
    <ActivityBlock
      github={github}
      summary={activity}
      rows={activityRows}
      reposVerified={reposVerified}
      leetcode={leetcode}
      leetcodeUsername={leetcodeUsername}
    />
  );

  const skillNames = skills.map((s) => s.skill).filter(Boolean);
  const cardImage = absoluteUrl(`/u/${clean}/opengraph-image`);
  const cardProps = {
    card,
    profile,
    displayName,
    url,
    rep,
    followers,
    skills,
    projects,
    proofItems,
    proofCounts,
    glance,
    chips,
    profileLinks: profileLinkList(displayLinks),
    activity: activityNode,
    isGuide: !!isGuide,
    showEndorsements: card.endorsements_visible !== false
  };

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
      <CardBody {...cardProps} isOwn={false} />
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
          <CardBody {...cardProps} isOwn />
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
