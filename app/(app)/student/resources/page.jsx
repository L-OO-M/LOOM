import { redirect } from "next/navigation";
import Link from "next/link";
import { getRequestContext } from "@/lib/auth-server";
import { cached } from "@/lib/cache";
import { AppShell } from "@/components/AppShell";
import { Display, Meta, ActionLink } from "@/components/loom/primitives";
import { OnboardingState } from "@/components/loom/States";
import {
  FilterLink,
  ProgressBar,
  ResourceCard,
  TrackCard,
  ContinueCard,
  levelLabel,
} from "./_components/resources-ui";

const TRACKS = [
  { id: "ai_ml", label: "AI / ML", focus: "ML fundamentals, paper-reading sessions, dataset-based contests, applied AI projects" },
  { id: "web", label: "Web Development", focus: "HTML/CSS/JavaScript bootcamps, framework workshops, society website, Git & deployment" },
  { id: "cybersecurity", label: "Cybersecurity", focus: "Ethical hacking within legal boundaries, CTF practice, cryptography basics, secure coding" },
  { id: "dsa", label: "DSA", focus: "Weekly problem-solving, contest practice, interview preparation, mock tests" },
  { id: "blockchain", label: "Blockchain", focus: "Distributed-ledger fundamentals, smart contracts, Web3 mini-projects" }
];

const KINDS = [
  { id: "", label: "Everything" },
  { id: "article", label: "Articles" },
  { id: "doc", label: "Docs" },
  { id: "video", label: "Videos" },
  { id: "course", label: "Courses" }
];

const STATUS_OPTIONS = [
  { id: "", label: "All progress" },
  { id: "todo", label: "Not completed" },
  { id: "completed", label: "Completed" }
];

function qs(base, extra) {
  const params = new URLSearchParams({ ...base, ...extra });
  for (const [k, v] of [...params]) if (!v) params.delete(k);
  const s = params.toString();
  return `/student/resources${s ? `?${s}` : ""}`;
}

function trackLabelFor(id) {
  return TRACKS.find((t) => t.id === id)?.label ?? id;
}

export default async function ResourcesPage({ searchParams }) {
  const ctx = await getRequestContext();
  if (ctx.error) redirect("/login?redirect=/student/resources");
  const { user, tenant, sql } = ctx;
  const sp = await searchParams;
  const domain = sp?.domain || "";
  const q = sp?.q || "";
  const kind = ["article", "doc", "video", "course"].includes(sp?.kind) ? sp.kind : "";
  const level = typeof sp?.level === "string" ? sp.level : "";
  const status = ["completed", "todo"].includes(sp?.status) ? sp.status : "";
  const base = { ...(q ? { q } : {}), ...(kind ? { kind } : {}), ...(level ? { level } : {}), ...(status ? { status } : {}) };

  // Sequential page queries — global catalog reads are cached 30s to keep
  // pooler pressure low; user progress stays uncached and sequential per AGENTS rule.
  const profile = await sql`SELECT primary_domain FROM profiles WHERE user_id = ${user.id} LIMIT 1`;
  const primaryDomain = profile[0]?.primary_domain || "";

  const counts = await cached("resources:counts", 30000, async () => sql`SELECT domain, COUNT(*)::int AS n FROM resources GROUP BY domain`);
  const levelRows = await cached("resources:levels", 30000, async () => sql`SELECT DISTINCT level FROM resources ORDER BY level ASC`);
  const totalRows = await cached("resources:total", 30000, async () => sql`SELECT COUNT(*)::int AS n FROM resources`);
  const countBy = Object.fromEntries(counts.map((c) => [c.domain, c.n]));
  const levels = levelRows.map((r) => r.level).filter(Boolean);
  const totalResources = totalRows[0]?.n ?? 0;

  const done = await sql`SELECT resource_id FROM resource_progress WHERE student_id = ${user.id} AND status = 'completed'`;
  const doneSet = new Set(done.map((d) => d.resource_id));

  const doneDomains = await sql`
    SELECT r.domain AS domain, COUNT(*)::int AS n
    FROM resource_progress p JOIN resources r ON r.id = p.resource_id
    WHERE p.student_id = ${user.id} AND p.status = 'completed'
    GROUP BY r.domain
  `;
  const doneBy = Object.fromEntries(doneDomains.map((d) => [d.domain, d.n]));

  const resources = await sql`
    SELECT * FROM resources
    WHERE TRUE
    ${domain ? sql`AND domain = ${domain}` : sql``}
    ${q ? sql`AND title ILIKE ${"%" + q + "%"}` : sql``}
    ${kind ? sql`AND kind = ${kind}` : sql``}
    ${level ? sql`AND level = ${level}` : sql``}
    ${status === "completed" ? sql`AND EXISTS (SELECT 1 FROM resource_progress p WHERE p.resource_id = resources.id AND p.student_id = ${user.id} AND p.status = 'completed')` : sql``}
    ${status === "todo" ? sql`AND NOT EXISTS (SELECT 1 FROM resource_progress p WHERE p.resource_id = resources.id AND p.student_id = ${user.id} AND p.status = 'completed')` : sql``}
    ORDER BY minutes ASC LIMIT 60
  `;

  const visible = resources;
  const visibleDone = visible.filter((r) => doneSet.has(r.id)).length;

  // Continue learning: next unfinished pieces in the student's own track
  // (real progress data — never fabricated). Independent of the current filter.
  let upNext = [];
  let primaryTotal = 0;
  let primaryDone = 0;
  if (primaryDomain) {
    primaryTotal = countBy[primaryDomain] ?? 0;
    primaryDone = doneBy[primaryDomain] ?? 0;
    const primaryRows = await sql`
      SELECT * FROM resources WHERE domain = ${primaryDomain} ORDER BY minutes ASC LIMIT 60
    `;
    upNext = primaryRows.filter((r) => !doneSet.has(r.id)).slice(0, 3);
  }
  const recommendedIds = new Set(upNext.map((r) => r.id));
  const hasPrimary = Boolean(primaryDomain);
  const trackComplete = hasPrimary && primaryTotal > 0 && primaryDone >= primaryTotal;
  const showContinue = hasPrimary && !trackComplete && upNext.length > 0;
  const primaryTrack = TRACKS.find((t) => t.id === primaryDomain);

  const completedTotal = doneSet.size;
  const percent = totalResources > 0 ? Math.round((completedTotal / totalResources) * 100) : 0;
  const hasAnyFilter = Boolean(q || domain || kind || level || status);
  const noResultsForSearch = visible.length === 0 && Boolean(q);
  const noResultsForFilters = visible.length === 0 && !q && hasAnyFilter;

  return (
    <AppShell area="student" tenant={tenant} user={user}>
      <style>{`
        .res-card:hover { border-color: var(--accent); }
        .res-card:focus-within { outline: 2px solid var(--accent); outline-offset: 2px; }
        .res-track:hover { border-color: var(--accent); }
        .res-filters-mobile { display: none; }
        @media (max-width: 640px) {
          .res-filters-desktop { display: none; }
          .res-filters-mobile { display: block; }
        }
        @media (prefers-reduced-motion: reduce) {
          .res-card, .res-track { transition: none; }
          .res-progress-fill { transition: none; }
        }
      `}</style>
      <main className="mx-auto max-w-4xl px-4 sm:px-6">
        {/* HERO — compact, real progress only */}
        <Meta>Resources · the curated library</Meta>
        <Display size="lg" className="mt-3">Learn with intention.</Display>
        <p className="narrative mt-4" style={{ color: "var(--text)" }}>
          Five tracks, curated by mentors — not an endless feed. Finish something and it stays on your record.
        </p>
        <div className="mt-6 flex flex-wrap items-baseline gap-x-8 gap-y-3 border-y py-4" style={{ borderColor: "var(--line)" }} aria-label="Library progress">
          <span>
            <span className="figure figure-mono" style={{ fontSize: "1.6rem" }}>{totalResources}</span>
            <span className="meta ml-2">pieces</span>
          </span>
          <span>
            <span className="figure figure-mono" style={{ fontSize: "1.6rem" }}>{completedTotal}</span>
            <span className="meta ml-2">finished</span>
          </span>
          <span>
            <span className="figure figure-mono" style={{ fontSize: "1.6rem" }}>{percent}%</span>
            <span className="meta ml-2">complete</span>
          </span>
        </div>

        {/* CONTINUE LEARNING — only from real progress data */}
        {showContinue && (
          <section className="mt-10" aria-label="Continue learning">
            <Meta style={{ color: "var(--accent)" }}>
              {primaryDone > 0 ? `Continue learning · ${primaryTrack?.label ?? primaryDomain}` : `Start your path · ${primaryTrack?.label ?? primaryDomain}`}
            </Meta>
            <div className="mt-3 flex flex-wrap items-baseline justify-between gap-3">
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                {primaryDone} of {primaryTotal} finished in your track
              </p>
              <ActionLink href={qs({ q, kind, level, status }, { domain: primaryDomain })}>Open the shelf</ActionLink>
            </div>
            <div className="mt-3">
              <ProgressBar percent={primaryTotal ? Math.round((primaryDone / primaryTotal) * 100) : 0} label={`${primaryTrack?.label ?? primaryDomain}: ${primaryDone} of ${primaryTotal} finished`} />
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {upNext.map((r) => (
                <ContinueCard key={r.id} r={r} trackLabel={trackLabelFor(r.domain)} />
              ))}
            </div>
          </section>
        )}
        {trackComplete && (
          <section className="mt-10 rounded-2xl border p-5" style={{ borderColor: "var(--accent)", background: "var(--bg-elevated)" }} aria-label="Track complete">
            <Meta style={{ color: "var(--accent)" }}>Track complete · {primaryTrack?.label ?? primaryDomain}</Meta>
            <p className="mt-2 text-sm font-semibold" style={{ color: "var(--text)" }}>
              You finished all {primaryTotal} pieces in this track. ✓
            </p>
            <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
              Pick another track below, or turn this into proof.
            </p>
            <div className="mt-3 flex flex-wrap gap-3">
              <Link href="/student/resources" prefetch={false} className="btn-ghost text-sm">Browse all tracks</Link>
              <Link href="/student/roadmap" prefetch={false} className="text-sm font-semibold hover:underline" style={{ color: "var(--accent)" }}>Return to your path →</Link>
            </div>
          </section>
        )}

        {/* EDITOR'S PICK — large editorial preview */}
        {visible.length > 0 && !hasAnyFilter && (
          <section className="mt-10 hero-field rounded-2xl border px-6 py-8 sm:px-8" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }} aria-label="Editor's pick">
            <Meta>Editor&apos;s pick</Meta>
            <Link href={`/student/resources/${visible[0].id}`} prefetch={false} className="display display-md mt-3 block max-w-2xl hover:underline" style={{ color: "var(--text)" }}>
              {visible[0].title}
            </Link>
            <p className="meta mt-2">{trackLabelFor(visible[0].domain)} · {visible[0].kind} · {visible[0].minutes} min</p>
            <p className="narrative mt-3 max-w-xl">A curated starting point from the shelf — open it, then continue along your track.</p>
            <Link href={`/student/resources/${visible[0].id}`} prefetch={false} className="btn-ink mt-5 inline-block">Open resource →</Link>
          </section>
        )}

        {/* BROWSE BY TRACK — typographic navigator */}
        <section className="mt-10" aria-label="Learning tracks">
          <Meta>Browse by track</Meta>
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 border-y py-4" style={{ borderColor: "var(--line)" }}>
            <Link href={qs({ q, kind, level, status }, {})} prefetch={false} className="text-sm font-semibold hover:underline" style={{ color: !domain ? "var(--accent)" : "var(--text-muted)" }}>All tracks · {totalResources}</Link>
            {TRACKS.map((t) => (
              <Link key={t.id} href={domain === t.id ? qs({ q, kind, level, status }, {}) : qs({ q, kind, level, status }, { domain: t.id })} prefetch={false} className="text-sm hover:underline" style={{ color: domain === t.id ? "var(--accent)" : "var(--text)", fontWeight: domain === t.id ? 700 : 500 }}>
                {t.label} <span className="meta ml-1 normal-case tracking-normal">{countBy[t.id] ?? 0}</span>
              </Link>
            ))}
          </div>
          <p className="narrative mt-3 text-sm">Pick a thread. Each shelf is curated — not infinite.</p>
        </section>

        {/* SEARCH + FILTERS */}
        <section className="mt-10" aria-label="Search and filter">
          <Meta>Search &amp; filter</Meta>
          <form method="get" className="mt-4 flex flex-wrap items-center gap-2" role="search">
            <input
              name="q"
              defaultValue={q}
              placeholder="Search by title — try “git”, “ hooks”, “CTF”…"
              aria-label="Search resources"
              style={{ borderRadius: 10, border: "1px solid var(--line)", background: "var(--bg-muted)", color: "var(--text)", padding: "8px 12px", fontSize: 14, minWidth: 220, flex: "1 1 220px" }}
            />
            {domain && <input type="hidden" name="domain" value={domain} />}
            {kind && <input type="hidden" name="kind" value={kind} />}
            {level && <input type="hidden" name="level" value={level} />}
            {status && <input type="hidden" name="status" value={status} />}
            <button className="btn-ink !py-2">Search</button>
            {hasAnyFilter && <Link href="/student/resources" prefetch={false} className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>Clear all</Link>}
          </form>

          <div className="res-filters-desktop mt-5 space-y-2.5">
            <div className="flex flex-wrap gap-2" aria-label="Filter by track">
              <FilterLink href={qs({ q, kind, level, status }, {})} active={!domain}>All tracks</FilterLink>
              {TRACKS.map((t) => (
                <FilterLink key={t.id} href={domain === t.id ? qs({ q, kind, level, status }, {}) : qs({ q, kind, level, status }, { domain: t.id })} active={domain === t.id}>
                  {t.label} · {countBy[t.id] ?? 0}
                </FilterLink>
              ))}
            </div>
            <div className="flex flex-wrap gap-2" aria-label="Filter by format">
              {KINDS.map((k) => (
                <FilterLink key={k.id || "all"} href={qs({ q, domain, level, status }, { kind: k.id })} active={kind === k.id} small>
                  {k.label}
                </FilterLink>
              ))}
            </div>
            {levels.length > 0 && (
              <div className="flex flex-wrap gap-2" aria-label="Filter by level">
                <FilterLink href={qs({ q, domain, kind, status }, {})} active={!level} small>All levels</FilterLink>
                {levels.map((lv) => (
                  <FilterLink key={lv} href={qs({ q, domain, kind, status }, { level: lv })} active={level === lv} small>
                    {levelLabel(lv)}
                  </FilterLink>
                ))}
              </div>
            )}
            <div className="flex flex-wrap gap-2" aria-label="Filter by completion">
              {STATUS_OPTIONS.map((s) => (
                <FilterLink key={s.id || "all"} href={qs({ q, domain, kind, level }, { status: s.id })} active={status === s.id} small>
                  {s.label}
                </FilterLink>
              ))}
            </div>
          </div>

          <details className="res-filters-mobile mt-4 rounded-xl border" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
            <summary className="cursor-pointer px-4 py-3 text-sm font-semibold" style={{ color: "var(--text)" }}>
              Filters{q || domain || kind || level || status ? " · active" : ""}
            </summary>
            <div className="space-y-2.5 px-4 pb-4">
              <div className="flex flex-wrap gap-2" aria-label="Filter by track">
                <FilterLink href={qs({ q, kind, level, status }, {})} active={!domain}>All tracks</FilterLink>
                {TRACKS.map((t) => (
                  <FilterLink key={t.id} href={domain === t.id ? qs({ q, kind, level, status }, {}) : qs({ q, kind, level, status }, { domain: t.id })} active={domain === t.id}>
                    {t.label} · {countBy[t.id] ?? 0}
                  </FilterLink>
                ))}
              </div>
              <div className="flex flex-wrap gap-2" aria-label="Filter by format">
                {KINDS.map((k) => (
                  <FilterLink key={k.id || "all"} href={qs({ q, domain, level, status }, { kind: k.id })} active={kind === k.id} small>
                    {k.label}
                  </FilterLink>
                ))}
              </div>
              {levels.length > 0 && (
                <div className="flex flex-wrap gap-2" aria-label="Filter by level">
                  <FilterLink href={qs({ q, domain, kind, status }, {})} active={!level} small>All levels</FilterLink>
                  {levels.map((lv) => (
                    <FilterLink key={lv} href={qs({ q, domain, kind, status }, { level: lv })} active={level === lv} small>
                      {levelLabel(lv)}
                    </FilterLink>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap gap-2" aria-label="Filter by completion">
                {STATUS_OPTIONS.map((s) => (
                  <FilterLink key={s.id || "all"} href={qs({ q, domain, kind, level }, { status: s.id })} active={status === s.id} small>
                    {s.label}
                  </FilterLink>
                ))}
              </div>
            </div>
          </details>
        </section>

        {/* RESOURCE RESULTS — alternating large/small editorial */}
        <section className="mt-10" aria-label="Resources">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <Meta>
              {domain ? `${trackLabelFor(domain)} shelf` : "All resources"}
              {status === "completed" ? " · completed" : status === "todo" ? " · to finish" : ""}
            </Meta>
            <p className="meta">{visible.length} pieces · {visibleDone} finished in view</p>
          </div>
          {visible.length > 1 && (
            <p className="narrative mt-2 text-sm">Large first, compact second — rhythm over grid.</p>
          )}

          {totalResources === 0 ? (
            <OnboardingState
              eyebrow="Being curated"
              title="The library is being stocked."
              why="Mentors are curating the first shelves now. Check back soon — your track will appear here first."
              action={<Link href="/student/roadmap" prefetch={false} className="btn-ghost">View your path</Link>}
            />
          ) : noResultsForSearch ? (
            <OnboardingState
              eyebrow="No matches"
              title={`Nothing matches “${q}”.`}
              why="Try a shorter search — mentors curate titles, not keywords — or clear the search to browse the shelf."
              action={<Link href={qs({ domain, kind, level, status }, {})} prefetch={false} className="btn-ghost">Clear search</Link>}
            />
          ) : noResultsForFilters ? (
            <OnboardingState
              eyebrow="No results for these filters"
              title="Nothing on this shelf with those filters."
              why={status === "completed"
                ? "You haven't finished anything matching these filters yet — switch to “Not completed” to see what's left."
                : "Try widening the format or level, or pick another track — the other shelves are open."}
              action={<Link href="/student/resources" prefetch={false} className="btn-ghost">Clear filters</Link>}
            />
          ) : (
            <div className="mt-4 grid gap-3">
              {visible.map((r) => (
                <ResourceCard
                  key={r.id}
                  r={r}
                  completed={doneSet.has(r.id)}
                  recommended={recommendedIds.has(r.id)}
                  trackLabel={trackLabelFor(r.domain)}
                />
              ))}
            </div>
          )}

          {visible.length > 0 && (
            <div className="mt-8 border-t pt-6" style={{ borderColor: "var(--line)" }}>
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <p className="meta">Your record · {completedTotal} of {totalResources} finished ({percent}%)</p>
                <ActionLink href="/student/roadmap">Return to your path</ActionLink>
              </div>
              <div className="mt-3">
                <ProgressBar percent={percent} label={`Library: ${completedTotal} of ${totalResources} finished`} />
              </div>
              <p className="narrative mt-6" style={{ fontSize: "0.9rem", color: "var(--text-muted)" }}>
                Learn → practice → build → proof. Finish a resource, then{" "}
                <Link href="/student/projects" prefetch={false} className="font-semibold hover:underline" style={{ color: "var(--accent)" }}>build something with it</Link>
                {" "}or{" "}
                <Link href="/student/contests" prefetch={false} className="font-semibold hover:underline" style={{ color: "var(--accent)" }}>prove it in a contest</Link>.
              </p>
            </div>
          )}
        </section>
      </main>
    </AppShell>
  );
}
