import { describe, expect, it } from "vitest";
import {
  folioNumber,
  leetcodeStats,
  monthYear,
  proofCountWords,
  proofWeightRows,
  roleLabel
} from "@/lib/profileFolio";
import { REPUTATION_WEIGHTS } from "@/lib/reputation";

// These helpers are shared by the authenticated profile and the public builder
// card, so a drift here shows the same member two different proof totals. They
// are pure by design; the cases below pin the output shape and the plural rules.

describe("folioNumber", () => {
  it("returns a three-digit catalog number", () => {
    for (const username of ["asha", "builder-01", "a", "SOMEONE_WITH_A_LONG_HANDLE"]) {
      const n = folioNumber(username);
      expect(n).toMatch(/^\d{3}$/);
      expect(Number(n)).toBeGreaterThanOrEqual(100);
      expect(Number(n)).toBeLessThanOrEqual(998);
    }
  });

  it("is stable and case-insensitive", () => {
    expect(folioNumber("Asha")).toBe(folioNumber("asha"));
    expect(folioNumber("asha")).toBe(folioNumber("asha"));
  });

  it("handles missing and non-string handles without throwing", () => {
    expect(folioNumber()).toBe("100");
    expect(folioNumber(null)).toBe("100");
    expect(folioNumber(42)).toMatch(/^\d{3}$/);
  });

  it("separates realistic handles instead of collapsing them", () => {
    const numbers = new Set(["asha", "ravi", "meera", "zoya", "kabir"].map(folioNumber));
    expect(numbers.size).toBeGreaterThan(1);
  });
});

describe("proofCountWords", () => {
  it("returns no words when nothing is recorded", () => {
    expect(proofCountWords({})).toEqual([]);
    expect(proofCountWords()).toEqual([]);
    expect(proofCountWords({ solutions: 0, wikiPages: 0, eventsAttended: 0 })).toEqual([]);
  });

  it("singularises one and pluralises more than one", () => {
    expect(proofCountWords({ solutions: 1 })).toEqual(["1 solution"]);
    expect(proofCountWords({ solutions: 2 })).toEqual(["2 solutions"]);
    expect(proofCountWords({ wikiPages: 1 })).toEqual(["1 wiki page"]);
    expect(proofCountWords({ wikiPages: 3 })).toEqual(["3 wiki pages"]);
    expect(proofCountWords({ eventsAttended: 1 })).toEqual(["1 event"]);
    expect(proofCountWords({ eventsAttended: 2 })).toEqual(["2 events"]);
  });

  it("keeps a stable order and drops the empty categories", () => {
    expect(proofCountWords({ solutions: 2, wikiPages: 0, eventsAttended: 1 })).toEqual([
      "2 solutions",
      "1 event"
    ]);
  });
});

describe("proofWeightRows", () => {
  it("includes only categories with a non-zero count", () => {
    const rows = proofWeightRows({ achievements: 2, solutions: 0, ossVerified: 1 });
    expect(rows.map((r) => r.key)).toEqual(["achievements", "ossVerified"]);
  });

  it("multiplies each count by the reputation weight", () => {
    const rows = proofWeightRows({ solutions: 3, wikiPages: 2 });
    const solutions = rows.find((r) => r.key === "solutions");
    const wiki = rows.find((r) => r.key === "wikiPages");
    expect(solutions.total).toBe(3 * REPUTATION_WEIGHTS.solution);
    expect(wiki.total).toBe(2 * REPUTATION_WEIGHTS.wikiPage);
  });

  it("returns an empty rail for a brand-new member", () => {
    expect(proofWeightRows({})).toEqual([]);
    expect(proofWeightRows()).toEqual([]);
  });

  it("creates a fresh array on each call", () => {
    const rep = { achievements: 1 };
    const first = proofWeightRows(rep);
    first[0].n = 99;
    expect(proofWeightRows(rep)[0].n).toBe(1);
  });
});

describe("roleLabel", () => {
  it("maps every role in the upward-only ladder", () => {
    expect(roleLabel("student")).toBe("Student");
    expect(roleLabel("core")).toBe("Core");
    expect(roleLabel("dept_lead")).toBe("Head");
    expect(roleLabel("vertical_lead")).toBe("Vertical Lead");
    expect(roleLabel("admin")).toBe("Admin");
    expect(roleLabel("platform_admin")).toBe("Platform Admin");
  });

  it("falls back to the raw value, then Member", () => {
    expect(roleLabel("ghost")).toBe("ghost");
    expect(roleLabel(null)).toBe("Member");
    expect(roleLabel(undefined)).toBe("Member");
    expect(roleLabel("")).toBe("Member");
  });
});

describe("leetcodeStats", () => {
  it("reads the stored snapshot, including a jsonb value returned as text", () => {
    const stored = {
      total: 169, easy: 49, medium: 100, hard: 20,
      ranking: 1058640, streak: 5, activeDays: 30,
      syncedAt: "2026-11-19T08:47:31.284Z"
    };
    expect(leetcodeStats(stored)).toMatchObject({
      total: 169, easy: 49, medium: 100, hard: 20, ranking: 1058640, streak: 5, activeDays: 30
    });
    expect(leetcodeStats(JSON.stringify(stored))).toMatchObject({ total: 169, easy: 49 });
  });

  it("ships only the recent submission calendar", () => {
    const stats = leetcodeStats(
      {
        total: 10,
        easy: 4,
        calendar: { "2026-11-20": 2, "2020-01-01": 9, "2026-11-19": 0 }
      },
      { now: Date.parse("2026-11-21T00:00:00Z") }
    );
    expect(stats.calendar).toEqual({ "2026-11-20": 2 });
  });

  it("does not publish submission-attempt counts as difficulty denominators", () => {
    // LeetCode's totalSubmissionNum looks like a denominator but counts
    // attempts; exposing it made "solved / total" meaningless.
    const result = leetcodeStats({ total: 154, easy: 50, totalEasy: 50 });
    expect(result).not.toHaveProperty("totalEasy");
    expect(result).not.toHaveProperty("totalMedium");
    expect(result).not.toHaveProperty("totalHard");
  });

  it("returns null when there is no usable snapshot", () => {
    expect(leetcodeStats(null)).toBeNull();
    expect(leetcodeStats("")).toBeNull();
    expect(leetcodeStats("not json")).toBeNull();
    expect(leetcodeStats({})).toBeNull();
    expect(leetcodeStats({ total: 0, easy: 0 })).toBeNull();
  });
});

describe("monthYear", () => {
  it("returns an em dash for missing or invalid values", () => {
    expect(monthYear(null)).toBe("—");
    expect(monthYear("")).toBe("—");
    expect(monthYear("not-a-date")).toBe("—");
    expect(monthYear(undefined)).toBe("—");
  });

  it("formats a real timestamp as short month and year", () => {
    expect(monthYear("2026-11-15T12:00:00Z")).toMatch(/Nov\s+2026/);
    expect(monthYear("2025-01-15T12:00:00Z")).toMatch(/Jan\s+2025/);
  });
});
