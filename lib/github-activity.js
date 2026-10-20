// Daily GitHub activity, derived from what the webhook actually recorded.
//
// The page used to show a heatmap, three lifetime totals and a current streak.
// That answers "how much" but not "how consistently" -- and consistency is the
// thing a contribution table is for. Everything here is a pure function over
// `student_daily_activity` rows so the numbers on screen can be traced to the
// same rows the export and the heatmap use. Nothing is estimated, and a day
// with no row is a zero, not a guess.

const DAY_MS = 86400000;

export function dayKey(row) {
  return row?.day ? String(row.day).slice(0, 10) : null;
}

export function dayTotal(row) {
  if (!row) return 0;
  return (Number(row.commits) || 0) + (Number(row.pull_requests) || 0) + (Number(row.reviews) || 0);
}

function isoDay(date) {
  return date.toISOString().slice(0, 10);
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
  const cursor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
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
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return out;
}

/** Consecutive active days ending today or yesterday, matching the heatmap. */
export function currentStreak(rows = [], now = new Date()) {
  const byDay = new Map(rows.map((r) => [dayKey(r), r]));
  const cursor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (dayTotal(byDay.get(isoDay(cursor))) <= 0) cursor.setUTCDate(cursor.getUTCDate() - 1);
  let streak = 0;
  for (;;) {
    if (dayTotal(byDay.get(isoDay(cursor))) <= 0) break;
    streak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
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
