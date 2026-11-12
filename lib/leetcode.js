import { parseAccepted } from "@/lib/practice-domain";

const LEETCODE_GRAPHQL = "https://leetcode.com/graphql/";
const QUERY = `query LoomRecentAccepted($username: String!) {
  matchedUser(username: $username) { username }
  recentAcSubmissionList(username: $username, limit: 20) {
    id
    titleSlug
    timestamp
  }
}`;

export function normalizeLeetCodeUsername(value) {
  const username = String(value || "").trim().toLowerCase();
  return /^[a-z0-9_-]{1,30}$/.test(username) ? username : null;
}

export async function fetchAccepted(username, userId, { timeoutMs = 12_000, fetchImpl = fetch, now = Date.now() } = {}) {
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
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        query: QUERY,
        variables: { username: normalized }
      }),
      signal: controller.signal,
      cache: "no-store"
    });
  } catch {
    return {
      ok: false,
      code: "LEETCODE_UNAVAILABLE",
      message: "LeetCode is unavailable. Recorded progress is preserved and a retry is scheduled.",
      retryable: true
    };
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
        retryable: true
      };
    }
    return {
      ok: false,
      code: "LEETCODE_UNAVAILABLE",
      message: `LeetCode is unavailable${status ? ` (HTTP ${status})` : ""}. Recorded progress is preserved.`,
      retryable: true
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
      retryable: true
    };
  }

  if (payload?.errors?.length || !payload?.data?.matchedUser) {
    return {
      ok: false,
      code: "LEETCODE_PROFILE_NOT_FOUND",
      message: "Profile unavailable. Check the username and public submission visibility.",
      retryable: false
    };
  }

  try {
    return {
      ok: true,
      username: normalized,
      submissions: parseAccepted(payload, userId, now)
    };
  } catch (error) {
    return {
      ok: false,
      code: "LEETCODE_BAD_RESPONSE",
      message: error instanceof Error ? error.message : "LeetCode returned an unexpected response.",
      retryable: true
    };
  }
}
