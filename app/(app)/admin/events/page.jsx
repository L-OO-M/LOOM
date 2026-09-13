import Link from "next/link";
import { redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { PageHeader, Card, Stat } from "@/components/ui";
import { EventForm } from "./EventBits";

export const dynamic = "force-dynamic";

export default async function AdminEventsPage() {
  const ctx = await getRequestContext({ adminOnly: true });
  if (ctx.error === "UNAUTHORIZED") redirect("/login?redirect=/admin/events");
  if (ctx.error === "FORBIDDEN") redirect("/student");
  if (ctx.error) redirect("/login?redirect=/admin/events");
  const { tenant, user, sql } = ctx;

  const events = await sql`
    SELECT e.*, (SELECT COUNT(*)::int FROM event_registrations r WHERE r.event_id = e.id AND r.status <> 'cancelled') AS seats_taken,
      (SELECT COUNT(*)::int FROM event_registrations r WHERE r.event_id = e.id AND r.status = 'attended') AS attended,
      COALESCE((SELECT AVG(feedback_score)::numeric FROM event_registrations WHERE event_id = e.id AND feedback_score IS NOT NULL), 0) AS avg_feedback
    FROM events e WHERE e.tenant_id = ${tenant?.id ?? null}::uuid
    ORDER BY e.starts_at DESC LIMIT 30
  `;
  const upcoming = events.filter((e) => e.status === "upcoming").length;

  return (
    <AppShell area="admin" tenant={tenant} user={user}>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <PageHeader kicker="Admin · Gather" title="Events console" desc="Schedule workshops, manage the door, issue certificates." />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Stat label="Total events" value={events.length} />
          <Stat label="Upcoming" value={upcoming} />
          <Stat label="Seats taken" value={events.reduce((n, e) => n + (e.seats_taken || 0), 0)} />
        </div>
        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <Card>
            <h2 className="font-medium" style={{ color: "var(--text)" }}>All events</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {events.map((e) => (
                <li key={e.id} className="flex justify-between gap-2">
                  <Link href={`/student/events/${e.id}`} className="min-w-0 truncate hover:underline" style={{ color: "var(--text)" }}>
                    {e.title} <span style={{ color: "var(--text-muted)" }}>· {e.seats_taken}{e.capacity ? `/${e.capacity}` : ""} reg · {e.attended} in{Number(e.avg_feedback) > 0 ? ` · ★${Number(e.avg_feedback).toFixed(1)}` : ""}</span>
                  </Link>
                  <span className="shrink-0 text-xs" style={{ color: "var(--text-muted)" }}>{e.status}</span>
                </li>
              ))}
              {events.length === 0 && <li className="text-sm" style={{ color: "var(--text-muted)" }}>No events yet.</li>}
            </ul>
          </Card>
          <Card>
            <h2 className="font-medium" style={{ color: "var(--text)" }}>Schedule an event</h2>
            <EventForm />
          </Card>
        </div>
      </main>
    </AppShell>
  );
}
