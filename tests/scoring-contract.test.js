import { describe, expect, it } from "vitest";
import {
  ACTIVITY_CAPS as SCORING_CAPS,
  ACTIVITY_WEIGHTS as SCORING_WEIGHTS,
  activityDeltaPoints,
  cappedActivityPoints,
  scoreAttestedActivity,
} from "@/lib/scoring";
import {
  ACTIVITY_CAPS as STANDINGS_CAPS,
  ACTIVITY_WEIGHTS as STANDINGS_WEIGHTS,
} from "@/lib/standings";
import { ACTIVITY_WEIGHTS as WEBHOOK_WEIGHTS } from "@/app/api/github/webhook/route.js";

// The webhook and the standings board used to carry two different copies of the
// same arithmetic (5/20 stored vs 2/12 displayed). These tests make the shared
// contract the only way to change a weight or cap, and pin the values that were
// actually serving production.

describe("canonical activity contract", () => {
  it("pins the board weights and caps", () => {
    expect(SCORING_WEIGHTS).toEqual({ commit: 2, pullRequest: 12, review: 2 });
    expect(SCORING_CAPS).toEqual({ commit: 20, pullRequest: 10 });
  });

  it("is the same object consumed by standings and the webhook", () => {
    expect(STANDINGS_WEIGHTS).toEqual(SCORING_WEIGHTS);
    expect(STANDINGS_CAPS).toEqual(SCORING_CAPS);
    expect(WEBHOOK_WEIGHTS).toEqual(SCORING_WEIGHTS);
    // Parity is the actual regression: a webhook weight that differs from the
    // board weight makes the stored daily score a second, contradictory answer.
    expect(WEBHOOK_WEIGHTS).toEqual(STANDINGS_WEIGHTS);
  });
});

describe("shared scoring helpers", () => {
  it("caps aggregate activity exactly like the board SQL", () => {
    expect(scoreAttestedActivity({})).toBe(0);
    expect(scoreAttestedActivity({ commits: 1 })).toBe(SCORING_WEIGHTS.commit);
    expect(scoreAttestedActivity({ prs: 1 })).toBe(SCORING_WEIGHTS.pullRequest);
    expect(scoreAttestedActivity({ commits: SCORING_CAPS.commit })).toBe(
      SCORING_CAPS.commit * SCORING_WEIGHTS.commit
    );
    expect(scoreAttestedActivity({ commits: SCORING_CAPS.commit * 100 })).toBe(
      scoreAttestedActivity({ commits: SCORING_CAPS.commit })
    );
  });

  it("treats an empty or negative count as zero contribution", () => {
    expect(cappedActivityPoints(SCORING_WEIGHTS.commit, 0, SCORING_CAPS.commit)).toBe(0);
    expect(cappedActivityPoints(SCORING_WEIGHTS.commit, -5, SCORING_CAPS.commit)).toBe(0);
    // The zero-weight guard is what stopped an empty contribution from paying
    // the full weight in the old aggregate form.
    expect(cappedActivityPoints(0, 10, 10)).toBe(0);
  });

  it("values a delivery delta with the same canonical weights", () => {
    expect(activityDeltaPoints({ commits: 3 })).toBe(3 * SCORING_WEIGHTS.commit);
    expect(activityDeltaPoints({ pullRequests: 2 })).toBe(2 * SCORING_WEIGHTS.pullRequest);
    expect(activityDeltaPoints({ reviews: 1 })).toBe(SCORING_WEIGHTS.review);
    expect(
      activityDeltaPoints({ commits: 1, pullRequests: 1, reviews: 1 })
    ).toBe(
      SCORING_WEIGHTS.commit + SCORING_WEIGHTS.pullRequest + SCORING_WEIGHTS.review
    );
  });
});
