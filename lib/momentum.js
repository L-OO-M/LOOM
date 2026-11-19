// Daily momentum: the one number a member can build without waiting for a lead.
//
// The dashboard used to show "this week" as seven dots and nothing else. A
// streak is the honest version of that idea: it counts days on which something
// real happened, from sources the chapter already records. It is deliberately
// NOT a separate counter the client can increment — every day comes from a row
// (signed GitHub activity, an accepted practice solve, a completed milestone,
// or an event the member actually attended).
//
// Pure functions first so the maths is testable without a database.

const DAY_MS = 24 * 60 * 60 * 1000;

/** ISO day key (YYYY-MM-DD) for a Date, in UTC. SQL already hands us keys. */
export function dayKey(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function shiftDay(key, delta) {
  const d = new Date(`${key}T00:00:00.000Z`);
  return new Date(d.getTime() + delta * DAY_MS).toISOString().slice(0, 10);
}

/**
 * Current streak, longest streak, and active-day count from a list of ISO days.
 *
 * A day that has no activity yet does not break the streak until it is over:
 * opening the dashboard at 9am must not say "0 days". So the walk starts at
 * today when today is active, otherwise at yesterday.
 */
export function streakFromDays(days = [], today = new Date()) {
  const set = new Set(
    (Array.isArray(days) ? days : []).map((value) => (typeof value === "string" ? value.slice(0, 10) : dayKey(value))).filter(Boolean)
  );
  const todayKey = typeof today === "string" ? today.slice(0, 10) : dayKey(today);
  if (!todayKey) return { current: 0, longest: 0, activeDays: set.size };

  let cursor = set.has(todayKey) ? todayKey : shiftDay(todayKey, -1);
  let current = 0;
  while (set.has(cursor)) {
    current += 1;
    cursor = shiftDay(cursor, -1);
  }

  const sorted = [...set].sort();
  let longest = 0;
  let run = 0;
  let previous = null;
  for (const key of sorted) {
    run = previous && shiftDay(previous, 1) === key ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = key;
  }

  return { current, longest, activeDays: set.size };
}

/** Days inside the trailing window, newest last — what a heatmap needs. */
export function recentDays(days = [], { today = new Date(), window = 28 } = {}) {
  const set = new Set((Array.isArray(days) ? days : []).map((value) => String(value).slice(0, 10)));
  const todayKey = typeof today === "string" ? today.slice(0, 10) : dayKey(today);
  const out = [];
  for (let i = window - 1; i >= 0; i -= 1) {
    const key = shiftDay(todayKey, -i);
    out.push({ day: key, hit: set.has(key) });
  }
  return out;
}

/**
 * Read every personal day source in one statement.
 *
 * Each branch is bounded to the member and the chapter. Every branch states
 * `tenant_id = ...` explicitly: the zero-leak gate in tests/tenant-scoping-gate
 * refuses a `tenant_id IS NULL` escape hatch on a tenant-owned table, and a
 * member's rows belong to exactly one tenant.
 */
export async function loadMomentum(sql, { userId, tenantId, today = new Date() } = {}) {
  if (!sql || !userId || !tenantId) {
    return { ...streakFromDays([], today), days: recentDays([], { today }) };
  }
  const rows = await sql`
    SELECT day FROM (
      SELECT DISTINCT to_char(day, 'YYYY-MM-DD') AS day
      FROM student_daily_activity
      WHERE student_id = ${userId}
        AND tenant_id = ${tenantId}::uuid
        AND day >= CURRENT_DATE - INTERVAL '120 days'
        AND (commits + pull_requests + reviews) > 0
      UNION
      SELECT DISTINCT to_char(accepted_at, 'YYYY-MM-DD') AS day
      FROM practice_solves
      WHERE user_id = ${userId}
        AND tenant_id = ${tenantId}::uuid
        AND accepted_at >= CURRENT_DATE - INTERVAL '120 days'
      UNION
      SELECT DISTINCT to_char(completed_at, 'YYYY-MM-DD') AS day
      FROM student_roadmap_progress
      WHERE student_id = ${userId}
        AND tenant_id = ${tenantId}::uuid
        AND status = 'completed'
        AND completed_at >= CURRENT_DATE - INTERVAL '120 days'
      UNION
      SELECT DISTINCT to_char(r.attended_at, 'YYYY-MM-DD') AS day
      FROM event_registrations r
      JOIN events e ON e.id = r.event_id
      WHERE r.student_id = ${userId}
        AND e.tenant_id = ${tenantId}::uuid
        AND r.attended_at IS NOT NULL
        AND r.attended_at >= CURRENT_DATE - INTERVAL '120 days'
    ) days
    ORDER BY day ASC
  `;
  const days = rows.map((row) => row.day);
  const streak = streakFromDays(days, today);
  return { ...streak, days: recentDays(days, { today }) };
}
