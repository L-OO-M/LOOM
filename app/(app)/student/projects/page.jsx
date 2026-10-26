import { redirect } from "next/navigation";
import Link from "next/link";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { ActionLink } from "@/components/loom/primitives";
import { OnboardingState } from "@/components/loom/States";
import { Reveal } from "@/components/motion/Reveal";
import { BuildTabs } from "@/components/student/SectionRails";
import "../_components/student-folio.css";
import "./projects.css";

const STATUSES = ["active", "completed", "archived"];

function qs(base, extra) {
  const params = new URLSearchParams({ ...base, ...extra });
  for (const [k, v] of [...params]) if (!v) params.delete(k);
  const s = params.toString();
  return `/student/projects${s ? `?${s}` : ""}`;
}

function tagLabel(t) {
  return String(t).toLowerCase().trim().replace(/\s+/g, "-");
}

export default async function ProjectsPage({ searchParams }) {
  const ctx = await getRequestContext();
  if (ctx.error) redirect("/login?redirect=/student/projects");
  const { user, tenant, sql } = ctx;
  const sp = (await searchParams) || {};
  const tag = (sp?.tag || "").trim().toLowerCase();
  const q = (sp?.q || "").trim().slice(0, 80);
  const status = STATUSES.includes(sp?.status) ? sp.status : "";
  const tid = tenant?.id ?? null;

  // ?owner=<uuid> is how a peer's public card links to *their* portfolio. Only a
  // same-chapter member whose card the viewer may see can be targeted; any other
  // value sends the viewer back to their own list rather than quietly showing it.
  const ownerParam = (sp?.owner || "").trim();
  let ownerCard = null;
  if (ownerParam && ownerParam !== user.id) {
    if (!/^[0-9a-fA-F-]{36}$/.test(ownerParam)) redirect("/student/projects");
    const [c] = await sql`
      SELECT user_id, username, is_public, tenant_id FROM user_profiles
      WHERE user_id = ${ownerParam} LIMIT 1
    `;
    if (c && (c.is_public || c.user_id === user.id) && (!c.tenant_id || c.tenant_id === tid)) ownerCard = c;
    else redirect("/student/projects");
  }
  const viewingOther = Boolean(ownerCard);
  const scopeOwnerId = ownerCard ? ownerCard.user_id : user.id;
  const base = {
    ...(ownerParam ? { owner: ownerParam } : {}),
    ...(q ? { q } : {}),
    ...(tag ? { tag } : {}),
    ...(status ? { status } : {}),
  };

  const rows = await sql`
    SELECT * FROM projects
    WHERE owner_id = ${scopeOwnerId}
      AND tenant_id = ${tid}::uuid
    ORDER BY created_at DESC LIMIT 100
  `;

  const total = rows.length;
  const active = rows.filter((p) => p.status === "active").length;
  const completed = rows.filter((p) => p.status === "completed").length;
  const withRepo = rows.filter((p) => p.repo_url).length;

  function normalizeTag(t) { return tagLabel(t).replace(/[^a-z0-9-]/g, ""); }
  const allTags = [...new Set(rows.flatMap((p) => (p.tags || []).map(normalizeTag).filter(Boolean)))].sort();
  const qLower = q.toLowerCase();
  const normTag = tag ? normalizeTag(tag) : "";
  const visible = rows.filter((p) => {
    if (status && p.status !== status) return false;
    if (normTag && !(p.tags || []).map(normalizeTag).includes(normTag)) return false;
    if (qLower && !(`${p.title || ""}\n${p.description || ""}`.toLowerCase().includes(qLower))) return false;
    return true;
  });
  const filtered = Boolean(q || tag || status);
  const [featured, ...rest] = visible;
  const showFeatured = !filtered && featured;
  const resetHref = viewingOther ? `/student/projects?owner=${ownerCard.user_id}` : "/student/projects";
  const completeShare = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <AppShell area="student" tenant={tenant} user={user}>
      <main className="desk workbench mx-auto max-w-6xl px-4 pb-4 sm:px-6">
        <Reveal>
          <section className="desk-hero workbench-hero" aria-labelledby="workbench-title">
            <div className="desk-hero-inner">
              <div className="desk-hero-main">
                <p className="desk-kicker">
                  <span>Build</span>
                  <span>{viewingOther ? `@${ownerCard.username}'s portfolio` : "Chapter workbench"}</span>
                </p>
                <h1 id="workbench-title" className="desk-title">
                  {viewingOther ? `What @${ownerCard.username} is building.` : "The workbench."}
                </h1>
                <p className="desk-lede">
                  {viewingOther
                    ? `Work published by @${ownerCard.username}. Read the build, follow the repo, or start something of your own.`
                    : "Projects turn learning into tangible work. Ship something small, track its status, link the repo, then carry it into proof."}
                </p>
                <p className="desk-meta-line">
                  {total} {total === 1 ? "project" : "projects"} &middot; {active} active &middot; {withRepo} repositories linked
                </p>
                <div className="desk-actions">
                  {viewingOther ? (
                    <Link href={`/student/${ownerCard.username}`} prefetch={false} className="btn-ghost">
                      Back to @{ownerCard.username}
                    </Link>
                  ) : (
                    <Link href="/student/projects/new" prefetch={false} className="btn-ink">
                      Start a project
                    </Link>
                  )}
                  {!viewingOther && total > 0 && (
                    <ActionLink href="/student/credentials">Turn shipped work into proof</ActionLink>
                  )}
                </div>
              </div>

              <aside className="desk-pass workbench-pass" aria-label="Workbench inventory">
                <p className="desk-label">
                  {viewingOther ? "Portfolio register" : "Bench inventory"}
                </p>
                <p className="desk-pass-value">
                  {total}
                  <span>{total === 1 ? "project" : "projects"}</span>
                </p>
                <p className="desk-pass-note">
                  {total === 0
                    ? "Nothing on the bench yet."
                    : `${completeShare}% of the bench is shipped.`}
                </p>
                <div
                  className="desk-pass-track"
                  role="img"
                  aria-label={`${completeShare} percent of projects completed`}
                >
                  <span style={{ width: `${completeShare}%` }} />
                </div>
                <dl className="desk-pass-list">
                  <div>
                    <dt>Active</dt>
                    <dd>{active} in progress</dd>
                  </div>
                  <div>
                    <dt>Shipped</dt>
                    <dd>{completed} completed</dd>
                  </div>
                  <div>
                    <dt>Repos</dt>
                    <dd>{withRepo} linked</dd>
                  </div>
                </dl>
              </aside>
            </div>
          </section>
        </Reveal>

        <div className="workbench-tabs">
          <BuildTabs active="/student/projects" />
        </div>

        {viewingOther && filtered && (
          <p className="workbench-clear-note">
            <Link href={resetHref} prefetch={false}>Clear filters</Link>
          </p>
        )}

        <form method="get" className="workbench-toolbar" role="search">
          {ownerParam && <input type="hidden" name="owner" value={ownerParam} />}
          {tag && <input type="hidden" name="tag" value={tag} />}
          {status && <input type="hidden" name="status" value={status} />}
          <div className="workbench-search">
            <label htmlFor="workbench-q" className="workbench-toolbar-label">Find</label>
            <input
              id="workbench-q"
              name="q"
              defaultValue={q}
              placeholder="Search titles and descriptions"
              aria-label="Search projects"
              className="workbench-input"
            />
            <button className="btn-ink !py-2 text-sm">Search</button>
            {filtered && <Link href={resetHref} prefetch={false} className="workbench-reset">Reset</Link>}
          </div>
          <div className="workbench-filter-row">
            <span className="workbench-toolbar-label">Status</span>
            <FilterLink href={qs({ owner: ownerParam, q, tag }, {})} active={!status}>All</FilterLink>
            {STATUSES.map((s) => (
              <FilterLink
                key={s}
                href={qs({ owner: ownerParam, q, tag }, { status: s })}
                active={status === s}
              >
                {s[0].toUpperCase() + s.slice(1)}
              </FilterLink>
            ))}
            {allTags.length > 0 && (
              <>
                <span className="workbench-toolbar-label workbench-tag-label">Tags</span>
                <FilterLink
                  href={qs({ owner: ownerParam, q, status }, {})}
                  active={!tag}
                  small
                >
                  All
                </FilterLink>
                {allTags.slice(0, 8).map((t) => (
                  <FilterLink
                    key={t}
                    href={qs({ owner: ownerParam, q, status }, { tag: t })}
                    active={normTag === t}
                    small
                  >
                    #{t}
                  </FilterLink>
                ))}
              </>
            )}
          </div>
        </form>

        <div className="workbench-body">
          {total === 0 ? (
            viewingOther ? (
              <OnboardingState
                eyebrow="Portfolio"
                title={`@${ownerCard.username} hasn't published a project yet.`}
                why="When they ship something it will show up here, repo link and roadmap milestone included."
                action={
                  <Link href={`/student/${ownerCard.username}`} prefetch={false} className="btn-ghost">
                    Back to @{ownerCard.username}
                  </Link>
                }
              />
            ) : (
              <OnboardingState
                eyebrow="Portfolio"
                title="Proof beats progress."
                why="Publish something small this week: a page, a script, a fix. Projects with a linked repo and a roadmap milestone become the strongest part of your proof."
                steps={[
                  { title: "Create", body: "Name the thing you're building and what it should do." },
                  { title: "Build", body: "Work in small steps; link the repository so the code is one click away." },
                  { title: "Track & ship", body: "Move it from active to completed when it's real and running." },
                ]}
                action={
                  <Link href="/student/projects/new" prefetch={false} className="btn-ink">
                    Create your first project
                  </Link>
                }
              />
            )
          ) : visible.length === 0 ? (
            <OnboardingState
              eyebrow="No matches"
              title={q ? `Nothing matches “${q}”.` : tag ? `Nothing tagged #${tag}.` : `No ${status} projects.`}
              why={
                viewingOther
                  ? "Try a shorter search, or clear the filter; their other projects are still here."
                  : "Try a shorter search, or clear a filter; your other projects are still here."
              }
              action={
                <Link href={resetHref} prefetch={false} className="btn-ghost">
                  Show everything
                </Link>
              }
            />
          ) : (
            <>
              {showFeatured && (
                <section className="workbench-feature" aria-labelledby="workbench-feature-title">
                  <p className="workbench-overline">
                    Current build <span>{featured.status}</span>
                  </p>
                  <div className="workbench-feature-grid">
                    <div className="workbench-feature-main">
                      <Link href={`/student/projects/${featured.id}`} prefetch={false}>
                        <h2 id="workbench-feature-title" className="workbench-feature-title">
                          {featured.title}
                        </h2>
                      </Link>
                      <p className="workbench-feature-desc">
                        {featured.description || "The bench is quiet; this build has no notes yet."}
                      </p>
                      <p className="workbench-feature-meta">
                        <span className="workbench-status" data-status={featured.status}>
                          {featured.status}
                        </span>
                        <span>{featured.repo_url ? "repository linked" : "repository pending"}</span>
                        {(featured.tags || []).slice(0, 4).map((t) => (
                          <span key={t}>#{tagLabel(t)}</span>
                        ))}
                      </p>
                    </div>
                    <div className="workbench-feature-side">
                      <p className="workbench-side-label">Bench note</p>
                      <p className="workbench-side-copy">
                        {featured.repo_url
                          ? "The code is open. Read the work, then leave a note or start your own."
                          : "This build is still finding its shape. A linked repo makes it portable proof."}
                      </p>
                      <Link
                        href={`/student/projects/${featured.id}`}
                        prefetch={false}
                        className="workbench-open"
                      >
                        Open the project <span aria-hidden="true">&rarr;</span>
                      </Link>
                    </div>
                  </div>
                </section>
              )}

              <div className="workbench-index-head">
                <p>
                  {visible.length} of {total} {total === 1 ? "project" : "projects"}
                </p>
                <p>Newest first</p>
              </div>

              <ol className="workbench-list">
                {(showFeatured ? rest : visible).map((p, i) => (
                  <li key={p.id} className="workbench-row">
                    <Link href={`/student/projects/${p.id}`} prefetch={false} className="workbench-row-link">
                      <span className="workbench-row-index">{String(i + 1).padStart(2, "0")}</span>
                      <span className="workbench-row-main">
                        <span className="workbench-row-top">
                          <span className="workbench-row-title">{p.title}</span>
                          <span className="workbench-status" data-status={p.status}>
                            {p.status}
                          </span>
                        </span>
                        <span className="workbench-row-desc">
                          {p.description || "No description yet."}
                        </span>
                        <span className="workbench-row-meta">
                          {(p.tags || []).slice(0, 4).map((t) => (
                            <span key={t}>#{tagLabel(t)}</span>
                          ))}
                          <span>{p.repo_url ? "repo linked" : "no repo yet"}</span>
                        </span>
                      </span>
                      <span className="workbench-row-arrow" aria-hidden="true">&rarr;</span>
                    </Link>
                  </li>
                ))}
              </ol>

              {!viewingOther && (
                <div className="workbench-footer">
                  <ActionLink href="/student/github">Link activity on GitHub</ActionLink>
                  <ActionLink href="/student/credentials">Turn shipped work into proof</ActionLink>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </AppShell>
  );
}

function FilterLink({ href, active, small, children }) {
  return (
    <Link
      href={href}
      prefetch={false}
      aria-pressed={active}
      className={`workbench-filter ${small ? "is-small" : ""}`}
    >
      {children}
    </Link>
  );
}
