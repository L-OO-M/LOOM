import Link from "next/link";
import { notFound, permanentRedirect, redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { WorkspaceMasthead, WorkspaceSection, WorkspaceEmpty } from "@/components/loom/WorkspaceMasthead";
import { can } from "@/lib/permissions";
import {
  VERTICAL_LABEL,
  departmentMeta,
  legacyDepartmentRedirect,
  catalogCounts,
} from "@/lib/department-catalog";
import {
  canViewDepartment,
  catalogueIndex,
  getDepartmentWorkspace,
} from "@/lib/department-workspace";
import { DepartmentWorkBoard } from "./_components/DepartmentWorkBoard";
import { DepartmentRoster } from "./_components/DepartmentRoster";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Department workspace",
  robots: { index: false, follow: false }
};

const LEAD_ROLES = ["dept_lead", "vertical_lead", "admin", "platform_admin"];

const money = (value) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(value || 0));

const day = (value) =>
  value ? new Date(value).toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric" }) : "—";

function Rows({ items, empty, render }) {
  if (!items.length) return <WorkspaceEmpty title={empty} />;
  return (
    <ul className="divide-y rounded-2xl border" style={{ borderColor: "var(--line)" }}>
      {items.map((item) => (
        <li key={item.id ?? item.user_id} className="flex flex-wrap items-baseline gap-3 p-4">
          {render(item)}
        </li>
      ))}
    </ul>
  );
}

export default async function DepartmentWorkspacePage({ params }) {
  const { slug } = await params;
  const legacy = legacyDepartmentRedirect(slug);
  if (legacy) permanentRedirect(`/lead/departments/${legacy}`);

  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") redirect("/login?redirect=/lead/departments");
  if (ctx.error) redirect("/login?redirect=/lead/departments");
  const { tenant, profile, sql, user } = ctx;
  if (!LEAD_ROLES.includes(profile.role)) redirect("/student");

  const meta = departmentMeta(slug);
  if (!meta) notFound();

  const [department] = await sql`
    SELECT id, name, slug, vertical, description, is_active
    FROM departments
    WHERE tenant_id = ${tenant.id}::uuid AND slug = ${slug}
    LIMIT 1
  `;
  if (!department || !department.is_active) notFound();
  if (!canViewDepartment(profile, department)) redirect("/lead/departments");

  const me = {
    id: user.id,
    tenantId: tenant.id,
    role: profile.role,
    vertical: profile.vertical,
    memberships: profile.memberships || [],
    scopedGrants: profile.scopedGrants || [],
    roleTermEnd: profile.roleTermEnd ?? profile.role_term_end ?? null,
    isPlatformAdmin: !!profile.isPlatformAdmin
  };
  const scope = { departmentId: department.id, vertical: department.vertical };

  const workspace = await getDepartmentWorkspace(sql, { tenantId: tenant.id, department });
  const { heads, members, events, tasks, departmentTasks, reports, contributions, assets, expenses, mous, directory, counts } = workspace;

  const showRoster = can(me, "view_roster", scope).ok;
  const showTasks = can(me, "view_assigned_event_tasks", scope).ok || can(me, "manage_event_ops", scope).ok;
  const showWork = can(me, "view_department_tasks", scope).ok;
  const canManageWork = can(me, "manage_department_tasks", scope).ok;
  const canVerifyWork = can(me, "verify_department_work", scope).ok;
  const canManageRoster = can(me, "manage_department_roster", scope).ok;
  const showReports = can(me, "export_reports", scope).ok || can(me, "view_lead_tools", scope).ok;
  const showAssets = can(me, "view_assets", scope).ok;
  const showBudget = can(me, "view_event_budget", scope).ok;
  const showAgreements =
    can(me, "manage_mou", scope).ok ||
    can(me, "manage_sponsorship_leads", scope).ok ||
    can(me, "manage_outreach_leads", scope).ok;
  const showDirectory = can(me, "view_lead_tools", scope).ok;

  // People a head may add: chapter members not already in this department.
  // Only fetched when the head can actually use the list.
  const candidates = canManageRoster
    ? await sql`
        SELECT p.user_id, p.name
        FROM profiles p
        WHERE p.tenant_id = ${tenant.id}::uuid
          AND NOT EXISTS (
            SELECT 1 FROM department_memberships m
            WHERE m.user_id = p.user_id AND m.department_id = ${department.id}::uuid
          )
        ORDER BY p.name ASC
        LIMIT 200
      `
    : [];

  const index = catalogueIndex(meta.slug);
  const total = catalogCounts().total;
  const spent = counts.spent;
  const allocated = counts.allocated;

  return (
    <AppShell area="lead" tenant={tenant} user={user}>
      <main className="animate-in mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        <p className="mt-6">
          <Link
            href="/lead/departments"
            prefetch={false}
            className="text-sm underline-offset-4 hover:underline"
            style={{ color: "var(--text-muted)" }}
          >
            ← All department workspaces
          </Link>
        </p>

        <WorkspaceMasthead
          kicker={`Department ${String(index).padStart(2, "0")} of ${total} / ${VERTICAL_LABEL[department.vertical] || department.vertical}`}
          title={department.name}
          lede={meta.description || department.description}
          meta={meta.tagline}
          tone="field"
          art={meta ? `/departments/${meta.slug}.png` : undefined}
          artAlt={`${department.name} cover artwork`}
          stats={[
            { value: counts.members, label: "members" },
            { value: counts.heads, label: "co-equal heads" },
            { value: counts.openWork, label: "open work" },
            { value: counts.awaitingReview, label: "awaiting review" }
          ]}
        />

        <div className="mt-10 space-y-10">
          <WorkspaceSection
            index="01"
            title="Who leads it"
            note="Two co-equal heads. Both hold exactly the same department authority; neither is a society administrator."
          >
            {heads.length === 0 ? (
              <WorkspaceEmpty
                title="No live head appointed"
                body="An admin appoints heads through Members. Until then nobody holds this department's head permissions."
              />
            ) : (
              <ul className="grid gap-4 sm:grid-cols-2">
                {heads.map((h) => (
                  <li
                    key={h.user_id}
                    className="flex items-center gap-4 rounded-2xl border p-4"
                    style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}
                  >
                    <span
                      className="grid h-12 w-12 shrink-0 place-items-center rounded-full text-sm font-semibold"
                      style={{ background: "var(--bg-muted)", color: "var(--text)" }}
                    >
                      {String(h.name || "?").slice(0, 1).toUpperCase()}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-medium" style={{ color: "var(--text)" }}>{h.name || "Unnamed head"}</span>
                      <span className="block text-xs" style={{ color: "var(--text-muted)" }}>Head / Co-head · term ends {day(h.term_end)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </WorkspaceSection>

          {showWork && (
            <WorkspaceSection
              index="02"
              title="Work board"
              note="Assign work inside this department, attach proof, and have it reviewed by the other head. Nobody approves their own submission."
            >
              <DepartmentWorkBoard
                departmentId={department.id}
                tasks={departmentTasks}
                members={members}
                meId={user.id}
                canManage={canManageWork}
                canVerify={canVerifyWork}
              />
            </WorkspaceSection>
          )}

          {showRoster && (
            <WorkspaceSection index="03" title="Members" note={`Everyone in ${department.name}. A head may add, promote, demote and remove within this department; a Head's seat stays an admin appointment.`}>
              <DepartmentRoster
                departmentId={department.id}
                departmentName={department.name}
                initialMembers={members}
                candidates={candidates}
                canManage={canManageRoster}
                meId={user.id}
              />
            </WorkspaceSection>
          )}

          <WorkspaceSection index="04" title="Events" note="Everything this department scheduled, newest first.">
            <Rows
              items={events}
              empty="No events yet. A department with nothing scheduled has nothing to promote, document, or staff."
              render={(e) => (
                <>
                  <span className="w-24 shrink-0 font-mono text-xs" style={{ color: "var(--text-muted)" }}>{day(e.starts_at)}</span>
                  <Link href={`/lead/events/${e.id}`} prefetch={false} className="min-w-0 flex-1 truncate text-sm font-medium hover:underline" style={{ color: "var(--text)" }}>
                    {e.title}
                  </Link>
                  <span className="font-mono text-xs" style={{ color: "var(--text-muted)" }}>
                    {e.event_type} · {e.status}
                    {e.capacity ? ` · ${e.registered_count}/${e.capacity}` : ""}
                  </span>
                </>
              )}
            />
          </WorkspaceSection>

          {showTasks && (
            <WorkspaceSection index="05" title="Event operations" note="Operational work assigned to this department, across every event it owns.">
              <Rows
                items={tasks}
                empty="No active tasks. Management assigns tasks when an event needs staffing."
                render={(t) => (
                  <>
                    <span className="min-w-0 flex-1 text-sm" style={{ color: "var(--text)" }}>
                      <span className="font-medium">{t.title}</span>
                      <span className="ml-2 text-xs" style={{ color: "var(--text-muted)" }}>{t.event_title}</span>
                    </span>
                    <span className="font-mono text-xs" style={{ color: t.status === "done" ? "var(--text-muted)" : "var(--accent)" }}>
                      {t.status} · due {day(t.due_at)}
                    </span>
                  </>
                )}
              />
            </WorkspaceSection>
          )}

          {showReports && (
            <WorkspaceSection index="06" title="Reports" note="Monthly submissions and their review status.">
              <Rows
                items={reports}
                empty="No monthly report submitted yet. Documentation owns the record; the head submits it."
                render={(r) => (
                  <>
                    <span className="min-w-0 flex-1 font-medium" style={{ color: "var(--text)" }}>{r.month}</span>
                    <span className="font-mono text-xs" style={{ color: "var(--text-muted)" }}>{r.status} · submitted {day(r.submitted_at)}</span>
                  </>
                )}
              />
            </WorkspaceSection>
          )}

          <WorkspaceSection index="07" title="Contributions" note="Work logged against this department, latest first.">
            <Rows
              items={contributions}
              empty="Nothing logged yet. Contributions are the department's proof of output."
              render={(c) => (
                <>
                  <span className="min-w-0 flex-1 text-sm" style={{ color: "var(--text)" }}>
                    <span className="font-medium">{c.student_name || "A member"}</span>
                    <span className="ml-2" style={{ color: "var(--text-muted)" }}>{c.title}</span>
                  </span>
                  <span className="font-mono text-xs" style={{ color: "var(--text-muted)" }}>{c.kind} · {day(c.created_at)}</span>
                </>
              )}
            />
          </WorkspaceSection>

          {showAssets && (
            <WorkspaceSection index="08" title="Assets" note="Department-owned files plus the shared society library every team reuses.">
              <Rows
                items={assets}
                empty="No assets yet. Design and SMM upload posters, templates, and footage here."
                render={(a) => (
                  <>
                    <span className="min-w-0 flex-1 truncate text-sm" style={{ color: "var(--text)" }}>{a.title}</span>
                    <span className="font-mono text-xs" style={{ color: "var(--text-muted)" }}>
                      {a.kind} · {a.department_id ? "department" : "shared"} · {day(a.created_at)}
                    </span>
                  </>
                )}
              />
            </WorkspaceSection>
          )}

          {showBudget && (
            <WorkspaceSection index="09" title="Budget" note="Allocated and spent for this department. Approval stays with an authorised administrator.">
              <div className="grid gap-4 sm:grid-cols-3">
                {[
                  { label: "Allocated", value: money(allocated) },
                  { label: "Spent (approved/paid)", value: money(spent) },
                  { label: "Remaining", value: money(Math.max(allocated - spent, 0)) }
                ].map((s) => (
                  <div key={s.label} className="rounded-2xl border p-4" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
                    <p className="font-mono text-[10px] uppercase tracking-[0.16em]" style={{ color: "var(--text-muted)" }}>{s.label}</p>
                    <p className="mt-1 text-xl font-semibold" style={{ color: "var(--text)" }}>{s.value}</p>
                  </div>
                ))}
              </div>
              <div className="mt-4">
                <Rows
                  items={expenses}
                  empty="No expenses recorded for this department."
                  render={(e) => (
                    <>
                      <span className="min-w-0 flex-1 text-sm" style={{ color: "var(--text)" }}>{e.note || "Expense"}</span>
                      <span className="font-mono text-xs" style={{ color: "var(--text-muted)" }}>{money(e.amount)} · {e.status} · {day(e.created_at)}</span>
                    </>
                  )}
                />
              </div>
            </WorkspaceSection>
          )}

          {showAgreements && (
            <WorkspaceSection index="10" title="Agreements & leads" note="MoUs and external relationships for this vertical.">
              <Rows
                items={mous}
                empty="No MoU records for this vertical yet."
                render={(m) => (
                  <>
                    <span className="min-w-0 flex-1 text-sm" style={{ color: "var(--text)" }}>
                      <span className="font-medium">{m.title}</span>
                      <span className="ml-2" style={{ color: "var(--text-muted)" }}>{m.partner_name}</span>
                    </span>
                    <span className="font-mono text-xs" style={{ color: "var(--text-muted)" }}>{m.status} · ends {day(m.ends_on)}</span>
                  </>
                )}
              />
            </WorkspaceSection>
          )}

          {showDirectory && (
            <WorkspaceSection index="11" title="Leadership record" note="Current heads and past holders in this department.">
              <Rows
                items={directory}
                empty="No leadership entries recorded for this department yet."
                render={(d) => (
                  <>
                    <span className="min-w-0 flex-1 text-sm" style={{ color: "var(--text)" }}>
                      <span className="font-medium">{d.name}</span>
                      <span className="ml-2" style={{ color: "var(--text-muted)" }}>{d.title}</span>
                    </span>
                    <span className="font-mono text-xs" style={{ color: "var(--text-muted)" }}>
                      {d.is_current ? "current" : `ended ${day(d.tenure_end)}`}
                    </span>
                  </>
                )}
              />
            </WorkspaceSection>
          )}
        </div>
      </main>
    </AppShell>
  );
}
