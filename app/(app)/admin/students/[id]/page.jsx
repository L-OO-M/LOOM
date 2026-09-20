import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { Clock3, Github, Layers, GraduationCap, Shield, ExternalLink, Award, FolderGit2, Activity } from "lucide-react";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import RoleForm from "./RoleForm";
import { ActivityBars } from "@/components/admin/DetailCharts";
import { HeatStrip } from "@/components/loom/HeatStrip";

function initials(name) {
  if (!name) return "?";
  return String(name).trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "?";
}
function roleLabel(r) {
  return ({ student: "Student", core: "Core", dept_lead: "Head", vertical_lead: "Vertical Lead", admin: "Admin" }[r] || r);
}

export default async function AdminStudentDetailPage({ params }) {
  const { id } = await params;
  const ctx = await getRequestContext({ adminOnly: true });
  if (ctx.error === "UNAUTHORIZED") redirect(`/login?redirect=/admin/students/${id}`);
  if (ctx.error === "FORBIDDEN") redirect("/student");
  if (ctx.error) redirect("/login?redirect=/admin/students");
  const { user, tenant, sql } = ctx;

  const [s] = await sql`
    SELECT user_id, name, role, primary_domain, branch, year, roll_number, github_username, vertical, tenant_id, updated_at
    FROM profiles
    WHERE user_id = ${id} AND (tenant_id = ${tenant?.id ?? null}::uuid OR ${tenant?.id ?? null}::uuid IS NULL) LIMIT 1
  `;
  if (!s) notFound();

  // Collapse 3 sequential footers into one row so the detail header renders in 1 RTT instead of 3.
  const [stats] = await sql`
    SELECT
      (SELECT COUNT(*)::int FROM student_roadmap_progress WHERE student_id = ${id} AND status = 'completed') AS done,
      (SELECT COUNT(*)::int FROM roadmap_nodes) AS total_nodes,
      (SELECT COUNT(*)::int FROM projects WHERE owner_id = ${id}) AS projects,
      (SELECT COUNT(*)::int FROM student_daily_activity WHERE student_id = ${id} AND day >= CURRENT_DATE - 14) AS active_days
  `;
  const memberships = await sql`
    SELECT m.level, m.core_requested, m.succession_ready, m.joined_at,
           d.name AS dept_name, d.slug AS dept_slug, d.vertical AS dept_vertical
    FROM department_memberships m JOIN departments d ON d.id = m.department_id
    WHERE m.user_id = ${id}
    ORDER BY d.name
  `;
  const projects = await sql`SELECT id, title, status, repo_url, roadmap_node_id, created_at FROM projects WHERE owner_id = ${id} ORDER BY created_at DESC LIMIT 10`;
  const activity = await sql`SELECT day, commits, pull_requests, reviews, score FROM student_daily_activity WHERE student_id = ${id} ORDER BY day DESC LIMIT 14`;
  const achievements = await sql`SELECT id, source_type, source_ref, level, earned_at FROM student_achievements WHERE student_id = ${id} ORDER BY earned_at DESC LIMIT 6`;

  const pct = stats?.total_nodes ? Math.round((stats.done / stats.total_nodes) * 100) : 0;
  const activityBars = [...activity].reverse().map((a) => ({
    label: new Date(a.day).toLocaleDateString("en-IN", { month: "short", day: "numeric" }),
    value: (Number(a.commits) || 0) + (Number(a.pull_requests) || 0) + (Number(a.reviews) || 0),
  }));
  const heatDays = [...activity].reverse().map((a) => ({
    label: String(a.day).slice(0, 10),
    value: (Number(a.commits) || 0) + (Number(a.pull_requests) || 0) + (Number(a.reviews) || 0),
  }));

  return (
    <AppShell area="admin" tenant={tenant} user={user}>
      <main className="mx-auto max-w-6xl px-4 pb-14 sm:px-6">
        <p className="pt-4 text-xs" style={{ color: "var(--text-muted)" }}>
          <Link href="/admin/students" prefetch={false} className="inline-flex items-center gap-1 hover:underline" style={{ color: "var(--accent)" }}>← Students</Link>
          <span className="mx-1.5">·</span>{s.name}
        </p>

        {/* Header — avatar, identity, meta, GitHub */}
        <div className="mt-4 flex flex-col gap-6 rounded-2xl border p-6 sm:flex-row sm:items-start" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
          <span className="inline-flex size-14 shrink-0 items-center justify-center rounded-2xl border text-lg font-semibold" style={{ borderColor: "var(--line)", background: "var(--bg)", color: "var(--text)" }}>{initials(s.name)}</span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-xl font-semibold leading-tight" style={{ color: "var(--text)" }}>{s.name}</h1>
              <span className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium" style={{ borderColor: "var(--line)", background: "var(--bg)", color: "var(--text-muted)" }}>
                <Shield size={12} /> {roleLabel(s.role)}
              </span>
              {s.vertical && <span className="meta rounded-full border px-2 py-0.5 capitalize" style={{ borderColor: "var(--line)" }}>{s.vertical.replace("_", " ")}</span>}
            </div>
            <p className="meta mt-1 flex flex-wrap items-center gap-1.5">
              {s.branch && <span>{s.branch}</span>}
              {s.year && <><span>·</span><span>Year {s.year}</span></>}
              {s.roll_number && <><span>·</span><span className="font-mono">{s.roll_number}</span></>}
              {s.primary_domain && <><span>·</span><span className="rounded-full border px-2 py-0.5" style={{ borderColor: "var(--line)" }}>{s.primary_domain}</span></>}
            </p>
            <p className="meta mt-1 flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-1"><Clock3 size={12} /> Updated {new Date(s.updated_at).toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric" })}</span>
              {s.github_username ? (
                <a href={`https://github.com/${s.github_username}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium hover:underline" style={{ color: "var(--accent)" }}>
                  <Github size={12} /> @{s.github_username} <ExternalLink size={10} />
                </a>
              ) : (
                <span className="inline-flex items-center gap-1" style={{ color: "var(--text-muted)" }}><Github size={12} /> Not linked</span>
              )}
            </p>
          </div>
          <div className="shrink-0 rounded-xl border p-3 text-center" style={{ borderColor: "var(--line)", background: "var(--bg)" }}>
            <p className="font-mono text-lg font-semibold leading-none" style={{ color: "var(--text)" }}>{pct}%</p>
            <p className="meta mt-1">Roadmap</p>
            <div className="mt-2 h-1.5 w-20 overflow-hidden rounded-full" style={{ background: "var(--line)" }}>
              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "var(--accent)" }} />
            </div>
            <p className="meta mt-1">{stats?.done ?? 0} / {stats?.total_nodes ?? 0} nodes</p>
          </div>
        </div>

        {/* KPI strip */}
        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          {[
            { k: "Progress", v: `${stats?.done ?? 0} nodes`, sub: `${pct}% completed`, icon: Layers },
            { k: "Projects", v: `${stats?.projects ?? 0}`, sub: "shipped", icon: FolderGit2 },
            { k: "Active days", v: `${stats?.active_days ?? 0} / 14`, sub: "last 2 weeks", icon: Activity },
            { k: "Departments", v: `${memberships.length}`, sub: memberships.length ? memberships.map((m) => m.dept_slug).slice(0, 2).join(", ") : "none", icon: GraduationCap },
          ].map((c) => (
            <div key={c.k} className="rounded-2xl border p-4" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
              <p className="flex items-center gap-1.5 text-xs font-medium" style={{ color: "var(--text-muted)" }}><c.icon size={12} /> {c.k}</p>
              <p className="mt-1 font-mono text-sm font-semibold" style={{ color: "var(--text)" }}>{c.v}</p>
              <p className="meta truncate">{c.sub}</p>
            </div>
          ))}
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          {/* Main */}
          <div className="space-y-6 lg:col-span-2">
            <section className="rounded-2xl border p-6" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
              <h2 className="flex items-center gap-2 text-sm font-semibold" style={{ color: "var(--text)" }}><Shield size={14} /> Role management</h2>
              <p className="narrative mt-1">Grant is scoped — Heads require a department, Vertical Leads require a vertical. Every change is audited.</p>
              <div className="mt-4"><RoleForm userId={s.user_id} currentRole={s.role} /></div>
            </section>

            <ActivityBars data={activityBars} />
            <div className="rounded-2xl border p-4" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
              <p className="meta">Heat · saturation = signals</p>
              <div className="mt-2"><HeatStrip days={heatDays} emptyLabel="No signals in 14 days" /></div>
            </div>

            <section className="rounded-2xl border p-6" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
              <h2 className="flex items-center gap-2 text-sm font-semibold" style={{ color: "var(--text)" }}><Activity size={14} /> Recent activity · last 14 days</h2>
              {activity.length === 0 ? (
                <p className="narrative mt-3">No GitHub activity in the last 14 days. Link GitHub and push to a tracked repo to populate this.</p>
              ) : (
                <ul className="mt-3 divide-y rounded-xl border" style={{ borderColor: "var(--line)", background: "var(--bg)" }}>
                  {activity.map((a) => (
                    <li key={String(a.day).slice(0, 10)} className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-sm">
                      <span className="font-mono text-xs" style={{ color: "var(--text-muted)" }}>{String(a.day).slice(0, 10)}</span>
                      <span className="flex items-center gap-2 text-xs" style={{ color: "var(--text)" }}>
                        <span className="rounded-full border px-2 py-0.5" style={{ borderColor: "var(--line)" }}>{a.commits} commits</span>
                        <span className="rounded-full border px-2 py-0.5" style={{ borderColor: "var(--line)" }}>{a.pull_requests} PRs</span>
                        {Number(a.reviews) > 0 && <span className="rounded-full border px-2 py-0.5" style={{ borderColor: "var(--line)" }}>{a.reviews} reviews</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="rounded-2xl border p-6" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
              <h2 className="flex items-center gap-2 text-sm font-semibold" style={{ color: "var(--text)" }}><FolderGit2 size={14} /> Projects · {projects.length}</h2>
              {projects.length === 0 ? (
                <p className="narrative mt-3">No projects yet. Projects appear once the student ships from the Build workspace.</p>
              ) : (
                <ul className="mt-3 divide-y rounded-xl border" style={{ borderColor: "var(--line)", background: "var(--bg)" }}>
                  {projects.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-3 px-3.5 py-3">
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium" style={{ color: "var(--text)" }}>{p.title}</span>
                        <span className="meta truncate">{p.status}{p.roadmap_node_id ? ` · ${p.roadmap_node_id}` : ""}</span>
                      </span>
                      {p.repo_url ? <a href={p.repo_url} target="_blank" rel="noreferrer" className="shrink-0 text-xs font-semibold hover:underline" style={{ color: "var(--accent)" }}>Repo →</a> : <span className="meta shrink-0">{new Date(p.created_at).toLocaleDateString("en-IN", { month: "short", day: "numeric" })}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          {/* Side */}
          <div className="space-y-6">
            <section className="rounded-2xl border p-6" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
              <h2 className="flex items-center gap-2 text-sm font-semibold" style={{ color: "var(--text)" }}><GraduationCap size={14} /> Departments</h2>
              {memberships.length === 0 ? (
                <p className="narrative mt-3">No department memberships. They are created on first login from signup domains or via the join flow.</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {memberships.map((m) => (
                    <li key={m.dept_slug} className="flex items-center justify-between rounded-xl border px-3 py-2.5" style={{ borderColor: "var(--line)", background: "var(--bg)" }}>
                      <span>
                        <span className="block text-sm font-medium" style={{ color: "var(--text)" }}>{m.dept_name}</span>
                        <span className="meta">{m.dept_vertical} · {m.level}{m.core_requested ? " · requested core" : ""}{m.succession_ready ? " · succession" : ""}</span>
                      </span>
                      <span className="meta shrink-0">{m.joined_at ? new Date(m.joined_at).toLocaleDateString("en-IN", { month: "short", day: "numeric" }) : ""}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="rounded-2xl border p-6" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
              <h2 className="flex items-center gap-2 text-sm font-semibold" style={{ color: "var(--text)" }}><Award size={14} /> Achievements</h2>
              {achievements.length === 0 ? (
                <p className="narrative mt-3">No achievements yet. Badges are awarded on verified OSS merges.</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {achievements.map((a) => (
                    <li key={a.id} className="flex items-center justify-between rounded-xl border px-3 py-2.5" style={{ borderColor: "var(--line)", background: "var(--bg)" }}>
                      <span className="text-sm font-medium" style={{ color: "var(--text)" }}>{a.source_ref}</span>
                      <span className="rounded-full border px-2 py-0.5 text-xs capitalize" style={{ borderColor: "var(--line)", color: "var(--text-muted)" }}>{a.level} · {a.source_type}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="rounded-2xl border p-6" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
              <h2 className="text-sm font-semibold" style={{ color: "var(--text)" }}>Profile</h2>
              <dl className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between gap-3"><dt className="meta">User ID</dt><dd className="font-mono text-xs" style={{ color: "var(--text-muted)" }}>{s.user_id.slice(0, 8)}…</dd></div>
                <div className="flex justify-between gap-3"><dt className="meta">Track</dt><dd style={{ color: "var(--text)" }}>{s.primary_domain || "—"}</dd></div>
                <div className="flex justify-between gap-3"><dt className="meta">Onboarding</dt><dd style={{ color: "var(--text)" }}>{s.updated_at ? new Date(s.updated_at).toLocaleDateString("en-IN") : "—"}</dd></div>
              </dl>
              <Link href="/admin/audit" prefetch={false} className="mt-4 inline-flex text-xs font-semibold hover:underline" style={{ color: "var(--accent)" }}>View audit trail →</Link>
            </section>
          </div>
        </div>
      </main>
    </AppShell>
  );
}
