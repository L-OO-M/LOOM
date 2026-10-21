/**
 * Collective Master Planner 2026-27 — pure helpers.
 *
 * Presentation/derivation only: no DB, no session. The student planner page
 * fetches `planner_weeks`, `planner_sessions` and planner-linked `events`,
 * serializes them, and lets this module answer "what is on, when, for whom".
 *
 * Unit-tested in tests/planner.test.js.
 *
 * Time model: every row stores a week (Mon-Sun) plus a day and a local
 * (Asia/Kolkata) start/end time. Dates are derived with UTC arithmetic so a
 * server in any timezone produces the same calendar day.
 */

import { domainLabel } from "./domains";

export const PLANNER_YEAR = "2026-27";
export const PLANNER_START_DATE = "2026-10-19";
export const PLANNER_RELAXATION_START = "2026-11-20";
export const PLANNER_RELAXATION_END = "2026-12-20";
export const PLANNER_TIMEZONE = "Asia/Kolkata";

/** Canonical order of the six technical wings in the shared calendar. */
export const PLANNER_TRACKS = [
  { key: "dsa", label: "DSA", short: "DSA" },
  { key: "ai_ml", label: "AI / ML", short: "AI" },
  { key: "cybersecurity", label: "Cybersecurity", short: "Cyber" },
  { key: "web", label: "Web Development", short: "Web" },
  { key: "embedded", label: "Hardware Engineering", short: "Hardware" },
  { key: "blockchain", label: "Web3 / Blockchain", short: "Web3" },
];

export const GENERAL_TRACK = "general";

export function trackLabel(key) {
  if (!key || key === GENERAL_TRACK) return "Society";
  const known = PLANNER_TRACKS.find((t) => t.key === key);
  if (known) return known.label;
  return domainLabel(key) || key;
}

/** Normalize a Date | string into a YYYY-MM-DD key. */
export function isoDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const s = String(value);
  return s.length >= 10 ? s.slice(0, 10) : s;
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

/** Add whole days to a YYYY-MM-DD key, UTC-safe. */
export function addDays(dateIso, days) {
  const iso = isoDate(dateIso);
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}

export function isRelaxationDate(dateIso) {
  const iso = isoDate(dateIso);
  if (!iso) return false;
  return iso >= PLANNER_RELAXATION_START && iso <= PLANNER_RELAXATION_END;
}

/**
 * The real calendar date of a session, derived from its week's Monday plus
 * `day_of_week` (1 = Monday ... 7 = Sunday). Returns null when the session has
 * no day/time, which is how deferred/paused items are stored.
 */
export function sessionDate(week, session) {
  const start = isoDate(week?.starts_on);
  const day = Number(session?.day_of_week);
  if (!start || !Number.isFinite(day) || day < 1 || day > 7) return null;
  return addDays(start, day - 1);
}

/** ISO local datetime (no offset) for ICS / display, e.g. 20261019T170000. */
export function sessionLocalStamp(dateIso, time) {
  const iso = isoDate(dateIso);
  if (!iso) return null;
  const t = String(time || "").slice(0, 8) || "00:00:00";
  const [h, mi, s] = t.split(":");
  return `${iso.replace(/-/g, "")}T${pad2(h || 0)}${pad2(mi || 0)}${pad2(s || 0)}`;
}

/** A session is "deferred" when it is explicitly paused, or sits in the window. */
export function isDeferred(week, session) {
  if (session?.delivery_mode === "deferred") return true;
  const date = sessionDate(week, session);
  return isRelaxationDate(date);
}

/** A session renders live only when it has a date, is not deferred, and is live/recorded. */
export function isScheduled(session, week) {
  if (!sessionDate(week, session)) return false;
  if (isDeferred(week, session)) return false;
  return ["live", "recorded", "async", "project", "assessment", "showcase"].includes(session?.delivery_mode);
}

export function formatWeekRange(week) {
  const a = isoDate(week?.starts_on);
  const b = isoDate(week?.ends_on);
  if (!a || !b) return "";
  return `${shortDate(a)} – ${shortDate(b)}`;
}

export function shortDate(dateIso) {
  const iso = isoDate(dateIso);
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${d} ${months[m - 1]} ${y}`;
}

/** Which track owns a session row. Society coordination rows are `general`. */
export function sessionTrack(session) {
  return session?.track_domain || GENERAL_TRACK;
}

export function filterSessions(sessions, track) {
  if (!track || track === "all") return sessions || [];
  return (sessions || []).filter((s) => sessionTrack(s) === track);
}

export function sessionsForWeek(sessions, weekNumber) {
  return (sessions || [])
    .filter((s) => Number(s.week_number) === Number(weekNumber))
    .sort((a, b) => (a.day_of_week ?? 0) - (b.day_of_week ?? 0) || (a.sort_order ?? 0) - (b.sort_order ?? 0));
}

/**
 * Merge planner sessions and society events into one dated list. Events carry
 * an absolute `starts_at`; sessions derive theirs from the week.
 */
export function buildCalendarItems({ weeks = [], sessions = [], events = [] } = {}) {
  const weekByNumber = new Map(weeks.map((w) => [Number(w.week_number), w]));
  const items = [];

  for (const session of sessions) {
    const week = weekByNumber.get(Number(session.week_number));
    const date = sessionDate(week, session);
    if (!date) continue;
    const deferred = isDeferred(week, session);
    items.push({
      kind: "session",
      id: session.id,
      date,
      startsTime: session.starts_time ? String(session.starts_time).slice(0, 5) : null,
      endsTime: session.ends_time ? String(session.ends_time).slice(0, 5) : null,
      track: sessionTrack(session),
      ref: session.curriculum_ref || null,
      title: session.title,
      sessionKind: session.session_kind,
      deliveryMode: deferred ? "deferred" : session.delivery_mode,
      deferred,
      required: !!session.is_required,
      weekNumber: Number(session.week_number),
      notes: session.notes || "",
      relaxation: deferred || !!week?.is_relaxation,
    });
  }

  for (const event of events) {
    const date = isoDate(event.starts_at);
    if (!date) continue;
    items.push({
      kind: "event",
      id: event.id,
      date,
      startsTime: event.starts_at ? localTimeOf(event.starts_at) : null,
      endsTime: event.ends_at ? localTimeOf(event.ends_at) : null,
      track: GENERAL_TRACK,
      ref: event.planner_ref || null,
      title: event.title,
      sessionKind: event.planner_kind || event.event_type || "event",
      deliveryMode: "live",
      deferred: false,
      required: false,
      weekNumber: event.planner_week ? Number(event.planner_week) : null,
      notes: event.description || "",
      relaxation: false,
      href: event.id ? `/student/events/${event.id}` : null,
    });
  }

  return items.sort((a, b) => a.date.localeCompare(b.date) || String(a.startsTime || "").localeCompare(String(b.startsTime || "")));
}

/** Local (Asia/Kolkata) time of an absolute timestamp, as HH:MM. */
export function localTimeOf(value) {
  if (!value) return null;
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return null;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: PLANNER_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(dt);
}

export function upcomingItems(items, now = new Date()) {
  const today = isoDate(now);
  return (items || []).filter((i) => !i.deferred && i.date >= today);
}

export function nextItem(items, now = new Date()) {
  return upcomingItems(items, now)[0] || null;
}

/**
 * In-app alerts the planner can render without a scheduler: the relaxation
 * window state and the next dated item.
 */
export function plannerAlerts({ weeks = [], items = [], now = new Date() } = {}) {
  const today = isoDate(now);
  const active = today >= PLANNER_RELAXATION_START && today <= PLANNER_RELAXATION_END;
  const before = today < PLANNER_RELAXATION_START;
  const daysUntil = before ? dayDiff(today, PLANNER_RELAXATION_START) : 0;
  const relaxationWeek = weeks.find((w) => w.is_relaxation) || null;

  return {
    relaxation: {
      active,
      upcoming: before,
      daysUntil,
      startsOn: PLANNER_RELAXATION_START,
      endsOn: PLANNER_RELAXATION_END,
      weekNumber: relaxationWeek ? Number(relaxationWeek.week_number) : null,
      label: active
        ? "Relaxation window — no workshops or live sessions until 20 Dec 2026."
        : before
          ? `Relaxation window opens 20 Nov 2026 (${daysUntil} day${daysUntil === 1 ? "" : "s"} away).`
          : "Relaxation window has ended. Curriculum resumes.",
    },
    next: nextItem(items, now),
  };
}

function dayDiff(fromIso, toIso) {
  const a = Date.parse(`${fromIso}T00:00:00Z`);
  const b = Date.parse(`${toIso}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86400000);
}

function icsEscape(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

function icsFold(line) {
  if (line.length <= 74) return line;
  let out = line.slice(0, 74);
  let rest = line.slice(74);
  while (rest.length) {
    out += `\r\n ${rest.slice(0, 73)}`;
    rest = rest.slice(73);
  }
  return out;
}

/**
 * RFC 5545 calendar for the shared planner. Uses floating local IST stamps with
 * TZID so every member's client shows the intended IST slot.
 */
export function toIcs({ weeks = [], sessions = [], events = [], track = "all", now = new Date() } = {}) {
  const weekByNumber = new Map(weeks.map((w) => [Number(w.week_number), w]));
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//LOOM//Collective Master Planner 2026-27//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${icsEscape(PLANNER_YEAR === "2026-27" ? "LOOM Collective Planner 2026-27" : "LOOM Planner")}`,
    `X-WR-TIMEZONE:${PLANNER_TIMEZONE}`,
    "BEGIN:VTIMEZONE",
    `TZID:${PLANNER_TIMEZONE}`,
    "X-LIC-LOCATION:Asia/Kolkata",
    "BEGIN:STANDARD",
    "TZOFFSETFROM:+0530",
    "TZOFFSETTO:+0530",
    "TZNAME:IST",
    "DTSTART:19700101T000000",
    "END:STANDARD",
    "END:VTIMEZONE",
  ];

  const wanted = (s) => track === "all" || sessionTrack(s) === track;

  for (const session of sessions.filter(wanted)) {
    const week = weekByNumber.get(Number(session.week_number));
    const date = sessionDate(week, session);
    if (!date || isDeferred(week, session)) continue;
    const start = sessionLocalStamp(date, session.starts_time || "00:00:00");
    const end = sessionLocalStamp(date, session.ends_time || session.starts_time || "00:00:00");
    if (!start) continue;
    const label = trackLabel(sessionTrack(session));
    lines.push(
      "BEGIN:VEVENT",
      icsFold(`UID:planner-${session.id}@loom`),
      `DTSTAMP:${stamp}`,
      `DTSTART;TZID=${PLANNER_TIMEZONE}:${start}`,
      `DTEND;TZID=${PLANNER_TIMEZONE}:${end}`,
      icsFold(`SUMMARY:${icsEscape(`${label} · ${session.curriculum_ref ? `${session.curriculum_ref} ` : ""}${session.title}`)}`),
      icsFold(`DESCRIPTION:${icsEscape(session.notes || session.description || "")}`),
      `STATUS:CONFIRMED`,
      "END:VEVENT"
    );
  }

  for (const event of events) {
    const start = new Date(event.starts_at);
    if (Number.isNaN(start.getTime())) continue;
    const end = event.ends_at ? new Date(event.ends_at) : new Date(start.getTime() + 90 * 60000);
    lines.push(
      "BEGIN:VEVENT",
      icsFold(`UID:event-${event.id}@loom`),
      `DTSTAMP:${stamp}`,
      `DTSTART;TZID=${PLANNER_TIMEZONE}:${localIcsStamp(start)}`,
      `DTEND;TZID=${PLANNER_TIMEZONE}:${localIcsStamp(end)}`,
      icsFold(`SUMMARY:${icsEscape(`Society · ${event.title}`)}`),
      icsFold(`DESCRIPTION:${icsEscape(event.description || "")}`),
      event.location ? icsFold(`LOCATION:${icsEscape(event.location)}`) : null,
      "STATUS:CONFIRMED",
      "END:VEVENT"
    );
  }

  lines.push("END:VCALENDAR");
  return `${lines.filter((l) => l !== null).join("\r\n")}\r\n`;
}

function localIcsStamp(dt) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: PLANNER_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(dt);
  const get = (type) => parts.find((p) => p.type === type)?.value || "00";
  return `${get("year")}${get("month")}${get("day")}T${get("hour")}${get("minute")}${get("second")}`;
}
