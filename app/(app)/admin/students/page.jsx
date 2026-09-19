import { redirect } from "next/navigation";
import Link from "next/link";
import { Search, Users, Shield, Crown, GraduationCap, Filter, ArrowUpRight, X } from "lucide-react";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/ui";
import { RoleDistributionDonut, DeptMembershipBars } from "@/components/admin/StudentsCharts";

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

  const departments = await sql`
    SELECT slug, name FROM departments
    WHERE is_active AND (tenant_id = ${tenant?.id ?? null}::uuid OR ${tenant?.id ?? null}::uuid IS NULL)
    ORDER BY name
  `;

  // Stats in one round-trip — avoids separate counts per role.
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

  const rows = await sql`
    SELECT p.user_id, p.name, p.role, p.primary_domain, p.branch, p.year, p.roll_number,
           p.github_username, p.updated_at, p.vertical,
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

  // Charts — sequential tenant-scoped aggregates (pooler-safe).
  const deptCounts = await sql`
    SELECT d.name, COUNT(*)::int AS c FROM department_memberships m
    JOIN departments d ON d.id = m.department_id
    WHERE (d.tenant_id = ${tenant?.id ?? null}::uuid OR ${tenant?.id ?? null}::uuid IS NULL)
    GROUP BY d.name ORDER BY c DESC LIMIT 6
  `;

  const activeFilters = [q && `search: ${q}`, role && `role: ${role}`, dept && `dept: ${dept}`].filter(Boolean);
  const clearHref = "/admin/students";

  return (
    <AppShell area="admin" tenant={tenant} user={user}>
      <main className="mx-auto max-w-6xl px-4 pb-14 sm:px-6">
        <PageHeader
          kicker={`College · ${stats?.total ?? rows.length} enrolled · ${rows.length} shown`}
          title="Students"
          desc="Search, inspect, and manage roles. Every role change is audited and scoped to this chapter."
          action={
            <Link href="/admin/students" prefetch={false} className="hidden sm:inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)", color: "var(--text-muted)" }}>
              <Users size={12} /> Roster
            </Link>
          }
        />

        {/* Stats strip — mirrors real admin consoles: total + distribution at a glance */}
        <div className="mb-6 grid gap-3 sm:grid-cols-4">
          {[
            { label: "Total", value: stats?.total ?? 0, icon: Users },
            { label: "Students", value: stats?.students ?? 0, icon: GraduationCap },
            { label: "Core + Leads", value: (stats?.core ?? 0) + (stats?.leads ?? 0), icon: Crown },
            { label: "Admins", value: stats?.admins ?? 0, icon: Shield },
          ].map((s) => (
            <div key={s.label} className="flex items-center gap-3 rounded-2xl border p-3.5" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
              <span className="inline-flex size-8 items-center justify-center rounded-full" style={{ background: "var(--bg)", border: "1px solid var(--line)", color: "var(--text-muted)" }}>
                <s.icon size={14} />
              </span>
              <div>
                <p className="font-mono text-sm font-semibold leading-none" style={{ color: "var(--text)" }}>{s.value}</p>
                <p className="meta">{s.label}</p>
              </div>
            </div>
          ))}
        </div>

        <section className="grid gap-4 lg:grid-cols-2" aria-label="Distribution visuals">
          <RoleDistributionDonut data={[
            { name: "Student", value: stats?.students ?? 0 },
            { name: "Core", value: stats?.core ?? 0 },
            { name: "Leads", value: stats?.leads ?? 0 },
            { name: "Admin", value: stats?.admins ?? 0 },
          ]} />
          <DeptMembershipBars data={deptCounts.map((r) => ({ name: r.name, value: r.c }))} />
        </section>

        {/* Filters — professional filter bar: search + selects + pills, like Linear/Notion directories */}
        <form method="get" className="mb-4 mt-4 rounded-2xl border p-3 sm:p-4" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }} role="search">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative flex-1">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--text-muted)" }} />
              <input
                name="q"
                defaultValue={q}
                placeholder="Search name, user id, or GitHub…"
                aria-label="Search students"
                className="w-full rounded-xl border py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--accent)_16%,transparent)]"
                style={{ borderColor: "var(--line)", background: "var(--bg)", color: "var(--text)" }}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Filter size={12} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: "var(--text-muted)" }} />
                <select name="role" defaultValue={role} aria-label="Filter by role" className="rounded-xl border py-2.5 pl-7 pr-8 text-sm outline-none" style={{ borderColor: "var(--line)", background: "var(--bg)", color: "var(--text)" }}>
                  <option value="">All roles</option>
                  <option value="student">Student</option>
                  <option value="core">Core</option>
                  <option value="dept_lead">Head</option>
                  <option value="vertical_lead">Vertical Lead</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <select name="dept" defaultValue={dept} aria-label="Filter by department" className="rounded-xl border py-2.5 pl-3 pr-8 text-sm outline-none" style={{ borderColor: "var(--line)", background: "var(--bg)", color: "var(--text)" }}>
                <option value="">All departments</option>
                {departments.map((d) => <option key={d.slug} value={d.slug}>{d.name}</option>)}
              </select>
              <button className="btn-ink !py-2.5 !px-5 text-sm">Search</button>
              {(q || role || dept) && (
                <Link href={clearHref} prefetch={false} className="inline-flex items-center gap-1 rounded-full border px-3 py-2 text-xs font-medium hover:bg-[var(--bg)]" style={{ borderColor: "var(--line)", color: "var(--text-muted)" }}>
                  <X size={12} /> Clear
                </Link>
              )}
            </div>
          </div>

          {activeFilters.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <span className="meta mr-1">Active:</span>
              {activeFilters.map((f) => (
                <span key={f} className="inline-flex items-center rounded-full border px-2.5 py-1 text-xs" style={{ borderColor: "var(--line)", background: "var(--bg)", color: "var(--text-muted)" }}>{f}</span>
              ))}
              <span className="meta ml-1">{rows.length} result{rows.length === 1 ? "" : "s"} · capped at 50</span>
            </div>
          )}
        </form>

        {/* Roster — dense, scannable table with avatar + role + dept tags; row hover lifts slightly */}
        <div className="overflow-hidden rounded-2xl border" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
          {rows.length === 0 ? (
            <div className="py-14 text-center">
              <p className="text-sm font-medium" style={{ color: "var(--text)" }}>No students found</p>
              <p className="narrative mx-auto mt-2 max-w-md">Try broadening the search or clearing the department filter. New sign-ups appear here after their first login.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b text-xs" style={{ borderColor: "var(--line)", color: "var(--text-muted)", background: "var(--bg)" }}>
                    <th className="whitespace-nowrap px-4 py-3 font-medium">Student</th>
                    <th className="whitespace-nowrap px-3 py-3 font-medium">Role</th>
                    <th className="whitespace-nowrap px-3 py-3 font-medium">Track</th>
                    <th className="whitespace-nowrap px-3 py-3 font-medium">Departments</th>
                    <th className="whitespace-nowrap px-3 py-3 font-medium">Year</th>
                    <th className="whitespace-nowrap px-3 py-3 font-medium">Updated</th>
                    <th className="px-3 py-3 text-right font-medium"></th>
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: "var(--line)" }}>
                  {rows.map((r) => {
                    const tone = roleTone(r.role);
                    const mems = Array.isArray(r.departments) ? r.departments : [];
                    return (
                      <tr key={r.user_id} className="group transition hover:bg-[color-mix(in_srgb,var(--accent)_5%,transparent)]">
                        <td className="px-4 py-3">
                          <Link href={`/admin/students/${r.user_id}`} prefetch={false} className="flex items-center gap-3">
                            <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full border text-xs font-semibold" style={{ borderColor: "var(--line)", background: "var(--bg)", color: "var(--text)" }}>{initials(r.name)}</span>
                            <span className="min-w-0">
                              <span className="block truncate font-medium group-hover:underline" style={{ color: "var(--text)" }}>{r.name || "—"}</span>
                              <span className="block truncate font-mono text-xs" style={{ color: "var(--text-muted)" }}>{r.github_username ? `@${r.github_username}` : r.user_id.slice(0, 8)}</span>
                            </span>
                          </Link>
                        </td>
                        <td className="px-3 py-3">
                          <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium" style={{ background: tone.bg, color: tone.color, borderColor: tone.border ?? "var(--line)" }}>{tone.label}</span>
                        </td>
                        <td className="px-3 py-3"><span className="meta rounded-full border px-2 py-0.5" style={{ borderColor: "var(--line)" }}>{r.primary_domain || "—"}</span></td>
                        <td className="px-3 py-3">
                          <span className="flex max-w-[22ch] flex-wrap gap-1">
                            {mems.length === 0 ? <span className="meta">—</span> : mems.slice(0, 2).map((d) => (
                              <span key={`${r.user_id}-${d.slug}`} className="inline-flex rounded-full border px-2 py-0.5 text-xs" style={{ borderColor: "var(--line)", background: "var(--bg)", color: "var(--text-muted)" }}>{d.name || d.slug}<span className="ml-1 opacity-60">· {d.level}</span></span>
                            ))}
                            {mems.length > 2 && <span className="meta">+{mems.length - 2}</span>}
                          </span>
                        </td>
                        <td className="px-3 py-3 font-mono text-xs" style={{ color: "var(--text-muted)" }}>{r.year ?? "—"}</td>
                        <td className="px-3 py-3 whitespace-nowrap text-xs" style={{ color: "var(--text-muted)" }}>{r.updated_at ? new Date(r.updated_at).toLocaleDateString("en-IN", { month: "short", day: "numeric" }) : "—"}</td>
                        <td className="px-3 py-3 text-right">
                          <Link href={`/admin/students/${r.user_id}`} prefetch={false} className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold opacity-70 transition group-hover:opacity-100 hover:border-[var(--accent)]" style={{ borderColor: "var(--line)", color: "var(--accent)" }}>
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
          <div className="flex items-center justify-between border-t px-4 py-3 text-xs" style={{ borderColor: "var(--line)", background: "var(--bg)", color: "var(--text-muted)" }}>
            <span>{rows.length} shown · server cap 50 · use search + filters to narrow</span>
            <Link href="/admin/students" prefetch={false} className="font-medium hover:underline" style={{ color: "var(--accent)" }}>Clear filters</Link>
          </div>
        </div>
      </main>
    </AppShell>
  );
}
