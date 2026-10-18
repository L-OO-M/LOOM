import { describe, expect, it } from "vitest";
import {
  ACTIVITY_CAPS,
  ACTIVITY_WEIGHTS,
  STANDINGS_BOARD_SIZE,
  assignRanks,
  canLinkProfile,
  normalizeLimit,
  normalizeOffset,
  normalizePeriod,
  normalizeScope,
  scoreStandings,
  standingBreakdown,
} from "@/lib/standings";
import { WEIGHTS } from "@/lib/ranking";

describe("standings scoring", () => {
  it("counts attested activity and verified evidence, nothing else", () => {
    expect(scoreStandings({})).toBe(0);
    expect(scoreStandings({ commits: 1 })).toBe(ACTIVITY_WEIGHTS.commit);
    expect(scoreStandings({ prs: 1 })).toBe(ACTIVITY_WEIGHTS.pullRequest);
    // The verified half arrives pre-computed from recompute_ranking_scores,
    // which is the single authority for it.
    expect(scoreStandings({ verifiedScore: 42 })).toBe(42);
  });

  // The regression that motivated the rewrite. There is no longer any way to
  // express "I clicked 40 nodes" or "I made 50 project rows" as a score input,
  // because scoreStandings does not accept them. If someone re-adds a
  // self-declared parameter to this signature, this test is what should fail.
  it("has no parameter through which a self-declared claim can score", () => {
    const args = scoreStandings.toString();
    expect(args).not.toMatch(/nodesDone|projects(?![A-Za-z])/);
  });

  it("caps volume so repetition past the threshold is worth nothing", () => {
    const atCap = scoreStandings({ commits: ACTIVITY_CAPS.commit });
    const wayPast = scoreStandings({ commits: ACTIVITY_CAPS.commit * 100 });
    // A hard plateau: 100x the commits buys exactly nothing.
    expect(wayPast).toBe(atCap);
  });

  it("is not outranked by raw volume when verified work exists", () => {
    const spammer = scoreStandings({ commits: 100000 });
    const builder = scoreStandings({ prs: 1, verifiedScore: WEIGHTS.oss_verified });
    expect(builder).toBeGreaterThan(spammer);
  });
});

describe("standings disclosure", () => {
  it("discloses weight, cap and source for every counted kind", () => {
    const rows = standingBreakdown();
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.weight).toBeGreaterThan(0);
      expect(row.cap).toBeGreaterThan(0);
      // Every line must say where the evidence came from. A weight with no
      // stated provenance is exactly the thing this redesign exists to remove.
      expect(row.source.length).toBeGreaterThan(0);
    }
  });

  it("never discloses a zero-weight kind as counting", () => {
    for (const row of standingBreakdown()) {
      expect(row.weight).toBeGreaterThan(0);
    }
  });
});

describe("standings params", () => {
  it("normalizes scope and period to safe defaults", () => {
    expect(normalizeScope("global")).toBe("global");
    expect(normalizeScope("friends")).toBe("friends");
    expect(normalizeScope("everyone")).toBe("college");
    expect(normalizeScope(null)).toBe("college");
    expect(normalizePeriod("30d")).toBe("30d");
    expect(normalizePeriod("7d")).toBe("all");
    expect(normalizePeriod(undefined)).toBe("all");
  });

  it("clamps limit and offset", () => {
    expect(normalizeLimit("20")).toBe(20);
    expect(normalizeLimit("500")).toBeLessThanOrEqual(100);
    expect(normalizeLimit("0")).toBe(STANDINGS_BOARD_SIZE);
    expect(normalizeLimit("abc")).toBe(STANDINGS_BOARD_SIZE);
    expect(normalizeOffset("10")).toBe(10);
    expect(normalizeOffset("-3")).toBe(0);
    expect(normalizeOffset("x")).toBe(0);
  });
});

describe("standings ranks", () => {
  it("shares ranks on ties (competition ranking)", () => {
    const ranked = assignRanks([
      { user_id: "a", name: "Asha", score: 100 },
      { user_id: "b", name: "Dev", score: 200 },
      { user_id: "c", name: "Mira", score: 200 },
      { user_id: "d", name: "Ravi", score: 50 },
    ]);
    expect(ranked.map((r) => [r.user_id, r.rank])).toEqual([
      ["b", 1],
      ["c", 1],
      ["a", 3],
      ["d", 4],
    ]);
  });

  it("orders tied scores deterministically by name", () => {
    const ranked = assignRanks([
      { user_id: "b", name: "Zoe", score: 100 },
      { user_id: "a", name: "Asha", score: 100 },
    ]);
    expect(ranked.map((r) => r.user_id)).toEqual(["a", "b"]);
    expect(ranked.every((r) => r.rank === 1)).toBe(true);
  });

  it("handles an empty board", () => {
    expect(assignRanks([])).toEqual([]);
  });
});

describe("standings profile links", () => {
  const tenant = "tenant-1";
  it("links public same-chapter cards and the viewer's own card", () => {
    expect(
      canLinkProfile(
        { user_id: "u1", username: "asha", profile_public: true, profile_tenant: tenant },
        tenant,
        "viewer"
      )
    ).toBe(true);
    expect(
      canLinkProfile(
        { user_id: "viewer", username: "me", profile_public: false, profile_tenant: tenant },
        tenant,
        "viewer"
      )
    ).toBe(true);
  });

  it("never links private or cross-chapter cards, or missing usernames", () => {
    expect(
      canLinkProfile(
        { user_id: "u2", username: "dev", profile_public: false, profile_tenant: tenant },
        tenant,
        "viewer"
      )
    ).toBe(false);
    expect(
      canLinkProfile(
        { user_id: "u3", username: "mira", profile_public: true, profile_tenant: "tenant-2" },
        tenant,
        "viewer"
      )
    ).toBe(false);
    expect(
      canLinkProfile(
        { user_id: "u4", username: null, profile_public: true, profile_tenant: tenant },
        tenant,
        "viewer"
      )
    ).toBe(false);
  });
});
