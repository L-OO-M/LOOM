import { redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { PageHeader, EmptyState } from "@/components/ui";
import { MarkNotificationRead } from "@/components/actions";

export default async function NotificationsPage() {
  const ctx = await getRequestContext();
  if (ctx.error) redirect("/login?redirect=/student/notifications");
  const { user, tenant, sql } = ctx;
  const rows = await sql`SELECT * FROM notifications WHERE user_id = ${user.id} ORDER BY created_at DESC LIMIT 30`;
  return (
    <AppShell area="student" tenant={tenant} user={user}>
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <PageHeader kicker="Updates" title="Notifications" desc="Roadmap, contest, and mentorship events." />
        {rows.length === 0 ? (
          <EmptyState title="All caught up" body="Notifications appear here when roadmaps complete, contests change, or mentors respond." />
        ) : (
          <div className="space-y-2">
            {rows.map((n) => (
              <div key={n.id} className="flex items-start justify-between gap-4 rounded-xl border p-4" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)", opacity: n.read_at ? 0.65 : 1 }}>
                <div className="min-w-0">
                  <p className="text-sm font-medium" style={{ color: "var(--text)" }}>{n.title}</p>
                  {n.body && <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>{n.body}</p>}
                  <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>{new Date(n.created_at).toLocaleString("en-IN")} {n.link ? `· ${n.link}` : ""}</p>
                </div>
                <MarkNotificationRead id={n.id} read={!!n.read_at} />
              </div>
            ))}
          </div>
        )}
      </main>
    </AppShell>
  );
}
