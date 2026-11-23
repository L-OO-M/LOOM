import { redirect } from "next/navigation";
import Link from "next/link";
import { CalendarClock, ExternalLink } from "lucide-react";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { WorkspaceMasthead, WorkspaceSection, WorkspaceEmpty } from "@/components/loom/WorkspaceMasthead";
import { BuildTabs } from "@/components/student/SectionRails";
import { TaskList } from "@/components/department/TaskList";
import { EVENT_TASK_STATUS_LABEL } from "@/lib/event-ops";
import { loadMyWork } from "@/lib/my-work";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "My work",
  robots: { index: false, follow: false }
};

function dueLabel(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric", timeZone: "UTC"
  });
}

// Everything one member owes, in one place. Two sources, two vocabularies, two
// owners of the truth: department work is driven here (start, block, submit),
// event-ops work is shown read-only because a lead owns that board. The page
// adds no third status system and stores nothing of its own.
export default async function MyWorkPage() {
  const ctx = await getRequestContext();
  if (ctx.error) redirect("/login?redirect=/student/work");
  const { tenant, user, sql } = ctx;

  const { department, event, summary } = await loadMyWork(sql, {
    tenantId: tenant.id,
    userId: user.id
  });

  return (
    <AppShell area="student" tenant={tenant} user={user}>
      <main className="animate-in mx-auto max-w-4xl px-4 pb-16 sm:px-6">
        <WorkspaceMasthead
          kicker="Build / My work"
          title="Your work"
          lede="Everything assigned to you, from both places work is given out. Department work you submit here with proof; event chores are set by the event lead and shown as they are."
          tone="field"
          stats={[
            { value: summary.totalOpen, label: "open" },
            { value: summary.departmentAwaitingReview, label: "in review" },
            { value: summary.departmentOverdue + summary.eventOverdue, label: "overdue" }
          ]}
        />

        <BuildTabs active="/student/work" />

        <div className="mt-10 space-y-12">
          <WorkspaceSection
            index="01"
            title="Department work"
            note="Start it, flag a blocker, or submit proof. Approved work stays here as your record."
          >
            {department.length === 0 ? (
              <WorkspaceEmpty
                title="Nothing assigned yet"
                body="When a department head gives you work, it appears here with its deadline."
              />
            ) : (
              <TaskList initialTasks={department} meId={user.id} showAssignee={false} showFilters groupByStage />
            )}
          </WorkspaceSection>

          <WorkspaceSection
            index="02"
            title="Event operations"
            note="Chores the event lead assigned to you. They update the status on the event board, so this list is read-only."
          >
            {event.length === 0 ? (
              <WorkspaceEmpty
                title="No event chores"
                body="You are not carrying anything on an event right now."
              />
            ) : (
              <ul className="space-y-3">
                {event.map((task) => {
                  const overdue = task.status !== "done" && task.due_at
                    && new Date(task.due_at).getTime() < Date.now();
                  return (
                    <li
                      key={task.key}
                      className="rounded-xl border p-4"
                      style={{ borderColor: "var(--line)", background: "var(--bg)" }}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>
                          {task.title}
                        </p>
                        <span
                          className="rounded-full border px-2 py-0.5 text-[10px] font-bold tracking-widest"
                          style={{
                            borderColor: task.status === "done" ? "var(--success)" : "var(--line)",
                            color: task.status === "done" ? "var(--success)" : "var(--text-muted)"
                          }}
                        >
                          {(EVENT_TASK_STATUS_LABEL[task.status] || task.status).toUpperCase()}
                        </span>
                        {overdue && (
                          <span className="text-[11px] font-semibold" style={{ color: "var(--danger)" }}>
                            Overdue
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
                        {task.event_title || "Chapter-wide"} · {task.kind}
                        {task.due_at ? (
                          <span className="inline-flex items-center gap-1">
                            {" · "}
                            <CalendarClock size={12} aria-hidden="true" /> due {dueLabel(task.due_at)}
                          </span>
                        ) : null}
                      </p>
                      {task.detail && (
                        <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>{task.detail}</p>
                      )}
                      {task.event_id && (
                        <Link
                          href={`/events/${task.event_id}`}
                          prefetch={false}
                          className="mt-2 inline-flex items-center gap-1 text-xs underline underline-offset-4"
                          style={{ color: "var(--accent)" }}
                        >
                          Open the event <ExternalLink size={12} />
                        </Link>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </WorkspaceSection>
        </div>
      </main>
    </AppShell>
  );
}
