import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarDays, Users, Star, Clock3, Search, MapPin, ArrowUpRight } from "lucide-react";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/ui";
import { Meta } from "@/components/loom/primitives";
import { EventForm } from "./EventBits";

function statusTone(s) {
  const m = {
    upcoming: { label: "Upcoming", bg: "color-mix(in srgb, #0ea5e9 10%, var(--bg))", color: "#0284c7" },
    live: { label: "Live", bg: "color-mix(in srgb, #16a34a 14%, var(--bg))", color: "#16a34a" },
    completed: { label: "Completed", bg: "var(--bg-elevated)", color: "var(--text-muted)" },
    cancelled: { label: "Cancelled", bg: "var(--bg)", color: "var(--text-muted)" },
    proposed: { label: "Proposed", bg: "color-mix(in srgb, #f59e0b 12%, var(--bg))", color: "#b45309" },
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

  const upcomingCount = events.filter((e) => e.status === "upcoming").length;
  const seatsTotal = events.reduce((n, e) => n + (e.seats_taken || 0), 0);

  return (
    <AppShell area="admin" tenant={tenant} user={user}>
      <main className="mx-auto max-w-6xl px-4 pb-14 sm:px-6">
        <PageHeader kicker={`Gather · ${stats?.total ?? 0} events · ${stats?.upcoming ?? 0} upcoming`} title="Events console" desc="Schedule workshops, manage capacity, and review attendance. Every event lives in this chapter only." />

        <div className="mb-6 grid gap-3 sm:grid-cols-4">
          {[
            { label: "Total", value: stats?.total ?? 0, icon: CalendarDays },
            { label: "Upcoming", value: stats?.upcoming ?? 0, icon: Clock3 },
            { label: "Seats taken", value: seatsTotal, icon: Users },
            { label: "Upcoming in view", value: upcomingCount, icon: Star },
          ].map((s) => (
            <div key={s.label} className="flex items-center gap-3 rounded-2xl border p-3.5" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
              <span className="inline-flex size-8 items-center justify-center rounded-full border" style={{ borderColor: "var(--line)", background: "var(--bg)", color: "var(--text-muted)" }}><s.icon size={14} /></span>
              <div><p className="font-mono text-sm font-semibold" style={{ color: "var(--text)" }}>{s.value}</p><p className="meta">{s.label}</p></div>
            </div>
          ))}
        </div>

        <form method="get" className="mb-4 flex flex-col gap-3 rounded-2xl border p-3 sm:flex-row sm:items-center" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }} role="search">
          <div className="relative flex-1">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--text-muted)" }} />
            <input name="q" defaultValue={q} placeholder="Search title or description…" className="w-full rounded-xl border py-2.5 pl-9 pr-3 text-sm outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--accent)_14%,transparent)]" style={{ borderColor: "var(--line)", background: "var(--bg)", color: "var(--text)" }} />
          </div>
          <select name="status" defaultValue={status} className="rounded-xl border px-3 py-2.5 text-sm outline-none" style={{ borderColor: "var(--line)", background: "var(--bg)", color: "var(--text)" }}>
            <option value="">All statuses</option>
            <option value="upcoming">Upcoming</option>
            <option value="live">Live</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
            <option value="proposed">Proposed</option>
          </select>
          <button className="btn-ink !py-2.5 text-sm">Filter</button>
          {(q || status) && <Link href="/admin/events" prefetch={false} className="text-xs font-medium hover:underline" style={{ color: "var(--accent)" }}>Clear</Link>}
          <span className="meta ml-auto hidden sm:block">{events.length} shown · cap 40</span>
        </form>

        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <section>
            <div className="flex items-center gap-2">
              <CalendarDays size={14} style={{ color: "var(--text-muted)" }} />
              <Meta>All events · newest first</Meta>
            </div>

            {events.length === 0 ? (
              <div className="mt-4 rounded-2xl border border-dashed p-10 text-center" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
                <p className="text-sm font-medium" style={{ color: "var(--text)" }}>No events yet</p>
                <p className="narrative mx-auto mt-2 max-w-md">Schedule the first gathering — workshops, hackathons, talks. Students register from /student/events.</p>
              </div>
            ) : (
              <ul className="mt-4 space-y-2">
                {events.map((e) => {
                  const tone = statusTone(e.status);
                  const fill = e.capacity ? Math.min(100, Math.round((e.seats_taken / e.capacity) * 100)) : 0;
                  return (
                    <li key={e.id} className="group rounded-2xl border p-4 transition hover:-translate-y-0.5 hover:shadow-sm" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Link href={`/student/events/${e.id}`} prefetch={false} className="truncate text-sm font-medium hover:underline" style={{ color: "var(--text)" }}>{e.title}</Link>
                            <span className="inline-flex rounded-full border px-2 py-0.5 text-xs font-medium" style={{ background: tone.bg, color: tone.color, borderColor: "var(--line)" }}>{tone.label}</span>
                            <span className="meta">{e.event_type} {e.dept_name ? `· ${e.dept_name}` : e.domain ? `· ${e.domain}` : ""}</span>
                          </div>
                          {e.description && <p className="narrative mt-1 line-clamp-1 text-xs leading-5">{e.description}</p>}
                          <p className="meta mt-1 flex flex-wrap items-center gap-2">
                            <span className="inline-flex items-center gap-1"><Clock3 size={11} /> {e.starts_at ? new Date(e.starts_at).toLocaleString("en-IN", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "no start"}</span>
                            {e.location && <span className="inline-flex items-center gap-1"><MapPin size={11} /> {e.location}{e.is_online ? " · online" : ""}</span>}
                            {e.speaker_name && <span>· {e.speaker_name}</span>}
                          </p>
                        </div>
                        <Link href={`/student/events/${e.id}`} prefetch={false} className="hidden shrink-0 rounded-full border p-1.5 opacity-60 transition group-hover:opacity-100" style={{ borderColor: "var(--line)" }}><ArrowUpRight size={12} /></Link>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs" style={{ borderColor: "var(--line)", background: "var(--bg)", color: "var(--text)" }}>
                          <Users size={12} style={{ color: "var(--text-muted)" }} /> {e.seats_taken}{e.capacity ? ` / ${e.capacity}` : ""} {e.attended ? `· ${e.attended} attended` : ""}
                        </span>
                        {e.capacity ? (
                          <span className="inline-flex items-center gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
                            <span className="h-1.5 w-20 overflow-hidden rounded-full" style={{ background: "var(--line)" }}><span className="block h-full rounded-full" style={{ width: `${fill}%`, background: fill > 85 ? "var(--danger)" : "var(--accent)" }} /></span>
                            {fill}%
                          </span>
                        ) : null}
                        {Number(e.avg_feedback) > 0 && <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs" style={{ borderColor: "var(--line)", background: "var(--bg)", color: "var(--text-muted)" }}><Star size={11} /> {Number(e.avg_feedback).toFixed(1)}</span>}
                        <span className="meta ml-auto font-mono text-[11px]">{e.id.slice(0, 8)}</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <div className="space-y-4">
            <div className="rounded-2xl border p-6" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
              <h2 className="text-sm font-semibold" style={{ color: "var(--text)" }}>Schedule an event</h2>
              <p className="narrative mt-1">Workshops and hackathons fill the calendar — keep capacity realistic.</p>
              <div className="mt-4"><EventForm /></div>
            </div>
            <div className="rounded-2xl border p-5" style={{ borderColor: "var(--line)", background: "var(--bg)" }}>
              <p className="text-xs font-semibold" style={{ color: "var(--text)" }}>Ops notes</p>
              <ul className="mt-2 space-y-1.5 text-xs leading-5" style={{ color: "var(--text-muted)" }}>
                <li>· Capacity enforces waitlist at registration time.</li>
                <li>· Feedback score is the attendee average — shows after the event.</li>
                <li>· Use proposed → upcoming → live → completed.</li>
              </ul>
            </div>
          </div>
        </div>
      </main>
    </AppShell>
  );
}
