// Small, pure helpers shared by both profile surfaces. Keeping these out of the
// page files makes the folio number and proof copy testable without a database.

import { REPUTATION_WEIGHTS } from "@/lib/reputation";

export function folioNumber(username = "") {
  const s = String(username || "").toLowerCase();
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 33 + s.charCodeAt(i)) >>> 0;
  return String((h % 899) + 100);
}

export function proofCountWords(rep = {}) {
  return [
    rep.solutions > 0 ? `${rep.solutions} solution${rep.solutions === 1 ? "" : "s"}` : null,
    rep.wikiPages > 0 ? `${rep.wikiPages} wiki page${rep.wikiPages === 1 ? "" : "s"}` : null,
    rep.eventsAttended > 0 ? `${rep.eventsAttended} event${rep.eventsAttended === 1 ? "" : "s"}` : null
  ].filter(Boolean);
}

export function proofWeightRows(rep = {}) {
  const rows = [
    { key: "achievements", label: "Achievements", n: rep.achievements || 0, weight: REPUTATION_WEIGHTS.achievement },
    { key: "ossVerified", label: "Verified merges", n: rep.ossVerified || 0, weight: REPUTATION_WEIGHTS.ossVerified },
    { key: "solutions", label: "Answers", n: rep.solutions || 0, weight: REPUTATION_WEIGHTS.solution },
    { key: "wikiPages", label: "Wiki pages", n: rep.wikiPages || 0, weight: REPUTATION_WEIGHTS.wikiPage },
    { key: "eventsAttended", label: "Events attended", n: rep.eventsAttended || 0, weight: REPUTATION_WEIGHTS.eventAttended },
    { key: "endorsements", label: "Endorsements", n: rep.endorsements || 0, weight: REPUTATION_WEIGHTS.endorsement }
  ];
  return rows.filter((r) => r.n > 0).map((r) => ({ ...r, total: r.n * r.weight }));
}

export function roleLabel(role) {
  return ({
    student: "Student",
    core: "Core",
    dept_lead: "Head",
    vertical_lead: "Vertical Lead",
    admin: "Admin",
    platform_admin: "Platform Admin"
  })[role] || role || "Member";
}

export function monthYear(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", { month: "short", year: "numeric" });
}
