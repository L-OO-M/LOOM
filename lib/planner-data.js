/**
 * Server-side reads for the Collective Planner.
 *
 * Every query filters on the tenant resolved from the session — never on a
 * client-supplied tenant. Shared by the page server components and the API
 * routes so the page and `/api/planner` can never disagree.
 */

import { PLANNER_YEAR } from "./planner";

export function serializeWeek(w) {
  return {
    id: w.id,
    week_number: Number(w.week_number),
    starts_on: toYmd(w.starts_on),
    ends_on: toYmd(w.ends_on),
    theme: w.theme || "",
    delivery_mode: w.delivery_mode,
    is_protected: !!w.is_protected,
    is_relaxation: !!w.is_relaxation,
    notes: w.notes || "",
  };
}

export function serializeSession(s) {
  return {
    id: s.id,
    week_number: Number(s.week_number),
    track_domain: s.track_domain || "general",
    curriculum_ref: s.curriculum_ref || null,
    title: s.title,
    session_kind: s.session_kind,
    day_of_week: s.day_of_week == null ? null : Number(s.day_of_week),
    starts_time: s.starts_time ? String(s.starts_time).slice(0, 8) : null,
    ends_time: s.ends_time ? String(s.ends_time).slice(0, 8) : null,
    delivery_mode: s.delivery_mode,
    is_required: !!s.is_required,
    is_relaxation: !!s.is_relaxation,
    notes: s.notes || "",
    sort_order: Number(s.sort_order ?? 0),
    owner_user_id: s.owner_user_id || null,
    owner_name: s.owner_name || null,
  };
}

export function serializePlannerEvent(e) {
  return {
    id: e.id,
    title: e.title,
    description: e.description || "",
    event_type: e.event_type,
    planner_kind: e.planner_kind || null,
    planner_ref: e.planner_ref || null,
    planner_week: e.planner_week == null ? null : Number(e.planner_week),
    starts_at: e.starts_at instanceof Date ? e.starts_at.toISOString() : String(e.starts_at),
    ends_at: e.ends_at ? (e.ends_at instanceof Date ? e.ends_at.toISOString() : String(e.ends_at)) : null,
    location: e.location || null,
  };
}

function toYmd(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const s = String(value);
  return s.length >= 10 ? s.slice(0, 10) : s;
}

export async function loadPlanner({ sql, tenantId, track = "all", week = null }) {
  const weeks = await sql`
    SELECT * FROM planner_weeks
    WHERE tenant_id = ${tenantId}::uuid AND academic_year = ${PLANNER_YEAR}
    ORDER BY week_number ASC
  `;

  const sessions = await sql`
    SELECT s.*, p.name AS owner_name
    FROM planner_sessions s
    LEFT JOIN profiles p ON p.user_id = s.owner_user_id
    WHERE s.tenant_id = ${tenantId}::uuid AND s.academic_year = ${PLANNER_YEAR}
      AND (${track === "all" ? sql`TRUE` : sql`s.track_domain = ${track}`})
      AND (${week == null ? sql`TRUE` : sql`s.week_number = ${week}`})
    ORDER BY s.week_number ASC, s.day_of_week ASC NULLS LAST, s.sort_order ASC
  `;

  const events = await sql`
    SELECT id, title, description, event_type, planner_kind, planner_ref, planner_week, starts_at, ends_at, location
    FROM events
    WHERE tenant_id = ${tenantId}::uuid AND planner_year = ${PLANNER_YEAR}
      AND status <> 'cancelled'
    ORDER BY starts_at ASC
  `;

  return {
    weeks: weeks.map(serializeWeek),
    sessions: sessions.map(serializeSession),
    events: events.map(serializePlannerEvent),
  };
}

/**
 * Who owns the planner: session counts grouped by owner, plus the unassigned
 * bucket (user_id null) so a lead can see what still needs a name against it.
 */
export async function loadPlannerOwners({ sql, tenantId }) {
  const rows = await sql`
    SELECT s.owner_user_id AS user_id, p.name, p.role, COUNT(*)::int AS sessions
    FROM planner_sessions s
    LEFT JOIN profiles p ON p.user_id = s.owner_user_id
    WHERE s.tenant_id = ${tenantId}::uuid AND s.academic_year = ${PLANNER_YEAR}
    GROUP BY s.owner_user_id, p.name, p.role
    ORDER BY (s.owner_user_id IS NULL) ASC, sessions DESC
  `;
  return rows.map((r) => ({
    user_id: r.user_id || null,
    name: r.name || null,
    role: r.role || null,
    sessions: Number(r.sessions),
  }));
}

/** Members a planner handover can pass rows to: core and above, in this chapter. */
export async function loadAssignableLeads({ sql, tenantId }) {
  const rows = await sql`
    SELECT user_id, name, role FROM profiles
    WHERE tenant_id = ${tenantId}::uuid
      AND role IN ('core', 'dept_lead', 'vertical_lead', 'admin')
    ORDER BY
      CASE role WHEN 'admin' THEN 1 WHEN 'vertical_lead' THEN 2 WHEN 'dept_lead' THEN 3 ELSE 4 END,
      name
    LIMIT 200
  `;
  return rows.map((r) => ({ user_id: r.user_id, name: r.name, role: r.role }));
}
