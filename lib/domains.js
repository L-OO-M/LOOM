// Single source of truth for skill-domain identity: label, ordering and
// ownership. Previously duplicated in RoadmapHero / RoadmapJourney /
// RoadmapTabs, which is why `embedded` was missing everywhere and why the
// roadmap rendered as one undifferentiated 328-node graph.

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
export const PRIMARY_DOMAINS = ["ai_ml", "web", "cybersecurity", "dsa", "blockchain", "embedded"];

// Support tracks that only ever appear inside another domain's roadmap.
export const SHARED_DOMAINS = ["backend", "devops"];

export const DOMAIN_ORDER = [...PRIMARY_DOMAINS, ...SHARED_DOMAINS];

export function domainLabel(domain) {
  return DOMAIN_LABEL[domain] || domain;
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
  return [
    ...DOMAIN_ORDER.filter((d) => present.has(d)),
    ...[...present].filter((d) => !DOMAIN_ORDER.includes(d)).sort(),
  ];
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