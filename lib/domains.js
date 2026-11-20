// Single source of truth for skill-domain identity: label, ordering and
// ownership. Previously duplicated in RoadmapHero / RoadmapJourney /
// RoadmapTabs, which is why `embedded` was missing everywhere and why the
// roadmap rendered as one undifferentiated 328-node graph.
//
// Department slugs (from load/seed-departments.js) map to these domains
// for technical departments. Non-technical departments don't have roadmap domains.

export const DOMAIN_LABEL = {
  ai_ml: "AI / ML",
  web: "Web Development",
  cybersecurity: "Cybersecurity",
  dsa: "DSA",
  blockchain: "Blockchain",
  embedded: "Embedded & Hardware",
  backend: "Backend",
  devops: "DevOps",
};

// Departments a member can actually enroll in (see load/seed-departments.js).
// These are the "own" tracks: each roadmap belongs to exactly one.
// Backend and DevOps are SHARED domains — they appear inside other domains' roadmaps
// but don't have independent departments or roadmaps.
export const PRIMARY_DOMAINS = ["ai_ml", "web", "cybersecurity", "dsa", "blockchain", "embedded"];

// One-line descriptions and monograms for the onboarding picker. Kept next to
// the keys so a new primary domain cannot be added without copy and a glyph.
export const DOMAIN_BLURB = {
  ai_ml: "Models, data, and the maths that make them work.",
  web: "Interfaces, browsers, and the product layer.",
  cybersecurity: "Offence and defence: recon, exploitation, hardening.",
  dsa: "Structures, algorithms, and problem solving under pressure.",
  blockchain: "Contracts, chains, and decentralised systems.",
  embedded: "Firmware, microcontrollers, and hardware bring-up.",
  backend: "APIs, services, and the data layer behind them.",
  devops: "Build, ship, observe: pipelines and infrastructure."
};

export const DOMAIN_GLYPH = {
  ai_ml: "AI",
  web: "WD",
  cybersecurity: "CS",
  dsa: "DS",
  blockchain: "BC",
  embedded: "EH",
  backend: "BE",
  devops: "DO"
};

// Support tracks that only ever appear inside another domain's roadmap.
// Backend and DevOps are shared — they don't have independent departments.
export const SHARED_DOMAINS = ["backend", "devops"];

export const DOMAIN_ORDER = [...PRIMARY_DOMAINS, ...SHARED_DOMAINS];

export function domainLabel(domain) {
  return DOMAIN_LABEL[domain] || domain;
}

/** A term that ended before today is over. NULL means grandfathered. */
export function termExpired(termEnd) {
  const end = termEnd ? String(termEnd).slice(0, 10) : null;
  if (!end) return false;
  return end < new Date().toISOString().slice(0, 10);
}

/**
 * Canonical key for a stored or requested domain, or null.
 *
 * Rows written before the domain picker was validated can hold a display label
 * ("Cybersecurity") instead of the key the roadmap queries use. Treating that as
 * an unknown domain silently fell back to the first available roadmap, so a
 * member's own track looked empty. Accepting the label closes that gap without
 * rewriting the column on every read.
 */
export function normalizeDomainKey(value) {
  if (typeof value !== "string") return null;
  const raw = value.trim().toLowerCase();
  if (!raw) return null;
  if (DOMAIN_LABEL[raw]) return raw;
  const byLabel = Object.entries(DOMAIN_LABEL).find(([, label]) => label.toLowerCase() === raw);
  if (byLabel) return byLabel[0];
  const squashed = raw.replace(/[\s_]+/g, "-");
  return DOMAIN_LABEL[squashed] ? squashed : null;
}

export function isPrimaryDomain(domain) {
  return PRIMARY_DOMAINS.includes(domain);
}

/**
 * Order the domains that actually have nodes in this tenant's catalogue.
 * Primary tracks first (in canonical order), then any shared/legacy domains so
 * a stray domain can never silently disappear from the UI.
 */
export function orderDomains(domains) {
  const present = new Set(domains);
  const primary = DOMAIN_ORDER.filter((d) => present.has(d));
  const unknown = [...present].filter((d) => !DOMAIN_ORDER.includes(d)).sort();
  return [...primary, ...unknown];
}

/**
 * Resolve which roadmap to open: an explicit ?domain= wins, then the member's
 * own primary_domain, then the largest published roadmap. Always returns a
 * domain that actually has nodes, so the page can never render empty.
 */
export function resolveDomain({ requested, primary, available }) {
  const ordered = orderDomains(available);
  const want = normalizeDomainKey(requested);
  if (want && ordered.includes(want)) return want;
  const own = normalizeDomainKey(primary);
  if (own && ordered.includes(own)) return own;
  return ordered[0] || null;
}