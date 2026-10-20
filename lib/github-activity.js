// Daily GitHub activity, derived from what the webhook actually recorded.
//
// The page used to show a heatmap, three lifetime totals and a current streak.
// That answers "how much" but not "how consistently" -- and consistency is the
// thing a contribution table is for. Everything here is a pure function over
// `student_daily_activity` rows so the numbers on screen can be traced to the
// same rows the export and the heatmap use. Nothing is estimated, and a day
// with no row is a zero, not a guess.

const DAY_MS = 86400000;

/**
 * A date-only key from a local Date.
 *
 * `toISOString()` is wrong here: the DB returns a `date` as a Date at local
 * midnight, and in IST that serialises to the PREVIOUS UTC day. Every key must
 * be built from local calendar parts or the heatmap shifts by a day.
 */
export function toIsoDay(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * `student_daily_activity.day` is a Postgres `date`, which postgres.js hands
 * back as a Date object -- not a "YYYY-MM-DD" string. String(Date).slice(0,10)
 * yields "Fri Oct 16", which never matches a calendar key, so every row was
 * silently invisible to the heatmap and streak maths. Accept both shapes.
 */
export function dayKey(row) {
  const value = row?.day;
  if (!value) return null;
  if (value instanceof Date) return toIsoDay(value);
  return String(value).slice(0, 10);
}

export function dayTotal(row) {
  if (!row) return 0;
  return (Number(row.commits) || 0) + (Number(row.pull_requests) || 0) + (Number(row.reviews) || 0);
}

function isoDay(date) {
  return toIsoDay(date);
}

/**
 * Fill a calendar window, newest first, including days with no recorded
 * activity. Missing rows are real zeroes: a table that silently skipped them
 * would make an intermittent contributor look consistent.
 */
export function dailyTable(rows = [], days = 30, now = new Date()) {
  const byDay = new Map();
  for (const row of rows) {
    const key = dayKey(row);
    if (key) byDay.set(key, row);
  }
  const out = [];
  // Local calendar days: the rows are date-only and were written in local time.
  const cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  for (let i = 0; i < days; i += 1) {
    const iso = isoDay(cursor);
    const row = byDay.get(iso);
    out.push({
      day: iso,
      commits: Number(row?.commits) || 0,
      pull_requests: Number(row?.pull_requests) || 0,
      reviews: Number(row?.reviews) || 0,
      total: dayTotal(row),
    });
    cursor.setDate(cursor.getDate() - 1);
  }
  return out;
}

/** Consecutive active days ending today or yesterday, matching the heatmap. */
export function currentStreak(rows = [], now = new Date()) {
  const byDay = new Map(rows.map((r) => [dayKey(r), r]));
  const cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (dayTotal(byDay.get(isoDay(cursor))) <= 0) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  for (;;) {
    if (dayTotal(byDay.get(isoDay(cursor))) <= 0) break;
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
    if (streak > 400) break;
  }
  return streak;
}

/**
 * Longest run of consecutive active days anywhere in the window, and the
 * one-day high. Calendar continuity is checked explicitly -- simply counting
 * ascending rows would call four Mondays in a row a four-day streak.
 */
export function longestStreak(rows = []) {
  const days = rows
    .map((r) => ({ at: dayKey(r), total: dayTotal(r) }))
    .filter((r) => r.at && r.total > 0)
    .sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  let best = 0;
  let run = 0;
  let previous = null;
  for (const row of days) {
    const time = Date.parse(`${row.at}T00:00:00Z`);
    const contiguous = previous !== null && time - previous === DAY_MS;
    run = contiguous ? run + 1 : 1;
    if (run > best) best = run;
    previous = time;
  }
  return best;
}

/** Everything the overview and the daily tab need, in one pass. */
export function summarizeActivity(rows = [], { days = 120, now = new Date() } = {}) {
  let commits = 0;
  let pullRequests = 0;
  let reviews = 0;
  let activeDays = 0;
  let best = { day: null, total: 0 };
  for (const row of rows) {
    const total = dayTotal(row);
    if (total <= 0) continue;
    commits += Number(row.commits) || 0;
    pullRequests += Number(row.pull_requests) || 0;
    reviews += Number(row.reviews) || 0;
    activeDays += 1;
    if (total > best.total) best = { day: dayKey(row), total };
  }
  const table = dailyTable(rows, days, now);
  return {
    commits,
    pullRequests,
    reviews,
    activeDays,
    windowDays: days,
    currentStreak: currentStreak(rows, now),
    longestStreak: longestStreak(rows),
    bestDay: best.day,
    bestDayTotal: best.total,
    weeklyAverage: Math.round(((commits + pullRequests + reviews) / days) * 7 * 10) / 10,
    table,
  };
}
