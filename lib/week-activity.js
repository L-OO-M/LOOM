// "This week" is a Monday-Sunday calendar strip, not a rolling 13-day window.
//
// The dashboard used to fetch two weeks of `student_daily_activity` and then
// count every active day in that result as a "session this week". A Tuesday
// could report 13 active days, and the seven-day strip and the totals could
// disagree. Everything here is a pure function over the same rows the strip
// renders, so the marks and the numbers can no longer drift apart.

import { dayKey, dayTotal, toIsoDay } from "./github-activity";

export const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Local Monday at 00:00 for the week containing `now`. */
export function startOfWeek(now = new Date()) {
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return monday;
}

/**
 * The current Monday-Sunday strip plus honest totals.
 *
 * - `days` is always exactly seven entries, including future days with no row.
 * - `sessions` counts active days *inside this calendar week only*.
 * - `contributions` sums commits, pull requests and reviews in the same window.
 * - `start`/`end` are date-only keys, useful for scoping a milestone query.
 */
export function summarizeWeek(rows = [], now = new Date()) {
  const byDay = new Map();
  for (const row of rows) {
    const key = dayKey(row);
    if (key) byDay.set(key, row);
  }

  const monday = startOfWeek(now);
  const today = toIsoDay(now);
  const days = WEEKDAY_LABELS.map((label, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    const iso = toIsoDay(date);
    const count = dayTotal(byDay.get(iso));
    return { label, date: iso, count, hit: count > 0, today: iso === today };
  });

  const active = days.filter((day) => day.hit);
  const start = toIsoDay(monday);
  const endDate = new Date(monday);
  endDate.setDate(monday.getDate() + 6);

  return {
    days,
    sessions: active.length,
    contributions: active.reduce((sum, day) => sum + day.count, 0),
    start,
    end: toIsoDay(endDate),
  };
}
