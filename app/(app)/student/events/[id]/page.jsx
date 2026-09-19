import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth-server";
import { isAdmin } from "@/lib/permissions";
import { AppShell } from "@/components/AppShell";
import { Display, Meta, StatusPill, ActionLink } from "@/components/loom/primitives";
import { env } from "@/lib/env";
import { RegisterButton, FeedbackForm, MaterialForm, CheckInForm } from "../EventsBits";
import { displayState, isFull, nextStepFor, TYPE_LABEL, HISTORY_STATUSES } from "@/lib/events";

export const dynamic = "force-dynamic";

function gcalUrl(e) {
  const fmt = (d) => new Date(d).toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const dates = e.ends_at ? `${fmt(e.starts_at)}/${fmt(e.ends_at)}` : `${fmt(e.starts_at)}/${fmt(e.starts_at)}`;
  const p = new URLSearchParams({ action: "TEMPLATE", text: e.title, dates, details: `${e.description || ""}\n${env.NEXT_PUBLIC_APP_URL}/student/events/${e.id}` });
  if (e.location) p.set("location", e.location);
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}

export default async function EventDetailPage({ params }) {
  const ctx = await getRequestContext();
  if (ctx.error) redirect("/login?redirect=/student/events");
  const { user, profile, tenant, sql } = ctx;
  const { id } = await params;
  const admin = isAdmin({ role: profile?.role });

  const [event] = admin
    ? await sql`
      SELECT e.*, (SELECT COUNT(*)::int FROM event_registrations r WHERE r.event_id = e.id AND r.status <> 'cancelled') AS seats_taken
      FROM events e WHERE e.id = ${id} AND e.tenant_id = ${tenant?.id ?? null}::uuid LIMIT 1
    `
    : await sql`
      SELECT e.*, (SELECT COUNT(*)::int FROM event_registrations r WHERE r.event_id = e.id AND r.status <> 'cancelled') AS seats_taken
      FROM events e WHERE e.id = ${id} AND e.tenant_id = ${tenant?.id ?? null}::uuid AND e.status = ANY(${HISTORY_STATUSES}) LIMIT 1
    `;
  if (!event) notFound();
  const [mine] = await sql`SELECT * FROM event_registrations WHERE event_id = ${id} AND student_id = ${user.id} LIMIT 1`;
  const materials = await sql`SELECT * FROM event_materials WHERE event_id = ${id} ORDER BY uploaded_at ASC`;
  const attendees = admin ? await sql`
    SELECT r.*, p.name AS student_name FROM event_registrations r
    LEFT JOIN profiles p ON p.user_id = r.student_id
    WHERE r.event_id = ${id} ORDER BY r.registered_at ASC LIMIT 200
  ` : [];
  const [cert] = mine ? await sql`SELECT * FROM certificates WHERE event_id = ${id} AND student_id = ${user.id} LIMIT 1` : [];

  const registered = !!mine && mine.status !== "cancelled";
  const state = displayState(event, mine);
  const full = isFull(event, mine);
  const past = state.key === "past";
  const step = nextStepFor(event);
  const seatsTaken = Number(event.seats_taken ?? 0);

  return (
    <AppShell area="student" tenant={tenant} user={user}>
      <main className="mx-auto max-w-3xl px-4 sm:px-6">
        <Link href="/student/events" prefetch={false} className="meta hover:underline" style={{ color: "var(--accent)" }}>← Events</Link>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <StatusPill tone={state.tone}>
            {TYPE_LABEL[event.event_type] || event.event_type} · {state.label}
          </StatusPill>
          <span className="meta">
            {new Date(event.starts_at).toLocaleString("en-IN", { weekday: "long", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
            {event.is_online ? " · online" : event.location ? ` · ${event.location}` : ""}
          </span>
        </div>
        <Display size="lg" className="mt-3">{event.title}</Display>
        <p className="lede mt-4 whitespace-pre-wrap">{event.description || "Details coming soon."}</p>
        {event.speaker_name && <p className="mt-3 text-sm" style={{ color: "var(--text-muted)" }}>with <span style={{ color: "var(--text)" }} className="font-medium">{event.speaker_name}</span>{event.speaker_bio ? ` — ${event.speaker_bio}` : ""}</p>}
        {(event.domain && event.domain !== "general") && (
          <p className="meta mt-3">
            Filed under{" "}
            <Link href={`/student/roadmap?domain=${encodeURIComponent(event.domain)}`} prefetch={false} className="font-semibold hover:underline" style={{ color: "var(--accent)" }}>
              {event.domain}
            </Link>
          </p>
        )}

        {!past ? (
          <div className="mt-6 flex flex-wrap items-center gap-4 border-y py-5" style={{ borderColor: "var(--line)" }}>
            <RegisterButton eventId={event.id} registered={registered} full={full} />
            <a href={gcalUrl(event)} target="_blank" rel="noreferrer" className="text-sm font-medium hover:underline" style={{ color: "var(--text-muted)" }}>Add to calendar ↗</a>
            {event.capacity && <span className="meta ml-auto">{seatsTaken}/{event.capacity} seats</span>}
          </div>
        ) : (
          <div className="mt-6 flex flex-wrap items-center gap-4 border-y py-5" style={{ borderColor: "var(--line)" }}>
            <StatusPill>{mine?.status === "attended" ? "Attended" : "Past"}</StatusPill>
            {event.capacity && <span className="meta ml-auto">{seatsTaken}/{event.capacity} seats</span>}
          </div>
        )}

        {registered && (
          <section className="mt-8" aria-label="Your registration">
            <Meta style={{ color: "var(--accent)" }}>Your seat</Meta>
            <p className="mt-2 font-mono text-lg font-semibold" style={{ color: "var(--text)" }}>
              {mine.status === "attended" ? "Attended ✓" : mine.check_in_code}
            </p>
            {mine.status !== "attended" && <p className="meta mt-1">Show this code at the door.</p>}
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1">
              {cert && <Link href={`/student/certificates/${cert.verification_code}`} prefetch={false} className="inline-block text-sm font-semibold hover:underline" style={{ color: "var(--accent)" }}>View certificate →</Link>}
              {mine.status === "attended" && (
                <Link href="/student/leaderboard" prefetch={false} className="inline-block text-sm font-medium hover:underline" style={{ color: "var(--text-muted)" }}>
                  Participation counts toward your standing →
                </Link>
              )}
            </div>
            {mine.status === "attended" && !mine.feedback_score && <div className="mt-3"><FeedbackForm eventId={event.id} /></div>}
          </section>
        )}

        {step && !past && (
          <section className="mt-8" aria-label="Next step">
            <Meta>Next step</Meta>
            <div className="mt-2">
              <ActionLink href={step.href}>{step.label}</ActionLink>
            </div>
            <div className="mt-2">
              <Link href={`/student/community/forums?event=${event.id}`} prefetch={false} className="text-sm font-medium hover:underline" style={{ color: "var(--text-muted)" }}>
                Continue the conversation →
              </Link>
            </div>
          </section>
        )}

        <section className="mt-10" aria-label="Materials">
          <Meta>Materials · {materials.length}</Meta>
          {materials.length === 0 ? (
            <p className="narrative mt-3">Slides, recordings, and handouts appear here after the gathering.</p>
          ) : (
            <ul className="mt-3 divide-y" style={{ borderColor: "var(--line)" }}>
              {materials.map((m) => (
                <li key={m.id} className="py-2.5 text-sm">
                  <a href={m.storage_url} target="_blank" rel="noreferrer" className="font-medium hover:underline" style={{ color: "var(--text)" }}>{m.title} ↗</a>
                  <span className="meta ml-2">{m.file_type}</span>
                </li>
              ))}
            </ul>
          )}
          {admin && <div className="mt-3"><MaterialForm eventId={event.id} /></div>}
        </section>

        {admin && (
          <section className="mt-10 border-t pt-6" style={{ borderColor: "var(--line)" }} aria-label="Check-in">
            <Meta>Door check-in · {attendees.filter((a) => a.status === "attended").length}/{attendees.length} attended</Meta>
            <div className="mt-3"><CheckInForm eventId={event.id} /></div>
            <ul className="mt-3 max-h-64 space-y-1 overflow-auto text-sm">
              {attendees.map((a) => (
                <li key={a.id} className="flex justify-between gap-2">
                  <span style={{ color: "var(--text)" }}>{a.student_name || a.student_id}</span>
                  <span className="font-mono text-xs" style={{ color: a.status === "attended" ? "var(--accent)" : "var(--text-muted)" }}>{a.status} · {a.check_in_code}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </AppShell>
  );
}
