import Link from "next/link";
import { redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { PageHeader, Card, EmptyState } from "@/components/ui";
import { RegisterButton } from "./EventsBits";

export const dynamic = "force-dynamic";

const TYPE_LABEL = { workshop: "Workshop", hackathon: "Hackathon", talk: "Talk", mentoring: "Mentoring", contest: "Contest" };

export default async function EventsPage({ searchParams }) {
  const ctx = await getRequestContext();
  if (ctx.error) redirect("/login?redirect=/student/events");
  const { user, tenant, sql } = ctx;
  const sp = await searchParams;
  const scope = sp?.scope === "past" ? "past" : "upcoming";

  const events = await sql`
    SELECT e.*, (SELECT COUNT(*)::int FROM event_registrations r WHERE r.event_id = e.id AND r.status <> 'cancelled') AS seats_taken,
      EXISTS (SELECT 1 FROM event_registrations r WHERE r.event_id = e.id AND r.student_id = ${user.id} AND r.status <> 'cancelled') AS registered
    FROM events e
    WHERE e.tenant_id = ${tenant?.id ?? null}::uuid AND e.status <> 'cancelled'
      AND ${scope === "past" ? sql`e.starts_at < now()` : sql`e.starts_at >= now() - interval '2 hours'`}
    ORDER BY e.starts_at ${scope === "past" ? sql`DESC` : sql`ASC`}
    LIMIT 50
  `;
  const mine = await sql`
    SELECT r.*, e.title FROM event_registrations r JOIN events e ON e.id = r.event_id
    WHERE r.student_id = ${user.id} AND r.status <> 'cancelled' ORDER BY e.starts_at ASC LIMIT 10
  `;

  return (
    <AppShell area="student" tenant={tenant} user={user}>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <PageHeader kicker="Show up" title="Events" desc="Workshops, hackathons, and talks from your chapter." />
        <div className="flex gap-2">
          <Link href="/student/events" className={scope === "upcoming" ? "btn-ink" : "rounded-xl border px-3 py-2 text-sm"} style={scope === "upcoming" ? undefined : { borderColor: "var(--line)", color: "var(--text-muted)" }}>Upcoming</Link>
          <Link href="/student/events?scope=past" className={scope === "past" ? "btn-ink" : "rounded-xl border px-3 py-2 text-sm"} style={scope === "past" ? undefined : { borderColor: "var(--line)", color: "var(--text-muted)" }}>Past</Link>
        </div>

        {mine.length > 0 && scope === "upcoming" && (
          <Card className="mt-6">
            <h2 className="font-medium" style={{ color: "var(--text)" }}>My registrations</h2>
            <ul className="mt-2 space-y-1 text-sm">
              {mine.map((r) => (
                <li key={r.id} className="flex flex-wrap justify-between gap-2">
                  <Link href={`/student/events/${r.event_id}`} className="hover:underline" style={{ color: "var(--text)" }}>{r.title}</Link>
                  <span className="font-mono text-xs" style={{ color: "var(--accent)" }}>{r.status === "attended" ? "attended ✓" : `door code: ${r.check_in_code}`}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {events.length === 0 ? (
          <div className="mt-4"><EmptyState title={scope === "past" ? "No past events" : "Nothing scheduled"} body={scope === "past" ? "" : "Check back soon — or propose a workshop to your chapter admin."} /></div>
        ) : (
          <ul className="mt-6 grid gap-4 sm:grid-cols-2">
            {events.map((e) => {
              const full = e.capacity && e.seats_taken >= e.capacity && !e.registered;
              return (
                <li key={e.id}>
                  <Card>
                    <div className="flex items-center justify-between gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
                      <span>{TYPE_LABEL[e.event_type] || e.event_type} · {e.domain}</span>
                      <span>{new Date(e.starts_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</span>
                    </div>
                    <Link href={`/student/events/${e.id}`} className="mt-2 block font-medium hover:underline" style={{ color: "var(--text)" }}>{e.title}</Link>
                    {e.speaker_name && <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>by {e.speaker_name}</p>}
                    <div className="mt-3 flex items-center justify-between gap-2">
                      <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                        {e.is_online ? "Online" : e.location || "TBA"}{e.capacity ? ` · ${e.seats_taken}/${e.capacity}` : ""}
                      </span>
                      {scope === "upcoming" && <RegisterButton eventId={e.id} registered={e.registered} full={full} />}
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </AppShell>
  );
}
