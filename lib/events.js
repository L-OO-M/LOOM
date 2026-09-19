/**
 * Events — pure helpers for the Student Events experience.
 *
 * Everything here is presentation/derivation logic over rows the server
 * already fetched. No DB, no session. Unit-tested in tests/events.test.js.
 */

export const EVENT_TYPES = ["workshop", "hackathon", "talk", "mentoring", "contest"];

export const TYPE_LABEL = {
  workshop: "Workshop",
  hackathon: "Hackathon",
  talk: "Talk",
  mentoring: "Mentoring",
  contest: "Contest"
};

/** Statuses a student may ever see. `proposed` stays in the lead/admin queue. */
export const VISIBLE_STATUSES = ["upcoming", "live"];

/** Past statuses a student may see in history. Never includes proposed/cancelled. */
export const HISTORY_STATUSES = ["upcoming", "live", "past"];

/**
 * Hours after starts_at during which an event still reads as
 * upcoming/live rather than past. Mirrors the SQL boundary
 * `starts_at >= now() - interval '2 hours'` used by the list queries.
 */
export const LIVE_WINDOW_HOURS = 2;

export function liveWindowMs() {
  return LIVE_WINDOW_HOURS * 3600 * 1000;
}

/** Normalize the `?scope=` query param. Unknown values fall back to upcoming. */
export function resolveScope(raw) {
  if (raw === "past") return "past";
  if (raw === "registered") return "registered";
  return "upcoming";
}

/** True when the row's status may be shown to a student. */
export function isStudentVisible(event) {
  return VISIBLE_STATUSES.includes(event?.status);
}

/** True when the event started longer than the live window ago. */
export function isPastEvent(startsAt, now = Date.now()) {
  const t = new Date(startsAt).getTime();
  if (Number.isNaN(t)) return false;
  return t < now - liveWindowMs();
}

function isActiveRegistration(mine) {
  return !!mine && mine.status !== "cancelled";
}

/**
 * Single display state for an event + the viewer's registration.
 * Priority: attended > you're in > past > full > live > open.
 * Returns { key, label, tone } where tone feeds StatusPill.
 */
export function displayState(event, mine, now = Date.now()) {
  const registered = isActiveRegistration(mine);
  if (mine?.status === "attended") return { key: "attended", label: "Attended", tone: "live" };
  if (registered) return { key: "in", label: "You're in", tone: "live" };
  if (isPastEvent(event?.starts_at, now) || event?.status === "past") {
    return { key: "past", label: "Past", tone: "" };
  }
  const seats = Number(event?.seats_taken ?? 0);
  const capacity = event?.capacity == null ? null : Number(event.capacity);
  if (capacity && seats >= capacity) return { key: "full", label: "Full", tone: "" };
  if (event?.status === "live") return { key: "live", label: "Live", tone: "live" };
  return { key: "open", label: "Open", tone: "" };
}

/** True when the Register button should be disabled for capacity. */
export function isFull(event, mine) {
  if (isActiveRegistration(mine)) return false;
  const seats = Number(event?.seats_taken ?? 0);
  const capacity = event?.capacity == null ? null : Number(event.capacity);
  return !!capacity && seats >= capacity;
}

/**
 * Lightweight in-memory filtering over the already-fetched scope rows.
 * `type`: "all" or one of EVENT_TYPES. `domain`: "all" or an event.domain value.
 */
export function filterEvents(events, { type = "all", domain = "all" } = {}) {
  return (events || []).filter((e) => {
    if (type !== "all" && e?.event_type !== type) return false;
    if (domain !== "all" && (e?.domain || "general") !== domain) return false;
    return true;
  });
}

/** Unique sorted domain list for the domain filter. Always includes general when present. */
export function collectDomains(events) {
  const set = new Set();
  for (const e of events || []) {
    if (typeof e?.domain === "string" && e.domain.trim()) set.add(e.domain.trim());
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

/**
 * One contextual "next step" bridge per event. Navigation only — these
 * systems share no database link with events.
 */
export function nextStepFor(event) {
  if (!event) return null;
  if (event.event_type === "mentoring") {
    return { href: "/student/mentorship", label: "Meet the guides" };
  }
  if (event.event_type === "hackathon" || event.event_type === "contest") {
    return { href: `/student/projects/new?event=${event.id}`, label: "Ship something from this event" };
  }
  if (event.domain && event.domain !== "general") {
    return { href: `/student/roadmap?domain=${encodeURIComponent(event.domain)}`, label: "Keep learning" };
  }
  return { href: `/student/community/forums?event=${event.id}`, label: "Discuss with the community" };
}
