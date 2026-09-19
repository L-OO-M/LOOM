import { describe, expect, it } from "vitest";
import {
  STANDINGS_BOARD_SIZE,
  STANDINGS_WEIGHTS,
  assignRanks,
  canLinkProfile,
  normalizeLimit,
  normalizeOffset,
  normalizePeriod,
  normalizeScope,
  scoreStandings,
} from "@/lib/standings";

describe("standings scoring", () => {
  it("scores from documented weights", () => {
    expect(scoreStandings({})).toBe(0);
    expect(scoreStandings({ commits: 1 })).toBe(STANDINGS_WEIGHTS.commit);
    expect(scoreStandings({ commits: 2, prs: 1, nodesDone: 1, projects: 1 })).toBe(
      2 * STANDINGS_WEIGHTS.commit +
        STANDINGS_WEIGHTS.pullRequest +
        STANDINGS_WEIGHTS.roadmapNode +
        STANDINGS_WEIGHTS.project
    );
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
