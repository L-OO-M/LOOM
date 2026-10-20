import { describe, it, expect } from "vitest";
import {
  inferLevel,
  levelDistance,
  normalizeDomain,
  scoreRepo,
  sortRepos
} from "@/lib/oss-match";

const profile = {
  primaryDomain: "ai_ml",
  level: "beginner",
  languages: ["python"]
};

const repo = (over = {}) => ({
  owner: "acme",
  repo_name: "thing",
  primary_domain: "ai_ml",
  difficulty: "beginner",
  language: "Python",
  stars: 100,
  good_first_issues: 12,
  is_curated: true,
  pushed_at: new Date().toISOString(),
  ...over
});

describe("normalizeDomain", () => {
  it("maps labels and aliases to the canonical keys used by roadmaps", () => {
    expect(normalizeDomain("AI / ML")).toBe("ai_ml");
    expect(normalizeDomain("AI/ML")).toBe("ai_ml");
    expect(normalizeDomain("Web Development")).toBe("web");
    expect(normalizeDomain("infosec")).toBe("cybersecurity");
    expect(normalizeDomain("Back End")).toBe("backend");
    expect(normalizeDomain("DevOps")).toBe("devops");
    expect(normalizeDomain("quantum")).toBe(null);
  });
});

describe("inferLevel", () => {
  it("prefers an explicit level", () => {
    expect(inferLevel({ explicit: "advanced", year: 1 })).toMatchObject({ level: "advanced", basis: "set" });
  });

  it("infers from year and roadmap progress", () => {
    expect(inferLevel({ year: 1 }).level).toBe("beginner");
    expect(inferLevel({ year: 3 }).level).toBe("intermediate");
    expect(inferLevel({ year: 4 }).level).toBe("advanced");
    expect(inferLevel({ year: 1, completedNodes: 70, totalNodes: 100 }).level).toBe("advanced");
    expect(inferLevel({ year: 1, completedNodes: 35, totalNodes: 100 }).level).toBe("intermediate");
  });

  it("ignores an invalid explicit value", () => {
    expect(inferLevel({ explicit: "expert", year: 2 }).level).toBe("beginner");
  });
});

describe("scoreRepo", () => {
  it("puts a domain match at the same level on top", () => {
    const good = scoreRepo(repo(), profile);
    const wrongDomain = scoreRepo(repo({ primary_domain: "blockchain" }), profile);
    expect(good.score).toBeGreaterThan(wrongDomain.score);
    expect(good.reasons.join(" ")).toContain("AI / ML");
  });

  it("rewards good-first-issues and active repos", () => {
    const withGfi = scoreRepo(repo(), profile);
    const without = scoreRepo(repo({ good_first_issues: 0 }), profile);
    expect(withGfi.score).toBeGreaterThan(without.score);
    const stale = scoreRepo(repo({ pushed_at: new Date(Date.now() - 400 * 86400000).toISOString() }), profile);
    expect(withGfi.score).toBeGreaterThan(stale.score);
  });

  it("penalises a repo two levels too hard", () => {
    const easy = scoreRepo(repo(), profile);
    const hard = scoreRepo(repo({ difficulty: "advanced" }), profile);
    expect(levelDistance("advanced", "beginner")).toBe(2);
    expect(hard.score).toBeLessThan(easy.score);
    expect(hard.reasons.join(" ")).toContain("above");
  });

  it("explains at most three reasons", () => {
    expect(scoreRepo(repo(), profile).reasons.length).toBeLessThanOrEqual(3);
  });
});

describe("sortRepos", () => {
  it("orders by match score by default and supports explicit sorts", () => {
    const rows = [
      repo({ repo_name: "b", primary_domain: "web", good_first_issues: 1 }),
      repo({ repo_name: "a", good_first_issues: 40 })
    ];
    expect(sortRepos(rows, profile).map((r) => r.repo_name)).toEqual(["a", "b"]);
    expect(sortRepos(rows, profile, { sort: "gfi" }).map((r) => r.repo_name)).toEqual(["a", "b"]);
    expect(sortRepos(rows, profile, { sort: "name" }).map((r) => r.repo_name)).toEqual(["a", "b"]);
  });
});
