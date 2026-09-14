import Link from "next/link";
import { redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { OSS_BADGES } from "@/lib/oss";
import { Display, Meta, PlainStat, StatusPill } from "@/components/loom/primitives";
import { Timeline, TimelineItem } from "@/components/loom/Timeline";
import { DataTable } from "@/components/loom/DataTable";
import { OnboardingState } from "@/components/loom/States";
import ClaimForm from "./ClaimForm";

export const dynamic = "force-dynamic";

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
      <main className="mx-auto max-w-6xl px-4 sm:px-6">
        <Meta>Build · write code the world uses</Meta>
        <Display size="lg" className="mt-3">Open source, with training wheels off.</Display>

        <div className="mt-8 grid gap-8 sm:grid-cols-3">
          <PlainStat value={verified} unit={verified === 1 ? "merge" : "merges"} label="verified by webhook — the only number that matters" />
          <PlainStat value={mine.length} unit="claimed" label="pull requests you've put your name on" />
          <PlainStat value={`${earned.size}/${OSS_BADGES.length}`} unit="badges" label="in your badge journal" />
        </div>

        <div className="mt-12 grid gap-12 lg:grid-cols-[1fr_360px]">
          <div>
            <section aria-label="Beginner-friendly repositories">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <h2 className="h-product">Start somewhere kind</h2>
                <span className="meta">{visible.length} curated repos</span>
              </div>
              <form method="get" className="mt-4 flex flex-wrap gap-2">
                <input name="q" defaultValue={sp?.q || ""} placeholder="Search repos…" aria-label="Search repositories" className="min-w-0 flex-1 rounded-xl border px-3 py-2 text-sm" style={{ borderColor: "var(--line)", background: "var(--bg-muted)", color: "var(--text)" }} />
                <select name="difficulty" defaultValue={diff} aria-label="Filter by difficulty" className="rounded-xl border px-3 py-2 text-sm" style={{ borderColor: "var(--line)", background: "var(--bg-muted)", color: "var(--text)" }}>
                  <option value="">All levels</option>
                  <option value="beginner">Beginner</option>
                  <option value="intermediate">Intermediate</option>
                  <option value="advanced">Advanced</option>
                </select>
                <button className="btn-ink !py-2" type="submit">Filter</button>
              </form>
              <div className="mt-4 border-y" style={{ borderColor: "var(--line)" }}>
                <DataTable
                  caption="Curated beginner-friendly repositories"
                  empty="No repos match. Try a different search — or ask your chapter admin to curate one."
                  columns={[
                    { key: "repo", label: "Repository", kind: "repo" },
                    { key: "difficulty", label: "Level" },
                    { key: "language", label: "Lang" },
                    { key: "stars", label: "Stars", mono: true, align: "right", kind: "stars" },
                    { key: "gfi", label: "Good first issues", mono: true, align: "right", kind: "gfi" }
                  ]}
                  rows={visible}
                />
              </div>
            </section>

            <section className="mt-12" aria-label="Your contributions">
              <h2 className="h-product">Your trail</h2>
              {mine.length === 0 ? (
                <p className="narrative mt-3">Nothing claimed yet. Open a pull request in a repo above, then claim it below — merges verify automatically.</p>
              ) : (
                <Timeline className="mt-5">
                  {mine.slice(0, 8).map((c) => (
                    <TimelineItem
                      key={c.id}
                      state={c.status === "verified" ? "done" : "now"}
                      title={c.title || `${c.owner ? `${c.owner}/${c.repo_name}#${c.pr_number ?? ""}` : "Pull request"}`}
                      meta={new Date(c.created_at).toLocaleDateString("en-IN", { month: "short", day: "numeric" })}
                      body={`${c.status}${c.verified_at ? " · merge verified" : " · awaiting merge"}`}
                      action={c.pr_url ? <a href={c.pr_url} target="_blank" rel="noreferrer" className="text-xs font-semibold hover:underline" style={{ color: "var(--accent)" }}>Open PR →</a> : null}
                    />
                  ))}
                </Timeline>
              )}
            </section>
          </div>

          <div className="space-y-10">
            <section aria-label="Claim a contribution" className="border-y py-6" style={{ borderColor: "var(--line)" }}>
              <Meta style={{ color: "var(--accent)" }}>Merged something? Claim it</Meta>
              <div className="mt-3"><ClaimForm /></div>
            </section>

            <section aria-label="Badge journal">
              <h2 className="h-product">Badge journal</h2>
              <ol className="mt-4 space-y-3">
                {OSS_BADGES.map((b) => {
                  const has = earned.has(b.key);
                  return (
                    <li key={b.key} className="flex items-start gap-3">
                      <span className="mt-1 size-2 shrink-0 rounded-full" style={{ background: has ? "var(--accent)" : "var(--line)" }} aria-hidden="true" />
                      <div>
                        <p className="text-sm font-semibold" style={{ color: has ? "var(--text)" : "var(--text-muted)" }}>{b.name}</p>
                        <p className="text-xs leading-5" style={{ color: "var(--text-muted)" }}>{b.desc}</p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </section>
          </div>
        </div>

        <p className="narrative mt-10">
          Chapters learn from each other. <Link href="/student/network" className="font-semibold hover:underline" style={{ color: "var(--accent)" }}>Compare with other chapters →</Link>
        </p>
      </main>
    </AppShell>
  );
}
