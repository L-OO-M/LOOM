import { redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { Display, Meta } from "@/components/loom/primitives";
import { EventsExplorer } from "./EventsBits";
import { resolveScope, HISTORY_STATUSES, VISIBLE_STATUSES } from "@/lib/events";

export const dynamic = "force-dynamic";

function serializeEvent(e) {
  return {
    id: e.id,
    title: e.title,
    event_type: e.event_type,
    domain: e.domain || "general",
    status: e.status,
    starts_at: e.starts_at instanceof Date ? e.starts_at.toISOString() : String(e.starts_at),
    location: e.location || null,
    is_online: !!e.is_online,
    speaker_name: e.speaker_name || null,
    capacity: e.capacity ?? null,
    seats_taken: Number(e.seats_taken ?? 0),
    registered: !!e.registered,
    reg_status: e.reg_status || null
  };
}

export default async function EventsPage({ searchParams }) {
  const ctx = await getRequestContext();
  if (ctx.error) redirect("/login?redirect=/student/events");
  const { user, tenant, sql } = ctx;
  const sp = await searchParams;
  const scope = resolveScope(sp?.scope);
  const tid = tenant?.id ?? null;

  let events;
  if (scope === "registered") {
    events = await sql`
      SELECT e.*, (SELECT COUNT(*)::int FROM event_registrations r WHERE r.event_id = e.id AND r.status <> 'cancelled') AS seats_taken,
        TRUE AS registered, r.status AS reg_status
      FROM events e JOIN event_registrations r ON r.event_id = e.id
      WHERE r.student_id = ${user.id} AND r.status <> 'cancelled'
        AND e.tenant_id = ${tid}::uuid AND e.status <> 'cancelled'
      ORDER BY e.starts_at DESC
      LIMIT 50
    `;
  } else if (scope === "past") {
    events = await sql`
      SELECT e.*, (SELECT COUNT(*)::int FROM event_registrations r WHERE r.event_id = e.id AND r.status <> 'cancelled') AS seats_taken,
        EXISTS (SELECT 1 FROM event_registrations r WHERE r.event_id = e.id AND r.student_id = ${user.id} AND r.status <> 'cancelled') AS registered,
        (SELECT r.status FROM event_registrations r WHERE r.event_id = e.id AND r.student_id = ${user.id} ORDER BY r.registered_at DESC LIMIT 1) AS reg_status
      FROM events e
      WHERE e.tenant_id = ${tid}::uuid AND e.status = ANY(${HISTORY_STATUSES})
        AND e.starts_at < now() - interval '2 hours'
      ORDER BY e.starts_at DESC
      LIMIT 50
    `;
  } else {
    events = await sql`
      SELECT e.*, (SELECT COUNT(*)::int FROM event_registrations r WHERE r.event_id = e.id AND r.status <> 'cancelled') AS seats_taken,
        EXISTS (SELECT 1 FROM event_registrations r WHERE r.event_id = e.id AND r.student_id = ${user.id} AND r.status <> 'cancelled') AS registered,
        (SELECT r.status FROM event_registrations r WHERE r.event_id = e.id AND r.student_id = ${user.id} ORDER BY r.registered_at DESC LIMIT 1) AS reg_status
      FROM events e
      WHERE e.tenant_id = ${tid}::uuid AND e.status = ANY(${VISIBLE_STATUSES})
        AND e.starts_at >= now() - interval '2 hours'
      ORDER BY e.starts_at ASC
      LIMIT 50
    `;
  }

  const mine = await sql`
    SELECT r.event_id, r.status AS reg_status, r.check_in_code, e.title, e.starts_at
    FROM event_registrations r JOIN events e ON e.id = r.event_id
    WHERE r.student_id = ${user.id} AND r.status <> 'cancelled'
      AND e.tenant_id = ${tid}::uuid AND e.status = ANY(${VISIBLE_STATUSES})
    ORDER BY e.starts_at ASC LIMIT 20
  `;
  const certs = await sql`
    SELECT event_id, verification_code FROM certificates WHERE student_id = ${user.id} LIMIT 100
  `;
  const certByEvent = Object.fromEntries(certs.map((c) => [c.event_id, c.verification_code]));

  return (
    <AppShell area="student" tenant={tenant} user={user}>
      <main className="mx-auto max-w-4xl px-4 sm:px-6">
        <Meta>Connect · show up, level up</Meta>
        <Display size="lg" className="mt-3">Gatherings worth showing up for.</Display>
        <p className="narrative mt-4 max-w-2xl">
          Find something worth your evening, register, show up — then turn the evening into proof.
        </p>

        <EventsExplorer
          events={events.map(serializeEvent)}
          seats={mine.map((r) => ({
            event_id: r.event_id,
            reg_status: r.reg_status,
            check_in_code: r.check_in_code,
            title: r.title,
            starts_at: r.starts_at instanceof Date ? r.starts_at.toISOString() : String(r.starts_at)
          }))}
          certByEvent={certByEvent}
          scope={scope}
          showActions={scope !== "past"}
        />
      </main>
    </AppShell>
  );
}
