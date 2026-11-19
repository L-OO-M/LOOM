import { parseAccepted } from "@/lib/practice-domain";

const LEETCODE_GRAPHQL = "https://leetcode.com/graphql/";

// One request returns both the recent accepted submissions and the real
// profile counters. `userCalendar` must stay NESTED under `matchedUser`:
// a top-level `userCalendar(username:)` is rejected by LeetCode's schema with
// HTTP 400, which fails the whole query and silently stops every sync.
export const LEETCODE_PROFILE_QUERY = `query LoomProfile($username: String!) {
  matchedUser(username: $username) {
    username
    profile { ranking reputation }
    submitStats {
      acSubmissionNum { difficulty count }
      totalSubmissionNum { difficulty count submissions }
    }
    userCalendar { streak totalActiveDays submissionCalendar }
  }
  recentAcSubmissionList(username: $username, limit: 20) {
    id
    titleSlug
    timestamp
  }
}`;

const DIFFICULTIES = ["All", "Easy", "Medium", "Hard"];

export function normalizeLeetCodeUsername(value) {
  const username = String(value || "").trim().toLowerCase();
  return /^[a-z0-9_-]{1,30}$/.test(username) ? username : null;
}

function toCount(value) {
  const count = Number(value);
  return Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
}

function difficultyCount(rows, difficulty) {
  if (!Array.isArray(rows)) return 0;
  const target = difficulty.toLowerCase();
  const row = rows.find(
    (entry) => String(entry?.difficulty || "").toLowerCase() === target
  );
  return row ? toCount(row.count) : 0;
}

function calendarDay(day) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(day)) return day;
  // LeetCode ships `submissionCalendar` keyed by epoch seconds; normalise to an
  // ISO day so the UI never has to know the encoding.
  if (/^\d{9,13}$/.test(day)) {
    const numeric = Number(day);
    const stamp = day.length <= 10 ? numeric * 1000 : numeric;
    const parsed = new Date(stamp);
    return Number.isFinite(parsed.getTime()) ? parsed.toISOString().slice(0, 10) : null;
  }
  return null;
}

export function normalizeCalendar(value) {
  let parsed = value;
  if (typeof parsed === "string") {
    if (!parsed.trim()) return {};
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return {};
    }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  const calendar = {};
  for (const [key, count] of Object.entries(parsed)) {
    const day = calendarDay(key);
    if (!day) continue;
    const numeric = Number(count);
    if (!Number.isFinite(numeric) || numeric < 0) continue;
    calendar[day] = Math.floor(numeric);
  }
  return calendar;
}

/**
 * Normalise the LeetCode `matchedUser` counters into a flat, defensive shape.
 * Every field is a number; a missing difficulty row or a malformed calendar
 * yields 0 / {} rather than throwing. `"All"` is the total, never a category.
 */
export function normalizeStats(matchedUser) {
  const user = matchedUser && typeof matchedUser === "object" ? matchedUser : {};
  const submitStats = user.submitStats && typeof user.submitStats === "object" ? user.submitStats : {};
  const profile = user.profile && typeof user.profile === "object" ? user.profile : {};
  const calendar = user.userCalendar && typeof user.userCalendar === "object" ? user.userCalendar : {};
  const solved = submitStats.acSubmissionNum;

  // Only solved counts are exported. `totalSubmissionNum` looks like a set of
  // denominators but it counts submissions/attempts, so using it as "solved out
  // of N" would claim a member had completed a whole difficulty (measured live:
  // Easy 50 solved, "total" 50). A wrong denominator is worse than none.
  return {
    total: difficultyCount(solved, DIFFICULTIES[0]),
    easy: difficultyCount(solved, DIFFICULTIES[1]),
    medium: difficultyCount(solved, DIFFICULTIES[2]),
    hard: difficultyCount(solved, DIFFICULTIES[3]),
    ranking: toCount(profile.ranking),
    reputation: toCount(profile.reputation),
    streak: toCount(calendar.streak),
    activeDays: toCount(calendar.totalActiveDays),
    calendar: normalizeCalendar(calendar.submissionCalendar)
  };
}

/**
 * Compact projection for API responses. The full submission calendar can hold
 * years of daily counts, so it is never serialised to the client.
 */
export function statsSummary(stats) {
  if (!stats || typeof stats !== "object") return null;
  return {
    total: toCount(stats.total),
    easy: toCount(stats.easy),
    medium: toCount(stats.medium),
    hard: toCount(stats.hard),
    ranking: toCount(stats.ranking),
    reputation: toCount(stats.reputation),
    streak: toCount(stats.streak),
    activeDays: toCount(stats.activeDays)
  };
}

function unavailable(username) {
  return {
    ok: false,
    code: "LEETCODE_UNAVAILABLE",
    message: "LeetCode is unavailable. Recorded progress is preserved and a retry is scheduled.",
    retryable: true,
    username
  };
}

async function requestProfile(username, { timeoutMs = 12_000, fetchImpl = fetch } = {}) {
  const normalized = normalizeLeetCodeUsername(username);
  if (!normalized) {
    return {
      ok: false,
      code: "INVALID_USERNAME",
      message: "Enter a LeetCode username, not a profile URL.",
      retryable: false
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetchImpl(LEETCODE_GRAPHQL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Referer: `https://leetcode.com/${normalized}/`,
        "User-Agent": "Mozilla/5.0"
      },
      body: JSON.stringify({
        query: LEETCODE_PROFILE_QUERY,
        variables: { username: normalized }
      }),
      signal: controller.signal,
      cache: "no-store"
    });
  } catch {
    return unavailable(normalized);
  } finally {
    clearTimeout(timer);
  }

  if (!response?.ok) {
    const status = Number(response?.status) || 0;
    if (status === 429) {
      return {
        ok: false,
        code: "LEETCODE_RATE_LIMITED",
        message: "LeetCode is rate limiting requests. A retry is scheduled.",
        retryable: true,
        username: normalized
      };
    }
    // 400 is what LeetCode returns for a malformed query (a schema field in the
    // wrong place). It is never the member's fault, so it must stay retryable
    // and must never be reported as "profile not found".
    if (status === 400) {
      return {
        ok: false,
        code: "LEETCODE_BAD_RESPONSE",
        message: "LeetCode rejected the progress request. Recorded progress is preserved.",
        retryable: true,
        username: normalized
      };
    }
    return {
      ok: false,
      code: "LEETCODE_UNAVAILABLE",
      message: `LeetCode is unavailable${status ? ` (HTTP ${status})` : ""}. Recorded progress is preserved.`,
      retryable: true,
      username: normalized
    };
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    return {
      ok: false,
      code: "LEETCODE_BAD_RESPONSE",
      message: "LeetCode returned an unreadable response. Recorded progress is preserved.",
      retryable: true,
      username: normalized
    };
  }

  if (payload?.errors?.length || !payload?.data?.matchedUser) {
    return {
      ok: false,
      code: "LEETCODE_PROFILE_NOT_FOUND",
      message: "Profile unavailable. Check the username and public submission visibility.",
      retryable: false,
      username: normalized
    };
  }

  return { ok: true, username: normalized, payload };
}

/**
 * Real profile counters for a handle: solved totals, difficulty split, ranking,
 * streak and the submission calendar. One network request.
 */
export async function fetchProfile(username, { timeoutMs = 12_000, fetchImpl = fetch } = {}) {
  const response = await requestProfile(username, { timeoutMs, fetchImpl });
  if (!response.ok) return response;
  return {
    ok: true,
    username: response.username,
    stats: normalizeStats(response.payload?.data?.matchedUser)
  };
}

/**
 * Recent accepted submissions (unchanged contract) plus the same normalised
 * `stats` snapshot, from the single shared request.
 */
export async function fetchAccepted(
  username,
  userId,
  { timeoutMs = 12_000, fetchImpl = fetch, now = Date.now() } = {}
) {
  const response = await requestProfile(username, { timeoutMs, fetchImpl });
  if (!response.ok) return response;

  const stats = normalizeStats(response.payload?.data?.matchedUser);
  try {
    return {
      ok: true,
      username: response.username,
      submissions: parseAccepted(response.payload, userId, now),
      stats
    };
  } catch (error) {
    return {
      ok: false,
      code: "LEETCODE_BAD_RESPONSE",
      message: error instanceof Error ? error.message : "LeetCode returned an unexpected response.",
      retryable: true,
      username: response.username
    };
  }
}
