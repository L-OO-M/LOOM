import Link from "next/link";
import { redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { MarkNotificationRead } from "@/components/actions";
import { WorkspaceMasthead, WorkspaceSection } from "@/components/loom/WorkspaceMasthead";
import { OnboardingState } from "@/components/loom/States";
import { SectionTabs } from "@/components/loom/SectionTabs";

export const dynamic = "force-dynamic";

export default async function NotificationsPage({ searchParams }) {
  const ctx = await getRequestContext();
  if (ctx.error) redirect("/login?redirect=/student/notifications");
  const { user, tenant, sql } = ctx;
  const { state } = await searchParams;
  const onlyUnread = state === "unread";

  const [{ unread = 0 } = {}] = await sql`
    SELECT COUNT(*)::int AS unread FROM notifications
    WHERE user_id = ${user.id} AND read_at IS NULL`;
  const rows = onlyUnread
    ? await sql`SELECT * FROM notifications WHERE user_id = ${user.id} AND read_at IS NULL ORDER BY created_at DESC LIMIT 30`
    : await sql`SELECT * FROM notifications WHERE user_id = ${user.id} ORDER BY created_at DESC LIMIT 30`;

  return (
    <AppShell area="student" tenant={tenant} user={user}>
      <main className="mx-auto max-w-3xl px-4 sm:px-6">
        <WorkspaceMasthead
          kicker="Notifications / history"
          title="Everything, in order."
          lede="Roadmap completions, contest changes, and mentor responses — newest first, with unread ones leading."
          meta={`${unread} unread / ${rows.length} shown`}
          tone="ledger"
          stats={[
            { value: unread, label: "unread" },
            { value: rows.length, label: onlyUnread ? "unread shown" : "shown here" }
          ]}
        />

        <SectionTabs
          className="mt-6"
          label="Notification views"
          active={onlyUnread ? "/student/notifications?state=unread" : "/student/notifications"}
          tabs={[
            { href: "/student/notifications", label: "All", count: unread },
            { href: "/student/notifications?state=unread", label: "Unread", count: unread }
          ]}
        />

        <WorkspaceSection
          index="01"
          title={onlyUnread ? "Unread notifications" : "All notifications"}
          note={unread > 0 ? `${unread} unread of ${rows.length} shown.` : `${rows.length} shown, all read.`}
        >
        {rows.length === 0 ? (
          <OnboardingState
            eyebrow="History"
            title={onlyUnread ? "Nothing unread." : "Nothing recorded yet."}
            why="Roadmap completions, contest changes, and mentor responses land here — newest first, with the unread ones leading."
          />
        ) : (
          <>
            <ul className="mt-3 divide-y" style={{ borderColor: "var(--line)" }}>
              {rows.map((n) => (
                <li key={n.id} className="flex items-start justify-between gap-4 py-4" style={{ opacity: n.read_at ? 0.6 : 1 }}>
                  <div className="flex min-w-0 items-start gap-3">
                    <span
                      className="mt-1.5 size-1.5 shrink-0 rounded-full"
                      style={{ background: n.read_at ? "var(--line)" : "var(--accent)" }}
                      aria-hidden="true"
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>
                        {n.link ? (
                          <Link href={n.link} prefetch={false} className="hover:underline">{n.title}</Link>
                        ) : n.title}
                      </p>
                      {n.body && <p className="mt-0.5 text-sm" style={{ color: "var(--text-muted)" }}>{n.body}</p>}
                      <p className="meta mt-1">{new Date(n.created_at).toLocaleString("en-IN", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</p>
                    </div>
                  </div>
                  <span className="shrink-0"><MarkNotificationRead id={n.id} read={!!n.read_at} /></span>
                </li>
              ))}
            </ul>
          </>
        )}
        </WorkspaceSection>
      </main>
    </AppShell>
  );
}
