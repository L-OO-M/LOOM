import { describe, it, expect } from "vitest";
import { summarizeDelivery } from "@/app/api/github/webhook/route.js";
import {
  currentStreak,
  dailyTable,
  dayKey,
  dayTotal,
  longestStreak,
  summarizeActivity,
  toIsoDay,
} from "@/lib/github-activity";
import { statusForIssue } from "@/lib/github-issues";

/**
 * Delivery -> activity delta.
 *
 * These numbers ARE the product's proof-of-building surface: the heatmap and
 * the commit / PR / streak tiles on /student/github, and commits x5 + prs x20 in
 * the leaderboard score. Getting the counting rule wrong does not throw -- it
 * silently inflates or deflates a student's standing, so the rule is pinned
 * here rather than left implicit in the route.
 */
describe("summarizeDelivery", () => {
  it("counts a push by its commit count", () => {
    expect(summarizeDelivery("push", { commits: [{}, {}, {}] })).toEqual({
      commits: 3, pullRequests: 0, reviews: 0
    });
  });

  it("treats a push with no commits as zero, not as one push", () => {
    // A branch deletion arrives as a push with an empty commit list.
    expect(summarizeDelivery("push", { commits: [] }).commits).toBe(0);
    expect(summarizeDelivery("push", {}).commits).toBe(0);
  });

  it("counts an opened and a reopened pull request, and nothing else", () => {
    expect(summarizeDelivery("pull_request", { action: "opened" }).pullRequests).toBe(1);
    expect(summarizeDelivery("pull_request", { action: "reopened" }).pullRequests).toBe(1);
    // Closing, syncing or labelling a PR is not new work by the author.
    for (const action of ["closed", "synchronize", "labeled", "edited", "assigned"]) {
      expect(summarizeDelivery("pull_request", { action }).pullRequests).toBe(0);
    }
  });

  it("counts only submitted reviews", () => {
    expect(summarizeDelivery("pull_request_review", { action: "submitted" }).reviews).toBe(1);
    expect(summarizeDelivery("pull_request_review", { action: "dismissed" }).reviews).toBe(0);
    expect(summarizeDelivery("pull_request_review", { action: "edited" }).reviews).toBe(0);
  });

  it("ignores deliveries that carry no attributable work", () => {
    // GitHub sends these unprompted; counting them would let a repo flood a
    // member's heatmap for activity they did not do.
    for (const ev of ["ping", "issues", "issue_comment", "star", "fork", "watch", "create"]) {
      expect(summarizeDelivery(ev, { action: "created" })).toEqual({
        commits: 0, pullRequests: 0, reviews: 0
      });
    }
  });

  it("is safe on a malformed payload", () => {
    for (const bad of [null, undefined, {}, { commits: "nope" }, []]) {
      const d = summarizeDelivery("push", bad);
      expect(Number.isInteger(d.commits)).toBe(true);
    }
    expect(summarizeDelivery(undefined, undefined)).toEqual({ commits: 0, pullRequests: 0, reviews: 0 });
  });
});
/**
 * Date handling.
 *
 * `student_daily_activity.day` is a Postgres `date`, which postgres.js returns
 * as a Date at local midnight. Building keys with String(...) or toISOString()
 * made every row invisible to the heatmap and streaks (0 active days while the
 * commit total was non-zero). These tests pin the calendar-key rule so a
 * timezone can never blank the page again.
 */
describe("activity calendar keys", () => {
  it("reads a Date row as its local calendar day", () => {
    const day = new Date(2026, 9, 16);
    expect(toIsoDay(day)).toBe("2026-10-16");
    expect(dayKey({ day })).toBe("2026-10-16");
  });

  it("leaves ISO strings untouched", () => {
    expect(dayKey({ day: "2026-10-16" })).toBe("2026-10-16");
    expect(dayKey({})).toBe(null);
    expect(toIsoDay(new Date("nope"))).toBe(null);
  });

  it("fills a window newest-first and keeps missing days as zeroes", () => {
    const now = new Date(2026, 9, 16);
    const rows = [{ day: new Date(2026, 9, 16), commits: 3 }];
    const table = dailyTable(rows, 3, now);
    expect(table.map((r) => r.day)).toEqual(["2026-10-16", "2026-10-15", "2026-10-14"]);
    expect(table.map((r) => r.total)).toEqual([3, 0, 0]);
  });

  it("counts streaks across Date rows", () => {
    const rows = [
      { day: new Date(2026, 9, 16), commits: 1 },
      { day: new Date(2026, 9, 15), reviews: 1 },
      { day: new Date(2026, 9, 13), commits: 1 },
    ];
    expect(currentStreak(rows, new Date(2026, 9, 16))).toBe(2);
    expect(longestStreak(rows)).toBe(2);
  });
});

/**
 * Two views of the same day.
 *
 * Webhook deliveries and GitHub's contribution calendar describe the same work;
 * a push is one commit AND one contribution. Summing them would double every
 * day the webhook saw, while ignoring the calendar leaves days the webhook
 * never saw blank. The rule is per-day max.
 */
describe("webhook + calendar merge", () => {
  it("takes the larger value, never the sum", () => {
    expect(dayTotal({ commits: 2, pull_requests: 1, reviews: 0, github_contributions: 3 })).toBe(3);
    expect(dayTotal({ commits: 2, pull_requests: 1, reviews: 0, github_contributions: 1 })).toBe(3);
    expect(dayTotal({ commits: 0, github_contributions: 7 })).toBe(7);
    expect(dayTotal({ commits: 0, github_contributions: 0 })).toBe(0);
    expect(dayTotal(null)).toBe(0);
  });

  it("counts a calendar-only day as active and streaks through it", () => {
    const rows = [
      { day: new Date(2026, 9, 16), github_contributions: 4 },
      { day: new Date(2026, 9, 15), github_contributions: 1 },
    ];
    expect(currentStreak(rows, new Date(2026, 9, 16))).toBe(2);
    expect(longestStreak(rows)).toBe(2);
    const table = dailyTable(rows, 2, new Date(2026, 9, 16));
    expect(table.map((r) => r.total)).toEqual([4, 1]);
  });

  it("summarises each day once and derives the weekly average from it", () => {
    const now = new Date(2026, 9, 16);
    const summary = summarizeActivity(
      [
        { day: new Date(2026, 9, 16), commits: 2, github_contributions: 5 },
        { day: new Date(2026, 9, 15), github_contributions: 3 },
      ],
      { days: 14, now }
    );
    expect(summary.commits).toBe(2);
    expect(summary.contributions).toBe(8);
    expect(summary.activeDays).toBe(2);
    expect(summary.weeklyAverage).toBe(4);
    expect(summary.bestDayTotal).toBe(5);
  });
});

/**
 * GitHub -> LOOM status. Only a closed issue decides a status; a plain refresh
 * of an open issue must not overwrite a decision an admin made by hand.
 */
describe("statusForIssue", () => {
  it("maps closed issues by state_reason", () => {
    expect(statusForIssue({ state: "closed", state_reason: "completed" })).toBe("built");
    expect(statusForIssue({ state: "closed", state_reason: "not_planned" })).toBe("rejected");
    expect(statusForIssue({ state: "closed", state_reason: null })).toBe("built");
  });

  it("does not decide for an open issue", () => {
    expect(statusForIssue({ state: "open" })).toBe(null);
    expect(statusForIssue(null)).toBe(null);
  });
});