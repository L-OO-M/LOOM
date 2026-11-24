/**
 * The long-form event page, as data.
 *
 * A hackathon brief is not a workshop description: it needs an overview, the
 * problem statements, prizes, a schedule, rules, a FAQ and links. Storing those
 * as columns would mean a migration per new block, so an event carries an
 * ordered list of typed sections instead. This module is the only place that
 * defines the vocabulary, validates input and normalizes rows for rendering.
 *
 * Pure: no DB, no session, no React. Unit-tested in tests/event-page.test.js.
 */

export const EVENT_SECTION_TYPES = [
  {
    type: "overview",
    label: "Full overview",
    hint: "The story: why this event exists and what a participant walks away with."
  },
  {
    type: "problem",
    label: "Problem statements",
    hint: "One bullet per problem. Add a link when the statement lives in a document."
  },
  {
    type: "prizes",
    label: "Prizes",
    hint: "Track prizes, certificates, and what each place actually receives."
  },
  {
    type: "schedule",
    label: "Schedule",
    hint: "One bullet per milestone, with the time written out."
  },
  {
    type: "rules",
    label: "Rules & eligibility",
    hint: "Team size, eligibility, and the hard boundaries people must respect."
  },
  {
    type: "faq",
    label: "FAQ",
    hint: "One question per bullet, answered on the same line or in the body."
  },
  {
    type: "resources",
    label: "Resources",
    hint: "Datasets, starter repositories, reading and links people need."
  }
];

const TYPE_MAP = new Map(EVENT_SECTION_TYPES.map((entry) => [entry.type, entry]));

/**
 * What a given event type usually needs, in reading order. The builder offers
 * these as one-click starter blocks; an author can still add, remove and
 * reorder anything. Keeping this here (not in the component) means the same
 * vocabulary is testable and could seed a future create-time default.
 */
export const EVENT_PAGE_TEMPLATES = {
  hackathon: {
    label: "Hackathon",
    note: "Problem statements, prizes and the run-of-show are what a hackathon page is judged on.",
    types: ["overview", "problem", "prizes", "schedule", "rules", "faq", "resources"]
  },
  workshop: {
    label: "Workshop",
    note: "A workshop page needs the outcome, the timetable and the material people bring or take home.",
    types: ["overview", "schedule", "resources", "faq"]
  },
  talk: {
    label: "Talk",
    note: "A talk page is short: who is speaking, what the room leaves with, and the reading list.",
    types: ["overview", "resources", "faq"]
  },
  contest: {
    label: "Contest",
    note: "A contest page is judged on prizes, timing and the rules nobody may claim they missed.",
    types: ["overview", "prizes", "schedule", "rules", "faq"]
  },
  mentoring: {
    label: "Mentoring",
    note: "A mentoring page sets expectations: cadence, who it is for, and how to prepare.",
    types: ["overview", "schedule", "resources", "faq"]
  }
};
const MAX_SECTIONS = 12;
const MAX_BULLETS = 20;
const MAX_LINKS = 10;

export function sectionLabel(type) {
  return TYPE_MAP.get(type)?.label || "Section";
}

function text(value, max) {
  return String(value ?? "").trim().slice(0, max);
}

/** https links only — a page section must never smuggle a javascript: URL. */
export function safeLink(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password) return "";
    return url.toString();
  } catch {
    return "";
  }
}

/**
 * A cover image is either a hosted https image or a path inside this app
 * (`/events/...`). Anything else — data:, javascript:, protocol-relative — is
 * dropped instead of rendered.
 */
export function safeImage(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (raw.startsWith("/") && !raw.startsWith("//")) return raw.slice(0, 500);
  return safeLink(raw) || null;
}

/**
 * Validate and normalize the ordered sections a lead submits.
 *
 * Unknown types fall back to `overview` rather than disappearing: the copy the
 * author typed is more valuable than a strict enum. Empty sections are dropped,
 * so "Add section" followed by nothing does not publish a blank heading.
 */
export function sanitizeSections(input) {
  if (!Array.isArray(input)) return [];
  const sections = [];
  for (const raw of input.slice(0, MAX_SECTIONS)) {
    if (!raw || typeof raw !== "object") continue;
    const type = TYPE_MAP.has(raw.type) ? raw.type : "overview";
    const heading = text(raw.heading, 120);
    const body = text(raw.body, 5000);
    const bullets = Array.isArray(raw.bullets)
      ? raw.bullets.map((bullet) => text(bullet, 300)).filter(Boolean).slice(0, MAX_BULLETS)
      : [];
    const links = Array.isArray(raw.links)
      ? raw.links
          .slice(0, MAX_LINKS)
          .map((link) => ({ label: text(link?.label, 80), url: safeLink(link?.url) }))
          .filter((link) => link.label && link.url)
      : [];
    if (!body && bullets.length === 0 && links.length === 0) continue;
    sections.push({
      id: text(raw.id, 60) || `section-${sections.length + 1}`,
      type,
      heading: heading || sectionLabel(type),
      body,
      bullets,
      links
    });
  }
  return sections;
}

/** Read a stored jsonb column (object or string) into render-ready sections. */
export function sectionsFromRow(value) {
  if (!value) return [];
  if (typeof value === "string") {
    try {
      return sanitizeSections(JSON.parse(value));
    } catch {
      return [];
    }
  }
  return sanitizeSections(value);
}

/**
 * Validate the page-level fields in one place, shared by the API and any UI
 * that wants to warn before saving.
 */
export function sanitizeEventPage({ tagline, coverImageUrl, sections } = {}) {
  return {
    tagline: text(tagline, 160) || null,
    coverImageUrl: safeImage(coverImageUrl),
    sections: sanitizeSections(sections)
  };
}
