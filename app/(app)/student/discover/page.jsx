import Link from "next/link";
import { redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { reputationForMany } from "@/lib/reputation";
import { Display, Meta, ActionLink, StatusPill } from "@/components/loom/primitives";
import { ActivityStream } from "@/components/loom/Evidence";
import { OnboardingState } from "@/components/loom/States";
import { ClaimCard, MentorReviewForm } from "./DiscoverBits";

export const dynamic = "force-dynamic";

function initialsFor(name) {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Deterministic, theme-safe avatar tint — var() only, no hardcoded colors.
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

function PersonAvatar({ name, avatarUrl, size = 44 }) {
  if (avatarUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={avatarUrl} alt={`Portrait of ${name}`} width={size} height={size} className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />;
  }
  const tint = avatarTint(name);
  return (
    <span aria-hidden="true" className="grid shrink-0 place-items-center rounded-full text-sm font-bold" style={{ width: size, height: size, ...tint }}>
      {initialsFor(name)}
    </span>
  );
}

function proofSignal(b) {
  if (b.ossVerified > 0) return `${b.ossVerified} verified merge${b.ossVerified === 1 ? "" : "s"}`;
  if (b.topSkill) return `Endorsed for ${b.topSkill.skill}${b.topSkill.n > 1 ? ` ×${b.topSkill.n}` : ""}`;
  if (b.achievements > 0) return `${b.achievements} achievement${b.achievements === 1 ? "" : "s"}`;
  if (b.solutions > 0) return `${b.solutions} forum solution${b.solutions === 1 ? "" : "s"}`;
  return null;
}

function BuilderRow({ b }) {
  const signal = proofSignal(b);
  return (
    <li>
      <Link href={`/student/${b.username}`} prefetch={false} className="row-link flex items-start gap-4 px-2 py-4">
        <PersonAvatar name={b.name} avatarUrl={b.avatar_url} />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate text-[1.02rem] font-semibold" style={{ color: "var(--text)" }}>
              {b.name}{" "}
              {b.isGuide && <StatusPill>Guide</StatusPill>}
            </span>
            <span className="figure-mono shrink-0 text-sm font-semibold" style={{ color: "var(--accent)" }}>{b.score}</span>
          </span>
          <span className="meta mt-0.5 block truncate">@{b.username}{b.primary_domain ? ` · ${b.primary_domain}` : ""}</span>
          <span className="mt-1 block text-sm" style={{ color: "var(--text-muted)" }}>
            {b.building ? <>Building: <strong style={{ color: "var(--text)" }}>{b.building}</strong></> : b.bio || `Learning ${b.primary_domain || "across tracks"}`}
          </span>
          <span className="meta mt-1.5 block">
            {signal ? `${signal} · ` : ""}{b.followers > 0 ? `${b.followers} follower${b.followers === 1 ? "" : "s"} · ` : ""}view profile →
          </span>
        </span>
      </Link>
    </li>
  );
}

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
  // Deterministic candidate set: public cards in this chapter, newest first.
  // updated_at is bumped on every card save, so the order is stable.
  const candidates = await sql`
    SELECT up.username, up.user_id, up.bio, up.primary_domain, up.avatar_url, up.updated_at, p.name, p.github_username
    FROM user_profiles up JOIN profiles p ON p.user_id = up.user_id
    WHERE up.tenant_id = ${tid}::uuid AND up.is_public = true AND up.user_id <> ${user.id}
    ORDER BY up.updated_at DESC LIMIT 24
  `;
  const ids = candidates.map((c) => c.user_id);
  // Batched context: one GROUP BY per source, sequential for pooler safety.
  const reps = await reputationForMany(sql, ids).catch(() => new Map());
  const latestProjects = ids.length === 0 ? [] : await sql`
    SELECT DISTINCT ON (owner_id) owner_id, title FROM projects
    WHERE owner_id = ANY(${ids}) ORDER BY owner_id, created_at DESC
  `;
  const followerCounts = ids.length === 0 ? [] : await sql`
    SELECT following_id AS id, COUNT(*)::int AS n FROM followers
    WHERE following_id = ANY(${ids}) GROUP BY following_id
  `;
  const endorsementRows = ids.length === 0 ? [] : await sql`
    SELECT endorsee_id AS id, skill, COUNT(*)::int AS n FROM user_endorsements
    WHERE endorsee_id = ANY(${ids}) GROUP BY endorsee_id, skill ORDER BY endorsee_id, n DESC
  `;
  const guideRows = ids.length === 0 ? [] : await sql`
    SELECT user_id AS id FROM mentors WHERE user_id = ANY(${ids}) AND tenant_id = ${tid}::uuid AND available = true
  `;
  const projectByOwner = new Map(latestProjects.map((r) => [r.owner_id, r.title]));
  const followersById = new Map(followerCounts.map((r) => [r.id, r.n]));
  const topSkillById = new Map();
  for (const r of endorsementRows) {
    if (!topSkillById.has(r.id)) topSkillById.set(r.id, { skill: r.skill, n: r.n });
  }
  const guideIds = new Set(guideRows.map((r) => r.id));

  const enriched = candidates.map((c) => {
    const rep = reps.get(c.user_id) || { score: 0, achievements: 0, ossVerified: 0, solutions: 0, wikiPages: 0, eventsAttended: 0, endorsements: 0 };
    return {
      ...c,
      ...rep,
      building: projectByOwner.get(c.user_id) || null,
      followers: followersById.get(c.user_id) || 0,
      topSkill: topSkillById.get(c.user_id) || null,
      isGuide: guideIds.has(c.user_id)
    };
  });
  // Proof-backed builders first (by live reputation), then honest newcomers.
  const builders = enriched.filter((b) => b.score > 0).sort((a, b) => b.score - a.score).slice(0, 12);
  const newcomers = enriched.filter((b) => b.score === 0).slice(0, 6);
  // Domain groups from actual stored values; missing domain reads honestly.
  const groups = new Map();
  for (const b of builders) {
    const key = b.primary_domain || "Exploring";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(b);
  }
  const orderedGroups = [...groups.entries()].sort(([a], [b]) => {
    if (a === "Exploring") return 1;
    if (b === "Exploring") return -1;
    return a.localeCompare(b);
  });

  // The living stream: launches, discussions, gatherings across the chapter.
  // Profile links only for publicly visible cards — never private dead-ends.
  const launches = await sql`
    SELECT p.title, p.created_at, pr.name AS owner_name, up.username, up.is_public AS profile_public FROM projects p
    JOIN profiles pr ON pr.user_id = p.owner_id
    LEFT JOIN user_profiles up ON up.user_id = p.owner_id
    WHERE pr.tenant_id = ${tid}::uuid AND p.created_at >= now() - interval '14 days'
    ORDER BY p.created_at DESC LIMIT 4
  `;
  const gatherings = await sql`
    SELECT title, starts_at FROM events
    WHERE tenant_id = ${tid}::uuid AND status IN ('upcoming', 'live') AND starts_at >= NOW()
    ORDER BY starts_at ASC LIMIT 3
  `;
  const stream = [
    ...launches.map((l) => ({
      actor: l.owner_name, text: `published ${l.title}`,
      meta: new Date(l.created_at).toLocaleDateString("en-IN", { month: "short", day: "numeric" }) + " · project launch",
      href: (l.username && l.profile_public) ? `/student/${l.username}` : null, hot: true
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
        <Meta>Discover · your college</Meta>
        <Display size="lg" className="mt-3">Find the people building what comes next.</Display>
        <p className="lede mt-4 max-w-2xl">
          Real builders, contributors, and guides from your chapter — surfaced through shipped
          projects, verified work, and proof, not profiles alone.
        </p>
        <div className="mt-6 max-w-2xl"><ClaimCard hasCard={!!myCard} /></div>

        <div className="mt-12 grid gap-12 lg:grid-cols-[1.2fr_0.8fr]">
          <div>
            <section aria-labelledby="builders-heading">
              <Meta>Builders in your college</Meta>
              <h2 id="builders-heading" className="h-product mt-2">Builders worth knowing</h2>
              <p className="mt-2 max-w-xl text-sm leading-6" style={{ color: "var(--text-muted)" }}>
                People with recent proof of building, contributing, or showing up.
              </p>
              {builders.length === 0 ? (
                <p className="narrative mt-4">
                  No builders to show yet. Earn some proof — finish a node, merge a PR, ship a
                  project — then claim your card so the chapter can find you.
                </p>
              ) : (
                orderedGroups.map(([domain, members]) => (
                  <section key={domain} aria-label={domain} className="mt-8">
                    <h3 className="meta" style={{ color: "var(--accent)" }}>{domain} · {members.length}</h3>
                    <ol className="mt-1 divide-y" style={{ borderColor: "var(--line)" }}>
                      {members.map((s) => <BuilderRow key={s.user_id} b={s} />)}
                    </ol>
                  </section>
                ))
              )}
            </section>

            {newcomers.length > 0 && (
              <section aria-labelledby="newcomers-heading" className="mt-12">
                <Meta>Recently claimed</Meta>
                <h2 id="newcomers-heading" className="h-product mt-2">New around here</h2>
                <p className="mt-2 max-w-xl text-sm leading-6" style={{ color: "var(--text-muted)" }}>
                  Public profiles without proof yet — not a ranking, just new faces to build with.
                </p>
                <ol className="mt-4 divide-y border-t" style={{ borderColor: "var(--line)" }}>
                  {newcomers.map((s) => (
                    <li key={s.user_id}>
                      <Link href={`/student/${s.username}`} prefetch={false} className="row-link flex items-start gap-4 px-2 py-4">
                        <PersonAvatar name={s.name} avatarUrl={s.avatar_url} size={40} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[1.02rem] font-semibold" style={{ color: "var(--text)" }}>{s.name}</span>
                          <span className="meta mt-0.5 block truncate">@{s.username}{s.primary_domain ? ` · ${s.primary_domain}` : ""}</span>
                          <span className="mt-1 block truncate text-sm" style={{ color: "var(--text-muted)" }}>
                            {s.bio || `Learning ${s.primary_domain || "across tracks"}`}
                          </span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ol>
              </section>
            )}

            {mentors.length > 0 && (
              <section aria-labelledby="guides-heading" className="mt-12">
                <div className="flex items-baseline justify-between gap-3">
                  <div>
                    <Meta>Guidance</Meta>
                    <h2 id="guides-heading" className="h-product mt-2">Guides worth your time</h2>
                  </div>
                  <ActionLink href="/student/mentorship">Explore mentors</ActionLink>
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
          </div>

          <section aria-labelledby="happening-heading">
            <Meta>Recent activity</Meta>
            <h2 id="happening-heading" className="h-product mt-2">What&apos;s happening</h2>
            <div className="mt-4">
              {stream.length > 0 ? (
                <ActivityStream items={stream} />
              ) : (
                <p className="narrative mt-4">
                  Quiet right now.{" "}
                  <Link href="/student/community/forums" prefetch={false} className="font-semibold hover:underline" style={{ color: "var(--accent)" }}>Start a thread</Link>{" "}
                  and give the chapter something to gather around.
                </p>
              )}
            </div>
            {threads.length > 0 && (
              <div className="mt-8">
                <h3 className="meta">Discussed this week</h3>
                <ul className="mt-3 space-y-3">
                  {threads.slice(0, 4).map((t) => (
                    <li key={t.id}>
                      <Link href={`/student/community/forums/${t.id}`} prefetch={false} className="text-sm font-medium hover:underline" style={{ color: "var(--text)" }}>{t.title}</Link>
                      <p className="meta mt-0.5">▲{t.upvote_count} · {t.reply_count} replies</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        </div>

        {builders.length === 0 && newcomers.length === 0 && mentors.length === 0 && (
          <div className="mt-8">
            <OnboardingState
              eyebrow="Discover"
              title="Your chapter is still gathering."
              why="Builder cards appear here once members claim public profiles — with projects, proof, and guides, all real."
            />
          </div>
        )}
      </main>
    </AppShell>
  );
}
