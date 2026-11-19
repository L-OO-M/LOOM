import { redirect } from "next/navigation";
import Link from "next/link";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { WorkspaceMasthead, WorkspaceSection } from "@/components/loom/WorkspaceMasthead";
import { EventsExplorer } from "./EventsBits";
import { ConnectTabs } from "@/components/student/SectionRails";
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
  const { user, tenant, profile, sql } = ctx;
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
        <WorkspaceMasthead
          kicker="Connect / show up, level up"
          title="Gatherings worth showing up for."
          lede="Find something worth your evening, register, show up — then turn the evening into proof."
          meta={`${events.length} in view / ${mine.length} seat${mine.length === 1 ? "" : "s"} held`}
          tone="paper"
          art="/events/event-talk.png"
          artAlt=""
          stats={[
            { value: events.length, label: "gatherings in view" },
            { value: mine.length, label: "seats you hold" },
            { value: events.filter((e) => e.is_online).length, label: "online" },
            { value: certs.length, label: "certificates earned" }
          ]}
        />

        <ConnectTabs active="/student/events" />

        {events.length === 0 && ["admin", "vertical_lead", "dept_lead"].includes(profile?.role || "") && (
          <WorkspaceSection index="00" title="No gatherings yet" note="Be the first to schedule one.">
            <p className="mt-3 text-sm" style={{ color: "var(--text)" }}>
              There are no events in view. As a <strong>{profile.role}</strong>, you can create one — workshops, hackathons, talks, mentoring sessions, or contests.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link href="/admin/events" prefetch={false} className="btn-ink !py-2 text-sm">
                {profile.role === "admin" ? "Open events console" : "Open lead console"}
              </Link>
              <Link href="/lead/workshops" prefetch={false} className="btn-ghost border !py-2 text-sm" style={{ borderColor: "var(--line)", color: "var(--text)" }}>
                Schedule a workshop
              </Link>
            </div>
          </WorkspaceSection>
        )}

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
