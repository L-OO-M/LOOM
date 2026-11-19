/**
 * Event times — one pinned clock, one shape.
 *
 * A chapter runs on one clock. Rendering `toLocaleString` with no locale or
 * time zone prints the viewer's wall clock, capitalises the meridiem
 * differently per runtime, and drops the zone entirely — which is how
 * "Thu, 29 Apr, 10:00 Am" reached production on an event page with no
 * timezone label anywhere. Everything here is pinned to the chapter's zone
 * (Asia/Kolkata) and shaped deterministically, so an instant reads the same on
 * the public page, the member page, and in a test.
 *
 * This module is the only place allowed to touch Intl for event times.
 * Unit-tested in tests/event-time.test.js.
 */

export const EVENT_TIME_ZONE = "Asia/Kolkata";
export const EVENT_TIME_ZONE_LABEL = "IST";

const timeFormatter = new Intl.DateTimeFormat("en-IN", {
  timeZone: EVENT_TIME_ZONE,
  hour: "numeric",
  minute: "2-digit",
  hour12: true
});

const shortDayFormatter = new Intl.DateTimeFormat("en-IN", {
  timeZone: EVENT_TIME_ZONE,
  weekday: "short",
  day: "numeric",
  month: "short"
});

const longDayFormatter = new Intl.DateTimeFormat("en-IN", {
  timeZone: EVENT_TIME_ZONE,
  weekday: "long",
  day: "numeric",
  month: "short"
});

function toDate(value) {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Split a timestamp into the pieces the pages actually print:
 * `{ day: "Thu, 29 Apr", clock: "10:00", meridiem: "am" }`.
 * Returns null for an unparseable value so callers can print nothing rather
 * than "Invalid Date".
 */
export function eventTimeParts(value) {
  const date = toDate(value);
  if (!date) return null;
  const parts = timeFormatter.formatToParts(date);
  const pick = (type) => parts.find((part) => part.type === type)?.value || "";
  const hour = pick("hour");
  const minute = pick("minute");
  return {
    day: shortDayFormatter.format(date),
    clock: hour ? `${hour}:${minute}` : "",
    // Intl gives "am" on en-IN and "AM" on en-US. Shape, don't inherit.
    meridiem: pick("dayPeriod").toLowerCase()
  };
}

function clockLabel(value) {
  const parts = eventTimeParts(value);
  if (!parts || !parts.clock) return "";
  return `${parts.clock} ${parts.meridiem}`.trim();
}

/** "10:00 am IST" — a single instant, zone attached. */
export function formatEventTime(value) {
  const clock = clockLabel(value);
  return clock ? `${clock} ${EVENT_TIME_ZONE_LABEL}` : "";
}

/** "10:00 am – 4:00 pm IST" — one zone label closes the range. */
export function formatEventTimeRange(start, end) {
  const from = clockLabel(start);
  if (!from) return "";
  const to = clockLabel(end);
  return to ? `${from} – ${to} ${EVENT_TIME_ZONE_LABEL}` : `${from} ${EVENT_TIME_ZONE_LABEL}`;
}

/** "Thu, 29 Apr" — `long: true` gives "Thursday, 29 Apr". */
export function eventDayLabel(value, { long = false } = {}) {
  const date = toDate(value);
  if (!date) return "";
  return (long ? longDayFormatter : shortDayFormatter).format(date);
}

/** "Thu, 29 Apr · 10:00 am IST" — day, then the clock. */
export function startsAtLabel(value) {
  const day = eventDayLabel(value);
  if (!day) return "";
  const time = formatEventTime(value);
  return time ? `${day} · ${time}` : day;
}

/** "Thu, 29 Apr · 10:00 am – 4:00 pm IST" — the WHEN block on a detail page. */
export function formatEventWhen(start, end, { long = false } = {}) {
  const day = eventDayLabel(start, { long });
  if (!day) return "";
  const range = formatEventTimeRange(start, end);
  return range ? `${day} · ${range}` : day;
}
