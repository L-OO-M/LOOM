import { redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth-server";
import { can } from "@/lib/permissions";
import { AppShell } from "@/components/AppShell";
import { WorkspaceMasthead, WorkspaceEmpty } from "@/components/loom/WorkspaceMasthead";
import Link from "next/link";
import { CalendarDays, Clock3, MapPin, Users, ArrowUpRight } from "lucide-react";
import { displayState, TYPE_LABEL } from "@/lib/events";

const LEAD_ROLES = ["dept_lead", "vertical_lead", "admin"];

function statusTone(s) {
  const m = {
    upcoming: { label: "Upcoming", className: "aled-tag--info" },
    live: { label: "Live", className: "aled-tag--success" },
    past: { label: "Completed", className: "" },
    completed: { label: "Completed", className: "" },
    cancelled: { label: "Cancelled", className: "" },
    proposed: { label: "Proposed", className: "aled-tag--warn" },
  };
  return m[s] || m.upcoming;
}

export const dynamic = "force-dynamic";

export default async function LeadEventsPage({ searchParams }) {
  const ctx = await getRequestContext();
  if (ctx.error) redirect(`/login?redirect=${encodeURIComponent("/lead/events")}`);
  const { user, profile, tenant, sql } = ctx;

  if (!LEAD_ROLES.includes(profile.role)) redirect("/student");

  const sp = await searchParams;
  const q = (sp?.q || "").trim();
  const status = sp?.status || "";

  // Scope: vertical leads see all events in their vertical; dept leads see their department events + society events they created
  // Build additional WHERE conditions beyond the mandatory tenant scoping
  let extraWhere = sql`TRUE`;
  if (profile.role === "dept_lead") {
    const myDeptIds = (profile.memberships || [])
      .filter((m) => m.level === "dept_lead")
      .map((m) => m.department_id);
    if (myDeptIds.length > 0) {
      extraWhere = sql`(e.department_id IN ${sql(myDeptIds)} OR e.created_by = ${user.id})`;
    } else {
      extraWhere = sql`e.created_by = ${user.id}`;
    }
  } else if (profile.role === "vertical_lead") {
    const verticalDeptIds = await sql`
      SELECT id FROM departments WHERE tenant_id = ${tenant.id}::uuid AND vertical = ${profile.vertical}
    `;
    const ids = verticalDeptIds.map((d) => d.id);
    if (ids.length > 0) {
      extraWhere = sql`(e.department_id IN ${sql(ids)} OR e.department_id IS NULL)`;
    } else {
      extraWhere = sql`e.department_id IS NULL`;
    }
  }

  const events = await sql`
    SELECT e.*,
      COALESCE(r.seats_taken, 0)::int AS seats_taken,
      d.name AS dept_name
    FROM events e
    LEFT JOIN (
      SELECT event_id, COUNT(*) FILTER (WHERE status <> "cancelled")::int AS seats_taken
      FROM event_registrations GROUP BY event_id
    ) r ON r.event_id = e.id
    LEFT JOIN departments d ON d.id = e.department_id
    WHERE e.tenant_id = ${tenant.id}::uuid
      AND ${extraWhere}
      AND (${q ? sql`(e.title ILIKE ${"%" + q + "%"} OR COALESCE(e.description,'') ILIKE ${"%" + q + "%"})` : sql`TRUE`})
      AND (${status ? sql`e.status = ${status}` : sql`TRUE`})
    ORDER BY e.starts_at DESC
    LIMIT 50
  `;

  return (
    <AppShell area="lead" tenant={tenant} user={user}>
      <main className="mx-auto max-w-6xl px-4 pb-14 sm:px-6">
        <WorkspaceMasthead
          kicker={`Events / ${events.length} shown`}
          title="Events"
          lede="Browse, search, and open any event to edit details, run check-in, or manage tasks."
          meta="Newest first. Department leads see their department events and society events they created. Vertical leads see all events in their vertical."
          tone="ledger"
          art="/events/event-talk.png"
          artAlt=""
        />

        <form method="get" className="aled-toolbar" role="search">
          <label className="aled-search">
            <input name="q" defaultValue={q} placeholder="Search title or description…" aria-label="Search events" />
          </label>
          <select name="status" defaultValue={status} className="aled-select" aria-label="Filter by status">
            <option value="">All statuses</option>
            <option value="upcoming">Upcoming</option>
            <option value="live">Live</option>
            <option value="past">Completed</option>
            <option value="cancelled">Cancelled</option>
            <option value="proposed">Proposed</option>
          </select>
          <Link href="/lead/events/new" prefetch={false} className="btn-ink !py-2 text-xs">Create event</Link>
          {(q || status) && <Link href="/lead/events" prefetch={false} className="aled-meta" style={{ color: "var(--accent)" }}>Clear</Link>}
          <span className="aled-meta ml-auto hidden sm:block">{events.length} shown / cap 50</span>
        </form>

        {events.length === 0 ? (
          <WorkspaceEmpty
            title="No events yet"
            body="Schedule the first gathering — workshops, hackathons, talks. Students register from /student/events."
          />
        ) : (
          <ul className="mt-4 divide-y rounded-2xl border" style={{ borderColor: "var(--line)", listStyle: "none", padding: 0 }}>
            {events.map((e) => {
              const tone = statusTone(e.status);
              const fill = e.capacity ? Math.min(100, Math.round((e.seats_taken / e.capacity) * 100)) : 0;
              return (
                <li key={e.id} className="aled-row flex flex-wrap items-baseline gap-4 p-4 hover:bg-[var(--wash)] transition">
                  <span className="aled-date mono-tag w-24 shrink-0">
                    {e.starts_at ? new Date(e.starts_at).toLocaleDateString("en-IN", { month: "short", day: "numeric" }) : "no start"}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.4rem" }}>
                      <Link href={`/lead/events/${e.id}`} prefetch={false} className="aled-title font-medium hover:underline" style={{ color: "var(--text)" }}>{e.title}</Link>
                      <span className={`aled-tag ${tone.className}`}>{tone.label}</span>
                      <span className="aled-meta">{e.event_type}{e.dept_name ? ` / ${e.dept_name}` : e.domain ? ` / ${e.domain}` : ""}</span>
                    </div>
                    {e.description && <p className="aled-sub mt-1 truncate" style={{ color: "var(--text-muted)" }}>{e.description}</p>}
                    <p className="aled-sub mt-1" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.35rem 0.7rem", color: "var(--text-muted)", fontSize: "0.85rem" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}><Clock3 size={11} aria-hidden="true" /> {e.starts_at ? new Date(e.starts_at).toLocaleString("en-IN", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "no start"}</span>
                      {e.location && <span style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}><MapPin size={11} aria-hidden="true" /> {e.location}{e.is_online ? " / online" : ""}</span>}
                      {e.speaker_name && <span>{e.speaker_name}</span>}
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}><Users size={11} aria-hidden="true" /> {e.seats_taken}{e.capacity ? ` / ${e.capacity}` : ""}</span>
                    </p>
                    {e.capacity && (
                      <span style={{ display: "flex", alignItems: "center", gap: "0.45rem", marginTop: "0.35rem" }}>
                        <span className="aled-meter" aria-hidden="true"><span className={fill > 85 ? "is-danger" : ""} style={{ width: `${fill}%` }} /></span>
                        <span className="aled-meta">{fill}% full</span>
                      </span>
                    )}
                  </div>
                  <span className="aled-actions flex items-center gap-2">
                    <span className="aled-meta text-[10px] font-mono">{e.id.slice(0, 8)}</span>
                    <Link href={`/lead/events/${e.id}`} prefetch={false} style={{ color: "var(--text-muted)", display: "inline-flex" }} aria-label={`Open ${e.title}`}><ArrowUpRight size={13} /></Link>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </AppShell>
  );
}