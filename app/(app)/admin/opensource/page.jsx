import { redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { PageHeader, Card, Stat } from "@/components/ui";
import { CurateForm, ReviewButtons } from "./AdminOss";

export const dynamic = "force-dynamic";

export default async function AdminOpenSourcePage() {
  const ctx = await getRequestContext({ adminOnly: true });
  if (ctx.error === "UNAUTHORIZED") redirect("/login?redirect=/admin/opensource");
  if (ctx.error === "FORBIDDEN") redirect("/student");
  if (ctx.error) redirect("/login?redirect=/admin/opensource");
  const { tenant, user, sql } = ctx;

  const projects = await sql`
    SELECT * FROM open_source_projects
    WHERE tenant_id IS NULL OR tenant_id = ${tenant?.id ?? null}::uuid
    ORDER BY stars DESC LIMIT 100
  `;
  const pending = await sql`
    SELECT c.*, p.name AS student_name FROM student_oss_contributions c
    LEFT JOIN profiles p ON p.user_id = c.student_id
    WHERE c.status = 'claimed' AND (c.tenant_id IS NULL OR c.tenant_id = ${tenant?.id ?? null}::uuid)
    ORDER BY c.created_at DESC LIMIT 50
  `;
  const [{ verified = 0 } = {}] = await sql`
    SELECT COUNT(*)::int AS verified FROM student_oss_contributions
    WHERE status = 'verified' AND (tenant_id IS NULL OR tenant_id = ${tenant?.id ?? null}::uuid)
  `;

  return (
    <AppShell area="admin" tenant={tenant} user={user}>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <PageHeader kicker="Admin · OSS" title="Open source console" desc="Curate repos for your chapter and review claimed contributions." />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Stat label="Tracked repos" value={projects.length} />
          <Stat label="Pending claims" value={pending.length} />
          <Stat label="Verified merges" value={verified} />
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <Card>
            <h2 className="font-medium" style={{ color: "var(--text)" }}>Curated projects</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {projects.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate" style={{ color: "var(--text)" }}>
                    {p.owner}/{p.repo_name} <span style={{ color: "var(--text-muted)" }}>· {p.difficulty} · ★{p.stars}{p.tenant_id ? " · chapter" : " · global"}</span>
                  </span>
                  <a href={p.github_repo_url} target="_blank" rel="noreferrer" className="shrink-0 text-xs" style={{ color: "var(--accent)" }}>Open ↗</a>
                </li>
              ))}
              {projects.length === 0 && <li className="text-sm" style={{ color: "var(--text-muted)" }}>No curated repos yet.</li>}
            </ul>
            <h3 className="mt-6 font-medium" style={{ color: "var(--text)" }}>Curate a new repo</h3>
            <CurateForm />
          </Card>

          <Card>
            <h2 className="font-medium" style={{ color: "var(--text)" }}>Pending claims</h2>
            {pending.length === 0 ? (
              <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>Inbox zero. Merged PRs in tracked repos verify automatically via webhook.</p>
            ) : (
              <ul className="mt-3 space-y-3">
                {pending.map((c) => (
                  <li key={c.id} className="flex items-start justify-between gap-3 rounded-xl border p-3" style={{ borderColor: "var(--line)" }}>
                    <div className="min-w-0 text-sm">
                      <p className="truncate" style={{ color: "var(--text)" }}>{c.title}</p>
                      <p className="truncate text-xs" style={{ color: "var(--text-muted)" }}>{c.student_name || c.student_id} · {c.contribution_type}</p>
                      <a href={c.pr_url} target="_blank" rel="noreferrer" className="text-xs" style={{ color: "var(--accent)" }}>{c.pr_url}</a>
                    </div>
                    <ReviewButtons id={c.id} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </main>
    </AppShell>
  );
}
