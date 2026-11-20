import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Users, Clock3, MapPin, ArrowLeft } from "lucide-react";
import { getRequestContext } from "@/lib/auth-server";
import { can } from "@/lib/permissions";
import { AppShell } from "@/components/AppShell";
import { WorkspaceMasthead, WorkspaceSection, WorkspaceEmpty } from "@/components/loom/WorkspaceMasthead";
import { EventCheckIn } from "@/components/events/EventCheckIn";
import { EventAdminActions } from "@/components/admin/EventAdminActions";
import { EventVolunteerAdmin } from "@/components/events/EventVolunteerAdmin";
import { displayState, TYPE_LABEL } from "@/lib/events";
import { DOMAIN_LABEL, DOMAIN_ORDER } from "@/lib/domains";

// One event-operations surface for both consoles. Before this, the only
// check-in page lived in student chrome, so an admin following an event link
// lost their workspace nav and a lead had no door tool at all.
export async function EventOpsPage({ id, area = "admin" }) {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") {
    redirect(`/login?redirect=${encodeURIComponent(`/${area}/events/${id}`)}`);
  }
  if (ctx.error) redirect(`/login?redirect=${encodeURIComponent(`/${area}/events/${id}`)}`);
  const { user, profile, tenant, sql } = ctx;
  if (!tenant?.id) redirect(`/${area}`);
  if (!can(profile, "manage_event_ops").ok && profile?.role !== "admin") {
    redirect("/student");
  }

  const [event] = await sql`
    SELECT e.*,
      (SELECT COUNT(*)::int FROM event_registrations r WHERE r.event_id = e.id AND r.status <> 'cancelled') AS seats_taken,
      (SELECT COUNT(*)::int FROM event_registrations r WHERE r.event_id = e.id AND r.status = 'attended') AS attended
    FROM events e
    WHERE e.id = ${id} AND e.tenant_id = ${tenant.id}::uuid
    LIMIT 1
  `;
  if (!event) notFound();

  const attendees = await sql`
    SELECT r.*, p.name AS student_name
    FROM event_registrations r
    LEFT JOIN profiles p ON p.user_id = r.student_id
    WHERE r.event_id = ${id}
    ORDER BY r.registered_at ASC
    LIMIT 200
  `;
  const materials = await sql`
    SELECT * FROM event_materials WHERE event_id = ${id} ORDER BY uploaded_at ASC
  `;
  const volunteerSlots = await sql`
    SELECT s.*,
      (SELECT COUNT(*)::int FROM volunteer_signups v WHERE v.slot_id = s.id) AS signup_count
    FROM volunteer_slots s
    WHERE s.event_id = ${id} AND s.tenant_id = ${tenant.id}::uuid
    ORDER BY s.created_at ASC
  `;
  // `profiles` has no email column (it lives on user_identities, migration 047).
  // Selecting p.email here threw `column p.email does not exist` and took the
  // whole event console down with a server-render error, for every event.
  const volunteerSignups = await sql`
    SELECT v.*, p.name AS student_name,
      (
        SELECT ui.email FROM user_identities ui
        WHERE ui.user_id = v.user_id
        ORDER BY ui.updated_at DESC NULLS LAST
        LIMIT 1
      ) AS email
    FROM volunteer_signups v
    JOIN volunteer_slots s ON s.id = v.slot_id
    LEFT JOIN profiles p ON p.user_id = v.user_id
    WHERE s.event_id = ${id} AND s.tenant_id = ${tenant.id}::uuid
    ORDER BY v.created_at ASC
    LIMIT 500
  `;
  // Editing an event needs the chapter's real departments and the canonical
  // track keys, so the form can offer a picker instead of free text.
  const departments = await sql`
    SELECT id, name FROM departments
    WHERE tenant_id = ${tenant.id}::uuid
    ORDER BY name
    LIMIT 100
  `;
  const domains = DOMAIN_ORDER.map((key) => ({ key, label: DOMAIN_LABEL[key] }));

  const state = displayState(event, null);
  const attended = Number(event.attended || 0);
  const seats = Number(event.seats_taken || 0);
  const turnout = seats > 0 ? Math.round((attended / seats) * 100) : 0;

  return (
    <AppShell area={area} tenant={tenant} user={user}>
      <main className="mx-auto max-w-4xl px-4 pb-14 sm:px-6">
        {/* `/lead/events` is only a `[id]` folder, so the lead-area back link has
            to point at the workshops list that actually exists. */}
        <Link href={area === "admin" ? "/admin/events" : "/lead/workshops"} prefetch={false} className="meta inline-flex items-center gap-1 hover:underline" style={{ color: "var(--accent)" }}>
          <ArrowLeft size={12} aria-hidden="true" /> {area === "admin" ? "Events console" : "Workshops"}
        </Link>
        <WorkspaceMasthead
          kicker={`${area === "admin" ? "Gather" : "Workshops"} / ${TYPE_LABEL[event.event_type] || event.event_type} / ${state.label}`}
          title={event.title}
          lede={event.description || "No description was filed for this gathering."}
          meta={`${attended} of ${seats} checked in${event.capacity ? ` / capacity ${event.capacity}` : ""}`}
          tone="field"
          art="/events/event-talk.png"
          artAlt=""
          stats={[
            { value: seats, label: "seats taken" },
            { value: attended, label: "checked in" },
            { value: turnout, unit: "%", label: "turnout" },
            { value: materials.length, label: "materials" }
          ]}
        />

        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
          <span className="meta inline-flex items-center gap-1">
            <Clock3 size={12} aria-hidden="true" />
            {event.starts_at ? new Date(event.starts_at).toLocaleString("en-IN", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "No start time"}
          </span>
          {event.location && (
            <span className="meta inline-flex items-center gap-1">
              <MapPin size={12} aria-hidden="true" /> {event.location}{event.is_online ? " / online" : ""}
            </span>
          )}
          {event.speaker_name && <span className="meta">with {event.speaker_name}</span>}
          <span className="meta inline-flex items-center gap-1"><Users size={12} aria-hidden="true" /> {seats} registered</span>
        </div>

        <EventAdminActions event={event} departments={departments} domains={domains} />

        <WorkspaceSection
          index="01"
          title="Run this event"
          note="The three places the work actually happens: the task board, the announcement feed, and the event thread."
        >
          <ul className="mt-3 grid gap-2 sm:grid-cols-3" style={{ listStyle: "none", padding: 0 }}>
            <li>
              <Link
                href={`${area === "admin" ? "/admin" : "/lead"}/event-ops?event=${event.id}`}
                prefetch={false}
                className="block rounded-xl border px-3.5 py-3 text-sm font-semibold hover:underline"
                style={{ borderColor: "var(--line)", color: "var(--text)", background: "var(--bg-muted)" }}
              >
                Team tasks for this event →
              </Link>
              <p className="meta mt-1.5 normal-case tracking-normal">Assign an owner, set a deadline, tick it off.</p>
            </li>
            <li>
              <Link
                href={`${area === "admin" ? "/admin" : "/lead"}/announcements`}
                prefetch={false}
                className="block rounded-xl border px-3.5 py-3 text-sm font-semibold hover:underline"
                style={{ borderColor: "var(--line)", color: "var(--text)", background: "var(--bg-muted)" }}
              >
                Announce it →
              </Link>
              <p className="meta mt-1.5 normal-case tracking-normal">Publish to the chapter feed or one vertical.</p>
            </li>
            <li>
              <Link
                href={`/student/community/forums?new=1&event=${event.id}`}
                prefetch={false}
                className="block rounded-xl border px-3.5 py-3 text-sm font-semibold hover:underline"
                style={{ borderColor: "var(--line)", color: "var(--text)", background: "var(--bg-muted)" }}
              >
                Open the event thread →
              </Link>
              <p className="meta mt-1.5 normal-case tracking-normal">Questions, logistics and follow-ups in one place.</p>
            </li>
          </ul>
        </WorkspaceSection>

        <WorkspaceSection index="02" title="Door check-in" note="Type or scan the student's door code. Check-in also writes attendance evidence and issues the certificate once.">
          <EventCheckIn eventId={event.id} />
          {event.status === "cancelled" && (
            <p className="mt-3 text-sm font-medium" role="alert" style={{ color: "var(--danger)" }}>
              This event was cancelled — the API will refuse every check-in.
            </p>
          )}
        </WorkspaceSection>

        <WorkspaceSection index="03" title="Attendee ledger" note="Registered first, newest last. Codes are shown only to event operators.">
          <div className="mb-3">
            <a
              href={`/api/admin/events/${event.id}/attendees/export`}
              className="text-xs font-semibold hover:underline"
              style={{ color: "var(--accent)" }}
            >
              Download attendee CSV
            </a>
          </div>
          {attendees.length === 0 ? (
            <WorkspaceEmpty title="No registrations yet" body="Students appear here the moment they register from /student/events." />
          ) : (
            <ul className="mt-4 divide-y rounded-2xl border" style={{ borderColor: "var(--line)" }}>
              {attendees.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                  <span className="min-w-0 flex-1 truncate text-sm" style={{ color: "var(--text)" }}>
                    {a.student_name || a.student_id}
                  </span>
                  <span className="mono-tag shrink-0">{a.status}</span>
                  <span className="shrink-0 font-mono text-xs" style={{ color: a.status === "attended" ? "var(--accent)" : "var(--text-muted)" }}>
                    {a.check_in_code || "no code"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </WorkspaceSection>

        <WorkspaceSection index="04" title="Volunteer roster" note="Add the jobs this event needs, then see exactly who signed up.">
          <EventVolunteerAdmin
            eventId={event.id}
            slots={volunteerSlots}
            signups={volunteerSignups}
          />
        </WorkspaceSection>
      </main>
    </AppShell>
  );
}
