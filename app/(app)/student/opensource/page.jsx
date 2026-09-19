import Link from "next/link";
import { redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { OSS_BADGES } from "@/lib/oss";
import { Display, Meta, PlainStat } from "@/components/loom/primitives";
import { DataTable } from "@/components/loom/DataTable";
import ClaimForm from "./ClaimForm";
import TrailClient from "./TrailClient";

export const dynamic = "force-dynamic";

function gfiHref(owner, repo) {
  return `https://github.com/${owner}/${repo}/issues?q=is:open+label:"good first issue"`;
}

export default async function OpenSourcePage({ searchParams }) {
  const ctx = await getRequestContext();
  if (ctx.error) redirect("/login?redirect=/student/opensource");
  const { user, tenant, sql } = ctx;
  const sp = await searchParams;
  const q = (sp?.q || "").trim().toLowerCase();
  const diff = sp?.difficulty || "";
  const domain = sp?.domain || "";
  const lang = sp?.language || "";

  const projects = await sql`
    SELECT * FROM open_source_projects
    WHERE (tenant_id IS NULL OR tenant_id = ${tenant?.id ?? null}::uuid)
    ORDER BY is_curated DESC, stars DESC
    LIMIT 100
  `;
  const mine = await sql`
    SELECT c.*, p.owner, p.repo_name FROM student_oss_contributions c
    LEFT JOIN open_source_projects p ON p.id = c.project_id
    WHERE c.student_id = ${user.id}
    ORDER BY c.created_at DESC LIMIT 50
  `;
  const badges = await sql`SELECT * FROM oss_badges WHERE student_id = ${user.id} ORDER BY earned_at DESC`;
  const achievements = await sql`
    SELECT id, source_ref FROM student_achievements
    WHERE student_id = ${user.id} AND source_type = 'oss'
  `;
  const earned = new Set(badges.map((b) => b.badge_key));
  const proofByBadge = Object.fromEntries(achievements.map((a) => [a.source_ref, a.id]));

  const domains = [...new Set(projects.map((p) => p.primary_domain).filter(Boolean))].sort();
  const languages = [...new Set(projects.map((p) => p.language).filter(Boolean))].sort();

  const visible = projects.filter((p) => {
    if (diff && p.difficulty !== diff) return false;
    if (domain && (p.primary_domain || "") !== domain) return false;
    if (lang && (p.language || "") !== lang) return false;
    if (!q) return true;
    return `${p.owner}/${p.repo_name} ${p.description} ${p.language || ""} ${p.primary_domain || ""}`.toLowerCase().includes(q);
  });
  const verified = mine.filter((c) => c.status === "verified").length;
  const gfiEntryPoints = visible.filter((p) => (p.good_first_issues || 0) > 0).slice(0, 8);

  return (
    <AppShell area="student" tenant={tenant} user={user}>
      <main className="mx-auto max-w-6xl px-4 pb-8 sm:px-6">
        {/* HERO — contribute with purpose */}
        <div className="animate-in">
          <Meta>Build · Contribute · Prove</Meta>
          <Display size="lg" className="mt-3">Open source, without the guesswork.</Display>
          <p className="narrative mt-4 max-w-2xl">
            Find a repository that fits your level, make your contribution, and let LOOM track the proof.
          </p>
        </div>

        <div className="mt-8 grid gap-8 sm:grid-cols-3">
          <PlainStat value={verified} unit={verified === 1 ? "merge" : "merges"} label="verified contributions — the number that matters" />
          <PlainStat value={mine.length} unit={mine.length === 1 ? "claim" : "claims"} label="contributions you have put your name on" />
          <PlainStat value={`${earned.size}/${OSS_BADGES.length}`} unit="badges" label="earned in your badge journal" />
        </div>

        {/* JOURNEY — Discover → Contribute → Verify → Prove (real state, no scores) */}
        <section aria-label="Contribution journey" className="mt-10 border-y py-6" style={{ borderColor: "var(--line)" }}>
          <ol className="grid gap-5 sm:grid-cols-4">
            <li>
              <p className="index-num">01</p>
              <p className="mt-1 text-sm font-semibold" style={{ color: "var(--text)" }}>Discover</p>
              <p className="mt-0.5 text-xs leading-5" style={{ color: "var(--text-muted)" }}>{projects.length === 0 ? "No curated repositories yet" : `${projects.length} curated ${projects.length === 1 ? "repository" : "repositories"} to explore`}</p>
            </li>
            <li>
              <p className="index-num">02</p>
              <p className="mt-1 text-sm font-semibold" style={{ color: "var(--text)" }}>Contribute</p>
              <p className="mt-0.5 text-xs leading-5" style={{ color: "var(--text-muted)" }}>{mine.length === 0 ? "Nothing claimed yet" : `${mine.length} contribution${mine.length === 1 ? "" : "s"} claimed`}</p>
            </li>
            <li>
              <p className="index-num">03</p>
              <p className="mt-1 text-sm font-semibold" style={{ color: "var(--text)" }}>Verify</p>
              <p className="mt-0.5 text-xs leading-5" style={{ color: "var(--text-muted)" }}>{verified === 0 ? "No verified merges yet" : `${verified} verified merge${verified === 1 ? "" : "s"}`}</p>
            </li>
            <li>
              <p className="index-num">04</p>
              <p className="mt-1 text-sm font-semibold" style={{ color: "var(--text)" }}>Prove</p>
              <p className="mt-0.5 text-xs leading-5" style={{ color: "var(--text-muted)" }}>{earned.size === 0 ? "No badges earned yet" : `${earned.size} of ${OSS_BADGES.length} badges earned`}</p>
            </li>
          </ol>
        </section>

        <div className="mt-12 grid gap-12 lg:grid-cols-[1fr_360px]">
          <div className="min-w-0">
            {/* FIND */}
            <section aria-label="Find a repository">
              <Meta>Discover · find</Meta>
              <h2 className="h-product mt-2">Find your next contribution</h2>
              <p className="narrative mt-2">Start with something close to your current skill level.</p>
              <form method="get" className="mt-4 flex flex-wrap gap-2">
                <input name="q" defaultValue={sp?.q || ""} placeholder="Search repos…" aria-label="Search repositories" className="min-w-0 flex-1 basis-40 rounded-xl border px-3 py-2 text-sm" style={{ borderColor: "var(--line)", background: "var(--bg-muted)", color: "var(--text)" }} />
                <select name="difficulty" defaultValue={diff} aria-label="Filter by difficulty" className="rounded-xl border px-3 py-2 text-sm" style={{ borderColor: "var(--line)", background: "var(--bg-muted)", color: "var(--text)" }}>
                  <option value="">All levels</option>
                  <option value="beginner">Beginner</option>
                  <option value="intermediate">Intermediate</option>
                  <option value="advanced">Advanced</option>
                </select>
                <select name="domain" defaultValue={domain} aria-label="Filter by domain" className="max-w-40 rounded-xl border px-3 py-2 text-sm" style={{ borderColor: "var(--line)", background: "var(--bg-muted)", color: "var(--text)" }}>
                  <option value="">All domains</option>
                  {domains.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
                <select name="language" defaultValue={lang} aria-label="Filter by language" className="max-w-40 rounded-xl border px-3 py-2 text-sm" style={{ borderColor: "var(--line)", background: "var(--bg-muted)", color: "var(--text)" }}>
                  <option value="">All languages</option>
                  {languages.map((l) => (
                    <option key={l} value={l}>{l}</option>
                  ))}
                </select>
                <button className="btn-ink !py-2" type="submit">Filter</button>
              </form>
              <p className="meta mt-4" aria-live="polite">
                {visible.length === 0 ? "No repositories match" : `${visible.length} ${visible.length === 1 ? "repository" : "repositories"}`}
              </p>

              {visible.length === 0 ? (
                <p className="narrative mt-3">Nothing matched that search. Try another repository, domain, or difficulty — or ask your chapter admin to curate one.</p>
              ) : (
                <>
                  {/* Desktop: efficient table (GFI bound to the real column) */}
                  <div className="mt-3 hidden border-y md:block" style={{ borderColor: "var(--line)" }}>
                    <DataTable
                      caption="Curated repositories with difficulty, stack, and good-first-issue counts"
                      empty="No repositories match your filters."
                      columns={[
                        { key: "repo", label: "Repository", kind: "repo" },
                        { key: "difficulty", label: "Level" },
                        { key: "language", label: "Language" },
                        { key: "primary_domain", label: "Domain" },
                        { key: "stars", label: "Stars", mono: true, align: "right", kind: "stars" },
                        { key: "good_first_issues", label: "Good first issues", mono: true, align: "right", kind: "gfi" }
                      ]}
                      rows={visible}
                    />
                  </div>

                  {/* Mobile: stacked cards, no cramped columns */}
                  <ul className="mt-3 space-y-3 md:hidden">
                    {visible.map((p) => (
                      <li key={p.id} className="rounded-2xl border p-4" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
                        <a href={p.github_repo_url} target="_blank" rel="noreferrer" aria-label={`${p.owner}/${p.repo_name} on GitHub (opens in a new tab)`} className="font-mono text-sm font-semibold hover:underline" style={{ color: "var(--text)" }}>
                          {p.owner}/{p.repo_name}
                        </a>
                        {p.description && (
                          <p className="mt-1 text-xs leading-5" style={{ color: "var(--text-muted)" }}>{p.description}</p>
                        )}
                        <p className="meta mt-3" style={{ textTransform: "none", letterSpacing: "0.02em" }}>
                          {p.difficulty}{p.language ? ` · ${p.language}` : ""}{p.primary_domain ? ` · ${p.primary_domain}` : ""}
                        </p>
                        <p className="mt-1 text-xs font-semibold" style={{ color: "var(--text)" }}>
                          ★ {p.stars && p.stars >= 1000 ? `${(p.stars / 1000).toFixed(1)}k` : (p.stars ?? 0)}
                          <span className="font-normal" style={{ color: "var(--text-muted)" }}>
                            {"  ·  "}{(p.good_first_issues || 0) > 0 ? `${p.good_first_issues} good-first-issues` : "good-first-issues —"}
                          </span>
                        </p>
                        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
                          <a href={p.github_repo_url} target="_blank" rel="noreferrer" aria-label={`Explore ${p.owner}/${p.repo_name} on GitHub (opens in a new tab)`} className="text-xs font-semibold hover:underline" style={{ color: "var(--accent)" }}>
                            Explore on GitHub →
                          </a>
                          {(p.good_first_issues || 0) > 0 && (
                            <a href={gfiHref(p.owner, p.repo_name)} target="_blank" rel="noreferrer" aria-label={`Good first issues in ${p.owner}/${p.repo_name} (opens in a new tab)`} className="text-xs font-semibold hover:underline" style={{ color: "var(--accent)" }}>
                              Good first issues →
                            </a>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>

                  {/* Desktop parity: direct GFI handoffs without an in-app issue browser */}
                  {gfiEntryPoints.length > 0 && (
                    <div className="mt-4 hidden md:block">
                      <p className="meta">Good-first-issue entry points</p>
                      <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-2">
                        {gfiEntryPoints.map((p) => (
                          <li key={p.id}>
                            <a href={gfiHref(p.owner, p.repo_name)} target="_blank" rel="noreferrer" aria-label={`Good first issues in ${p.owner}/${p.repo_name} (opens in a new tab)`} className="text-xs font-semibold hover:underline" style={{ color: "var(--accent)" }}>
                              {p.owner}/{p.repo_name} · {p.good_first_issues} →
                            </a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              )}
              <p className="meta mt-4" style={{ textTransform: "none", letterSpacing: "0.02em" }}>Repository metadata · as curated, not live.</p>
            </section>

            {/* UNDERSTAND */}
            <section aria-label="How to choose" className="mt-12">
              <Meta>Understand · before you contribute</Meta>
              <h2 className="h-product mt-2">How to choose</h2>
              <ol className="mt-4 space-y-3">
                {[
                  "Pick a repository near your skill level.",
                  "Check its language and domain — stay close to what you already practice.",
                  "Open its good-first-issues list on GitHub.",
                  "Read the issue and the repository's contribution guide.",
                  "Make your contribution on GitHub.",
                  "Return here and claim the pull request, issue, or review."
                ].map((step, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <span className="index-num mt-0.5 shrink-0">{String(i + 1).padStart(2, "0")}</span>
                    <p className="text-sm leading-6" style={{ color: "var(--text)" }}>{step}</p>
                  </li>
                ))}
              </ol>
            </section>

            {/* TRACK */}
            <section className="mt-12" aria-label="Your contribution trail">
              <Meta>Track · your trail</Meta>
              <h2 className="h-product mt-2">Your contribution trail</h2>
              <div className="mt-4"><TrailClient items={mine} /></div>
            </section>
          </div>

          {/* SIDEBAR — persistent contribution panel */}
          <div className="min-w-0">
            <div className="space-y-10 lg:sticky lg:top-24">
              <section aria-label="Claim a contribution" className="rounded-2xl border p-5" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
                <Meta style={{ color: "var(--accent)" }}>Contribute · claim</Meta>
                <h2 className="h-product mt-2" style={{ fontSize: "1.1rem" }}>Claim your contribution</h2>
                <p className="mt-2 text-xs leading-5" style={{ color: "var(--text-muted)" }}>
                  Made a pull request, reported an issue, or reviewed code in a tracked repository? Claim it here so LOOM can track it toward verification.
                </p>
                <div className="mt-3"><ClaimForm /></div>
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
