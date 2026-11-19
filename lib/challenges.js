// Domain-aware challenge inventory.
//
// "Practice" used to mean one thing: seven LeetCode questions. A web or AI/ML
// member had no path from the roadmap into a challenge that matched what they
// were learning, so the Learn surface felt like it stopped at reading.
//
// This module answers one question for the roadmap CTA and the /student/challenges
// hub: what can this member actually attempt right now, in their own track?
// Three sources, all real rows:
//
//   practice  the weekly LeetCode set (domain 'dsa')
//   debug     published debug_challenges for the member's domain
//   contests  open/upcoming chapter contests, domain or 'general'
//
// It is a read model. No writes, no fabricated counts: an empty section says so.

import { domainLabel } from "@/lib/domains";

export const CHALLENGE_KINDS = {
  practice: { label: "Practice", href: "/student/practice" },
  debug: { label: "Debug", href: "/student/debug" },
  contest: { label: "Contest", href: "/student/contests" }
};

function iso(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * Load the challenge overview for one member.
 *
 * Queries are sequential (AGENTS.md: never Promise.all against the pooler) and
 * each is tenant-scoped. A missing table (an older deployment that has not run
 * 078/082 yet) degrades that one section instead of blanking the page.
 */
export async function loadChallenges(sql, { userId, tenantId, domain = "dsa", now = new Date() } = {}) {
  const track = String(domain || "dsa");
  const out = {
    domain: track,
    domainLabel: domainLabel(track),
    practice: null,
    debug: { total: 0, items: [] },
    contests: { total: 0, items: [] }
  };
  if (!sql || !userId || !tenantId) return out;

  // 1. This week's DSA set. It stays visible to every track because DSA is the
  //    one shared weekly habit; the hub labels it as the core set rather than
  //    pretending it is domain-specific.
  try {
    const [week] = await sql`
      SELECT id, title, start_at, end_at
      FROM practice_weeks
      WHERE tenant_id = ${tenantId}::uuid
        AND status = 'scheduled'
        AND end_at >= ${now}
      ORDER BY start_at ASC
      LIMIT 1
    `;
    if (week) {
      const [{ total = 0 } = {}] = await sql`
        SELECT COUNT(*)::int AS total
        FROM practice_questions
        WHERE tenant_id = ${tenantId}::uuid AND week_id = ${week.id} AND domain = 'dsa'
      `;
      const [{ solved = 0 } = {}] = await sql`
        SELECT COUNT(DISTINCT s.question_id)::int AS solved
        FROM practice_solves s
        JOIN practice_questions q ON q.id = s.question_id
        WHERE s.user_id = ${userId}
          AND s.tenant_id = ${tenantId}::uuid
          AND q.week_id = ${week.id}
          AND q.domain = 'dsa'
      `;
      out.practice = {
        id: week.id,
        title: week.title,
        startAt: iso(week.start_at),
        endAt: iso(week.end_at),
        total,
        solved,
        href: CHALLENGE_KINDS.practice.href
      };
    }
  } catch {
    out.practice = null;
  }

  // 2. Debug challenges in this member's own domain.
  try {
    const rows = await sql`
      SELECT slug, title, domain, difficulty, published_at
      FROM debug_challenges
      WHERE tenant_id = ${tenantId}::uuid
        AND is_published = true
        AND domain = ${track}
      ORDER BY published_at DESC NULLS LAST, created_at DESC
      LIMIT 6
    `;
    out.debug = {
      total: rows.length,
      items: rows.map((r) => ({
        id: r.slug,
        kind: "debug",
        title: r.title,
        domain: r.domain,
        difficulty: r.difficulty,
        at: iso(r.published_at),
        href: `/student/debug/${r.slug}`
      }))
    };
  } catch {
    out.debug = { total: 0, items: [] };
  }

  // 3. Contests: the chapter's own, plus anything published for this track.
  try {
    const rows = await sql`
      SELECT c.id, c.title, c.status, c.starts_at, c.ends_at, c.domain,
        EXISTS(
          SELECT 1 FROM contest_registrations r
          WHERE r.contest_id = c.id AND r.student_id = ${userId}
        ) AS registered
      FROM contests c
      WHERE c.tenant_id = ${tenantId}::uuid
        AND c.status IN ('open', 'upcoming', 'published')
        AND (c.domain = 'general' OR c.domain = ${track})
      ORDER BY c.starts_at ASC NULLS LAST
      LIMIT 6
    `;
    out.contests = {
      total: rows.length,
      items: rows.map((c) => ({
        id: c.id,
        kind: "contest",
        title: c.title,
        domain: c.domain,
        status: c.status,
        registered: c.registered === true,
        at: iso(c.starts_at || c.ends_at),
        href: `/student/contests/${c.id}`
      }))
    };
  } catch {
    out.contests = { total: 0, items: [] };
  }

  out.available = (out.debug.total || 0) + (out.contests.total || 0) + (out.practice ? 1 : 0);
  return out;
}

/** What the roadmap CTA should say. Pure, so the wording is testable. */
export function challengeNudge({ verifiedCount = 0, total = 0, domain = "dsa", overview = null } = {}) {
  const label = domainLabel(domain);
  const hasDomainWork = (overview?.debug?.total || 0) + (overview?.contests?.total || 0) > 0;
  if (total > 0 && verifiedCount >= total) {
    return {
      title: `${label} path complete.`,
      body: hasDomainWork
        ? "Turn the last milestone into evidence: pick a challenge in your track."
        : "You finished the reading. Ship something and put it on your card.",
      href: "/student/challenges",
      cta: "Open challenges"
    };
  }
  if (verifiedCount < 3) {
    return {
      title: "Finish a few foundations first.",
      body: "Challenges open once you have three verified milestones - enough context to attempt real work.",
      href: "/student/roadmap",
      cta: "Back to the path"
    };
  }
  return {
    title: "Learned enough? Try a challenge.",
    body: hasDomainWork
      ? `Practice matched to ${label}: debug tasks, contests, and the weekly core set.`
      : `No ${label} challenge is published yet. The weekly core set is open, and your lead can add track-specific work.`,
    href: "/student/challenges",
    cta: "See what's open"
  };
}
