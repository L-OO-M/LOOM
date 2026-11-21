import { redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { WorkspaceMasthead, WorkspaceSection } from "@/components/loom/WorkspaceMasthead";
import { BuildTabs } from "@/components/student/SectionRails";
import { TaskList } from "@/components/department/TaskList";
import { listTasksForAssignee } from "@/lib/department-tasks";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Department work",
  robots: { index: false, follow: false }
};

// The member's side of the department work board: everything assigned to me,
// with the proof I submitted and who reviewed it. Readable even if my
// department membership has changed since the work was given.
export default async function MyWorkPage() {
  const ctx = await getRequestContext();
  if (ctx.error) redirect("/login?redirect=/student/work");
  const { tenant, user, sql } = ctx;

  const tasks = await listTasksForAssignee(sql, { tenantId: tenant.id, userId: user.id });
  const open = tasks.filter((t) => t.status !== "done").length;
  const awaiting = tasks.filter((t) => t.status === "submitted").length;
  const approved = tasks.filter((t) => t.status === "done").length;

  return (
    <AppShell area="student" tenant={tenant} user={user}>
      <main className="animate-in mx-auto max-w-4xl px-4 pb-16 sm:px-6">
        <WorkspaceMasthead
          kicker="Build / Department work"
          title="Your work"
          lede="Work your department head gave you. Submit an evidence link when it is done — a second head reviews it, and nobody can approve their own submission."
          tone="field"
          stats={[
            { value: open, label: "open" },
            { value: awaiting, label: "in review" },
            { value: approved, label: "approved" }
          ]}
        />

        <BuildTabs active="/student/work" />

        <div className="mt-10">
          <WorkspaceSection
            index="01"
            title="Assigned to you"
            note="Start it, flag a blocker, or submit proof. Approved work stays here as your record."
          >
            <TaskList initialTasks={tasks} meId={user.id} showAssignee={false} />
          </WorkspaceSection>
        </div>
      </main>
    </AppShell>
  );
}
