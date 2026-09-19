// Proof record presentation helpers — pure, no I/O, no secrets.
// Shared by the server page (labels, grouping, next-proof derivation) and
// unit-tested in tests/proof-format.test.js. Mirrors the title logic in
// app/api/credentials/route.js so both surfaces name achievements the same way.

export const MILESTONE_LABELS = {
  "roadmap-first-step": "First step",
  "roadmap-halfway": "Halfway there",
  "roadmap-complete": "Path complete"
};

export const LEVEL_LABELS = {
  bronze: "Bronze",
  silver: "Silver",
  gold: "Gold"
};

// Filter categories for the record. Manual + contest achievements only ever
// reach the ledger through an admin of the student's chapter, so both read
// as chapter-issued. Anything unrecognised stays unfiltered, never invented.
export function sourceKey(a) {
  if (!a) return "chapter";
  if (a.source_type === "roadmap") return "roadmap";
  if (a.source_type === "oss") return "oss";
  return "chapter";
}

export const SOURCE_LABELS = {
  roadmap: "Roadmap",
  oss: "Open source",
  chapter: "Chapter"
};

export function sourceLabel(a) {
  return SOURCE_LABELS[sourceKey(a)];
}

export function labelFor(a) {
  if (!a) return "Achievement";
  if (a.badge_name) return a.badge_name;
  if (a.source_type === "oss") return `OSS · ${a.source_ref || "contribution"}`;
  if (a.source_type === "contest") return `Contest · ${a.source_ref || "challenge"}`;
  if (a.source_type === "roadmap") return `Roadmap · ${MILESTONE_LABELS[a.source_ref] || a.source_ref || "milestone"}`;
  return "Achievement";
}

export function levelLabel(level) {
  return LEVEL_LABELS[level] || null;
}

// Group share links under their achievement without dropping any.
// (A Map keyed by achievement_id would silently keep only the last link.)
export function groupLinksByAchievement(credentials) {
  const groups = new Map();
  for (const c of credentials || []) {
    const key = c.achievement_id || "__unlinked__";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(c);
  }
  return groups;
}

export function linksFor(groups, achievementId) {
  if (!groups) return [];
  return groups.get(achievementId) || [];
}

// Evidence links are stored as free text. Internal LOOM paths stay in-app;
// anything else opens externally. No URL, no link — never a fake one.
export function evidenceKind(url) {
  if (!url || typeof url !== "string" || !url.trim()) return null;
  return url.trim().startsWith("/") ? "internal" : "external";
}

// The honest "what's next": the smallest roadmap threshold above `done`.
// Thresholds mirror lib/mentorship milestoneFor (first node, half the path,
// the whole path). Returns null when nothing can be derived.
export function nextMilestone(done, total) {
  if (!total || total < 1 || done == null || done < 0) {
    return total > 0 && (done || 0) === 0
      ? { key: "roadmap-first-step", label: "First step", remaining: 1 }
      : null;
  }
  if (done >= total) return null;
  const thresholds = [
    { key: "roadmap-first-step", label: "First step", at: 1 },
    { key: "roadmap-halfway", label: "Halfway there", at: Math.max(2, Math.ceil(total / 2)) },
    { key: "roadmap-complete", label: "Path complete", at: total }
  ];
  for (const t of thresholds) {
    if (done < t.at) return { key: t.key, label: t.label, remaining: t.at - done };
  }
  return null;
}

export function formatShortDate(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric" });
}
