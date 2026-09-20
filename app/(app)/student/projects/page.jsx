import { redirect } from "next/navigation";
import Link from "next/link";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { Display, Meta, ActionLink, StatusPill, PlainStat } from "@/components/loom/primitives";
import { OnboardingState } from "@/components/loom/States";

const STATUSES = ["active", "completed", "archived"];

function qs(base, extra) {
  const params = new URLSearchParams({ ...base, ...extra });
  for (const [k, v] of [...params]) if (!v) params.delete(k);
  const s = params.toString();
  return `/student/projects${s ? `?${s}` : ""}`;
}

function pillTone(status) {
  if (status === "active") return "live";
  if (status === "completed") return "solid";
  return "";
}

export default async function ProjectsPage({ searchParams }) {
  const ctx = await getRequestContext();
  if (ctx.error) redirect("/login?redirect=/student/projects");
  const { user, tenant, sql } = ctx;
  const sp = await searchParams;
  const tag = (sp?.tag || "").trim().toLowerCase();
  const q = (sp?.q || "").trim().slice(0, 80);
  const status = STATUSES.includes(sp?.status) ? sp.status : "";
  const base = { ...(q ? { q } : {}), ...(tag ? { tag } : {}), ...(status ? { status } : {}) };
  const tid = tenant?.id ?? null;

  const rows = await sql`
    SELECT * FROM projects
    WHERE owner_id = ${user.id}
      AND (${tid}::uuid IS NULL OR tenant_id IS NULL OR tenant_id = ${tid}::uuid)
    ORDER BY created_at DESC LIMIT 100
  `;

  const total = rows.length;
  const active = rows.filter((p) => p.status === "active").length;
  const completed = rows.filter((p) => p.status === "completed").length;
  const withRepo = rows.filter((p) => p.repo_url).length;

  function normalizeTag(t) { return String(t).toLowerCase().trim().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, ""); }
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

  return (
    <AppShell area="student" tenant={tenant} user={user}>
      <main className="mx-auto max-w-4xl px-4 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Meta>Build · workspace &amp; portfolio</Meta>
            <Display size="lg" className="mt-3">Build what proves your skills.</Display>
            <p className="narrative mt-4 max-w-xl" style={{ color: "var(--text)" }}>
              Projects turn learning into tangible work. Ship something small, track its status, link the repo — then carry it into proof.
            </p>
          </div>
          <Link href="/student/projects/new" prefetch={false} className="btn-ink">+ New project</Link>
        </div>

        {total > 0 && (
          <div className="mt-8 flex flex-wrap gap-x-10 gap-y-5 border-y py-6" style={{ borderColor: "var(--line)" }}>
            <PlainStat value={total} label={total === 1 ? "project started" : "projects started"} />
            <PlainStat value={active} label="active right now" />
            <PlainStat value={completed} label="completed" />
            <PlainStat value={withRepo} label="with repository linked" />
          </div>
        )}

        <form method="get" className="mt-6 flex flex-wrap items-center gap-2 rounded-[var(--radius-lg)] border p-2" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }} role="search">
          <input
            name="q"
            defaultValue={q}
            placeholder="Search title or description…"
            aria-label="Search projects"
            className="min-w-[220px] flex-1 rounded-[var(--radius-md)] border px-3 py-2 text-sm"
            style={{ borderColor: "var(--line)", background: "var(--bg-muted)", color: "var(--text)" }}
          />
          {tag && <input type="hidden" name="tag" value={tag} />}
          {status && <input type="hidden" name="status" value={status} />}
          <button className="btn-ink !py-2 text-sm">Search</button>
          {filtered && <Link href="/student/projects" prefetch={false} className="mono-tag hover:underline" style={{ color: "var(--text-muted)" }}>Clear</Link>}
          <span className="mx-1 hidden h-4 w-px sm:block" style={{ background: "var(--line)" }} aria-hidden="true" />
          <span className="mono-tag hidden sm:inline">Status</span>
          <span className="flex flex-wrap gap-1.5">
            <FilterLink href={qs({ q, tag }, {})} active={!status}>All</FilterLink>
            {STATUSES.map((s) => (
              <FilterLink key={s} href={qs({ q, tag }, { status: s })} active={status === s}>
                {s[0].toUpperCase() + s.slice(1)}
              </FilterLink>
            ))}
          </span>
          {allTags.length > 0 && (
            <span className="flex flex-wrap gap-1.5">
              <span className="mono-tag hidden sm:inline">Tag</span>
              <FilterLink href={qs({ q, status }, {})} active={!tag} small>All tags</FilterLink>
              {allTags.slice(0, 8).map((t) => (
                <FilterLink key={t} href={qs({ q, status }, { tag: t })} active={normTag === t} small>#{t}</FilterLink>
              ))}
            </span>
          )}
        </form>

        <div className="mt-8">
          {total === 0 ? (
            <OnboardingState
              eyebrow="Portfolio"
              title="Proof beats progress."
              why="Publish something small this week — a page, a script, a fix. Projects with a linked repo and a roadmap milestone become the strongest part of your proof."
              steps={[
                { title: "Create", body: "Name the thing you're building and what it should do." },
                { title: "Build", body: "Work in small steps; link the repository so the code is one click away." },
                { title: "Track & ship", body: "Move it from active to completed when it's real and running." },
              ]}
              action={<Link href="/student/projects/new" prefetch={false} className="btn-ink">Create your first project →</Link>}
            />
          ) : visible.length === 0 ? (
            <OnboardingState
              eyebrow="No matches"
              title={q ? `Nothing matches “${q}”.` : tag ? `Nothing tagged #${tag}.` : `No ${status} projects.`}
              why="Try a shorter search, or clear a filter — your other projects are still here."
              action={<Link href="/student/projects" prefetch={false} className="btn-ghost">Show everything</Link>}
            />
          ) : (
            <>
              <p className="meta">{visible.length} of {total} {total === 1 ? "project" : "projects"}</p>
              {showFeatured && (
                <Link href={`/student/projects/${featured.id}`} prefetch={false} className="mt-4 block rounded-xl border p-6 hover:shadow-sm" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
                  <span className="mono-tag" style={{ color: "var(--accent)" }}>Latest · {featured.status}</span>
                  <p className="display display-md mt-3" style={{ overflowWrap: "break-word" }}>{featured.title}</p>
                  {featured.description && <p className="narrative mt-3 max-w-2xl" style={{ color: "var(--text)" }}>{featured.description}</p>}
                  <span className="mono-tag mt-4 flex flex-wrap items-center gap-2">
                    <span className="rounded-full border px-2 py-0.5 text-[10px] tracking-widest" style={{ borderColor: featured.status === "active" ? "var(--accent)" : "var(--line)", color: featured.status === "active" ? "var(--accent)" : "var(--text-muted)" }}>{featured.status.toUpperCase()}</span>
                    {(featured.tags || []).map((t) => (
                      <span key={t} className="mono-tag">#{String(t).toLowerCase().trim().replace(/\s+/g, "-")}</span>
                    ))}
                    <span className="dot-sep">{featured.repo_url ? "repo linked" : "no repo yet"}</span>
                    <span style={{ color: "var(--accent)" }} className="ml-auto">View →</span>
                  </span>
                </Link>
              )}
              <ol className="mt-4 grid gap-3">
                {(showFeatured ? rest : visible).map((p, i) => (
                  <li key={p.id} className="rounded-xl border p-4 hover:shadow-sm" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
                    <Link href={`/student/projects/${p.id}`} prefetch={false} className="flex items-start gap-4">
                      <span className="index-num hidden shrink-0 sm:block pt-1">{String(i + 1).padStart(2, "0")}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-display text-[1.02rem] font-medium leading-6" style={{ color: "var(--text)", overflowWrap: "break-word" }}>{p.title}</span>
                        <span className="mt-1 block truncate text-sm" style={{ color: "var(--text-muted)" }}>
                          {p.description || "No description yet"}
                        </span>
                        <span className="mono-tag mt-2 flex flex-wrap gap-2">
                          <span className="rounded-full border px-2 py-0.5 text-[10px] tracking-widest" style={{ borderColor: p.status === "active" ? "var(--accent)" : "var(--line)", color: p.status === "active" ? "var(--accent)" : "var(--text-muted)" }}>{p.status.toUpperCase()}</span>
                          {(p.tags || []).slice(0, 4).map((t) => <span key={t} className="mono-tag">#{String(t).toLowerCase().trim().replace(/\s+/g, "-")}</span>)}
                          <span className="dot-sep">{p.repo_url ? "repo linked" : "no repo"}</span>
                        </span>
                      </span>
                      <span className="mono-tag hidden shrink-0 sm:block" style={{ color: "var(--accent)" }}>→</span>
                    </Link>
                  </li>
                ))}
              </ol>
              <div className="mt-8 flex flex-wrap justify-between gap-3">
                <ActionLink href="/student/github">Link activity on GitHub</ActionLink>
                <ActionLink href="/student/credentials">Turn shipped work into proof</ActionLink>
              </div>
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
      className={`transition active:scale-[0.97] ${small ? "px-3.5 py-1 font-mono text-xs" : "px-4 py-1.5 text-sm"} rounded-full font-medium`}
      style={active
        ? { background: "var(--text)", color: "var(--bg)" }
        : { background: "transparent", color: "var(--text-muted)", border: "1px solid var(--line)" }}
    >
      {children}
    </Link>
  );
}
