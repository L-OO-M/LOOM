// Mentor service — pure helpers for discovery, availability, and booking.
// Database rows stay thin; every decision here is unit-testable without a DB.

export const EXPERTISE = [
  "Web Development", "Backend Development", "Data Science", "Machine Learning",
  "Artificial Intelligence", "Cyber Security", "Cloud Computing", "DevOps",
  "UI/UX", "DSA", "Career Guidance", "Entrepreneurship",
];

export const SORTS = [
  { value: "recommended", label: "Recommended" },
  { value: "experienced", label: "Most Experienced" },
  { value: "rated", label: "Highest Rated" },
  { value: "active", label: "Most Sessions" },
];

export const SESSION_TYPES = [
  { minutes: 30, label: "30 minute session" },
  { minutes: 60, label: "60 minute session" },
];

// "React, Node.js" -> ["React", "Node.js"]. Expertise + skills merged.
export function parseSkills(...fields) {
  const out = [];
  for (const f of fields) {
    for (const part of String(f || "").split(",")) {
      const s = part.trim();
      if (s && !out.some((x) => x.toLowerCase() === s.toLowerCase())) out.push(s);
    }
  }
  return out.slice(0, 12);
}

export function inr(amount) {
  if (amount == null) return null;
  return `₹${Number(amount).toLocaleString("en-IN")}`;
}

// Price for a session length from an hourly rate. Rounds to whole rupees.
export function priceFor(hourlyRate, minutes) {
  if (hourlyRate == null) return null;
  return Math.round((Number(hourlyRate) * Number(minutes)) / 60);
}

function haystack(m) {
  return [m.mentor_name, m.headline, m.expertise, m.skills, m.bio].filter(Boolean).join(" ").toLowerCase();
}

export function matchesQuery(m, q) {
  const needle = String(q || "").trim().toLowerCase();
  if (!needle) return true;
  return needle.split(/\s+/).every((w) => haystack(m).includes(w));
}

export function matchesExpertise(m, expertise) {
  if (!expertise || expertise === "all") return true;
  return haystack(m).includes(String(expertise).toLowerCase());
}

export function matchesExperience(m, band) {
  if (!band || band === "any") return true;
  const y = m.experience_years;
  if (y == null) return false;
  if (band === "1-3") return y >= 1 && y <= 3;
  if (band === "3-5") return y > 3 && y <= 5;
  if (band === "5-10") return y > 5 && y <= 10;
  if (band === "10+") return y > 10;
  return true;
}

// Availability bucket from a mentor's weekly schedule rows
// [{ day_of_week, start_time, end_time }]. Pure wrt the passed "now".
export function availabilityBucket(schedule, now = new Date()) {
  if (!schedule || schedule.length === 0) return "none";
  const today = now.getDay();
  const hasDay = (d) => schedule.some((s) => Number(s.day_of_week) === d);
  if (hasDay(today)) return "today";
  for (let i = 1; i <= 6; i++) {
    if (hasDay((today + i) % 7)) return "week";
  }
  return "none";
}

export function availabilityLabel(bucket) {
  if (bucket === "today") return "Available today";
  if (bucket === "week") return "Available this week";
  return "Schedule not set";
}

export function matchesAvailability(m, bucket, schedule) {
  if (!bucket || bucket === "all") return true;
  const b = availabilityBucket(schedule, new Date());
  if (bucket === "now") return !!m.available && (b === "today" || b === "week");
  if (bucket === "today") return b === "today";
  if (bucket === "week") return b === "today" || b === "week";
  return true;
}

export function sortMentors(list, sort) {
  const arr = [...list];
  if (sort === "experienced") arr.sort((a, b) => (b.experience_years || 0) - (a.experience_years || 0));
  else if (sort === "rated") arr.sort((a, b) => Number(b.avg_rating || 0) - Number(a.avg_rating || 0) || Number(b.review_count || 0) - Number(a.review_count || 0));
  else if (sort === "active") arr.sort((a, b) => Number(b.session_count || 0) - Number(a.session_count || 0));
  else arr.sort((a, b) => Number(b.is_verified || false) - Number(a.is_verified || false) || Number(b.avg_rating || 0) - Number(a.avg_rating || 0));
  return arr;
}

// "10:00" + 30min -> "10:30". Times are HH:MM 24h strings.
export function addMinutes(hhmm, mins) {
  const [h, m] = String(hhmm).split(":").map(Number);
  const total = h * 60 + m + Number(mins);
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function toDisplay(hhmm) {
  let [h, m] = String(hhmm).split(":").map(Number);
  const ap = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${String(m).padStart(2, "0")} ${ap}`;
}

// Day schedule -> bookable slot start times for one date.
// bookedTimes: ["10:00", ...] already taken (requested/scheduled sessions).
export function slotsForDate(dayRows, bookedTimes, duration = 30) {
  const booked = new Set(bookedTimes || []);
  const slots = [];
  for (const row of dayRows || []) {
    let t = row.start_time;
    let guard = 0;
    while (t < row.end_time && guard++ < 48) {
      const end = addMinutes(t, duration);
      if (end > row.end_time) break;
      slots.push({ time: t, label: toDisplay(t), available: !booked.has(t) });
      t = addMinutes(t, duration);
    }
  }
  return slots;
}

// Next 14 bookable dates for a mentor. Each: { iso, label, weekday }.
export function nextBookableDates(schedule, days = 14, now = new Date()) {
  const have = new Set((schedule || []).map((s) => Number(s.day_of_week)));
  const out = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() + i);
    if (have.has(d.getDay())) {
      out.push({
        iso: d.toISOString().slice(0, 10),
        label: d.toLocaleDateString("en-IN", { month: "short", day: "numeric" }),
        weekday: d.toLocaleDateString("en-IN", { weekday: "short" }),
      });
    }
    if (out.length >= 7) break;
  }
  return out;
}

// Booking validation. Returns { ok, error } — never throws.
export function validateBooking({ mentor, dateIso, time, duration, bookedTimes }) {
  if (!mentor) return { ok: false, error: "Mentor not found." };
  if (!mentor.available) return { ok: false, error: "This mentor is currently paused." };
  if (!SESSION_TYPES.some((s) => s.minutes === Number(duration))) return { ok: false, error: "Choose a session length." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso || "")) return { ok: false, error: "Choose a valid date." };
  const day = new Date(`${dateIso}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (Number.isNaN(day.getTime()) || day < today) return { ok: false, error: "The date must be today or later." };
  if (!/^\d{2}:\d{2}$/.test(time || "")) return { ok: false, error: "Choose a time slot." };
  if ((bookedTimes || []).includes(time)) return { ok: false, error: "That slot was just taken. Pick another." };
  return { ok: true, error: null };
}

export function toScheduledAt(dateIso, time) {
  return new Date(`${dateIso}T${time}:00`).toISOString();
}

// ---- Server helpers (tenant-filtered; callers pass tenantId) ----

export async function enrichMentors(sql, mentors) {
  const out = [];
  for (const m of mentors || []) {
    const [agg] = await sql`
      SELECT (SELECT COUNT(*)::int FROM mentor_sessions s WHERE s.mentor_id = ${m.user_id}) AS sessions,
             (SELECT COUNT(*)::int FROM mentor_reviews r WHERE r.mentor_id = ${m.user_id}) AS reviews,
             (SELECT COALESCE(AVG(rating),0)::numeric FROM mentor_reviews r WHERE r.mentor_id = ${m.user_id}) AS rating
    `;
    out.push({
      ...m,
      session_count: agg?.sessions ?? 0,
      review_count: agg?.reviews ?? 0,
      avg_rating: Number(agg?.rating ?? 0),
    });
  }
  return out;
}

export async function availabilityMap(sql, mentorUserIds) {
  const map = {};
  for (const id of mentorUserIds || []) map[id] = [];
  if (!mentorUserIds || mentorUserIds.length === 0) return map;
  const rows = await sql`
    SELECT mentor_id, day_of_week, start_time, end_time FROM mentor_availability
    WHERE mentor_id = ANY(${mentorUserIds}) ORDER BY day_of_week, start_time
  `;
  for (const r of rows) (map[r.mentor_id] = map[r.mentor_id] || []).push(r);
  return map;
}

// Start times (HH:MM) already taken on one date for a mentor.
export async function bookedTimesFor(sql, mentorUserId, dateIso) {
  const rows = await sql`
    SELECT scheduled_at FROM mentor_sessions
    WHERE mentor_id = ${mentorUserId} AND status IN ('requested','scheduled')
      AND scheduled_at::date = ${dateIso}::date
  `;
  return rows
    .map((r) => (r.scheduled_at ? new Date(r.scheduled_at).toISOString().slice(11, 16) : null))
    .filter(Boolean);
}
