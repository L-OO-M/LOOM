import Link from "next/link";
import { redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { OSS_BADGES } from "@/lib/oss";
import { Meta } from "@/components/loom/primitives";
import { WorkspaceMasthead, WorkspaceSection } from "@/components/loom/WorkspaceMasthead";
import { BuildTabs } from "@/components/student/SectionRails";
import { domainLabel } from "@/lib/domains";
import {
  OSS_LEVELS,
  inferLevel,
  isKnownDomain,
  levelLabel,
  normalizeDomain,
  sortRepos
} from "@/lib/oss-match";
import ClaimForm from "./ClaimForm";
import TrailClient from "./TrailClient";
import RepoCard from "./_components/RepoCard";
import GuideTabs from "./_components/GuideTabs";

export const dynamic = "force-dynamic";

const SORTS = ["match", "gfi", "stars", "name"];
const PER_PAGE = 12;

function str(value) {
  return typeof value === "string" ? value : "";
}

function fmtSynced(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export default async function OpenSourcePage({ searchParams }) {
  const ctx = await getRequestContext();
  if (ctx.error) redirect("/login?redirect=/student/opensource");
  const { user, tenant, sql, profile } = ctx;
  const sp = await searchParams;

  const q = str(sp?.q).trim();
  const diff = OSS_LEVELS.includes(str(sp?.difficulty)) ? str(sp.difficulty) : "";
  const requestedDomain = str(sp?.domain);
  const domain = isKnownDomain(requestedDomain) ? requestedDomain : "";
  const lang = str(sp?.language).slice(0, 40);
  const match = str(sp?.nomatch) !== "1";
  const requestedSort = str(sp?.sort);
  const sort = SORTS.includes(requestedSort)
    ? requestedSort === "match" && !match
      ? "stars"
      : requestedSort
    : match
      ? "match"
      : "stars";
  const requestedPage = Math.max(1, Number.parseInt(str(sp?.page), 10) || 1);
  const initialRepo = /^[\w.-]+\/[\w.-]+$/.test(str(sp?.repo)) ? str(sp.repo) : "";

  const primaryDomain = normalizeDomain(profile?.primary_domain) || null;

  // Roadmap progress in the student's own domain is the second signal used to
  // infer experience. A global count would call a web student advanced because
  // they finished an unrelated AI track.
  let totalNodes = 0;
  let completedNodes = 0;
  if (primaryDomain) {
    const [progress] = await sql`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE p.status = 'completed')::int AS done
      FROM roadmap_nodes n
      LEFT JOIN student_roadmap_progress p
        ON p.node_id = n.id AND p.student_id = ${user.id}
      WHERE n.domain = ${primaryDomain}
    `;
    totalNodes = Number(progress?.total) || 0;
    completedNodes = Number(progress?.done) || 0;
  }
  const levelInfo = inferLevel({
    explicit: profile?.oss_level || null,
    year: profile?.year || null,
    completedNodes,
    totalNodes
  });

  const mine = await sql`
    SELECT c.*, p.owner, p.repo_name, p.language
    FROM student_oss_contributions c
    LEFT JOIN open_source_projects p ON p.id = c.project_id
    WHERE c.student_id = ${user.id}
    ORDER BY c.created_at DESC LIMIT 50
  `;
  const languages = [...new Set(mine.map((c) => c.language).filter(Boolean))].slice(0, 3);
  const matchProfile = {
    primaryDomain,
    level: levelInfo.level,
    languages
  };

  const rows = await sql`
    SELECT *, COUNT(*) OVER() AS total_count
    FROM open_source_projects
    WHERE (tenant_id IS NULL OR tenant_id = ${tenant?.id ?? null}::uuid)
      AND is_active
      AND (${diff || null}::text IS NULL OR difficulty = ${diff || null})
      AND (${domain || null}::text IS NULL OR primary_domain = ${domain || null})
      AND (${lang || null}::text IS NULL OR language = ${lang || null})
      AND (
        ${q || null}::text IS NULL
        OR owner ILIKE ${q ? `%${q}%` : null}
        OR repo_name ILIKE ${q ? `%${q}%` : null}
        OR description ILIKE ${q ? `%${q}%` : null}
        OR array_to_string(topics, ' ') ILIKE ${q ? `%${q}%` : null}
      )
    ORDER BY is_curated DESC, stars DESC
    LIMIT 500
  `;
  const total = Number(rows[0]?.total_count) || 0;
  const ranked = sortRepos(rows, matchProfile, { sort });
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  const page = Math.min(requestedPage, totalPages);
  const start = (page - 1) * PER_PAGE;
  const visible = ranked.slice(start, start + PER_PAGE);
  const recommended = match ? ranked.slice(0, 3) : [];

  const domFacets = await sql`
    SELECT DISTINCT primary_domain FROM open_source_projects
    WHERE (tenant_id IS NULL OR tenant_id = ${tenant?.id ?? null}::uuid)
      AND is_active AND primary_domain IS NOT NULL
    ORDER BY primary_domain
  `;
  const langFacets = await sql`
    SELECT DISTINCT language FROM open_source_projects
    WHERE (tenant_id IS NULL OR tenant_id = ${tenant?.id ?? null}::uuid)
      AND is_active AND language IS NOT NULL
    ORDER BY language
  `;
  const [{ count: catalogueCount = 0 } = {}] = await sql`
    SELECT COUNT(*)::int AS count FROM open_source_projects
    WHERE (tenant_id IS NULL OR tenant_id = ${tenant?.id ?? null}::uuid) AND is_active
  `;

  const badges = await sql`SELECT * FROM oss_badges WHERE student_id = ${user.id} ORDER BY earned_at DESC`;
  const credentials = await sql`
    SELECT id, achievement_id FROM verifiable_credentials
    WHERE student_id = ${user.id}
  `;
  const achievements = await sql`
    SELECT id, source_ref FROM student_achievements
    WHERE student_id = ${user.id} AND source_type = 'oss'
  `;
  const earned = new Set(badges.map((b) => b.badge_key));
  // /verify/credential/[id] reads verifiable_credentials.id (a text code), not
  // student_achievements.id. This used to pass the achievement UUID, so every
  // "Open proof →" link was a guaranteed 404. Join through achievement_id.
  const credentialByAchievement = new Map(credentials.map((c) => [c.achievement_id, c.id]));
  const proofByBadge = Object.fromEntries(
    achievements
      .map((a) => [a.source_ref, credentialByAchievement.get(a.id)])
      .filter(([, credId]) => Boolean(credId))
  );

  const verified = mine.filter((c) => c.status === "verified").length;
  const verifiedPrs = mine.filter((c) => c.status === "verified" && c.contribution_type === "pr").length;
  const verifiedReviews = mine.filter((c) => c.status === "verified" && c.contribution_type === "review").length;
  const lastSynced = fmtSynced(
    rows.reduce((latest, r) => (r.metadata_synced_at && (!latest || r.metadata_synced_at > latest) ? r.metadata_synced_at : latest), null)
  );

  const makeHref = (overrides = {}) => {
    const next = {
      q,
      difficulty: diff,
      domain,
      language: lang,
      sort,
      nomatch: match ? "" : "1",
      ...overrides
    };
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(next)) {
      if (value === null || value === undefined || value === "" || value === false) continue;
      params.set(key, String(value));
    }
    const qs = params.toString();
    return `/student/opensource${qs ? `?${qs}` : ""}`;
  };
  const claimHrefFor = (repo) => `${makeHref({ repo: `${repo.owner}/${repo.repo_name}`, page: null })}#claim`;

  const chips = [
    q ? { key: "q", label: `“${q}”`, href: makeHref({ q: "" }) } : null,
    diff ? { key: "difficulty", label: levelLabel(diff), href: makeHref({ difficulty: "" }) } : null,
    domain ? { key: "domain", label: domainLabel(domain), href: makeHref({ domain: "" }) } : null,
    lang ? { key: "language", label: lang, href: makeHref({ language: "" }) } : null
  ].filter(Boolean);

  const levelBasis =
    levelInfo.basis === "set"
      ? "You set this level in your profile."
      : `Inferred from ${profile?.year ? `year ${profile.year}` : "your profile"}${
          totalNodes > 0 ? ` and ${completedNodes}/${totalNodes} ${domainLabel(primaryDomain)} roadmap nodes` : ""
        }.`;

  return (
    <AppShell area="student" tenant={tenant} user={user}>
      <main className="mx-auto max-w-6xl px-4 pb-8 sm:px-6">
        <WorkspaceMasthead
          kicker="Open source / build · contribute · prove"
          title="Open source, without the guesswork."
          lede="Find a repository that fits your level and domain, make one useful contribution, and let LOOM keep the proof."
          meta={`${catalogueCount} curated ${catalogueCount === 1 ? "repository" : "repositories"}${lastSynced ? ` / metadata synced ${lastSynced}` : " / metadata as curated"}`}
          tone="field"
          art="/storyloom/opensource.png"
          artAlt=""
          stats={[
            { value: verified, label: "verified contributions" },
            { value: mine.length, unit: mine.length === 1 ? "claim" : "claims", label: "put your name on" },
            { value: `${earned.size}/${OSS_BADGES.length}`, label: "badges earned" },
            { value: levelLabel(levelInfo.level), label: "starting level" }
          ]}
        />

        <BuildTabs active="/student/opensource" />

        {/* JOURNEY — Discover → Contribute → Verify → Prove (real state, no scores) */}
        <WorkspaceSection title="The contribution loop" note="Four honest states, read straight from your record.">
          <ol className="grid gap-5 pt-4 sm:grid-cols-4">
            <li>
              <p className="index-num">01</p>
              <p className="mt-1 text-sm font-semibold" style={{ color: "var(--text)" }}>Discover</p>
              <p className="mt-0.5 text-xs leading-5" style={{ color: "var(--text-muted)" }}>
                {catalogueCount === 0 ? "No curated repositories yet" : `${catalogueCount} curated ${catalogueCount === 1 ? "repository" : "repositories"} to explore`}
              </p>
            </li>
            <li>
              <p className="index-num">02</p>
              <p className="mt-1 text-sm font-semibold" style={{ color: "var(--text)" }}>Contribute</p>
              <p className="mt-0.5 text-xs leading-5" style={{ color: "var(--text-muted)" }}>
                {mine.length === 0 ? "Nothing claimed yet" : `${mine.length} contribution${mine.length === 1 ? "" : "s"} claimed`}
              </p>
            </li>
            <li>
              <p className="index-num">03</p>
              <p className="mt-1 text-sm font-semibold" style={{ color: "var(--text)" }}>Verify</p>
              <p className="mt-0.5 text-xs leading-5" style={{ color: "var(--text-muted)" }}>
                {verified === 0
                  ? "No verified contributions yet"
                  : `${verifiedPrs} merged PR${verifiedPrs === 1 ? "" : "s"}${verifiedReviews ? ` · ${verifiedReviews} review${verifiedReviews === 1 ? "" : "s"}` : ""}`}
              </p>
            </li>
            <li>
              <p className="index-num">04</p>
              <p className="mt-1 text-sm font-semibold" style={{ color: "var(--text)" }}>Prove</p>
              <p className="mt-0.5 text-xs leading-5" style={{ color: "var(--text-muted)" }}>
                {earned.size === 0 ? "No badges earned yet" : `${earned.size} of ${OSS_BADGES.length} badges earned`}
              </p>
            </li>
          </ol>
        </WorkspaceSection>

        <div className="mt-12 grid gap-10 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-12">
          <div className="min-w-0">
            {/* MATCH */}
            <section aria-label="Matching profile" className="rounded-[var(--radius-xl)] border p-4" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <Meta style={{ color: "var(--accent)" }}>Match · your profile</Meta>
                  <p className="mt-1 text-sm font-semibold" style={{ color: "var(--text)" }}>
                    {primaryDomain ? domainLabel(primaryDomain) : "No domain set"} · {levelLabel(levelInfo.level)}
                  </p>
                  <p className="mt-0.5 text-xs leading-5" style={{ color: "var(--text-muted)" }}>
                    {levelBasis}
                    {languages.length > 0 ? ` You have claimed work in ${languages.join(", ")}.` : ""}
                  </p>
                </div>
                <Link
                  href={makeHref({ nomatch: match ? "1" : null, page: null })}
                  prefetch={false}
                  className="mono-tag rounded-full border px-3 py-1.5 font-semibold"
                  style={{ borderColor: "var(--line)", color: "var(--accent)" }}
                >
                  {match ? "Personalization on" : "Personalization off"}
                </Link>
              </div>
              <p className="meta mt-3" style={{ textTransform: "none", letterSpacing: "0.02em" }}>
                Ranking uses domain fit, level distance, open starter issues, language and recent activity. It does not predict whether a maintainer will merge your work.
              </p>
            </section>

            {recommended.length > 0 && (
              <WorkspaceSection
                index="02"
                title="Three places to start"
                note={`Chosen for ${primaryDomain ? domainLabel(primaryDomain) : "your profile"} at ${levelLabel(levelInfo.level).toLowerCase()} level.`}
              >
                <ul className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {recommended.map((p) => (
                    <RepoCard
                      key={`rec-${p.id}`}
                      repo={p}
                      reasons={p.matchReasons}
                      claimHref={claimHrefFor(p)}
                    />
                  ))}
                </ul>
              </WorkspaceSection>
            )}

            {/* FIND */}
            <WorkspaceSection
              index="03"
              title="The catalogue"
              note="Filter by what you can commit this week, not by what sounds impressive."
            >
              <form
                method="get"
                className="mt-4 rounded-[var(--radius-lg)] border p-2 lg:sticky lg:top-4 lg:z-20"
                style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    name="q"
                    defaultValue={q}
                    placeholder="Search repos, descriptions, topics…"
                    aria-label="Search repositories"
                    className="min-w-[180px] flex-1 rounded-[var(--radius-md)] border px-3 py-2 text-sm"
                    style={{ borderColor: "var(--line)", background: "var(--bg-muted)", color: "var(--text)" }}
                  />
                  <select name="difficulty" defaultValue={diff} aria-label="Filter by level" className="rounded-full border px-3 py-1.5 text-xs font-semibold" style={{ borderColor: "var(--line)", background: "var(--bg-muted)", color: "var(--text)" }}>
                    <option value="">All levels</option>
                    {OSS_LEVELS.map((l) => (
                      <option key={l} value={l}>{levelLabel(l)}</option>
                    ))}
                  </select>
                  <select name="domain" defaultValue={domain} aria-label="Filter by domain" className="max-w-40 rounded-full border px-3 py-1.5 text-xs font-semibold" style={{ borderColor: "var(--line)", background: "var(--bg-muted)", color: "var(--text)" }}>
                    <option value="">All domains</option>
                    {domFacets.map((d) => (
                      <option key={d.primary_domain} value={d.primary_domain}>{domainLabel(d.primary_domain)}</option>
                    ))}
                  </select>
                  <select name="language" defaultValue={lang} aria-label="Filter by language" className="max-w-40 rounded-full border px-3 py-1.5 text-xs font-semibold" style={{ borderColor: "var(--line)", background: "var(--bg-muted)", color: "var(--text)" }}>
                    <option value="">All languages</option>
                    {langFacets.map((l) => (
                      <option key={l.language} value={l.language}>{l.language}</option>
                    ))}
                  </select>
                  <select name="sort" defaultValue={sort} aria-label="Sort repositories" className="rounded-full border px-3 py-1.5 text-xs font-semibold" style={{ borderColor: "var(--line)", background: "var(--bg-muted)", color: "var(--text)" }}>
                    <option value="match">Best match</option>
                    <option value="gfi">Most starter issues</option>
                    <option value="stars">Most stars</option>
                    <option value="name">A–Z</option>
                  </select>
                  {!match && <input type="hidden" name="nomatch" value="1" />}
                  <button className="btn-ink !py-1.5 text-xs" type="submit">Apply</button>
                </div>
                {chips.length > 0 && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t pt-2" style={{ borderColor: "var(--line)" }}>
                    <span className="meta">Active</span>
                    {chips.map((chip) => (
                      <Link
                        key={chip.key}
                        href={chip.href}
                        prefetch={false}
                        className="rounded-full border px-2 py-0.5 text-[10px] font-semibold"
                        style={{ borderColor: "var(--line)", color: "var(--text)" }}
                      >
                        {chip.label} ×
                      </Link>
                    ))}
                    <Link href="/student/opensource" prefetch={false} className="meta underline">Clear all</Link>
                  </div>
                )}
              </form>

              <div className="mt-4 flex flex-wrap items-baseline justify-between gap-2">
                <p className="meta" aria-live="polite">
                  {total === 0
                    ? "No repositories match"
                    : `Showing ${start + 1}–${Math.min(start + PER_PAGE, total)} of ${total}`}
                </p>
                <p className="meta" style={{ textTransform: "none", letterSpacing: "0.02em" }}>
                  {lastSynced ? `GitHub metadata last synced ${lastSynced}` : "Metadata as curated, not live"}
                </p>
              </div>

              {visible.length === 0 ? (
                <div className="mt-4 rounded-[var(--radius-xl)] border p-6" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
                  <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>Nothing matched that combination.</p>
                  <p className="mt-1 text-xs leading-5" style={{ color: "var(--text-muted)" }}>
                    Remove a filter, search a language instead of a domain, or ask your chapter admin to curate a repository.
                  </p>
                  <Link href="/student/opensource" prefetch={false} className="mt-3 inline-block text-sm font-semibold hover:underline" style={{ color: "var(--accent)" }}>
                    Reset filters →
                  </Link>
                </div>
              ) : (
                <ul className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {visible.map((p) => (
                    <RepoCard
                      key={p.id}
                      repo={p}
                      reasons={match ? p.matchReasons : []}
                      claimHref={claimHrefFor(p)}
                    />
                  ))}
                </ul>
              )}

              {totalPages > 1 && (
                <nav className="mt-6 flex items-center justify-between gap-3" aria-label="Repository pages">
                  {page > 1 ? (
                    <Link href={`${makeHref({ page: page - 1 })}`} prefetch={false} className="btn-ghost !py-2 text-sm">← Previous</Link>
                  ) : (
                    <span className="meta">← Previous</span>
                  )}
                  <span className="meta">Page {page} of {totalPages}</span>
                  {page < totalPages ? (
                    <Link href={`${makeHref({ page: page + 1 })}`} prefetch={false} className="btn-ghost !py-2 text-sm">Next →</Link>
                  ) : (
                    <span className="meta">Next →</span>
                  )}
                </nav>
              )}
            </WorkspaceSection>

            {/* GUIDE */}
            <WorkspaceSection
              index="04"
              title="Pick → prepare → ship → claim"
              note="A contribution is one issue, one small pull request, and a clear description of what you tested."
            >
              <GuideTabs />
            </WorkspaceSection>

            {/* TRACK */}
            <WorkspaceSection index="05" title="Your contribution trail" note="Everything you have claimed, newest first.">
              <div className="mt-4"><TrailClient items={mine} /></div>
            </WorkspaceSection>
          </div>

          {/* SIDEBAR — persistent contribution panel */}
          <div className="min-w-0">
            <div className="space-y-10 lg:sticky lg:top-24">
              <section id="claim" aria-label="Claim a contribution" className="scroll-mt-24 rounded-2xl border p-5" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
                <Meta style={{ color: "var(--accent)" }}>Contribute · claim</Meta>
                <h2 className="h-product mt-2" style={{ fontSize: "1.1rem" }}>Claim your contribution</h2>
                <p className="mt-2 text-xs leading-5" style={{ color: "var(--text-muted)" }}>
                  Made a pull request, reported an issue, or reviewed code in a tracked repository? Claim it here so LOOM can verify it.
                </p>
                <div className="mt-3"><ClaimForm initialRepo={initialRepo} /></div>
              </section>

              <section aria-label="Badge journal">
                <Meta>Prove · badge journal</Meta>
                <h2 className="h-product mt-2" style={{ fontSize: "1.1rem" }}>Badge journal</h2>
                <ol className="mt-4 space-y-4">
                  {OSS_BADGES.map((b) => {
                    const has = earned.has(b.key);
                    const proofId = proofByBadge[b.key];
                    return (
                      <li key={b.key} className="flex items-start gap-3">
                        <span className="mt-1 size-2 shrink-0 rounded-full" style={{ background: has ? "var(--accent)" : "var(--line)" }} aria-hidden="true" />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold" style={{ color: has ? "var(--text)" : "var(--text-muted)" }}>
                            {b.name}
                            <span className="meta ml-2" style={{ letterSpacing: "0.08em" }}>{has ? "Earned" : "Locked"}</span>
                          </p>
                          <p className="mt-0.5 text-xs leading-5" style={{ color: "var(--text-muted)" }}>{b.desc}</p>
                          {has && proofId && (
                            <Link href={`/verify/credential/${proofId}`} prefetch={false} className="mt-1 inline-block text-xs font-semibold hover:underline" style={{ color: "var(--accent)" }}>
                              Open proof →
                            </Link>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ol>
                <div className="mt-5 border-t pt-4" style={{ borderColor: "var(--line)" }}>
                  <p className="text-xs leading-5" style={{ color: "var(--text-muted)" }}>
                    Verified contributions can become part of your LOOM proof — contribute, get verified, earn a badge, share it as a credential.
                  </p>
                  <Link href="/student/credentials" prefetch={false} className="mt-2 inline-block text-sm font-semibold hover:underline" style={{ color: "var(--accent)" }}>
                    View your credentials →
                  </Link>
                </div>
              </section>
            </div>
          </div>
        </div>

        <p className="narrative mt-10">
          Chapters learn from each other. <Link href="/student/network" prefetch={false} className="font-semibold hover:underline" style={{ color: "var(--accent)" }}>Compare with other chapters →</Link>
        </p>
      </main>
    </AppShell>
  );
}
