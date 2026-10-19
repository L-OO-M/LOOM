// Content safety for user-authored public text.
//
// The security report found that GitHub handles, LinkedIn URLs and bios
// accepted arbitrary input (random characters, non-LinkedIn links, profanity)
// with no screening at all. This module is the single, dependency-free place
// those checks live so every public-text field can call the same function.
//
// Design notes:
//  - No new npm dependency (AGENTS.md iron rule: a dependency must not be added
//    to save a small amount of code). The word list is deliberately short and
//    curated -- it is a floor, not a perfect classifier.
//  - Matching is conservative to avoid the "Scunthorpe problem" (flagging a real
//    word because a banned substring sits inside it). We match whole tokens,
//    never raw substrings, and only fall back to a whole-string equality check
//    to catch letter-spaced evasion ("f u c k").
//  - Leet substitutions are normalised before matching so "@", "0", "1", "3",
//    "5", "7", "$" do not smuggle a word past the filter.

const LEET = {
  "@": "a", "4": "a",
  "0": "o",
  "1": "i", "!": "i",
  "3": "e",
  "5": "s", "$": "s",
  "7": "t",
  "8": "b",
  "9": "g"
};

// Curated profanity / slur floor. Kept short on purpose; extend as needed.
const BLOCKED = [
  "fuck", "shit", "bitch", "bastard", "asshole", "dick", "piss", "slut",
  "whore", "cunt", "wanker", "bollocks", "arse", "twat", "prick",
  "nigger", "nigga", "faggot", "retard", "kike", "spic", "chink", "tranny",
  "rape", "molest", "paedo", "pedo"
];

const BLOCKED_SET = new Set(BLOCKED);

// Common English inflections, stripped before matching so "fucking",
// "bitches" and "assholes" are caught from their base word. Applied only after
// an exact miss, and the folded base is re-checked against the set -- so
// "glass" -> "glas" and "pass" -> "pas" still pass.
const SUFFIXES = ["ing", "ers", "er", "es", "ed", "s"];

function matchToken(token) {
  if (BLOCKED_SET.has(token)) return token;
  const bases = new Set();
  for (const suf of SUFFIXES) {
    if (!token.endsWith(suf)) continue;
    const b = token.slice(0, -suf.length);
    bases.add(b);
    bases.add(b.replace(/(.)\1$/, "$1")); // shitt -> shit
  }
  for (const b of bases) if (BLOCKED_SET.has(b)) return b;
  return null;
}

/**
 * Lowercase, strip accents, fold leet substitutions, turn any run of
 * non-alphanumerics into a single space, and collapse 3+ repeated letters so
 * "fuuuuck" becomes "fuck". Returns a clean, space-separated string.
 */
export function normalizeForScreening(text) {
  if (typeof text !== "string") return "";
  const folded = text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .split("")
    .map((ch) => LEET[ch] ?? ch)
    .join("");
  return folded
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/(.)\1{2,}/g, "$1");
}

/**
 * Returns the offending word if `text` contains blocked language, otherwise null.
 */
export function findUnsafeText(text) {
  const normalized = normalizeForScreening(text);
  if (!normalized) return null;
  for (const token of normalized.split(" ")) {
    const hit = matchToken(token);
    if (hit) return hit;
  }
  // Letter-spaced evasion: "f u c k" normalises to "f u c k" token-wise, but the
  // whole string with spaces removed equals the word. Only an exact whole-string
  // match is treated as unsafe, so real sentences never trip this.
  const compact = normalized.replace(/ /g, "");
  if (BLOCKED_SET.has(compact)) return compact;
  return null;
}

/** Convenience boolean wrapper around findUnsafeText. */
export function isSafeText(text) {
  return findUnsafeText(text) === null;
}

/**
 * GitHub username rules: 1-39 chars, ASCII letters/digits/hyphens only, may not
 * begin or end with a hyphen and may not contain consecutive hyphens. This is a
 * format check -- it does not confirm the account exists (ownership is proven
 * separately via OAuth, see docs/21-github-oauth-setup.md).
 */
export function validGithubHandle(handle) {
  if (typeof handle !== "string") return false;
  const h = handle.trim().replace(/^@/, "");
  if (h.length < 1 || h.length > 39) return false;
  if (!/^[A-Za-z0-9-]+$/.test(h)) return false;
  if (h.startsWith("-") || h.endsWith("-")) return false;
  if (h.includes("--")) return false;
  return true;
}

/**
 * Accepts only linkedin.com (or a subdomain), http(s). Rejects look-alikes such
 * as "linkedin.com.evil.com" and any other host.
 */
export function isLinkedInUrl(value) {
  if (typeof value !== "string" || !value.trim()) return false;
  let url;
  try {
    url = new URL(value.trim());
  } catch {
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  return host === "linkedin.com" || host.endsWith(".linkedin.com");
}

/**
 * Validates the user-authored fields of the public card. Returns
 * `{ ok: true }` or `{ ok: false, field, code, message }` for the first failure,
 * in the standard envelope shape the API routes already emit.
 */
export function screenProfileCard({ bio, location, github, linkedin } = {}) {
  if (github && !validGithubHandle(github)) {
    return {
      ok: false, field: "github", code: "INVALID_GITHUB",
      message: "GitHub handle must be 1-39 letters, numbers or single hyphens"
    };
  }
  if (linkedin && !isLinkedInUrl(linkedin)) {
    return {
      ok: false, field: "linkedin", code: "INVALID_LINKEDIN",
      message: "LinkedIn URL must be a linkedin.com link"
    };
  }
  const bioWord = findUnsafeText(bio);
  if (bioWord) {
    return {
      ok: false, field: "bio", code: "UNSAFE_CONTENT",
      message: "Your bio contains language that is not allowed here"
    };
  }
  const locationWord = findUnsafeText(location);
  if (locationWord) {
    return {
      ok: false, field: "location", code: "UNSAFE_CONTENT",
      message: "Your location contains language that is not allowed here"
    };
  }
  return { ok: true };
}
