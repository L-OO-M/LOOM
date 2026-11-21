import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { WorkspaceMasthead, WorkspaceSection, WorkspaceEmpty } from "@/components/loom/WorkspaceMasthead";
import { VERTICAL_LABEL, departmentMeta } from "@/lib/department-catalog";
import { departmentsForProfile, listWorkspaceDepartments } from "@/lib/department-workspace";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Departments",
  robots: { index: false, follow: false }
};

const LEAD_ROLES = ["dept_lead", "vertical_lead", "admin", "platform_admin"];

function artFor(slug) {
  const meta = departmentMeta(slug);
  return meta ? `/departments/${meta.slug}.png` : null;
}

export default async function DepartmentsPage() {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") redirect("/login?redirect=/lead/departments");
  if (ctx.error) redirect("/login?redirect=/lead/departments");
  const { tenant, profile, sql, user } = ctx;
  if (!LEAD_ROLES.includes(profile.role)) redirect("/student");

  const rows = await listWorkspaceDepartments(sql, tenant.id);
  const visible = departmentsForProfile(profile, rows);
  const technical = visible.filter((d) => d.vertical === "technical");
  const nonTechnical = visible.filter((d) => d.vertical === "non_technical");
  const totalMembers = visible.reduce((sum, d) => sum + Number(d.members || 0), 0);

  function Group({ items }) {
    return items.length === 0 ? (
      <WorkspaceEmpty
        title="Nothing here yet"
        body="No active department in this vertical is visible to your role."
      />
    ) : (
      <ul className="grid gap-4 sm:grid-cols-2">
        {items.map((d) => (
          <li key={d.id}>
            <Link
              href={`/lead/departments/${d.slug}`}
              prefetch={false}
              className="group flex h-full overflow-hidden rounded-2xl border transition-transform hover:-translate-y-0.5"
              style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}
            >
              <div className="relative w-28 shrink-0 sm:w-36">
                {artFor(d.slug) ? (
                  <Image
                    src={artFor(d.slug)}
                    alt=""
                    fill
                    sizes="144px"
                    className="object-cover"
                  />
                ) : (
                  <div className="h-full w-full" style={{ background: "var(--bg-muted)" }} />
                )}
              </div>
              <div className="min-w-0 flex-1 p-4">
                <p className="font-mono text-[10px] uppercase tracking-[0.18em]" style={{ color: "var(--text-muted)" }}>
                  {VERTICAL_LABEL[d.vertical] || d.vertical}
                </p>
                <p className="mt-1 truncate font-medium" style={{ color: "var(--text)" }}>{d.name}</p>
                <p className="mt-2 text-xs" style={{ color: "var(--text-muted)" }}>
                  {Number(d.members || 0)} member{Number(d.members || 0) === 1 ? "" : "s"}
                  {" · "}
                  {Number(d.upcoming_events || 0)} upcoming
                  {Number(d.open_tasks || 0) > 0 ? ` · ${d.open_tasks} open task${d.open_tasks === 1 ? "" : "s"}` : ""}
                </p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <AppShell area="lead" tenant={tenant} user={user}>
      <main className="animate-in mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        <WorkspaceMasthead
          kicker={`Chapter / ${visible.length} ${visible.length === 1 ? "department" : "departments"} / ${totalMembers} members`}
          title="Department workspaces."
          lede="One place per department: its people, its events, its open tasks, what it has reported, and what it has spent."
          meta="Modules are gated by permission — you only see the ones your department actually needs."
          tone="field"
          stats={[
            { value: visible.length, label: "departments visible" },
            { value: totalMembers, label: "members in scope" },
            { value: visible.reduce((s, d) => s + Number(d.upcoming_events || 0), 0), label: "upcoming events" },
            { value: visible.reduce((s, d) => s + Number(d.open_tasks || 0), 0), label: "open tasks" }
          ]}
        />

        <div className="mt-10 space-y-10">
          <WorkspaceSection index="01" title="Technical" note="Six teams that build, break, and document the work.">
            <Group items={technical} />
          </WorkspaceSection>
          <WorkspaceSection index="02" title="Non-technical" note="Seven teams that make the work reach people, run on time, and be recorded.">
            <Group items={nonTechnical} />
          </WorkspaceSection>
        </div>
      </main>
    </AppShell>
  );
}
