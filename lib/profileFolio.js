// Small, pure helpers shared by both profile surfaces. Keeping these out of the
// page files makes the folio number and proof copy testable without a database.

import { REPUTATION_WEIGHTS } from "@/lib/reputation";
import { isLinkedInUrl } from "@/lib/content-safety";
import { normalizeLeetCodeUsername, recentCalendar } from "@/lib/leetcode";

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

// ---------------------------------------------------------------------------
// Linked developer identity
// ---------------------------------------------------------------------------
// social_links is the one durable place a member's developer identity lives.
// GitHub and LeetCode are HANDLES (a login is not a URL -- accepting a URL means
// two spellings of the same account and a broken link when the handle renames);
// LinkedIn, X and a personal site are URLs. Everything below is pure so the
// route, the editor and the public card agree on one normalisation.

const GITHUB_LOGIN = /^[A-Za-z0-9-]{1,39}$/;
export const LINK_LABELS = {
  linkedin: "LinkedIn",
  x: "X",
  website: "Website",
  discord: "Discord",
  kaggle: "Kaggle",
  unstop: "Unstop",
  devfolio: "Devfolio",
  huggingface: "Hugging Face"
};
// Handle-shaped providers: the stored value is a login, never a URL.
const HANDLE_PROVIDERS = {
  discord: /^[A-Za-z0-9._#]{2,40}$/,
  kaggle: /^[A-Za-z0-9_-]{2,40}$/,
  unstop: /^[A-Za-z0-9._-]{2,60}$/,
  devfolio: /^[A-Za-z0-9._-]{2,60}$/,
  huggingface: /^[A-Za-z0-9._-]{2,60}$/
};
const PROFILE_HOSTS = {
  github: "github.com",
  leetcode: "leetcode.com",
  kaggle: "kaggle.com",
  unstop: "unstop.com",
  devfolio: "devfolio.co",
  huggingface: "huggingface.co"
};
// The order links appear on the card. Every key is editable in the profile
// editor; ownership state is stored separately (migration 083) so a handle can
// exist without pretending it is verified.
export const SOCIAL_LINK_KEYS = [
  "github", "leetcode", "huggingface", "kaggle", "devfolio", "unstop",
  "linkedin", "x", "discord", "website"
];

/** Accepts what a human pastes ("@octocat", a profile URL, "octocat") and
 *  returns the login, or null when it is not a GitHub login. */
export function normalizeGithubHandle(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const withoutAt = raw.replace(/^@+/, "");
  const withoutHost = withoutAt.replace(/^https?:\/\/(www\.)?github\.com\//i, "");
  const login = withoutHost.split(/[/?#]/)[0].replace(/\/+$/, "");
  return GITHUB_LOGIN.test(login) ? login : null;
}

/** A LeetCode handle, normalised exactly like the sync path does. */
export function normalizeLeetCodeHandle(value) {
  return normalizeLeetCodeUsername(value);
}

/**
 * Pull a handle out of a pasted profile URL, or keep a bare login as typed.
 * Accepting the URL is what makes the editor feel obvious: people copy the
 * address bar, not the slug.
 */
export function handleFromProfileUrl(provider, raw) {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  const host = PROFILE_HOSTS[provider];
  try {
    const url = new URL(text.startsWith("http") ? text : `https://${text}`);
    const hostname = url.hostname.replace(/^www\./, "").toLowerCase();
    if (host && (hostname === host || hostname.endsWith(`.${host}`))) {
      const parts = url.pathname.replace(/^\/+/, "").split("/").filter(Boolean);
      if (provider === "leetcode" && parts[0] === "u") return parts[1] || null;
      if (provider === "unstop" || provider === "devfolio") {
        return (parts[0] || "").replace(/^@/, "") || null;
      }
      return parts[0] || null;
    }
  } catch {
    // Not a URL: fall through to the bare-handle path.
  }
  // Discord is the one handle that legitimately contains `#` (legacy
  // `name#1234`), so splitting on it would silently truncate the account.
  if (provider === "discord") {
    return text.replace(/^@+/, "").split("/")[0].split("?")[0] || null;
  }
  return text.replace(/^@+/, "").split(/[/?#]/)[0] || null;
}

/** Absolute http(s) URL or null. Guards stored jsonb, which may predate the
 *  schema that writes it, from being rendered as a live attribute. */
export function safeHttpUrl(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.href.replace(/\/$/, "");
  } catch {
    return null;
  }
}

function isBlank(value) {
  return value === null || value === undefined || (typeof value === "string" && value.trim() === "");
}

/**
 * Merge a profile-save input over the stored social_links.
 *
 * - keys the editor does not touch are preserved (unknown keys survive)
 * - an explicit null/"" clears that key
 * - github/leetcode normalise as handles, linkedin/x/website as http(s) URLs
 * Returns `{ links, errors }`; the route fails on the first error.
 */
export function mergeSocialLinks(existing, input = {}) {
  const links = existing && typeof existing === "object" && !Array.isArray(existing) ? { ...existing } : {};
  const errors = [];
  const has = (key) => Object.prototype.hasOwnProperty.call(input, key);

  if (has("github")) {
    if (isBlank(input.github)) {
      delete links.github;
    } else {
      const handle = normalizeGithubHandle(input.github);
      if (!handle) errors.push({ field: "github", message: "GitHub handle must be 1-39 letters, numbers or hyphens" });
      else links.github = `https://github.com/${handle}`;
    }
  }

  if (has("leetcode")) {
    if (isBlank(input.leetcode)) {
      delete links.leetcode;
    } else {
      const handle = normalizeLeetCodeHandle(input.leetcode);
      if (!handle) errors.push({ field: "leetcode", message: "LeetCode handle must be 1-30 letters, numbers, - or _" });
      else links.leetcode = handle;
    }
  }

  for (const [key, pattern] of Object.entries(HANDLE_PROVIDERS)) {
    if (!has(key)) continue;
    if (isBlank(input[key])) {
      delete links[key];
      continue;
    }
    const handle = handleFromProfileUrl(key, input[key]);
    if (!handle || !pattern.test(handle)) {
      errors.push({ field: key, message: `${LINK_LABELS[key]} handle looks invalid` });
    } else {
      links[key] = handle;
    }
  }

  for (const key of ["linkedin", "x", "website"]) {
    if (!has(key)) continue;
    if (isBlank(input[key])) {
      delete links[key];
      continue;
    }
    const url = safeHttpUrl(input[key]);
    if (!url) {
      errors.push({ field: key, message: `${LINK_LABELS[key]} must be an http(s) URL` });
    } else if (key === "linkedin" && !isLinkedInUrl(url)) {
      errors.push({ field: key, message: "LinkedIn URL must be a linkedin.com link" });
    } else {
      links[key] = url;
    }
  }

  return { links, errors };
}

function xHandleFromUrl(url) {
  try {
    const parsed = new URL(url);
    if (!/(^|\.)(x|twitter)\.com$/i.test(parsed.hostname)) return null;
    const [first] = parsed.pathname.replace(/^\/+/, "").split("/");
    return first && /^[A-Za-z0-9_]{1,15}$/.test(first) ? first : null;
  } catch {
    return null;
  }
}

function linkedinSlug(url) {
  try {
    const parts = new URL(url).pathname.replace(/^\/+/, "").split("/").filter(Boolean);
    if (parts[0] === "in" && parts[1]) return parts[1];
    return parts[parts.length - 1] || null;
  } catch {
    return null;
  }
}

/**
 * Resolve the display shape from a stored card.
 *
 * Reads social_links FIRST, then falls back to legacy top-level github/linkedin
 * values so older rows keep working. Returns only what exists, each entry
 * `{ url, handle, note, verified }`; the caller renders ticks, never the raw
 * jsonb. `verified` is true only when the caller passed a `verifications` map
 * (migration 083) that marks that provider `verified`.
 */
export function socialLinksForDisplay(card = {}, verifications = {}) {
  const stored = card?.social_links && typeof card.social_links === "object" && !Array.isArray(card.social_links)
    ? card.social_links
    : {};
  const out = {};
  const verified = (key) => verifications?.[key] === "verified";
  const add = (key, handle, url) => {
    if (!handle && !url) return;
    out[key] = { url: url || null, handle: handle || null, note: null, verified: Boolean(url) && verified(key) };
  };

  const githubRaw = stored.github ?? card?.github ?? null;
  const githubHandle = normalizeGithubHandle(githubRaw) || handleFromProfileUrl("github", githubRaw);
  if (githubHandle) add("github", githubHandle, `https://github.com/${githubHandle}`);

  const leetcodeHandle = normalizeLeetCodeHandle(stored.leetcode);
  if (leetcodeHandle) add("leetcode", leetcodeHandle, `https://leetcode.com/u/${leetcodeHandle}/`);

  for (const [key, pattern] of Object.entries(HANDLE_PROVIDERS)) {
    const raw = stored[key];
    if (!raw) continue;
    const handle = handleFromProfileUrl(key, raw);
    if (!handle || !pattern.test(handle)) continue;
    const host = PROFILE_HOSTS[key];
    const url = key === "unstop" ? `https://unstop.com/@${handle}`
      : key === "devfolio" ? `https://devfolio.co/@${handle}`
      : `https://${host}/${handle}`;
    add(key, handle, url);
  }

  const linkedinUrl = safeHttpUrl(stored.linkedin ?? card?.linkedin ?? null);
  if (linkedinUrl) add("linkedin", linkedinSlug(linkedinUrl), linkedinUrl);

  const xUrl = safeHttpUrl(stored.x);
  if (xUrl) add("x", xHandleFromUrl(xUrl), xUrl);

  const websiteUrl = safeHttpUrl(stored.website);
  if (websiteUrl) {
    let host = null;
    try {
      host = new URL(websiteUrl).hostname.replace(/^www\./, "");
    } catch {
      host = null;
    }
    add("website", host, websiteUrl);
  }

  // Discord has no public profile URL. Keep the row so the card can show the
  // handle without inventing a link that goes nowhere.
  if (stored.discord) {
    const handle = handleFromProfileUrl("discord", stored.discord);
    if (handle && HANDLE_PROVIDERS.discord.test(handle)) add("discord", handle, null);
  }

  return out;
}

/** Flatten the display shape into the ordered chip/list rows the card renders. */
export function profileLinkList(display = {}) {
  return SOCIAL_LINK_KEYS
    .filter((key) => display?.[key]?.url || display?.[key]?.handle)
    .map((key) => ({
      key,
      label: LINK_LABELS[key] || key,
      href: display[key].url || null,
      note: display[key].handle || null,
      verified: display[key].verified === true
    }));
}

// ---------------------------------------------------------------------------
// Synced LeetCode progress
// ---------------------------------------------------------------------------
// The public page reads a jsonb blob written by the practice sync. Validate it
// into numbers here: `leetcode_stats` may be missing, partially written, or
// written by an older job, and the page must render an honest empty state
// rather than NaN.

function positiveInt(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

export function leetcodeStats(value, { now = Date.now() } = {}) {
  // jsonb normally arrives parsed; a pooler/column-type change has been seen to
  // hand back the raw text, so accept both rather than silently rendering "—".
  let parsed = value;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return null;
    }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const easy = positiveInt(parsed.easy);
  const medium = positiveInt(parsed.medium);
  const hard = positiveInt(parsed.hard);
  const total = positiveInt(parsed.total) || easy + medium + hard;
  if (total <= 0) return null;
  return {
    total,
    easy,
    medium,
    hard,
    ranking: positiveInt(parsed.ranking),
    streak: positiveInt(parsed.streak),
    activeDays: positiveInt(parsed.activeDays),
    // Only the recent slice is rendered; the stored blob keeps full history.
    calendar: recentCalendar(parsed.calendar, { now }),
    syncedAt: typeof parsed.syncedAt === "string" ? parsed.syncedAt : null
  };
}
