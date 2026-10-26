import { redirect } from "next/navigation";
import Link from "next/link";
import { Star, GitPullRequest, Clock3, ExternalLink, Search } from "lucide-react";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { WorkspaceMasthead, WorkspaceSection, WorkspaceEmpty } from "@/components/loom/WorkspaceMasthead";
import { CurateForm, ReviewButtons } from "./AdminOss";
import "../_components/admin-ledger.css";

const DIFFICULTY = {
  beginner: { label: "Beginner", className: "aled-tag--success" },
  intermediate: { label: "Intermediate", className: "aled-tag--warn" },
  advanced: { label: "Advanced", className: "aled-tag--danger" },
};

function diffTone(d) {
  return DIFFICULTY[d] || { label: d || "—", className: "" };
}

export default async function AdminOpenSourcePage({ searchParams }) {
  const ctx = await getRequestContext({ adminOnly: true });
  if (ctx.error === "UNAUTHORIZED") redirect("/login?redirect=/admin/opensource");
  if (ctx.error === "FORBIDDEN") redirect("/student");
  if (ctx.error) redirect("/login?redirect=/admin/opensource");
  const { tenant, user, sql } = ctx;
  const sp = await searchParams;
  const q = (sp?.q || "").trim();
  const tid = tenant?.id ?? null;

  const [stats] = await sql`
    SELECT
      (SELECT COUNT(*)::int FROM open_source_projects WHERE tenant_id IS NULL OR tenant_id = ${tid}::uuid) AS repos,
      (SELECT COUNT(*)::int FROM student_oss_contributions WHERE status = 'claimed' AND tenant_id = ${tid}::uuid) AS pending,
      (SELECT COUNT(*)::int FROM student_oss_contributions WHERE status = 'verified' AND tenant_id = ${tid}::uuid) AS verified
  `;

  const projects = await sql`
    SELECT * FROM open_source_projects
    WHERE (tenant_id IS NULL OR tenant_id = ${tid}::uuid)
      AND (${q ? sql`(owner ILIKE ${"%" + q + "%"} OR repo_name ILIKE ${"%" + q + "%"})` : sql`TRUE`})
    ORDER BY stars DESC LIMIT 100
  `;
  const pending = await sql`
    SELECT c.*, p.name AS student_name FROM student_oss_contributions c
    LEFT JOIN profiles p ON p.user_id = c.student_id
    WHERE c.status = 'claimed' AND c.tenant_id = ${tid}::uuid
    ORDER BY c.created_at DESC LIMIT 50
  `;

  return (
    <AppShell area="admin" tenant={tenant} user={user}>
      <main className="mx-auto max-w-6xl px-4 pb-14 sm:px-6">
        <WorkspaceMasthead
          kicker={`Open source / ${stats?.repos ?? 0} tracked / ${stats?.pending ?? 0} claimed / ${stats?.verified ?? 0} verified`}
          title="Open source console"
          lede="Curate repos for this chapter — merged PRs in tracked repos verify automatically via webhook."
          meta={`${projects.length} repos in view / ${pending.length} claims awaiting review`}
          tone="field"
          art="/storyloom/opensource.png"
          artAlt=""
          stats={[
            { value: stats?.repos ?? 0, label: "tracked repos" },
            { value: stats?.pending ?? 0, label: "pending claims" },
            { value: stats?.verified ?? 0, label: "verified merges" }
          ]}
        />

        <form method="get" className="aled-toolbar" role="search">
          <label className="aled-search">
            <Search size={14} style={{ color: "var(--text-muted)" }} aria-hidden="true" />
            <input name="q" defaultValue={q} placeholder="Search owner or repo…" aria-label="Search repositories" />
          </label>
          <button className="btn-ink !py-1.5 text-xs">Search</button>
          {q && <Link href="/admin/opensource" prefetch={false} className="aled-meta" style={{ color: "var(--accent)" }}>Clear</Link>}
          <span className="aled-meta ml-auto hidden sm:block">{projects.length} repos</span>
        </form>

        <div className="grid gap-6 lg:grid-cols-2">
          <WorkspaceSection index="01" title="Curated projects" note="Sorted by stars. Students claim PRs against this list and merges verify automatically." action={<span className="aled-meta">by stars</span>}>
            {projects.length === 0 ? (
              <WorkspaceEmpty title="No repos yet" body="Curate the first repo — students claim PRs against this list and merges verify automatically." />
            ) : (
              <ul className="aled-ledger" style={{ listStyle: "none", margin: "0.9rem 0 0", padding: 0 }}>
                {projects.map((p) => {
                  const tone = diffTone(p.difficulty);
                  return (
                    <li key={p.id} className="aled-row" style={{ "--aled-cols": "minmax(0, 1fr) auto" }}>
                      <div className="aled-copy">
                        <span className="aled-title" style={{ fontFamily: "var(--font-geist-mono), ui-monospace, monospace" }}>{p.owner}/{p.repo_name}</span>
                        {p.description && <p className="aled-sub">{p.description}</p>}
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", marginTop: "0.4rem" }}>
                          <span className="aled-tag"><Star size={10} aria-hidden="true" /> {p.stars ?? 0}</span>
                          <span className={`aled-tag ${tone.className}`}>{tone.label}</span>
                          <span className="aled-tag">{p.tenant_id ? "chapter" : "global"}</span>
                        </div>
                      </div>
                      <a href={p.github_repo_url} target="_blank" rel="noreferrer" className="aled-tag aled-tag--accent">
                        <ExternalLink size={12} aria-hidden="true" /> Open
                      </a>
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="aled-panel" style={{ marginTop: "1.4rem" }}>
              <p className="aled-panel-title"><GitPullRequest size={12} aria-hidden="true" /> Curate a new repo</p>
              <div style={{ marginTop: "0.8rem" }}><CurateForm /></div>
            </div>
          </WorkspaceSection>

          <WorkspaceSection index="02" title="Pending claims" note="Oldest first. Claimed PRs wait here for a human decision." action={<span className="aled-meta">{pending.length} waiting</span>}>
            {pending.length === 0 ? (
              <WorkspaceEmpty title="Inbox zero" body="Merged PRs in tracked repos verify automatically via webhook." />
            ) : (
              <ul className="aled-ledger" style={{ listStyle: "none", margin: "0.9rem 0 0", padding: 0 }}>
                {pending.map((c) => (
                  <li key={c.id} className="aled-row" style={{ "--aled-cols": "minmax(0, 1fr) auto" }}>
                    <div className="aled-copy">
                      <span className="aled-title">{c.title || c.pr_url}</span>
                      <p className="aled-sub">
                        {c.student_name || c.student_id.slice(0, 8)} · {c.contribution_type} · {c.pr_number ? `#${c.pr_number}` : ""}
                      </p>
                      <a href={c.pr_url} target="_blank" rel="noreferrer" className="aled-sub" style={{ color: "var(--accent)", display: "inline-flex", alignItems: "center", gap: "0.25rem", marginTop: "0.25rem" }}>
                        {String(c.pr_url).slice(0, 56)} <ExternalLink size={10} aria-hidden="true" />
                      </a>
                      {c.files_changed != null && <p className="aled-meta" style={{ marginTop: "0.3rem" }}>{c.files_changed} files · +{c.lines_added} / -{c.lines_deleted}</p>}
                    </div>
                    <div className="aled-actions" style={{ alignItems: "flex-start", flexDirection: "column" }}>
                      <span className="aled-tag"><Clock3 size={10} aria-hidden="true" /> claimed</span>
                      <ReviewButtons id={c.id} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </WorkspaceSection>
        </div>
      </main>
    </AppShell>
  );
}
