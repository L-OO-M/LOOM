import { describe, expect, it, vi } from "vitest";
import {
  LEETCODE_PROFILE_QUERY,
  fetchAccepted,
  fetchProfile,
  normalizeLeetCodeUsername,
  recentCalendar,
  statsSummary
} from "@/lib/leetcode";

const NOW = Date.parse("2026-11-16T00:00:00Z");

function response(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload
  };
}

function realisticPayload({ acceptedAt = Math.floor((NOW - 60_000) / 1000) } = {}) {
  return {
    data: {
      matchedUser: {
        username: "demonstrikkk",
        profile: { ranking: 48213, reputation: 12 },
        submitStats: {
          acSubmissionNum: [
            { difficulty: "All", count: 253 },
            { difficulty: "Easy", count: 60 },
            { difficulty: "Medium", count: 141 },
            { difficulty: "Hard", count: 52 }
          ],
          // Hard row deliberately absent: the client must not invent it.
          totalSubmissionNum: [
            { difficulty: "All", count: 3200, submissions: 4100 },
            { difficulty: "Easy", count: 850, submissions: 900 },
            { difficulty: "Medium", count: 1700, submissions: 2000 }
          ]
        },
        userCalendar: {
          streak: 17,
          totalActiveDays: 128,
          submissionCalendar: JSON.stringify({
            1763424000: 3,
            "2025-11-19": 1,
            "not-a-day": 99
          })
        }
      },
      recentAcSubmissionList: [
        { id: "2195305747", titleSlug: "subsets", timestamp: String(acceptedAt) }
      ]
    }
  };
}

describe("LeetCode profile lookup", () => {
  it("accepts handles but not profile URLs", () => {
    expect(normalizeLeetCodeUsername("  DemonStrikkk ")).toBe("demonstrikkk");
    expect(normalizeLeetCodeUsername("https://leetcode.com/u/demonstrikkk/")).toBeNull();
    expect(normalizeLeetCodeUsername("name with spaces")).toBeNull();
  });

  it("reports a profile LeetCode does not recognise", async () => {
    const fetchImpl = vi.fn(async () => response({
      errors: [{ message: "That user does not exist." }],
      data: { matchedUser: null, recentAcSubmissionList: [] }
    }));

    const result = await fetchAccepted("missing-profile", "user-1", { fetchImpl, now: NOW });

    expect(result).toMatchObject({ ok: false, code: "LEETCODE_PROFILE_NOT_FOUND", retryable: false });
  });

  it("reports rate limiting without treating the profile as missing", async () => {
    const fetchImpl = vi.fn(async () => response({}, 429));

    const result = await fetchAccepted("someone", "user-1", { fetchImpl, now: NOW });

    expect(result).toMatchObject({ ok: false, code: "LEETCODE_RATE_LIMITED", retryable: true });
  });

  it("treats an HTTP 400 as a retryable request fault, never a missing member", async () => {
    // A schema mistake in the query (e.g. userCalendar at the root) makes
    // LeetCode answer 400. That must not read as "profile not found", or every
    // member would silently stop syncing forever.
    const fetchImpl = vi.fn(async () => response({}, 400));

    const result = await fetchProfile("demonstrikkk", { fetchImpl });

    expect(result).toMatchObject({ ok: false, code: "LEETCODE_BAD_RESPONSE", retryable: true });
  });

  it("parses accepted submissions from a real GraphQL-shaped response", async () => {
    const acceptedAt = Math.floor((NOW - 60_000) / 1000);
    const fetchImpl = vi.fn(async () => response(realisticPayload({ acceptedAt })));

    const result = await fetchAccepted("demonstrikkk", "user-1", { fetchImpl, now: NOW });

    expect(result).toMatchObject({
      ok: true,
      username: "demonstrikkk",
      submissions: [{
        userId: "user-1",
        externalId: "2195305747",
        slug: "subsets",
        acceptedAt: acceptedAt * 1000
      }]
    });
    expect(result.stats.total).toBe(253);
  });
});

describe("LeetCode query shape", () => {
  it("nests userCalendar under matchedUser and never queries it at the root", async () => {
    // Regression: `userCalendar(username:)` at the query root is rejected with
    // HTTP 400 and kills the entire sync. This is the guard for that.
    expect(LEETCODE_PROFILE_QUERY).toMatch(/matchedUser\([^)]*\)\s*\{[\s\S]*userCalendar\s*\{/);
    expect(LEETCODE_PROFILE_QUERY).not.toMatch(/^\s*userCalendar\s*\(/m);

    const fetchImpl = vi.fn(async () => response(realisticPayload()));
    await fetchProfile("demonstrikkk", { fetchImpl });

    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(body.variables.username).toBe("demonstrikkk");
    expect(body.query).toMatch(/matchedUser\([^)]*\)\s*\{[\s\S]*userCalendar\s*\{/);
    expect(body.query).not.toMatch(/^\s*userCalendar\s*\(/m);
    expect(fetchImpl.mock.calls[0][1].headers.Referer).toBe("https://leetcode.com/demonstrikkk/");
  });
});

describe("LeetCode stats normalisation", () => {
  it("flattens solved counts, difficulty totals, ranking, streak and calendar", async () => {
    const fetchImpl = vi.fn(async () => response(realisticPayload()));

    const result = await fetchProfile("demonstrikkk", { fetchImpl });

    expect(result).toMatchObject({
      ok: true,
      username: "demonstrikkk",
      stats: {
        total: 253,
        easy: 60,
        medium: 141,
        hard: 52,
        ranking: 48213,
        reputation: 12,
        streak: 17,
        activeDays: 128,
        calendar: { "2025-11-18": 3, "2025-11-19": 1 }
      }
    });
  });

  it("survives a malformed calendar and missing counters without throwing", async () => {
    const fetchImpl = vi.fn(async () => response({
      data: {
        matchedUser: {
          username: "demonstrikkk",
          submitStats: { acSubmissionNum: [{ difficulty: "All", count: "not-a-number" }] },
          userCalendar: { submissionCalendar: "{not json" }
        },
        recentAcSubmissionList: []
      }
    }));

    const result = await fetchProfile("demonstrikkk", { fetchImpl });

    expect(result.ok).toBe(true);
    expect(result.stats).toMatchObject({
      total: 0,
      easy: 0,
      medium: 0,
      hard: 0,
      ranking: 0,
      reputation: 0,
      streak: 0,
      activeDays: 0,
      calendar: {}
    });
  });

  it("summarises stats and ships only the recent calendar", () => {
    const summary = statsSummary(
      {
        total: 253,
        easy: 60,
        calendar: { "2025-11-18": 3, "2020-01-01": 9, "2025-11-17": 0 },
        extra: "ignore me"
      },
      { now: Date.parse("2025-11-21T00:00:00Z") }
    );

    expect(summary).toMatchObject({ total: 253, easy: 60, medium: 0, hard: 0 });
    expect(summary.calendar).toEqual({ "2025-11-18": 3 });
    expect(summary.extra).toBeUndefined();
    expect(statsSummary(null)).toBeNull();
  });
});

describe("recentCalendar", () => {
  it("keeps only days inside the window and drops zeroes", () => {
    const now = Date.parse("2026-11-21T00:00:00Z");
    expect(
      recentCalendar({ "2026-11-20": 2, "2026-11-19": 0, "2025-01-01": 7, "nope": 4 }, { days: 30, now })
    ).toEqual({ "2026-11-20": 2 });
  });

  it("accepts the epoch-second encoding LeetCode returns", () => {
    const now = Date.parse("2026-11-21T00:00:00Z");
    const stamp = Math.floor(Date.parse("2026-11-18T00:00:00Z") / 1000);
    expect(recentCalendar({ [stamp]: 3 }, { days: 30, now })).toEqual({ "2026-11-18": 3 });
  });

  it("degrades to an empty object for junk", () => {
    expect(recentCalendar(null)).toEqual({});
    expect(recentCalendar("not json")).toEqual({});
    expect(recentCalendar([1, 2, 3])).toEqual({});
  });
});
