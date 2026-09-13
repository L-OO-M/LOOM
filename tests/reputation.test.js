import { describe, expect, it } from "vitest";
import { REPUTATION_WEIGHTS, scoreReputation, validUsername } from "@/lib/reputation";

describe("reputation", () => {
  it("scores from documented weights", () => {
    expect(scoreReputation({})).toBe(0);
    expect(scoreReputation({ achievements: 1 })).toBe(REPUTATION_WEIGHTS.achievement);
    expect(scoreReputation({ ossVerified: 2, solutions: 1 })).toBe(
      2 * REPUTATION_WEIGHTS.ossVerified + REPUTATION_WEIGHTS.solution
    );
  });

  it("validates usernames", () => {
    expect(validUsername("aanya-dev_99")).toBe(true);
    expect(validUsername("ab")).toBe(true);
    expect(validUsername("a")).toBe(false);
    expect(validUsername("-bad")).toBe(false);
    expect(validUsername("has space")).toBe(false);
    expect(validUsername("")).toBe(false);
  });
});
