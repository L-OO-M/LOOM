import { redirect } from "next/navigation";
import Link from "next/link";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { ResourceCompleteButton } from "@/components/actions";
import { Display, Meta, ActionLink } from "@/components/loom/primitives";
import { OnboardingState } from "@/components/loom/States";

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

function qs(base, extra) {
  const params = new URLSearchParams({ ...base, ...extra });
  for (const [k, v] of [...params]) if (!v) params.delete(k);
  const s = params.toString();
  return `/student/resources${s ? `?${s}` : ""}`;
}

export default async function ResourcesPage({ searchParams }) {
  const ctx = await getRequestContext();
  if (ctx.error) redirect("/login?redirect=/student/resources");
  const { user, tenant, sql } = ctx;
  const sp = await searchParams;
  const domain = sp?.domain || "";
  const q = sp?.q || "";
  const kind = ["article", "doc", "video", "course"].includes(sp?.kind) ? sp.kind : "";
  const base = { ...(q ? { q } : {}), ...(kind ? { kind } : {}) };

  const profile = await sql`SELECT primary_domain FROM profiles WHERE id = ${user.id} LIMIT 1`;
  const primaryDomain = profile[0]?.primary_domain || "";

  const counts = await sql`SELECT domain, COUNT(*)::int AS n FROM resources GROUP BY domain`;
  const countBy = Object.fromEntries(counts.map((c) => [c.domain, c.n]));

  const resources = await sql`
    SELECT * FROM resources
    WHERE TRUE
    ${domain ? sql`AND domain = ${domain}` : sql``}
    ${q ? sql`AND title ILIKE ${"%" + q + "%"}` : sql``}
    ${kind ? sql`AND kind = ${kind}` : sql``}
    ORDER BY minutes ASC LIMIT 60
  `;

  const done = await sql`SELECT resource_id FROM resource_progress WHERE student_id = ${user.id} AND status = 'completed'`;
  const doneSet = new Set(done.map((d) => d.resource_id));
  const kindLabel = (k) => (k === "doc" ? "Doc" : k === "video" ? "Video" : k === "course" ? "Course" : "Article");
  const track = TRACKS.find((t) => t.id === (domain || primaryDomain));

  return (
    <AppShell area="student" tenant={tenant} user={user}>
      <main className="mx-auto max-w-4xl px-4 sm:px-6">
        <Meta>Learn · the curated library</Meta>
        <Display size="lg" className="mt-3">
          {domain ? track?.label ?? domain : "Read with intent."}
        </Display>
        <p className="narrative mt-4" style={{ color: "var(--text)" }}>
          {domain
            ? track?.focus ?? "Mentor-curated material for this track."
            : "Five tracks, curated by mentors — not an endless feed. Finish something and it stays on your record."}
        </p>

        {!domain && !q && primaryDomain && (
          <div className="mt-8 border-y py-6" style={{ borderColor: "var(--line)" }}>
            <Meta style={{ color: "var(--accent)" }}>Continue in {TRACKS.find((t) => t.id === primaryDomain)?.label}</Meta>
            <div className="mt-3 flex flex-wrap items-baseline justify-between gap-3">
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>{countBy[primaryDomain] ?? 0} pieces of material on your path</p>
              <ActionLink href={qs(base, { domain: primaryDomain })}>Open the shelf</ActionLink>
            </div>
          </div>
        )}

        {!domain && !q && (
          <nav className="mt-10" aria-label="Learning tracks">
            <Meta>Browse by track</Meta>
            <ol className="mt-4">
              {TRACKS.map((t, i) => (
                <li key={t.id} className="border-b first:border-t" style={{ borderColor: "var(--line)" }}>
                  <Link href={qs(base, { domain: t.id })} className="row-link flex items-baseline gap-5 px-2 py-5">
                    <span className="index-num shrink-0">{String(i + 1).padStart(2, "0")}</span>
                    <span className="min-w-0 flex-1">
                      <span className="font-display block text-2xl font-medium" style={{ color: "var(--text)" }}>{t.label}</span>
                      <span className="mt-1 block max-w-xl text-sm leading-6" style={{ color: "var(--text-muted)" }}>{t.focus}</span>
                    </span>
                    <span className="meta shrink-0">{countBy[t.id] ?? 0} pieces</span>
                  </Link>
                </li>
              ))}
            </ol>
          </nav>
        )}

        <form method="get" className="mt-10 flex flex-wrap items-center gap-2" role="search">
          <input
            name="q"
            defaultValue={q}
            placeholder="Search the library…"
            aria-label="Search resources"
            style={{ borderRadius: 10, border: "1px solid var(--line)", background: "var(--bg-muted)", color: "var(--text)", padding: "8px 12px", fontSize: 14, minWidth: 220 }}
          />
          {domain && <input type="hidden" name="domain" value={domain} />}
          {kind && <input type="hidden" name="kind" value={kind} />}
          <button className="btn-ink !py-2">Search</button>
          {(q || domain || kind) && <Link href="/student/resources" className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>Clear all</Link>}
        </form>

        <div className="mt-5 flex flex-wrap gap-2" aria-label="Filter by track">
          <FilterLink href={qs({ q, kind }, {})} active={!domain}>All tracks</FilterLink>
          {TRACKS.map((t) => (
            <FilterLink key={t.id} href={qs({ q, kind }, { domain: t.id })} active={domain === t.id}>
              {t.label} · {countBy[t.id] ?? 0}
            </FilterLink>
          ))}
        </div>
        <div className="mt-2.5 flex flex-wrap gap-2" aria-label="Filter by format">
          {KINDS.map((k) => (
            <FilterLink key={k.id || "all"} href={qs({ q, domain }, { kind: k.id })} active={kind === k.id} small>
              {k.label}
            </FilterLink>
          ))}
        </div>

        <div className="mt-8">
          {resources.length === 0 ? (
            <OnboardingState
              eyebrow={q ? "No matches" : "Being curated"}
              title={q ? `Nothing matches “${q}”.` : "This shelf is being stocked."}
              why={q ? "Try a shorter search, or browse a track — mentors curate titles, not keywords." : "Mentors are curating this track now. The other shelves are open."}
              action={<Link href="/student/resources" className="btn-ghost">Browse everything</Link>}
            />
          ) : (
            <>
              <p className="meta">{resources.length} pieces · {doneSet.size} finished</p>
              <ol className="mt-4">
                {resources.map((r, i) => (
                  <li key={r.id} className="border-b py-4 first:border-t" style={{ borderColor: "var(--line)" }}>
                    <div className="flex items-start gap-4">
                      <span className="index-num mt-1 shrink-0">{String(i + 1).padStart(2, "0")}</span>
                      <div className="min-w-0 flex-1">
                        <Link href={`/student/resources/${r.id}`} className="text-[0.98rem] font-semibold leading-6 hover:underline" style={{ color: "var(--text)" }}>
                          {doneSet.has(r.id) && <span style={{ color: "var(--accent)" }}>✓ </span>}{r.title}
                        </Link>
                        <p className="meta mt-1.5">{kindLabel(r.kind)} · {r.minutes} min · {r.level?.replace("_", " ")}</p>
                      </div>
                      <span className="flex shrink-0 items-center gap-3">
                        <ResourceCompleteButton resourceId={r.id} completed={doneSet.has(r.id)} />
                        {r.url && <a href={r.url} target="_blank" rel="noreferrer" className="text-xs font-semibold hover:underline" style={{ color: "var(--accent)" }} aria-label={`Open ${r.title} source`}>↗</a>}
                      </span>
                    </div>
                  </li>
                ))}
              </ol>
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
      aria-pressed={active}
      className={`transition active:scale-[0.97] ${small ? "px-3.5 py-1 text-xs" : "px-4 py-1.5 text-sm"} rounded-full font-medium`}
      style={active
        ? { background: "var(--text)", color: "var(--bg)" }
        : { background: "transparent", color: "var(--text-muted)", border: "1px solid var(--line)" }}
    >
      {children}
    </Link>
  );
}
