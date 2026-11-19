import { describe, expect, it } from "vitest";
import {
  TIER_NAMES,
  classifyTier,
  filterIdsByTier,
  normalizeTier,
  tallyTiers
} from "@/lib/tiers";

// Tiers decide who gets offered mentoring and who is shown as advanced, so the
// thresholds are behavioural, not cosmetic. A self-declared count never reaches
// this function (callers pass verified counts), but the boundaries still have to
// be exact: an off-by-one here mis-routes a junior.

describe("classifyTier", () => {
  it("calls a member with no evidence a beginner", () => {
    expect(classifyTier({})).toMatchObject({ tier: "beginner", label: "Beginner" });
    expect(classifyTier()).toMatchObject({ tier: "beginner" });
    expect(classifyTier({ roadmapPct: 0, projects: 0, ossVerified: 0, solutions: 0 })).toMatchObject({
      tier: "beginner"
    });
  });

  it("promotes on any advanced signal", () => {
    expect(classifyTier({ roadmapPct: 60 }).tier).toBe("advanced");
    expect(classifyTier({ projects: 2 }).tier).toBe("advanced");
    expect(classifyTier({ ossVerified: 1 }).tier).toBe("advanced");
    expect(classifyTier({ solutions: 3 }).tier).toBe("advanced");
  });

  it("stays intermediate just below the advanced thresholds", () => {
    expect(classifyTier({ roadmapPct: 59 }).tier).toBe("intermediate");
    expect(classifyTier({ projects: 1 }).tier).toBe("intermediate");
    expect(classifyTier({ solutions: 2 }).tier).toBe("intermediate");
  });

  it("promotes on the intermediate signals", () => {
    expect(classifyTier({ roadmapPct: 25 }).tier).toBe("intermediate");
    expect(classifyTier({ resourcePct: 30 }).tier).toBe("intermediate");
    expect(classifyTier({ solutions: 1 }).tier).toBe("intermediate");
  });

  it("stays beginner just below the intermediate thresholds", () => {
    expect(classifyTier({ roadmapPct: 24.9, resourcePct: 29.9 }).tier).toBe("beginner");
  });

  it("coerces numeric strings and ignores non-numeric input", () => {
    expect(classifyTier({ projects: "2" }).tier).toBe("advanced");
    expect(classifyTier({ projects: "many" }).tier).toBe("beginner");
    expect(classifyTier({ roadmapPct: null }).tier).toBe("beginner");
  });

  it("never reports a score above 100", () => {
    for (const input of [
      { roadmapPct: 100, projects: 10, ossVerified: 10, solutions: 20 },
      { roadmapPct: 1000, resourcePct: 1000 }
    ]) {
      const result = classifyTier(input);
      expect(result.score).toBeLessThanOrEqual(100);
      expect(result.score).toBeGreaterThanOrEqual(0);
    }
  });

  it("carries the support message for each tier", () => {
    for (const tier of ["beginner", "intermediate", "advanced"]) {
      const result = classifyTier({ projects: tier === "advanced" ? 2 : 1 });
      expect(result.need.length).toBeGreaterThan(10);
    }
  });
});

describe("normalizeTier", () => {
  it("accepts only the three known names", () => {
    for (const name of TIER_NAMES) expect(normalizeTier(name)).toBe(name);
    expect(normalizeTier("expert")).toBe("");
    expect(normalizeTier(null)).toBe("");
    expect(normalizeTier(undefined)).toBe("");
  });
});

describe("tallyTiers", () => {
  const tierMap = new Map([
    ["a", { tier: "advanced" }],
    ["b", { tier: "intermediate" }],
    ["c", { tier: "beginner" }],
    ["d", { tier: "broken" }]
  ]);

  it("counts every member, defaulting an unknown tier to beginner", () => {
    expect(tallyTiers(["a", "b", "c", "d", "e"], tierMap)).toEqual({
      beginner: 3,
      intermediate: 1,
      advanced: 1
    });
  });

  it("handles an empty roster and missing map", () => {
    expect(tallyTiers([], tierMap)).toEqual({ beginner: 0, intermediate: 0, advanced: 0 });
    expect(tallyTiers(["a"], null)).toEqual({ beginner: 1, intermediate: 0, advanced: 0 });
  });
});

describe("filterIdsByTier", () => {
  const tierMap = new Map([
    ["a", { tier: "advanced" }],
    ["b", { tier: "intermediate" }],
    ["c", { tier: "beginner" }]
  ]);

  it("returns only the requested tier", () => {
    expect(filterIdsByTier(["a", "b", "c"], tierMap, "advanced")).toEqual(["a"]);
    expect(filterIdsByTier(["a", "b", "c"], tierMap, "intermediate")).toEqual(["b"]);
    expect(filterIdsByTier(["a", "b", "c"], tierMap, "beginner")).toEqual(["c"]);
  });

  it("returns nothing for an unknown tier instead of everyone", () => {
    expect(filterIdsByTier(["a", "b", "c"], tierMap, "expert")).toEqual([]);
    expect(filterIdsByTier(["a"], tierMap, null)).toEqual([]);
  });

  it("defaults members missing from the map to beginner", () => {
    expect(filterIdsByTier(["a", "z"], tierMap, "beginner")).toEqual(["z"]);
  });
});
