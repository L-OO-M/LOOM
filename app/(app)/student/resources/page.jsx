import { redirect } from "next/navigation";
import Link from "next/link";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { PageHeader, EmptyState } from "@/components/ui";
import { ResourceCompleteButton } from "@/components/actions";

const TRACKS = [
  { id: "ai_ml", label: "AI / ML", focus: "ML fundamentals, paper-reading sessions, dataset-based contests, applied AI projects" },
  { id: "web", label: "Web Development", focus: "HTML/CSS/JavaScript bootcamps, framework workshops, society website, Git & deployment" },
  { id: "cybersecurity", label: "Cybersecurity", focus: "Ethical hacking within legal boundaries, CTF practice, cryptography basics, secure coding" },
  { id: "dsa", label: "DSA", focus: "Weekly problem-solving, contest practice, interview preparation, mock tests" },
  { id: "blockchain", label: "Blockchain", focus: "Distributed-ledger fundamentals, smart contracts, Web3 mini-projects" }
];

const KINDS = [
  { id: "", label: "All" },
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

  return (
    <AppShell area="student" tenant={tenant} user={user}>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <PageHeader kicker="Learn" title="Resources for your next breakthrough" desc="Five society tracks, curated by mentors. Complete a resource and it stays on your record." />

        {!domain && !q && primaryDomain && (
          <section aria-label="Recommended for you" className="mb-8 rounded-2xl border p-6" style={{ borderColor: "var(--accent)", background: "var(--bg-elevated)" }}>
            <p className="kicker">Recommended for your roadmap</p>
            <h2 className="mt-2 text-lg font-semibold" style={{ color: "var(--text)" }}>
              Continue in {TRACKS.find((t) => t.id === primaryDomain)?.label ?? primaryDomain}
            </h2>
            <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
              {TRACKS.find((t) => t.id === primaryDomain)?.focus ?? "Picked from your onboarding direction."}
            </p>
            <Link href={qs(base, { domain: primaryDomain })} className="btn-ink mt-4">
              Open {countBy[primaryDomain] ?? 0} resources
            </Link>
          </section>
        )}

        {!domain && !q && (
          <section aria-label="Learning tracks" className="mb-8">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--text-muted)" }}>Browse by track</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {TRACKS.map((t) => (
                <Link
                  key={t.id}
                  href={qs(base, { domain: t.id })}
                  className="group rounded-xl border p-5 transition hover:-translate-y-0.5"
                  style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="text-base font-semibold" style={{ color: "var(--text)" }}>{t.label}</h3>
                    <span className="font-mono text-xs" style={{ color: "var(--accent)" }}>{countBy[t.id] ?? 0}</span>
                  </div>
                  <p className="mt-2 text-xs leading-5" style={{ color: "var(--text-muted)" }}>{t.focus}</p>
                  <span className="mt-3 inline-block text-xs font-semibold" style={{ color: "var(--accent)" }}>Explore →</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        <form method="get" className="mb-4 flex flex-wrap items-center gap-2" role="search">
          <input
            name="q"
            defaultValue={q}
            placeholder="Search resources…"
            aria-label="Search resources"
            style={{ borderRadius: 10, border: "1px solid var(--line)", background: "var(--bg-muted)", color: "var(--text)", padding: "8px 12px", fontSize: 14 }}
          />
          {domain && <input type="hidden" name="domain" value={domain} />}
          {kind && <input type="hidden" name="kind" value={kind} />}
          <button className="btn-ink !py-2">Search</button>
          {(q || domain || kind) && <Link href="/student/resources" className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>Clear all</Link>}
        </form>

        <div className="mb-3 flex flex-wrap gap-2" role="tablist" aria-label="Filter by track">
          <Link
            href={qs({ q, kind }, {})}
            role="tab"
            aria-selected={!domain}
            className="rounded-full px-4 py-1.5 text-sm font-medium transition active:scale-[0.97]"
            style={!domain
              ? { background: "var(--text)", color: "var(--bg)" }
              : { background: "transparent", color: "var(--text-muted)", border: "1px solid var(--line)" }}
          >
            All tracks
          </Link>
          {TRACKS.map((t) => {
            const isActive = domain === t.id;
            return (
              <Link
                key={t.id}
                href={qs({ q, kind }, { domain: t.id })}
                role="tab"
                aria-selected={isActive}
                className="rounded-full px-4 py-1.5 text-sm font-medium transition active:scale-[0.97]"
                style={isActive
                  ? { background: "var(--text)", color: "var(--bg)" }
                  : { background: "transparent", color: "var(--text-muted)", border: "1px solid var(--line)" }}
              >
                {t.label} · {countBy[t.id] ?? 0}
              </Link>
            );
          })}
        </div>

        <div className="mb-6 flex flex-wrap gap-2" aria-label="Filter by format">
          {KINDS.map((k) => {
            const isActive = kind === k.id;
            return (
              <Link
                key={k.id || "all"}
                href={qs({ q, domain }, { kind: k.id })}
                aria-pressed={isActive}
                className="rounded-full px-3.5 py-1 text-xs font-medium transition active:scale-[0.97]"
                style={isActive
                  ? { background: "var(--accent)", color: "#101314" }
                  : { background: "transparent", color: "var(--text-muted)", border: "1px solid var(--line)" }}
              >
                {k.label}
              </Link>
            );
          })}
        </div>

        {domain && (
          <div className="mb-5 rounded-xl border p-4" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
            <h2 className="text-base font-semibold" style={{ color: "var(--text)" }}>
              {TRACKS.find((t) => t.id === domain)?.label ?? domain}
            </h2>
            <p className="mt-1 text-xs leading-5" style={{ color: "var(--text-muted)" }}>
              {TRACKS.find((t) => t.id === domain)?.focus ?? ""}
            </p>
          </div>
        )}

        {resources.length === 0 ? (
          <EmptyState title="Nothing here yet" body={q ? `No resources match “${q}”. Try a shorter search or another track.` : "This track is being curated. Check the other tracks or come back soon."} />
        ) : (
          <>
            <p className="mb-3 font-mono text-xs" style={{ color: "var(--text-muted)" }}>
              {resources.length} RESOURCE{resources.length === 1 ? "" : "S"} · {doneSet.size} COMPLETED
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {resources.map((r) => (
                <div key={r.id} className="flex flex-col rounded-xl border p-5" style={{ borderColor: doneSet.has(r.id) ? "var(--accent)" : "var(--line)", background: "var(--bg-elevated)" }}>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: "var(--bg-muted)", color: "var(--accent)" }}>{kindLabel(r.kind)}</span>
                    <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{r.minutes} min · {r.level?.replace("_", " ")}</span>
                    {doneSet.has(r.id) && <span className="ml-auto text-[11px] font-semibold" style={{ color: "var(--accent)" }}>✓ Done</span>}
                  </div>
                  <Link href={`/student/resources/${r.id}`} className="mt-3 text-sm font-semibold leading-6 hover:underline" style={{ color: "var(--text)" }}>{r.title}</Link>
                  <div className="mt-3 flex items-center justify-between border-t pt-3" style={{ borderColor: "var(--line)" }}>
                    <ResourceCompleteButton resourceId={r.id} completed={doneSet.has(r.id)} />
                    {r.url && <a href={r.url} target="_blank" rel="noreferrer" className="text-xs font-medium hover:underline" style={{ color: "var(--accent)" }}>Open source ↗</a>}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </main>
    </AppShell>
  );
}
