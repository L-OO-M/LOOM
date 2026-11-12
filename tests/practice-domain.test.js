import { describe, expect, it } from "vitest";
import {
  DAY_MS,
  automaticSyncDue,
  computeCredits,
  eligible,
  historyCutoff,
  isReleased,
  monthBounds,
  parseAccepted,
  problemSlug,
  rankMembers,
  retryDelay,
  validateQuestions,
  weekStart
} from "@/lib/practice-domain";
import { normalizeWeek } from "@/lib/practice";

const start = Date.parse("2026-10-26T00:00:00+05:30");
const now = Date.parse("2026-10-30T18:00:00+05:30");
const week = { id: "w1", title: "Week", startAt: start, endAt: start + 7 * DAY_MS, status: "scheduled", createdAt: start };
const question = { id: "q1", weekId: "w1", position: 1, title: "Two Sum", slug: "two-sum", difficulty: "Easy", topic: "Arrays" };

function solve(time, id = "1", userId = "m1") {
  return { userId, externalId: id, slug: "two-sum", acceptedAt: time };
}

function score(solves, corrections = [], weeks = [week], questions = [question]) {
  return computeCredits(weeks, questions, solves, corrections, now);
}

function correction(credited, time = start + 1000) {
  return {
    userId: "m1",
    questionId: "q1",
    credited,
    acceptedAt: time,
    evidenceUrl: "https://leetcode.com/u/test/",
    reason: "Verified"
  };
}

describe("practice IST calendar", () => {
  it("changes the week exactly at Monday midnight IST", () => {
    expect(weekStart(start - 1)).toBe(start - 7 * DAY_MS);
    expect(weekStart(start)).toBe(start);
    expect(weekStart(now)).toBe(start);
  });

  it("uses IST calendar months, including cross-month weeks", () => {
    const [lo, hi] = monthBounds(now);
    expect(lo).toBe(Date.parse("2026-10-01T00:00:00+05:30"));
    expect(hi).toBe(Date.parse("2026-11-01T00:00:00+05:30"));
  });

  it("clamps the three-month history cutoff instead of overflowing", () => {
    expect(historyCutoff(Date.parse("2026-05-31T12:00:00+05:30"))).toBe(
      Date.parse("2026-02-28T12:00:00+05:30")
    );
  });
});

describe("practice release and eligibility", () => {
  it("does not release future or draft weeks", () => {
    expect(isReleased({ ...week, startAt: now + 1 }, now)).toBe(false);
    expect(isReleased({ ...week, status: "draft" }, now)).toBe(false);
    expect(isReleased(week, start)).toBe(true);
  });

  it("normalizes snake_case database rows before applying domain rules", () => {
    const row = {
      id: "w1",
      title: "Week",
      start_at: start,
      end_at: start + 7 * DAY_MS,
      status: "scheduled",
      created_at: start
    };
    const normalized = normalizeWeek(row);
    expect(normalized.startAt).toBe(start);
    expect(isReleased(normalized, now)).toBe(true);
    expect(eligible(normalized, start + 1000, now)).toBe(true);
  });

  it("includes the opening instant, excludes the closing instant, and rejects future solves", () => {
    expect(eligible(week, start, now)).toBe(true);
    expect(eligible(week, start - 1, now)).toBe(false);
    expect(eligible(week, week.endAt, week.endAt)).toBe(false);
    expect(eligible(week, now + 1, now)).toBe(false);
  });
});

describe("practice credits", () => {
  it("counts one fresh acceptance exactly once", () => {
    expect(score([solve(start + 1000)])).toHaveLength(1);
  });

  it("cannot inflate points with repeat submissions and keeps the earliest acceptance", () => {
    const credits = score([solve(start + 3000, "3"), solve(start + 1000), solve(start + 2000, "2")]);
    expect(credits).toHaveLength(1);
    expect(credits[0].acceptedAt).toBe(start + 1000);
  });

  it("requires a solve inside the week even if the problem was solved earlier", () => {
    expect(score([solve(start - 1)])).toHaveLength(0);
    expect(score([solve(start - 1), solve(start + 1000, "2")])).toHaveLength(1);
  });

  it("never counts draft, future, or late assignments", () => {
    expect(score([solve(start + 1)], [], [{ ...week, status: "draft" }])).toHaveLength(0);
    expect(score([solve(start + 1)], [], [{ ...week, startAt: now + DAY_MS }])).toHaveLength(0);
    expect(computeCredits([week], [question], [solve(week.endAt)], [], week.endAt + DAY_MS)).toHaveLength(0);
  });

  it("makes an admin removal override later automatic submissions", () => {
    expect(score([solve(start + 1), solve(start + 2, "2")], [correction(false)])).toHaveLength(0);
  });

  it("makes an admin grant override automatic evidence and set the monthly timestamp", () => {
    const credits = score([solve(start + 2)], [correction(true, start + 1000)]);
    expect(credits).toHaveLength(1);
    expect(credits[0].acceptedAt).toBe(start + 1000);
    expect(credits[0].source).toBe("admin");
  });

  it("rejects an out-of-window admin grant", () => {
    expect(score([], [correction(true, start - 1)])).toHaveLength(0);
  });

  it("requires separate in-week solves when the same problem repeats in consecutive weeks", () => {
    const week2 = { ...week, id: "w2", startAt: week.endAt, endAt: week.endAt + 7 * DAY_MS };
    const question2 = { ...question, id: "q2", weekId: "w2" };
    const credits = computeCredits(
      [week, week2],
      [question, question2],
      [solve(start + 1), solve(week2.startAt + 1, "2")],
      [],
      week2.startAt + DAY_MS
    );
    expect(credits).toHaveLength(2);
  });
});

describe("practice ranking", () => {
  it("uses competition ranking, shares ties, and includes zero-score members", () => {
    const members = ["m1", "m2", "m3"].map((id, index) => ({
      id,
      name: `Member ${index}`,
      username: id
    }));
    const credits = [solve(start + 1), solve(start + 1, "2", "m2")].map((item) => ({
      ...item,
      questionId: "q1",
      weekId: "w1",
      source: "sync"
    }));
    const ranks = rankMembers(members, credits, () => true);
    expect(ranks.map((row) => [row.score, row.rank])).toEqual([
      [1, 1],
      [1, 1],
      [0, 3]
    ]);
  });
});

describe("practice question links", () => {
  it("normalizes LeetCode problem links and rejects every other host or scheme", () => {
    expect(problemSlug("https://leetcode.com/problems/two-sum/description/?x=1")).toBe("two-sum");
    for (const url of [
      "https://evil.test/problems/two-sum/",
      "javascript:alert(1)",
      "https://leetcode.com.evil.test/problems/two-sum/",
      "https://x@leetcode.com/problems/two-sum/",
      "http://leetcode.com/problems/two-sum/"
    ]) {
      expect(() => problemSlug(url)).toThrow();
    }
  });

  it("requires seven distinct, valid questions before scheduling", () => {
    const questions = Array.from({ length: 7 }, (_, index) => ({
      title: `Q${index}`,
      url: `https://leetcode.com/problems/problem-${index}/`,
      difficulty: "Easy"
    }));
    expect(validateQuestions(questions, true)).toHaveLength(7);
    expect(() => validateQuestions(questions.slice(1), true)).toThrow();
    expect(() => validateQuestions([...questions.slice(1), questions[1]], true)).toThrow();
    expect(validateQuestions([], false)).toHaveLength(0);
  });
});

describe("LeetCode accepted submissions", () => {
  it("requires a visible valid profile and deduplicates upstream rows", () => {
    const submission = {
      id: "123",
      titleSlug: "two-sum",
      timestamp: String(Math.floor(start / 1000))
    };
    const raw = {
      data: {
        matchedUser: { username: "test" },
        recentAcSubmissionList: [submission, submission]
      }
    };
    expect(parseAccepted(raw, "m1", now)).toHaveLength(1);
    expect(() =>
      parseAccepted({ data: { matchedUser: null, recentAcSubmissionList: [] } }, "m1", now)
    ).toThrow();
    expect(() => parseAccepted({ errors: [{ message: "Private" }] }, "m1", now)).toThrow();
    expect(() =>
      parseAccepted(
        {
          data: {
            ...raw.data,
            recentAcSubmissionList: [{ ...submission, timestamp: "invalid" }]
          }
        },
        "m1",
        now
      )
    ).toThrow();
  });

  it("accepts an empty successful list without erasing stored credit", () => {
    expect(
      parseAccepted(
        { data: { matchedUser: { username: "test" }, recentAcSubmissionList: [] } },
        "m1",
        now
      )
    ).toEqual([]);
    expect(score([solve(start + 1), ...[]])).toHaveLength(1);
  });
});

describe("practice sync scheduling", () => {
  const connection = { active: true, lastSyncAt: null, nextSyncAt: 0, leaseUntil: 0 };

  it("makes a newly linked member immediately eligible", () => {
    expect(automaticSyncDue(connection, now)).toBe(true);
  });

  it("does not recheck before a full hour", () => {
    expect(automaticSyncDue({ ...connection, lastSyncAt: now - 3_599_999 }, now)).toBe(false);
    expect(automaticSyncDue({ ...connection, lastSyncAt: now - 3_600_000 }, now)).toBe(true);
  });

  it("respects manual-refresh delay, backoff, leases, and archived members", () => {
    expect(
      automaticSyncDue({ ...connection, lastSyncAt: now - 20 * 60_000, nextSyncAt: now - 5 * 60_000 }, now)
    ).toBe(false);
    expect(automaticSyncDue({ ...connection, nextSyncAt: now + 1 }, now)).toBe(false);
    expect(automaticSyncDue({ ...connection, leaseUntil: now + 1 }, now)).toBe(false);
    expect(automaticSyncDue({ ...connection, active: false }, now)).toBe(false);
  });

  it("grows the retry delay and bounds it at six hours", () => {
    expect(retryDelay(1)).toBe(15 * 60_000);
    expect(retryDelay(2)).toBe(30 * 60_000);
    expect(retryDelay(20)).toBe(6 * 60 * 60_000);
  });
});
