import Link from "next/link";
import { redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { PageHeader, Card, Stat, EmptyState, PrimaryLink } from "@/components/ui";
import { OSS_BADGES } from "@/lib/oss";
import ClaimForm from "./ClaimForm";

export const dynamic = "force-dynamic";

function fmtStars(n) {
  if (!n) return "0";
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

export default async function OpenSourcePage({ searchParams }) {
  const ctx = await getRequestContext();
  if (ctx.error) redirect("/login?redirect=/student/opensource");
  const { user, tenant, sql } = ctx;
  const sp = await searchParams;
  const q = (sp?.q || "").trim().toLowerCase();
  const diff = sp?.difficulty || "";

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
  const earned = new Set(badges.map((b) => b.badge_key));

  const visible = projects.filter((p) => {
    if (diff && p.difficulty !== diff) return false;
    if (!q) return true;
    return `${p.owner}/${p.repo_name} ${p.description} ${p.language || ""}`.toLowerCase().includes(q);
  });
  const verified = mine.filter((c) => c.status === "verified").length;

  return (
    <AppShell area="student" tenant={tenant} user={user}>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <PageHeader
          kicker="Open source"
          title="Contribution portal"
          desc="Claim PRs against curated beginner-friendly repos. Merges auto-verify via webhook and earn badges."
          action={<PrimaryLink href="/student/github">Connect GitHub</PrimaryLink>}
        />

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Tracked repos" value={projects.length} />
          <Stat label="My contributions" value={mine.length} />
          <Stat label="Verified merges" value={verified} />
          <Stat label="Badges" value={`${earned.size}/${OSS_BADGES.length}`} />
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_360px]">
          <div>
            <form method="get" className="flex flex-wrap gap-2">
              <input name="q" defaultValue={sp?.q || ""} placeholder="Search repos…" className="min-w-0 flex-1 rounded-xl border px-3 py-2 text-sm" style={{ borderColor: "var(--line)", background: "var(--bg-muted)", color: "var(--text)" }} />
              <select name="difficulty" defaultValue={diff} className="rounded-xl border px-3 py-2 text-sm" style={{ borderColor: "var(--line)", background: "var(--bg-muted)", color: "var(--text)" }}>
                <option value="">All levels</option>
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
              </select>
              <button className="btn-ink" type="submit">Filter</button>
            </form>

            {visible.length === 0 ? (
              <div className="mt-4"><EmptyState title="No repos match" body="Try a different search, or ask your chapter admin to curate a repo." /></div>
            ) : (
              <ul className="mt-4 space-y-3">
                {visible.map((p) => (
                  <li key={p.id}>
                    <Card>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium" style={{ color: "var(--text)" }}>{p.owner}/{p.repo_name}</p>
                          {p.description && <p className="mt-1 text-sm leading-6" style={{ color: "var(--text-muted)" }}>{p.description}</p>}
                          <p className="mt-2 flex flex-wrap gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
                            <span className="rounded-full border px-2 py-0.5" style={{ borderColor: "var(--line)" }}>{p.difficulty}</span>
                            {p.language && <span className="rounded-full border px-2 py-0.5" style={{ borderColor: "var(--line)" }}>{p.language}</span>}
                            <span>★ {fmtStars(p.stars)}</span>
                            {p.good_first_issues > 0 && <span>{p.good_first_issues}+ good-first-issues</span>}
                          </p>
                        </div>
                        <a href={p.github_repo_url} target="_blank" rel="noreferrer" className="btn-ink shrink-0">Open repo ↗</a>
                      </div>
                    </Card>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="space-y-6">
            <Card>
              <h2 className="font-medium" style={{ color: "var(--text)" }}>Claim a contribution</h2>
              <ClaimForm />
            </Card>

            <Card>
              <h2 className="font-medium" style={{ color: "var(--text)" }}>Badge journal</h2>
              <ul className="mt-3 space-y-2">
                {OSS_BADGES.map((b) => (
                  <li key={b.key} className="flex items-center justify-between gap-2 text-sm">
                    <span style={{ color: earned.has(b.key) ? "var(--text)" : "var(--text-muted)" }}>
                      {earned.has(b.key) ? "●" : "○"} {b.name} <span className="text-xs">— {b.desc}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </Card>

            <Card>
              <h2 className="font-medium" style={{ color: "var(--text)" }}>My contributions</h2>
              {mine.length === 0 ? (
                <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>Nothing claimed yet. Open a PR, then claim it here.</p>
              ) : (
                <ul className="mt-3 space-y-2 text-sm">
                  {mine.map((c) => (
                    <li key={c.id} className="flex items-center justify-between gap-2">
                      <a href={c.pr_url} target="_blank" rel="noreferrer" className="min-w-0 truncate" style={{ color: "var(--accent)" }}>
                        {c.owner ? `${c.owner}/${c.repo_name}#${c.pr_number ?? ""}` : c.pr_url} — {c.title}
                      </a>
                      <span className="shrink-0 rounded-full border px-2 py-0.5 text-xs" style={{
                        borderColor: "var(--line)",
                        color: c.status === "verified" ? "var(--accent)" : "var(--text-muted)"
                      }}>{c.status}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
        <p className="mt-6 text-xs" style={{ color: "var(--text-muted)" }}>
          <Link href="/student/network" style={{ color: "var(--accent)" }}>Compare with other chapters →</Link>
        </p>
      </main>
    </AppShell>
  );
}
