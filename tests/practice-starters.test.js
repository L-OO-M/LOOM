import { describe, expect, it } from "vitest";
import { STARTER_PROBLEMS } from "@/lib/practice-starters";

// The starter set seeds a practice week for a new practice-enabled department.
// Position is the display order and slug is the uniqueness key, so both are
// invariants rather than presentation choices.

describe("STARTER_PROBLEMS", () => {
  it("contains exactly one week of problems", () => {
    expect(STARTER_PROBLEMS).toHaveLength(7);
  });

  it("numbers positions 1..7 with no gaps", () => {
    expect(STARTER_PROBLEMS.map((p) => p.position)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("has a unique slug for every problem", () => {
    const slugs = STARTER_PROBLEMS.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("uses LeetCode-shaped slugs and a known difficulty", () => {
    for (const problem of STARTER_PROBLEMS) {
      expect(problem.slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      expect(["Easy", "Medium", "Hard"]).toContain(problem.difficulty);
      expect(problem.title.trim().length).toBeGreaterThan(0);
      expect(problem.topic.trim().length).toBeGreaterThan(0);
    }
  });

  it("starts with an easy on-ramp before medium problems", () => {
    const firstMedium = STARTER_PROBLEMS.findIndex((p) => p.difficulty === "Medium");
    expect(firstMedium).toBeGreaterThan(0);
    expect(STARTER_PROBLEMS.slice(0, firstMedium).every((p) => p.difficulty === "Easy")).toBe(true);
    expect(STARTER_PROBLEMS.slice(firstMedium).every((p) => p.difficulty === "Medium")).toBe(true);
  });

  it("does not contain a duplicate title", () => {
    const titles = STARTER_PROBLEMS.map((p) => p.title);
    expect(new Set(titles).size).toBe(titles.length);
  });
});
