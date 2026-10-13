import { describe, it, expect } from "vitest";
import { summarizeDelivery } from "@/app/api/github/webhook/route.js";

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