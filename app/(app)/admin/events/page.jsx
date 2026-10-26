import Link from "next/link";
import { redirect } from "next/navigation";
import { Users, Star, Clock3, Search, MapPin, ArrowUpRight } from "lucide-react";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { WorkspaceMasthead, WorkspaceSection, WorkspaceEmpty } from "@/components/loom/WorkspaceMasthead";
import { EventForm } from "./EventBits";
import "../_components/admin-ledger.css";

function statusTone(s) {
  const m = {
    upcoming: { label: "Upcoming", className: "aled-tag--info" },
    live: { label: "Live", className: "aled-tag--success" },
    completed: { label: "Completed", className: "" },
    cancelled: { label: "Cancelled", className: "" },
    proposed: { label: "Proposed", className: "aled-tag--warn" },
  };
  return m[s] || m.upcoming;
}

export default async function AdminEventsPage({ searchParams }) {
  const ctx = await getRequestContext({ adminOnly: true });
  if (ctx.error === "UNAUTHORIZED") redirect("/login?redirect=/admin/events");
  if (ctx.error === "FORBIDDEN") redirect("/student");
  if (ctx.error) redirect("/login?redirect=/admin/events");
  const { tenant, user, sql } = ctx;
  const sp = await searchParams;
  const q = (sp?.q || "").trim();
  const status = sp?.status || "";

  const [stats] = await sql`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE status = 'upcoming')::int AS upcoming,
      COUNT(*) FILTER (WHERE status = 'live')::int AS live,
      COUNT(*) FILTER (WHERE status = 'completed')::int AS completed
    FROM events WHERE tenant_id = ${tenant?.id ?? null}::uuid
  `;

  // Derived JOIN aggregates — one query instead of 3 correlated subqueries per row.
  const events = await sql`
    SELECT e.*,
      COALESCE(r.seats_taken, 0)::int AS seats_taken,
      COALESCE(r.attended, 0)::int AS attended,
      COALESCE(r.avg_feedback, 0)::numeric AS avg_feedback,
      d.name AS dept_name
    FROM events e
    LEFT JOIN (
      SELECT event_id,
        COUNT(*) FILTER (WHERE status <> 'cancelled')::int AS seats_taken,
        COUNT(*) FILTER (WHERE status = 'attended')::int AS attended,
        AVG(feedback_score)::numeric AS avg_feedback
      FROM event_registrations GROUP BY event_id
    ) r ON r.event_id = e.id
    LEFT JOIN departments d ON d.id = e.department_id
    WHERE e.tenant_id = ${tenant?.id ?? null}::uuid
      AND (${q ? sql`(e.title ILIKE ${"%" + q + "%"} OR COALESCE(e.description,'') ILIKE ${"%" + q + "%"})` : sql`TRUE`})
      AND (${status ? sql`e.status = ${status}` : sql`TRUE`})
    ORDER BY e.starts_at DESC LIMIT 40
  `;

  const seatsTotal = events.reduce((n, e) => n + (e.seats_taken || 0), 0);

  return (
    <AppShell area="admin" tenant={tenant} user={user}>
      <main className="mx-auto max-w-6xl px-4 pb-14 sm:px-6">
        <WorkspaceMasthead
          kicker={`Gather / ${stats?.total ?? 0} events / ${stats?.upcoming ?? 0} upcoming`}
          title="Events console"
          lede="Schedule workshops, manage capacity, and review attendance. Every event lives in this chapter only."
          meta={`${events.length} shown / newest first / cap 40`}
          tone="field"
          art="/events/event-talk.png"
          artAlt=""
          stats={[
            { value: stats?.total ?? 0, label: "events all time" },
            { value: stats?.upcoming ?? 0, label: "upcoming" },
            { value: stats?.completed ?? 0, label: "completed" },
            { value: seatsTotal, label: "seats taken in view" }
          ]}
        />

        <form method="get" className="aled-toolbar" role="search">
          <label className="aled-search">
            <Search size={14} style={{ color: "var(--text-muted)" }} aria-hidden="true" />
            <input name="q" defaultValue={q} placeholder="Search title or description…" aria-label="Search events" />
          </label>
          <select name="status" defaultValue={status} className="aled-select" aria-label="Filter by status">
            <option value="">All statuses</option>
            <option value="upcoming">Upcoming</option>
            <option value="live">Live</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
            <option value="proposed">Proposed</option>
          </select>
          <button className="btn-ink !py-2 text-xs">Filter</button>
          {(q || status) && <Link href="/admin/events" prefetch={false} className="aled-meta" style={{ color: "var(--accent)" }}>Clear</Link>}
          <span className="aled-meta ml-auto hidden sm:block">{events.length} shown / cap 40</span>
        </form>

        <div className="aled-split">
          <section aria-label="Event ledger">
            <div className="aled-meta">All events / newest first</div>
            {events.length === 0 ? (
              <WorkspaceEmpty
                title="No events yet"
                body="Schedule the first gathering — workshops, hackathons, talks. Students register from /student/events."
              />
            ) : (
              <ul className="aled-ledger" style={{ listStyle: "none", margin: "0.9rem 0 0", padding: 0 }}>
                {events.map((e) => {
                  const tone = statusTone(e.status);
                  const fill = e.capacity ? Math.min(100, Math.round((e.seats_taken / e.capacity) * 100)) : 0;
                  return (
                    <li key={e.id} className="aled-row" style={{ "--aled-cols": "4.6rem minmax(0, 1fr) auto" }}>
                      <span className="aled-date">
                        {e.starts_at ? new Date(e.starts_at).toLocaleDateString("en-IN", { month: "short", day: "numeric" }) : "no start"}
                      </span>
                      <div className="aled-copy">
                        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.4rem" }}>
                          <Link href={`/student/events/${e.id}`} prefetch={false} className="aled-title" style={{ display: "inline" }}>{e.title}</Link>
                          <span className={`aled-tag ${tone.className}`}>{tone.label}</span>
                          <span className="aled-meta">{e.event_type}{e.dept_name ? ` / ${e.dept_name}` : e.domain ? ` / ${e.domain}` : ""}</span>
                        </div>
                        {e.description && <p className="aled-sub">{e.description}</p>}
                        <p className="aled-sub" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.35rem 0.7rem" }}>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}><Clock3 size={11} aria-hidden="true" /> {e.starts_at ? new Date(e.starts_at).toLocaleString("en-IN", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "no start"}</span>
                          {e.location && <span style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}><MapPin size={11} aria-hidden="true" /> {e.location}{e.is_online ? " / online" : ""}</span>}
                          {e.speaker_name && <span>{e.speaker_name}</span>}
                          <span style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}><Users size={11} aria-hidden="true" /> {e.seats_taken}{e.capacity ? ` / ${e.capacity}` : ""}{e.attended ? ` / ${e.attended} attended` : ""}</span>
                          {Number(e.avg_feedback) > 0 && <span style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}><Star size={11} aria-hidden="true" /> {Number(e.avg_feedback).toFixed(1)}</span>}
                        </p>
                        {e.capacity ? (
                          <span style={{ display: "flex", alignItems: "center", gap: "0.45rem", marginTop: "0.35rem" }}>
                            <span className="aled-meter" aria-hidden="true"><span className={fill > 85 ? "is-danger" : ""} style={{ width: `${fill}%` }} /></span>
                            <span className="aled-meta">{fill}% full</span>
                          </span>
                        ) : null}
                      </div>
                      <span className="aled-actions">
                        <span className="aled-meta">{e.id.slice(0, 8)}</span>
                        <Link href={`/student/events/${e.id}`} prefetch={false} style={{ color: "var(--text-muted)", display: "inline-flex" }} aria-label={`Open ${e.title}`}><ArrowUpRight size={13} /></Link>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <div className="aled-stack">
            <WorkspaceSection title="Schedule an event" note="Workshops and hackathons fill the calendar — keep capacity realistic." className="mt-0">
              <div className="aled-panel"><EventForm /></div>
            </WorkspaceSection>
            <div className="aled-panel">
              <p className="aled-panel-title">Ops notes</p>
              <ul className="aled-notes">
                <li>Capacity enforces waitlist at registration time.</li>
                <li>Feedback score is the attendee average — shows after the event.</li>
                <li>Use proposed → upcoming → live → completed.</li>
              </ul>
            </div>
          </div>
        </div>
      </main>
    </AppShell>
  );
}
