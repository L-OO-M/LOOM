// Open-source matching: pure functions so the ranking can be tested without a
// database and explained on screen.
//
// The catalogue only carries an editorial difficulty, a domain and a language.
// The student carries a year, a primary domain, an optional explicit experience
// level, and roadmap progress. Matching is therefore a small, deterministic
// score -- not a recommendation model. Every point can be traced to a reason
// the UI renders as a chip.

import { DOMAIN_LABEL, PRIMARY_DOMAINS, SHARED_DOMAINS } from "./domains";

export const OSS_LEVELS = ["beginner", "intermediate", "advanced"];

export const LEVEL_LABEL = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced"
};

const DOMAIN_ALIASES = {
  ai: "ai_ml",
  aiml: "ai_ml",
  "ai/ml": "ai_ml",
  "ai-ml": "ai_ml",
  ml: "ai_ml",
  "machine-learning": "ai_ml",
  "machine learning": "ai_ml",
  "artificial intelligence": "ai_ml",
  web: "web",
  frontend: "web",
  "front-end": "web",
  "web development": "web",
  fullstack: "web",
  "full-stack": "web",
  cyber: "cybersecurity",
  security: "cybersecurity",
  infosec: "cybersecurity",
  "cyber security": "cybersecurity",
  dsa: "dsa",
  algorithms: "dsa",
  "data structures": "dsa",
  blockchain: "blockchain",
  "block chain": "blockchain",
  web3: "blockchain",
  embedded: "embedded",
  hardware: "embedded",
  iot: "embedded",
  "embedded systems": "embedded",
  backend: "backend",
  "back-end": "backend",
  "back end": "backend",
  api: "backend",
  devops: "devops",
  "dev ops": "devops",
  infra: "devops",
  infrastructure: "devops",
  sre: "devops"
};

/** Canonical domain key or null. Accepts "AI/ML", "Web Development", "DevOps". */
export function normalizeDomain(value) {
  if (typeof value !== "string") return null;
  const raw = value.trim().toLowerCase();
  if (!raw) return null;
  if (DOMAIN_LABEL[raw]) return raw;
  if (DOMAIN_ALIASES[raw]) return DOMAIN_ALIASES[raw];
  const compact = raw.replace(/\s*\/\s*/g, "/").replace(/\s+/g, " ");
  if (DOMAIN_ALIASES[compact]) return DOMAIN_ALIASES[compact];
  const squashed = compact.replace(/[\s_]+/g, "-");
  if (DOMAIN_LABEL[squashed]) return squashed;
  if (DOMAIN_ALIASES[squashed]) return DOMAIN_ALIASES[squashed];
  return null;
}

/** Human label for a free-text domain; canonical keys get their proper name. */
export function domainLabel(value) {
  const key = normalizeDomain(value);
  if (key) return DOMAIN_LABEL[key] || key;
  return String(value || "general");
}

/**
 * Resolve the student's contribution level.
 *
 * Explicit always wins. Otherwise: senior year or most of the roadmap done is
 * advanced; third year or a third of the roadmap done is intermediate; everyone
 * else starts at beginner. The basis is returned so the UI can be honest about
 * which of the two it used.
 */
export function inferLevel({ explicit = null, year = null, completedNodes = 0, totalNodes = 0 } = {}) {
  if (OSS_LEVELS.includes(explicit)) return { level: explicit, basis: "set" };

  const progress = totalNodes > 0 ? Math.min(completedNodes / totalNodes, 1) : 0;
  const y = Number(year) || 0;
  let level = "beginner";
  if (y >= 4 || progress >= 0.65) level = "advanced";
  else if (y >= 3 || progress >= 0.3) level = "intermediate";
  return { level, basis: "inferred", progress };
}

export function levelLabel(level) {
  return LEVEL_LABEL[level] || "Beginner";
}

/** How far apart two levels are: -2 (easier) .. +2 (harder). */
export function levelDistance(candidate, base) {
  const a = OSS_LEVELS.indexOf(candidate);
  const b = OSS_LEVELS.indexOf(base);
  if (a === -1 || b === -1) return 0;
  return a - b;
}

function isSharedDomain(domain) {
  return SHARED_DOMAINS.includes(domain);
}

/**
 * Score one repository for one student.
 *
 * Returns `{ score, reasons }`; reasons are short UI strings, never generic
 * "recommended" filler.
 */
export function scoreRepo(repo, profile = {}) {
  if (!repo) return { score: 0, reasons: [] };
  const reasons = [];
  let score = 0;

  const repoDomain = normalizeDomain(repo.primary_domain);
  const profileDomain = normalizeDomain(profile.primaryDomain);
  if (profileDomain && repoDomain === profileDomain) {
    score += 40;
    reasons.push(`In your ${domainLabel(profileDomain)} track`);
  } else if (profileDomain && repoDomain && isSharedDomain(repoDomain)) {
    score += 10;
    reasons.push(`Builds the ${domainLabel(repoDomain)} layer your track uses`);
  }

  const distance = levelDistance(repo.difficulty, profile.level);
  if (distance === 0) {
    score += 30;
    reasons.push(`Fits ${levelLabel(profile.level).toLowerCase()} contributors`);
  } else if (distance === -1) {
    score += 18;
    reasons.push("A gentler step below your level");
  } else if (distance === 1) {
    score += 8;
    reasons.push("A stretch one level up");
  } else if (distance >= 2) {
    score -= 15;
    reasons.push("Well above your current level");
  }

  const gfi = Number(repo.good_first_issues) || 0;
  if (gfi > 0) {
    score += 12 + Math.min(gfi, 50) / 5;
    reasons.push(`${gfi} good first issue${gfi === 1 ? "" : "s"} open`);
  }

  if (repo.is_curated) score += 6;

  const stars = Number(repo.stars) || 0;
  if (stars > 0) score += Math.min(8, Math.log10(stars + 1) * 2);

  const language = String(repo.language || "").toLowerCase();
  const hints = (profile.languages || []).map((l) => String(l).toLowerCase());
  if (language && hints.includes(language)) {
    score += 6;
    reasons.push(`You already work in ${repo.language}`);
  }

  if (repo.pushed_at) {
    const ageDays = (Date.now() - new Date(repo.pushed_at).getTime()) / 86400000;
    if (Number.isFinite(ageDays) && ageDays >= 0 && ageDays <= 90) {
      score += 4;
      reasons.push("Active in the last 90 days");
    }
  }

  return { score: Math.round(score * 10) / 10, reasons: reasons.slice(0, 3) };
}

/** Sort modes exposed in the filter bar. Match is the default. */
export function sortRepos(rows, profile, { sort = "match" } = {}) {
  const decorated = rows.map((repo) => {
    const match = scoreRepo(repo, profile);
    return { ...repo, matchScore: match.score, matchReasons: match.reasons };
  });
  const byGfi = (a, b) => (Number(b.good_first_issues) || 0) - (Number(a.good_first_issues) || 0);
  const byStars = (a, b) => (Number(b.stars) || 0) - (Number(a.stars) || 0);
  const byName = (a, b) => `${a.owner}/${a.repo_name}`.localeCompare(`${b.owner}/${b.repo_name}`);
  if (sort === "gfi") decorated.sort((a, b) => byGfi(a, b) || byStars(a, b));
  else if (sort === "stars") decorated.sort((a, b) => byStars(a, b) || byGfi(a, b));
  else if (sort === "name") decorated.sort(byName);
  else {
    decorated.sort(
      (a, b) =>
        b.matchScore - a.matchScore ||
        byGfi(a, b) ||
        byStars(a, b) ||
        byName(a, b)
    );
  }
  return decorated;
}

export function primaryDomainLabel(domain) {
  return DOMAIN_LABEL[domain] || domainLabel(domain);
}

export function isKnownDomain(domain) {
  return PRIMARY_DOMAINS.includes(domain) || SHARED_DOMAINS.includes(domain);
}
