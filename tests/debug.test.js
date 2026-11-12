import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { PRIMARY_DOMAINS } from "@/lib/domains";
import {
  canReviewDebugDomain,
  debugChallengeRepo,
  parseForkUrl,
  reviewScopes,
  verifyForkOwnership
} from "@/lib/debug";
import { standingBreakdown } from "@/lib/standings";

function profile(overrides = {}) {
  return {
    role: "student",
    memberships: [],
    ...overrides
  };
}

function response(data, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data
  };
}

function github({ login = "asha", repo = {}, commits = [], repoStatus = 200 } = {}) {
  return async (url) => {
    const path = new URL(url).pathname;
    if (path === "/user") return response({ id: 7, login });
    if (path === "/repos/asha/buggy-fix") {
      if (repoStatus !== 200) return response({ message: "unavailable" }, repoStatus);
      return response({
        id: 42,
        full_name: "asha/buggy-fix",
        owner: { login: "asha" },
        fork: true,
        parent: { full_name: "L-OO-M/buggy" },
        created_at: "2026-02-01T00:00:00Z",
        ...repo
      });
    }
    if (path === "/repos/asha/buggy-fix/commits") return response(commits);
    return response({ message: "not found" }, 404);
  };
}

const CHALLENGE = "L-OO-M/buggy";
const PUBLISHED = Date.parse("2026-01-01T00:00:00Z");

describe("debug schema contract", () => {
  it("constrains challenge domains to the primary LOOM domains", () => {
    const sql = fs.readFileSync(path.resolve("load/migrations/078_debug.sql"), "utf8");
    const check = /debug_challenges_domain_check CHECK \(([\s\S]*?)\)/.exec(sql);
    expect(check).not.toBeNull();
    const listed = [...check[1].matchAll(/'([^']+)'/g)].map((match) => match[1]);
    expect(listed.sort()).toEqual([...PRIMARY_DOMAINS].sort());
  });

  it("ships debug_fixed ranking support without the practice migration", () => {
    const sql = fs.readFileSync(path.resolve("load/migrations/078_debug.sql"), "utf8");
    expect(sql).toContain("'debug_fixed'");
    expect(sql).toMatch(/WHEN 'debug_fixed' THEN 10/);
    expect(sql).toMatch(/'debug_fixed', p\.debug_fixed/);
    expect(sql).not.toMatch(/practice_/);
  });
});

describe("debug standing disclosure", () => {
  it("shows the debug evidence row with its real weight and cap", () => {
    const row = standingBreakdown().find((item) => item.label === "Debug challenge fixed");
    expect(row).toMatchObject({ weight: 15, cap: 10, source: "Reviewed by the domain lead" });
  });
});

describe("debug fork URLs", () => {
  it("parses a GitHub repository and normalises the URL", () => {
    expect(parseForkUrl("https://github.com/Asha/buggy-fix/tree/main")).toEqual({
      fullName: "Asha/buggy-fix",
      owner: "Asha",
      repo: "buggy-fix",
      url: "https://github.com/Asha/buggy-fix"
    });
    expect(parseForkUrl("not a repo")).toBeNull();
    expect(parseForkUrl("https://gitlab.com/asha/buggy-fix")).toBeNull();
  });

  it("reads the challenge repository from the environment with a safe default", () => {
    expect(debugChallengeRepo()).toBeTruthy();
    expect(debugChallengeRepo()).toMatch(/^[\w.-]+\/[\w.-]+$/);
  });
});

describe("debug review scope", () => {
  it("gives admins every domain", () => {
    const scopes = reviewScopes(profile({ role: "admin" }));
    expect(scopes.all).toBe(true);
    expect(canReviewDebugDomain(profile({ role: "admin" }), "web-dev")).toBe(true);
  });

  it("limits a department lead to their live department", () => {
    const lead = profile({
      role: "dept_lead",
      memberships: [
        { level: "dept_lead", department_id: "d1", slug: "web-dev", term_end: null },
        { level: "dept_lead", department_id: "d2", slug: "ai-ml", term_end: "2020-01-01" }
      ]
    });
    expect(reviewScopes(lead)).toEqual({ all: false, domains: ["web-dev"] });
    expect(canReviewDebugDomain(lead, "web-dev")).toBe(true);
    expect(canReviewDebugDomain(lead, "ai-ml")).toBe(false);
  });

  it("refuses a student and an expired lead", () => {
    expect(reviewScopes(profile()).domains).toEqual([]);
    const expired = profile({
      role: "dept_lead",
      memberships: [{ level: "dept_lead", department_id: "d1", slug: "web-dev", term_end: "2020-01-01" }]
    });
    expect(reviewScopes(expired).domains).toEqual([]);
  });
});

describe("fork ownership verification", () => {
  it("accepts a fork owned by the linked account with a commit", async () => {
    const result = await verifyForkOwnership({
      accessToken: "token",
      forkFullName: "asha/buggy-fix",
      challengeRepoFullName: CHALLENGE,
      challengePublishedAt: PUBLISHED,
      fetchImpl: github({ commits: [{ sha: "abc" }] })
    });
    expect(result.status).toBe("verified");
    expect(result.repoId).toBe(42);
  });

  it("checks the fork against the stored GitHub connection", async () => {
    const okResult = await verifyForkOwnership({
      accessToken: "token",
      forkFullName: "asha/buggy-fix",
      challengeRepoFullName: CHALLENGE,
      challengePublishedAt: PUBLISHED,
      expectedOwner: "asha",
      fetchImpl: github({ commits: [{ sha: "abc" }] })
    });
    expect(okResult.status).toBe("verified");

    const stale = await verifyForkOwnership({
      accessToken: "token",
      forkFullName: "asha/buggy-fix",
      challengeRepoFullName: CHALLENGE,
      challengePublishedAt: PUBLISHED,
      expectedOwner: "old-asha",
      fetchImpl: github({ commits: [{ sha: "abc" }] })
    });
    expect(stale.status).toBe("error");
    expect(stale.reason).toMatch(/Re-link GitHub/);
  });

  it("rejects a repository owned by somebody else", async () => {
    const result = await verifyForkOwnership({
      accessToken: "token",
      forkFullName: "asha/buggy-fix",
      challengeRepoFullName: CHALLENGE,
      challengePublishedAt: PUBLISHED,
      fetchImpl: github({ repo: { owner: { login: "mallory" } }, commits: [{ sha: "abc" }] })
    });
    expect(result.status).toBe("rejected");
    expect(result.reason).toMatch(/linked GitHub account/);
  });

  it("rejects a private fork that the reviewer cannot inspect", async () => {
    const result = await verifyForkOwnership({
      accessToken: "token",
      forkFullName: "asha/buggy-fix",
      challengeRepoFullName: CHALLENGE,
      challengePublishedAt: PUBLISHED,
      fetchImpl: github({ repo: { private: true }, commits: [{ sha: "abc" }] })
    });
    expect(result.status).toBe("rejected");
    expect(result.reason).toMatch(/public/);
  });

  it("rejects a fork created before the challenge was published", async () => {
    const result = await verifyForkOwnership({
      accessToken: "token",
      forkFullName: "asha/buggy-fix",
      challengeRepoFullName: CHALLENGE,
      challengePublishedAt: PUBLISHED,
      fetchImpl: github({ repo: { created_at: "2025-01-01T00:00:00Z" }, commits: [{ sha: "abc" }] })
    });
    expect(result.status).toBe("rejected");
    expect(result.reason).toMatch(/before this challenge/);
  });

  it("keeps a submission pending when GitHub is unavailable", async () => {
    const result = await verifyForkOwnership({
      accessToken: "token",
      forkFullName: "asha/buggy-fix",
      challengeRepoFullName: CHALLENGE,
      challengePublishedAt: PUBLISHED,
      fetchImpl: github({ repoStatus: 503 })
    });
    expect(result.status).toBe("error");
  });

  it("rejects a fork with no commits from the linked account", async () => {
    const result = await verifyForkOwnership({
      accessToken: "token",
      forkFullName: "asha/buggy-fix",
      challengeRepoFullName: CHALLENGE,
      challengePublishedAt: PUBLISHED,
      fetchImpl: github({ commits: [] })
    });
    expect(result.status).toBe("rejected");
    expect(result.reason).toMatch(/no commits/);
  });

  it("requires a linked token", async () => {
    const result = await verifyForkOwnership({
      accessToken: null,
      forkFullName: "asha/buggy-fix",
      challengeRepoFullName: CHALLENGE
    });
    expect(result.status).toBe("error");
  });
});
