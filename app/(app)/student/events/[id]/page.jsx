import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { PageHeader, Card } from "@/components/ui";
import { env } from "@/lib/env";
import { RegisterButton, FeedbackForm, MaterialForm, CheckInForm } from "../EventsBits";

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
  const isAdmin = profile?.role === "admin";

  const [event] = await sql`
    SELECT e.*, (SELECT COUNT(*)::int FROM event_registrations r WHERE r.event_id = e.id AND r.status <> 'cancelled') AS seats_taken
    FROM events e WHERE e.id = ${id} AND e.tenant_id = ${tenant?.id ?? null}::uuid LIMIT 1
  `;
  if (!event) notFound();
  const [mine] = await sql`SELECT * FROM event_registrations WHERE event_id = ${id} AND student_id = ${user.id} LIMIT 1`;
  const materials = await sql`SELECT * FROM event_materials WHERE event_id = ${id} ORDER BY uploaded_at ASC`;
  const attendees = isAdmin ? await sql`
    SELECT r.*, p.name AS student_name FROM event_registrations r
    LEFT JOIN profiles p ON p.user_id = r.student_id
    WHERE r.event_id = ${id} ORDER BY r.registered_at ASC LIMIT 200
  ` : [];
  const [cert] = mine ? await sql`SELECT * FROM certificates WHERE event_id = ${id} AND student_id = ${user.id} LIMIT 1` : [];
  const full = event.capacity && event.seats_taken >= event.capacity && !mine;

  return (
    <AppShell area="student" tenant={tenant} user={user}>
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          <Link href="/student/events" style={{ color: "var(--accent)" }}>← Events</Link>
        </p>
        <PageHeader kicker={`${event.event_type} · ${event.domain}`} title={event.title}
          desc={`${new Date(event.starts_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })} · ${event.is_online ? "Online" : event.location || "TBA"}`}
          action={<RegisterButton eventId={event.id} registered={!!mine && mine.status !== "cancelled"} full={full} />} />
        <Card>
          <p className="whitespace-pre-wrap text-sm leading-7" style={{ color: "var(--text)" }}>{event.description || "Details coming soon."}</p>
          {event.speaker_name && <p className="mt-3 text-sm" style={{ color: "var(--text-muted)" }}>Speaker: <span style={{ color: "var(--text)" }}>{event.speaker_name}</span>{event.speaker_bio ? ` — ${event.speaker_bio}` : ""}</p>}
          <a href={gcalUrl(event)} target="_blank" rel="noreferrer" className="mt-4 inline-block text-sm font-medium" style={{ color: "var(--accent)" }}>Add to Google Calendar ↗</a>
        </Card>

        {mine && mine.status !== "cancelled" && (
          <Card className="mt-6">
            <h2 className="font-medium" style={{ color: "var(--text)" }}>Your registration</h2>
            <p className="mt-2 font-mono text-sm" style={{ color: "var(--accent)" }}>
              {mine.status === "attended" ? "Attended ✓" : `Door code: ${mine.check_in_code}`}
            </p>
            {cert && <Link href={`/student/certificates/${cert.verification_code}`} className="mt-2 inline-block text-sm font-medium" style={{ color: "var(--accent)" }}>View certificate →</Link>}
            {mine.status === "attended" && !mine.feedback_score && <FeedbackForm eventId={event.id} />}
          </Card>
        )}

        <Card className="mt-6">
          <h2 className="font-medium" style={{ color: "var(--text)" }}>Materials</h2>
          {materials.length === 0 ? (
            <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>Slides, recordings, and handouts appear here.</p>
          ) : (
            <ul className="mt-2 space-y-1 text-sm">
              {materials.map((m) => (
                <li key={m.id}><a href={m.storage_url} target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>{m.title} ↗</a> <span style={{ color: "var(--text-muted)" }}>· {m.file_type}</span></li>
              ))}
            </ul>
          )}
          {isAdmin && <MaterialForm eventId={event.id} />}
        </Card>

        {isAdmin && (
          <Card className="mt-6">
            <h2 className="font-medium" style={{ color: "var(--text)" }}>Door check-in ({attendees.filter((a) => a.status === "attended").length}/{attendees.length} attended)</h2>
            <CheckInForm eventId={event.id} />
            <ul className="mt-3 max-h-64 space-y-1 overflow-auto text-sm">
              {attendees.map((a) => (
                <li key={a.id} className="flex justify-between gap-2">
                  <span style={{ color: "var(--text)" }}>{a.student_name || a.student_id}</span>
                  <span className="font-mono text-xs" style={{ color: a.status === "attended" ? "var(--accent)" : "var(--text-muted)" }}>{a.status} · {a.check_in_code}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </main>
    </AppShell>
  );
}
