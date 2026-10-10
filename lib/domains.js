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
  if (requested && ordered.includes(requested)) return requested;
  if (primary && ordered.includes(primary)) return primary;
  return ordered[0] || null;
}