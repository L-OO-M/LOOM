import { redirect } from "next/navigation";
import Link from "next/link";
import { Search, Users, Filter, ArrowUpRight, X } from "lucide-react";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { RoleDistributionDonut, DeptMembershipBars } from "@/components/admin/StudentsCharts";
import { classifyMany } from "@/lib/tiers";
import "./students.css";

function roleTone(role) {
  switch (role) {
    case "admin": return { bg: "var(--text)", color: "white", label: "Admin" };
    case "vertical_lead": return { bg: "color-mix(in srgb, #7c3aed 18%, var(--bg))", color: "#7c3aed", border: "color-mix(in srgb, #7c3aed 22%, transparent)", label: "Vertical Lead" };
    case "dept_lead": return { bg: "color-mix(in srgb, #d97706 14%, var(--bg))", color: "#b45309", border: "color-mix(in srgb, #d97706 20%, transparent)", label: "Head" };
    case "core": return { bg: "color-mix(in srgb, var(--accent) 14%, var(--bg))", color: "var(--accent)", border: "color-mix(in srgb, var(--accent) 20%, transparent)", label: "Core" };
    default: return { bg: "var(--bg-elevated)", color: "var(--text-muted)", border: "var(--line)", label: "Student" };
  }
}

function initials(name) {
  if (!name) return "?";
  const parts = String(name).trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase()).join("") || "?";
}

export default async function AdminStudentsPage({ searchParams }) {
  const ctx = await getRequestContext({ adminOnly: true });
  if (ctx.error === "UNAUTHORIZED") redirect("/login?redirect=/admin/students");
  if (ctx.error === "FORBIDDEN") redirect("/student");
  if (ctx.error) redirect("/login?redirect=/admin/students");
  const { user, tenant, sql } = ctx;
  const sp = await searchParams;
  const q = (sp?.q || "").trim();
  const role = sp?.role || "";
  const dept = sp?.dept || "";
  const tierFilter = sp?.tier || "";

  const departments = await sql`
    SELECT slug, name FROM departments
    WHERE is_active AND (tenant_id = ${tenant?.id ?? null}::uuid OR ${tenant?.id ?? null}::uuid IS NULL)
    ORDER BY name
  `;

  // Stats in one round-trip, avoids separate counts per role.
  const [stats] = await sql`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE role = 'student')::int AS students,
      COUNT(*) FILTER (WHERE role = 'core')::int AS core,
      COUNT(*) FILTER (WHERE role IN ('dept_lead','vertical_lead'))::int AS leads,
      COUNT(*) FILTER (WHERE role = 'admin')::int AS admins
    FROM profiles
    WHERE (tenant_id = ${tenant?.id ?? null}::uuid OR ${tenant?.id ?? null}::uuid IS NULL)
  `;

  let rows = await sql`
    SELECT p.user_id, p.name, p.role, p.primary_domain, p.branch, p.year, p.roll_number,
           p.github_username, p.updated_at, p.vertical, p.role_term_end,
      (SELECT json_agg(json_build_object('slug', d.slug, 'level', m.level, 'name', d.name))
       FROM department_memberships m JOIN departments d ON d.id = m.department_id
       WHERE m.user_id = p.user_id) AS departments
    FROM profiles p
    WHERE (p.tenant_id = ${tenant?.id ?? null}::uuid OR ${tenant?.id ?? null}::uuid IS NULL)
      AND (${q ? sql`(p.name ILIKE ${"%" + q + "%"} OR p.user_id ILIKE ${"%" + q + "%"} OR COALESCE(p.github_username,'') ILIKE ${"%" + q + "%"})` : sql`TRUE`})
      AND (${role ? sql`p.role = ${role}` : sql`TRUE`})
      AND (${dept ? sql`EXISTS (SELECT 1 FROM department_memberships m JOIN departments d ON d.id = m.department_id WHERE m.user_id = p.user_id AND d.slug = ${dept})` : sql`TRUE`})
    ORDER BY p.updated_at DESC LIMIT 50
  `;

  // Tier segregation is computed live, never stored, never shown as public tags.
  let tierMap = new Map();
  let tierCounts = { beginner: 0, intermediate: 0, advanced: 0 };
  if (rows.length > 0) {
    try {
      tierMap = await classifyMany(sql, rows.map((r) => r.user_id));
      for (const r of rows) {
        const t = tierMap.get(r.user_id)?.tier || "beginner";
        tierCounts[t] = (tierCounts[t] || 0) + 1;
        r._tier = t;
      }
      if (tierFilter && ["beginner", "intermediate", "advanced"].includes(tierFilter)) {
        rows = rows.filter((r) => r._tier === tierFilter);
      }
    } catch { /* tier must never break roster */ }
  }

  // Charts use sequential tenant-scoped aggregates (pooler-safe).
  const deptCounts = await sql`
    SELECT d.name, COUNT(*)::int AS c FROM department_memberships m
    JOIN departments d ON d.id = m.department_id
    WHERE (d.tenant_id = ${tenant?.id ?? null}::uuid OR ${tenant?.id ?? null}::uuid IS NULL)
    GROUP BY d.name ORDER BY c DESC LIMIT 6
  `;

  const activeFilters = [q && `search: ${q}`, role && `role: ${role}`, dept && `dept: ${dept}`, tierFilter && `tier: ${tierFilter}`].filter(Boolean);
  const clearHref = "/admin/students";
  const tierRows = [
    { id: "beginner", label: "Beginner", count: tierCounts.beginner, desc: "needs support" },
    { id: "intermediate", label: "Intermediate", count: tierCounts.intermediate, desc: "needs guidance" },
    { id: "advanced", label: "Advanced", count: tierCounts.advanced, desc: "ready to build" },
  ];

  return (
    <AppShell area="admin" tenant={tenant} user={user}>
      <main className="rosterx mx-auto max-w-6xl px-4 pb-14 sm:px-6">
        <header className="adminx-masthead">
          <div className="adminx-masthead-bar">
            <span className="adminx-seal"><Users size={12} /> Roster</span>
            <span>People / chapter ledger</span>
            {tenant?.name && <span>/ {tenant.name}</span>}
          </div>
          <div className="adminx-masthead-grid">
            <div className="adminx-masthead-copy">
              <p className="adminx-kicker">People / chapter</p>
              <h1 className="adminx-title">The chapter, <span>by name.</span></h1>
              <p className="adminx-desc">
                Search, inspect, and manage roles. Every role change is audited and scoped to this chapter.
              </p>
              <p className="adst-meta-line">
                {stats?.total ?? 0} enrolled &middot; {rows.length} shown &middot; server cap 50
              </p>
            </div>
            <div className="adminx-glance" aria-label="Chapter roster at a glance">
              {[
                { label: "Total", value: stats?.total ?? 0 },
                { label: "Students", value: stats?.students ?? 0 },
                { label: "Core + leads", value: (stats?.core ?? 0) + (stats?.leads ?? 0) },
                { label: "Admins", value: stats?.admins ?? 0 },
              ].map((s) => (
                <div key={s.label} className="adminx-glance-item">
                  <strong>{s.value}</strong>
                  <span>{s.label}</span>
                </div>
              ))}
            </div>
          </div>
        </header>

        <section className="adst-tier-band" aria-labelledby="adst-tier-title">
          <div className="adst-tier-head">
            <p id="adst-tier-title" className="adst-band-label">Tiers / internal</p>
            <p className="adst-band-note">For distribution only, hidden from student UI</p>
          </div>
          <div className="adst-tier-row">
            {tierRows.map((t) => (
              <Link
                key={t.id}
                href={tierFilter === t.id ? clearHref : `/admin/students?tier=${t.id}${q ? `&q=${encodeURIComponent(q)}` : ""}${role ? `&role=${role}` : ""}${dept ? `&dept=${dept}` : ""}`}
                prefetch={false}
                aria-pressed={tierFilter === t.id}
                className="adst-tier"
              >
                <span className="adst-tier-count">{t.count}</span>
                <span className="adst-tier-copy">
                  <span className="adst-tier-label">{t.label}</span>
                  <span className="adst-tier-desc">{t.desc}</span>
                </span>
              </Link>
            ))}
          </div>
        </section>

        <section className="adst-charts" aria-label="Distribution visuals">
          <div className="adst-chart-cell">
            <RoleDistributionDonut data={[
              { name: "Student", value: stats?.students ?? 0 },
              { name: "Core", value: stats?.core ?? 0 },
              { name: "Leads", value: stats?.leads ?? 0 },
              { name: "Admin", value: stats?.admins ?? 0 },
            ]} />
          </div>
          <div className="adst-chart-cell">
            <DeptMembershipBars data={deptCounts.map((r) => ({ name: r.name, value: r.c }))} />
          </div>
        </section>

        <form method="get" className="adst-filter" role="search">
          <div className="adst-filter-main">
            <div className="adst-search">
              <Search size={14} className="adst-search-icon" aria-hidden="true" />
              <input
                name="q"
                defaultValue={q}
                placeholder="Search name, user id, or GitHub"
                aria-label="Search students"
                className="adst-search-input"
              />
            </div>
            <div className="adst-selects">
              <div className="adst-select-wrap">
                <Filter size={12} className="adst-select-icon" aria-hidden="true" />
                <select name="role" defaultValue={role} aria-label="Filter by role" className="adst-select">
                  <option value="">All roles</option>
                  <option value="student">Student</option>
                  <option value="core">Core</option>
                  <option value="dept_lead">Head</option>
                  <option value="vertical_lead">Vertical Lead</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <select name="dept" defaultValue={dept} aria-label="Filter by department" className="adst-select">
                <option value="">All departments</option>
                {departments.map((d) => <option key={d.slug} value={d.slug}>{d.name}</option>)}
              </select>
              <select name="tier" defaultValue={tierFilter} aria-label="Filter by tier" className="adst-select">
                <option value="">All tiers</option>
                <option value="beginner">Beginner / needs support</option>
                <option value="intermediate">Intermediate / needs guidance</option>
                <option value="advanced">Advanced / ready to build</option>
              </select>
              <button className="btn-ink !py-2.5 !px-5 text-sm">Search</button>
              {(q || role || dept) && (
                <Link href={clearHref} prefetch={false} className="adst-clear">
                  <X size={12} /> Clear
                </Link>
              )}
            </div>
          </div>

          {activeFilters.length > 0 && (
            <div className="adst-active-filters">
              <span className="adst-band-label">Active</span>
              {activeFilters.map((f) => (
                <span key={f} className="adst-active-filter">{f}</span>
              ))}
              <span className="adst-active-count">
                {rows.length} result{rows.length === 1 ? "" : "s"} &middot; capped at 50
              </span>
            </div>
          )}
        </form>

        <div className="adst-roster">
          {rows.length === 0 ? (
            <div className="adst-empty">
              <p className="adst-empty-title">No students found.</p>
              <p className="adst-empty-copy">Try broadening the search or clearing the department filter. New sign-ups appear here after their first login.</p>
            </div>
          ) : (
            <div className="adst-table-wrap">
              <table className="adst-table">
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Role</th>
                    <th>Term ends</th>
                    <th>Tier</th>
                    <th>Track</th>
                    <th>Departments</th>
                    <th>Year</th>
                    <th>Updated</th>
                    <th aria-label="Actions"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => {
                    const tone = roleTone(r.role);
                    const mems = Array.isArray(r.departments) ? r.departments : [];
                    const tier = tierMap.get(r.user_id);
                    const expired = r.role_term_end && new Date(r.role_term_end) < new Date();
                    return (
                      <tr key={r.user_id}>
                        <td className="adst-person">
                          <span className="adst-row-num" aria-hidden="true">{String(i + 1).padStart(2, "0")}</span>
                          <Link href={`/admin/students/${r.user_id}`} prefetch={false} className="adst-person-link">
                            <span className="adst-avatar">{initials(r.name)}</span>
                            <span className="adst-person-copy">
                              <span className="adst-person-name">{r.name || "—"}</span>
                              <span className="adst-person-handle">{r.github_username ? `@${r.github_username}` : r.user_id.slice(0, 8)}</span>
                            </span>
                          </Link>
                        </td>
                        <td>
                          <span className="adst-role" style={{ background: tone.bg, color: tone.color, borderColor: tone.border ?? "var(--line)" }}>
                            {tone.label}
                          </span>
                        </td>
                        <td className={`adst-term ${expired ? "is-expired" : ""}`}>
                          {r.role_term_end ? new Date(r.role_term_end).toLocaleDateString("en-IN", { month: "short", year: "numeric" }) : "—"}
                          {expired && <span className="adst-term-note">expired</span>}
                        </td>
                        <td>
                          <span className="adst-tier-pill" data-tier={tier?.tier || "beginner"} title={tier?.need || ""}>
                            <span className="adst-tier-dot" aria-hidden="true" />
                            {tier?.tier || "beginner"}
                          </span>
                        </td>
                        <td><span className="adst-track">{r.primary_domain || "—"}</span></td>
                        <td>
                          <span className="adst-depts">
                            {mems.length === 0 ? <span className="adst-muted">—</span> : mems.slice(0, 2).map((d) => (
                              <span key={`${r.user_id}-${d.slug}`} className="adst-dept">
                                {d.name || d.slug}<span className="adst-dept-level">{d.level}</span>
                              </span>
                            ))}
                            {mems.length > 2 && <span className="adst-muted">+{mems.length - 2}</span>}
                          </span>
                        </td>
                        <td className="adst-year">{r.year ?? "—"}</td>
                        <td className="adst-updated">{r.updated_at ? new Date(r.updated_at).toLocaleDateString("en-IN", { month: "short", day: "numeric" }) : "—"}</td>
                        <td className="adst-actions">
                          <Link href={`/admin/students/${r.user_id}`} prefetch={false} className="adst-open">
                            Open <ArrowUpRight size={12} />
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <div className="adst-foot">
            <span>{rows.length} shown &middot; server cap 50 &middot; use search + filters to narrow</span>
            <Link href={clearHref} prefetch={false}>Clear filters</Link>
          </div>
        </div>
      </main>
    </AppShell>
  );
}
