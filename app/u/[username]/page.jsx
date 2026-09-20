import Link from "next/link";
import { notFound } from "next/navigation";
import { getSql } from "@/lib/db";
import { reputationFor } from "@/lib/reputation";
import { absoluteUrl } from "@/lib/seo";
import { BrandMark } from "@/components/BrandMark";
import { AppShell } from "@/components/AppShell";
import { createServerSupabase } from "@/lib/supabase/server";
import { Display, Meta, PlainStat } from "@/components/loom/primitives";
import { Timeline, TimelineItem } from "@/components/loom/Timeline";
import ShareButtons from "./ShareButtons";

export const revalidate = 300;

export async function generateMetadata({ params }) {
  const { username } = await params;
  const clean = username.trim().toLowerCase();
  try {
    const sql = getSql();
    const [card] = await sql`SELECT username, bio, is_public FROM user_profiles WHERE username = ${clean} LIMIT 1`;
    if (!card || !card.is_public) return { title: "Profile not found" };
    const [profile] = await sql`SELECT name, primary_domain FROM profiles WHERE user_id = (SELECT user_id FROM user_profiles WHERE username = ${clean} LIMIT 1) LIMIT 1`;
    const name = profile?.name || card.username;
    return {
      title: `${name} — L.O.O.M. Builder`,
      description: card.bio || `${name} on L.O.O.M. — ${profile?.primary_domain || "building"} · View proof, projects, and reputation.`,
      openGraph: {
        title: `${name} — L.O.O.M.`,
        description: card.bio?.slice(0, 160) || `Builder @${card.username} on L.O.O.M.`,
        url: absoluteUrl(`/u/${clean}`),
        images: [{ url: absoluteUrl(`/u/${clean}/opengraph-image`), width: 1200, height: 630, alt: `${name} — L.O.O.M.` }],
      },
      twitter: { card: "summary_large_image", title: `${name} — L.O.O.M.`, images: [absoluteUrl(`/u/${clean}/opengraph-image`)] },
      alternates: { canonical: absoluteUrl(`/u/${clean}`) },
    };
  } catch {
    return { title: "L.O.O.M. Builder" };
  }
}

function initials(name) {
  if (!name) return "?";
  return String(name).trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "?";
}

export default async function PublicProfilePage({ params }) {
  const { username } = await params;
  const clean = username.trim().toLowerCase();
  const sql = getSql();

  const [card] = await sql`SELECT * FROM user_profiles WHERE username = ${clean} LIMIT 1`;
  if (!card || !card.is_public) notFound();

  const [profile] = await sql`SELECT name, primary_domain FROM profiles WHERE user_id = ${card.user_id} LIMIT 1`;
  const rep = await reputationFor(sql, card.user_id).catch(() => ({ score: 0, achievements: 0, ossVerified: 0, solutions: 0, wikiPages: 0, eventsAttended: 0, endorsements: 0 }));
  const [{ followers = 0 } = {}] = await sql`SELECT COUNT(*)::int AS followers FROM followers WHERE following_id = ${card.user_id}`;
  const skills = await sql`SELECT skill, COUNT(*)::int AS n FROM user_endorsements WHERE endorsee_id = ${card.user_id} GROUP BY skill ORDER BY n DESC LIMIT 8`;
  const achievements = await sql`SELECT a.*, b.name AS badge_name FROM student_achievements a LEFT JOIN skill_badges b ON b.id = a.badge_id WHERE a.student_id = ${card.user_id} ORDER BY a.earned_at DESC LIMIT 6`;
  const latestProject = await sql`SELECT id, title FROM projects WHERE owner_id = ${card.user_id} ORDER BY created_at DESC LIMIT 1`;
  const isGuide = await sql`SELECT 1 FROM mentors WHERE user_id = ${card.user_id} AND available = true LIMIT 1`;
  const displayName = profile?.name || card.username;
  const url = absoluteUrl(`/u/${clean}`);
  const proofCounts = [
    rep.solutions > 0 ? `${rep.solutions} solutions` : null,
    rep.wikiPages > 0 ? `${rep.wikiPages} wiki` : null,
    rep.eventsAttended > 0 ? `${rep.eventsAttended} events` : null,
  ].filter(Boolean);

  // If viewer is logged in, show full AppShell with account switcher instead of bare public header.
  // Detect session server-side without throwing — public page must stay public.
  let viewer = null;
  let viewerTenant = null;
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { getSql: _getSql } = await import("@/lib/db");
      const s = _getSql();
      const [p] = await s`SELECT * FROM profiles WHERE user_id = ${user.id} LIMIT 1`;
      if (p?.tenant_id) {
        const [t] = await s`SELECT * FROM tenants WHERE id = ${p.tenant_id} LIMIT 1`;
        viewerTenant = t || null;
      }
      viewer = user;
      // If this is their own card, hint that they can edit
      const isOwn = card.user_id === user.id;
      if (isOwn) {
        // Render inside AppShell so top nav stays
        return (
          <AppShell area="student" tenant={viewerTenant} user={user}>
            <main className="mx-auto max-w-5xl px-4 pb-14 sm:px-6">
              <p className="meta flex items-center gap-2"><span style={{ background: "var(--accent)", color: "#101314" }} className="rounded-full px-2 py-0.5 text-[10px] font-bold">YOUR CARD</span> <span>This is how others see you at {url}</span> <Link href={`/student/${card.username}`} prefetch={false} className="font-semibold hover:underline" style={{ color: "var(--accent)" }}>Edit card</Link></p>
              <div className="mt-4 flex min-w-0 items-start gap-5">
                <span className="grid size-[72px] shrink-0 place-items-center rounded-full text-lg font-bold" style={{ background: "color-mix(in srgb, var(--accent) 16%, var(--bg-muted))", color: "var(--accent)" }}>{initials(displayName)}</span>
                <div className="min-w-0">
                  <p className="mono-tag">@{String(card.username).toUpperCase()} · @{card.username}{isGuide.length > 0 && <span className="ml-2 rounded-full border px-2 py-0.5" style={{ borderColor: "var(--accent)", color: "var(--accent)" }}>Guide</span>}</p>
                  <Display size="lg" className="mt-1 break-words">{displayName}</Display>
                  <p className="meta mt-1">{card.primary_domain || profile?.primary_domain || "builder"}{card.location ? ` · ${card.location}` : ""}</p>
                  {card.bio && <p className="narrative mt-4 max-w-xl" style={{ color: "var(--text)" }}>{card.bio}</p>}
                  <div className="mt-4">
                    <ShareButtons username={clean} name={displayName} url={url} score={rep.score} />
                  </div>
                </div>
              </div>
              <div className="mt-8 grid grid-cols-3 gap-6 border-y py-6" style={{ borderColor: "var(--line)" }}>
                <PlainStat value={rep.score} unit="" label="reputation" />
                <PlainStat value={followers} unit="" label="followers" />
                <PlainStat value={rep.ossVerified} unit="" label="verified merges" />
              </div>
              {latestProject[0] && (
                <section aria-labelledby="building-heading-own" className="mt-8">
                  <h2 id="building-heading-own" className="meta">Building</h2>
                  <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>
                    Latest: <Link href={`/student/projects/${latestProject[0].id}`} prefetch={false} className="font-semibold hover:underline" style={{ color: "var(--text)" }}>{latestProject[0].title}</Link>
                  </p>
                </section>
              )}
              <div className="mt-10 grid gap-10 sm:grid-cols-2">
                <section aria-labelledby="proof-heading-own">
                  <h2 id="proof-heading-own" className="meta">The proof</h2>
                  {achievements.length === 0 ? (
                    <p className="narrative mt-3">{proofCounts.length > 0 ? `${proofCounts.join(" · ")}.` : "No proof recorded yet."} Badges land here as they're earned.</p>
                  ) : (
                    <Timeline className="mt-4">
                      {achievements.map((a) => (
                        <TimelineItem key={a.id} state="done" title={a.badge_name || `${a.source_type} achievement`} meta={new Date(a.earned_at).toLocaleDateString("en-IN", { month: "short", year: "numeric" })} />
                      ))}
                    </Timeline>
                  )}
                </section>
                <section aria-labelledby="known-for-heading-own">
                  <h2 id="known-for-heading-own" className="meta">Known for · {rep.endorsements}</h2>
                  {skills.length === 0 ? (
                    <p className="narrative mt-3">No endorsements yet — vouch for a skill you've seen in action.</p>
                  ) : (
                    <ul className="mt-4 space-y-2.5">
                      {skills.map((s) => (
                        <li key={s.skill}>
                          <div className="flex justify-between gap-2 text-sm"><span className="min-w-0 truncate" style={{ color: "var(--text)" }}>{s.skill}</span><span className="font-mono shrink-0" style={{ color: "var(--text-muted)" }}>×{s.n}</span></div>
                          <div className="mt-1 h-1 overflow-hidden rounded-full" style={{ background: "var(--bg-muted)" }}><div className="h-full rounded-full" style={{ width: `${Math.min(100, s.n * 25)}%`, background: "var(--accent)" }} /></div>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </div>
            </main>
          </AppShell>
        );
      }
    }
  } catch {}

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

      <div className="mx-auto max-w-5xl px-4 pb-14 sm:px-6">
        <div className="mt-6 flex min-w-0 items-start gap-5">
          <span className="grid size-[72px] shrink-0 place-items-center rounded-full text-lg font-bold" style={{ background: "color-mix(in srgb, var(--accent) 16%, var(--bg-muted))", color: "var(--accent)" }}>{initials(displayName)}</span>
          <div className="min-w-0">
            <p className="mono-tag">@{String(card.username).toUpperCase()} · @{card.username}{isGuide.length > 0 && <span className="ml-2 rounded-full border px-2 py-0.5" style={{ borderColor: "var(--accent)", color: "var(--accent)" }}>Guide</span>}</p>
            <Display size="lg" className="mt-1 break-words">{displayName}</Display>
            <p className="meta mt-1">{card.primary_domain || profile?.primary_domain || "builder"}{card.location ? ` · ${card.location}` : ""}</p>
            {card.bio && <p className="narrative mt-4 max-w-xl" style={{ color: "var(--text)" }}>{card.bio}</p>}
            <div className="mt-4">
              <ShareButtons username={clean} name={displayName} url={url} score={rep.score} />
            </div>
          </div>
        </div>

        <div className="mt-8 grid grid-cols-3 gap-6 border-y py-6" style={{ borderColor: "var(--line)" }}>
          <PlainStat value={rep.score} unit="" label="reputation" />
          <PlainStat value={followers} unit="" label="followers" />
          <PlainStat value={rep.ossVerified} unit="" label="verified merges" />
        </div>

        {latestProject[0] && (
          <section aria-labelledby="building-heading" className="mt-8">
            <h2 id="building-heading" className="meta">Building</h2>
            <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>
              Latest: <Link href={`/student/projects/${latestProject[0].id}`} prefetch={false} className="font-semibold hover:underline" style={{ color: "var(--text)" }}>{latestProject[0].title}</Link>
            </p>
          </section>
        )}

        <div className="mt-10 grid gap-10 sm:grid-cols-2">
          <section aria-labelledby="proof-heading">
            <h2 id="proof-heading" className="meta">The proof</h2>
            {achievements.length === 0 ? (
              <p className="narrative mt-3">{proofCounts.length > 0 ? `${proofCounts.join(" · ")}.` : "No proof recorded yet."} Badges land here as they're earned.</p>
            ) : (
              <Timeline className="mt-4">
                {achievements.map((a) => (
                  <TimelineItem key={a.id} state="done" title={a.badge_name || `${a.source_type} achievement`} meta={new Date(a.earned_at).toLocaleDateString("en-IN", { month: "short", year: "numeric" })} />
                ))}
              </Timeline>
            )}
          </section>
          <section aria-labelledby="known-for-heading">
            <h2 id="known-for-heading" className="meta">Known for · {rep.endorsements}</h2>
            {skills.length === 0 ? (
              <p className="narrative mt-3">No endorsements yet — vouch for a skill you've seen in action.</p>
            ) : (
              <ul className="mt-4 space-y-2.5">
                {skills.map((s) => (
                  <li key={s.skill}>
                    <div className="flex justify-between gap-2 text-sm"><span className="min-w-0 truncate" style={{ color: "var(--text)" }}>{s.skill}</span><span className="font-mono shrink-0" style={{ color: "var(--text-muted)" }}>×{s.n}</span></div>
                    <div className="mt-1 h-1 overflow-hidden rounded-full" style={{ background: "var(--bg-muted)" }}><div className="h-full rounded-full" style={{ width: `${Math.min(100, s.n * 25)}%`, background: "var(--accent)" }} /></div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="mt-10 flex flex-wrap gap-3 border-t pt-6" style={{ borderColor: "var(--line)" }}>
          <Link href="/register" prefetch={false} className="btn-ink">Create your card →</Link>
          <Link href="/about" prefetch={false} className="btn-ghost">What is L.O.O.M.?</Link>
        </div>
        <p className="meta mt-3">Share this page — it unfurls beautifully on Discord, iMessage, and Twitter.</p>
      </div>
    </main>
  );
}
