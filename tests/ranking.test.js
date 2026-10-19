import { describe, expect, it } from "vitest";
import {
  KIND_CAPS,
  VERIFIED_KINDS,
  WEIGHTS,
  cappedContribution,
  hasPrerequisiteCycle,
  parseGitHubRepo,
  recordEvidence,
  repoOwnershipOk,
  scoreEvidence,
  unmetPrerequisites,
} from "@/lib/ranking";

// These tests are the reason the redesign can be trusted. Each one pins a rule
// that, if it quietly regressed, would let a student write their own score.

describe("the ledger refuses unverified evidence", () => {
  // recordEvidence no longer defaults verifiedBy to null the way the 027 writer
  // did. The default was the bug: a caller that forgot to pass a verifier wrote
  // a scored row, and nothing downstream could tell.
  it("throws rather than recording a row with no verifier", async () => {
    const calls = [];
    const fakeSql = (...args) => {
      calls.push(args);
      return Promise.resolve([]);
    };
    await expect(
      recordEvidence({
        sql: fakeSql,
        tenantId: "t1",
        userId: "u1",
        kind: "project_verified",
        refId: "p1",
        // verifiedBy deliberately absent
      })
    ).rejects.toThrow(/verifiedBy is required/);
    expect(calls).toHaveLength(0);
  });

  it("rejects an empty or blank verifier, not just a missing one", async () => {
    const fakeSql = () => Promise.resolve([]);
    for (const verifiedBy of [null, "", "   "]) {
      await expect(
        recordEvidence({ sql: fakeSql, tenantId: "t1", userId: "u1", kind: "oss_verified", refId: "x", verifiedBy })
      ).rejects.toThrow(/verifiedBy is required/);
    }
  });

  it("refuses an unknown kind instead of silently scoring zero", async () => {
    const fakeSql = () => Promise.resolve([]);
    await expect(
      recordEvidence({ sql: fakeSql, tenantId: "t1", userId: "u1", kind: "made_up", refId: "x", verifiedBy: "admin" })
    ).rejects.toThrow(/unknown kind/);
  });

  it("writes nothing for a deliberately zero-weight kind", async () => {
    const calls = [];
    const fakeSql = (...args) => {
      calls.push(args);
      return Promise.resolve([]);
    };
    // Ticking "I watched this" has no verifiable fact behind it, so it must not
    // reach the ledger even when handed a verifier.
    const result = await recordEvidence({
      sql: fakeSql, tenantId: "t1", userId: "u1", kind: "resource_done", refId: "res1", verifiedBy: "admin",
    });
    expect(result).toBeNull();
    expect(calls).toHaveLength(0);
  });
});

describe("weights are inverted toward verified evidence", () => {
  it("ranks attested-and-external evidence above raw volume", () => {
    expect(WEIGHTS.oss_verified).toBeGreaterThan(WEIGHTS.commit);
    expect(WEIGHTS.project_verified).toBeGreaterThan(WEIGHTS.commit);
    expect(WEIGHTS.roadmap_done).toBeGreaterThan(WEIGHTS.commit);
    expect(WEIGHTS.pull_request).toBeGreaterThan(WEIGHTS.commit);
  });

  it("gives a merged PR more than a completed milestone", () => {
    // The old formula was inverted: nodes (30) and projects (25) outweighed
    // PRs (20) and commits (5), and both of the high-weight inputs were the two
    // a student could fake most easily.
    expect(WEIGHTS.oss_verified).toBeGreaterThan(WEIGHTS.roadmap_done);
  });

  it("treats a resource tick as worth nothing", () => {
    expect(WEIGHTS.resource_done).toBe(0);
    expect(VERIFIED_KINDS).not.toContain("resource_done");
  });

  it("keeps commits and pull requests out of the ledger kinds", () => {
    // They are attested at ingest and already live one-row-per-day in
    // student_daily_activity; one ledger row per commit would be a large
    // ingest-path cost for no additional trust.
    expect(VERIFIED_KINDS).not.toContain("commit");
    expect(VERIFIED_KINDS).not.toContain("pull_request");
  });
});

describe("caps", () => {
  it("pays full weight up to the cap", () => {
    expect(cappedContribution({ weight: 30, seq: 1, cap: 15 })).toBe(30);
    expect(cappedContribution({ weight: 30, seq: 15, cap: 15 })).toBe(30);
  });

  it("collapses past the cap", () => {
    expect(cappedContribution({ weight: 30, seq: 16, cap: 15 })).toBe(0);
    expect(cappedContribution({ weight: 30, seq: 1000, cap: 15 })).toBe(0);
  });

  it("scores nothing for zero weight", () => {
    expect(cappedContribution({ weight: 0, seq: 1, cap: 10 })).toBe(0);
  });

  it("gains nothing from claims past the cap, however many arrive", () => {
    const claims = (n) => Array.from({ length: n }, (_, i) => ({ kind: "roadmap_done", refId: `n${i}` }));
    const atCap = scoreEvidence(claims(KIND_CAPS.roadmap_done));
    expect(scoreEvidence(claims(KIND_CAPS.roadmap_done * 50))).toBe(atCap);
    expect(atCap).toBe(KIND_CAPS.roadmap_done * WEIGHTS.roadmap_done);
  });

  it("keeps a genuinely large body of confirmed work ahead of a small one", () => {
    // Forty lead-confirmed milestones is more real work than two merged PRs, so
    // it should outrank them. The protection being tested is not "verified work
    // always beats verified work" -- it is that repetition cannot add to either.
    const many = Array.from({ length: KIND_CAPS.roadmap_done }, (_, i) => ({ kind: "roadmap_done", refId: `n${i}` }));
    const few = [{ kind: "oss_verified", refId: "pr/1" }, { kind: "oss_verified", refId: "pr/2" }];
    expect(scoreEvidence(many)).toBeGreaterThan(scoreEvidence(few));
  });

  it("gives the first items full value and everything past the cap nothing", () => {
    const rows = Array.from({ length: 60 }, (_, i) => ({ kind: "oss_verified", refId: `pr${i}` }));
    const cappedTotal = scoreEvidence(rows);
    const uncapped = rows.length * WEIGHTS.oss_verified;
    expect(cappedTotal).toBe(KIND_CAPS.oss_verified * WEIGHTS.oss_verified);
    expect(cappedTotal).toBeLessThan(uncapped / 3);
  });

  it("is order-independent in total, which is what makes reversal exact", () => {
    const a = [{ kind: "oss_verified", refId: "1" }, { kind: "roadmap_done", refId: "n1" }, { kind: "oss_verified", refId: "2" }];
    const b = [{ kind: "roadmap_done", refId: "n1" }, { kind: "oss_verified", refId: "2" }, { kind: "oss_verified", refId: "1" }];
    // Ordering decides *which* item is inside the cap, not the total.
    expect(scoreEvidence(a)).toBe(scoreEvidence(b));
  });
});

describe("roadmap prerequisites", () => {
  const edges = [
    { from_id: "html", to_id: "css", kind: "required" },
    { from_id: "css", to_id: "js", kind: "required" },
    { from_id: "html", to_id: "js", kind: "required" },
    { from_id: "beginner", to_id: "js", kind: "optional" },
    { from_id: "alt", to_id: "js", kind: "alternative" },
  ];

  it("blocks on unmet required predecessors", () => {
    expect(unmetPrerequisites({ nodeId: "js", completedNodeIds: [], edges })).toEqual(
      expect.arrayContaining(["css", "html"])
    );
  });

  it("clears once every required predecessor is done", () => {
    expect(unmetPrerequisites({ nodeId: "js", completedNodeIds: ["html", "css"], edges })).toEqual([]);
  });

  it("never blocks on optional or alternative edges", () => {
    const missing = unmetPrerequisites({ nodeId: "js", completedNodeIds: ["html", "css"], edges });
    expect(missing).not.toContain("beginner");
    expect(missing).not.toContain("alt");
  });

  it("never blocks an optional node", () => {
    // is_optional means "off the main line" — requiring its prerequisites
    // would be backwards and would lock a legitimate path.
    expect(unmetPrerequisites({ nodeId: "js", completedNodeIds: [], edges, nodeOptional: true })).toEqual([]);
  });

  it("de-duplicates, so a re-seeded graph does not tell a student to do the same thing twice", () => {
    const dupes = [
      { from_id: "a", to_id: "b", kind: "required" },
      { from_id: "a", to_id: "b", kind: "required" },
    ];
    expect(unmetPrerequisites({ nodeId: "b", completedNodeIds: [], edges: dupes })).toEqual(["a"]);
  });

  it("leaves an unrelated node ungated", () => {
    expect(unmetPrerequisites({ nodeId: "html", completedNodeIds: [], edges })).toEqual([]);
  });
});

describe("prerequisite graph sanity", () => {
  it("detects a cycle, which would make the gate unsatisfiable", () => {
    // In a cycle every node waits for another node in the same cycle, so no
    // student could ever complete any of them.
    expect(hasPrerequisiteCycle([
      { from_id: "a", to_id: "b", kind: "required" },
      { from_id: "b", to_id: "c", kind: "required" },
      { from_id: "c", to_id: "a", kind: "required" },
    ])).toBe(true);
  });

  it("passes an acyclic graph", () => {
    expect(hasPrerequisiteCycle([
      { from_id: "a", to_id: "b", kind: "required" },
      { from_id: "b", to_id: "c", kind: "required" },
    ])).toBe(false);
  });

  it("ignores optional edges, which cannot form a blocking cycle", () => {
    expect(hasPrerequisiteCycle([
      { from_id: "a", to_id: "b", kind: "optional" },
      { from_id: "b", to_id: "a", kind: "optional" },
    ])).toBe(false);
  });
});

describe("repository identity", () => {
  it("parses the url forms students actually paste", () => {
    expect(parseGitHubRepo("https://github.com/asha/loom-app")).toBe("asha/loom-app");
    expect(parseGitHubRepo("https://github.com/asha/loom-app.git")).toBe("asha/loom-app");
    expect(parseGitHubRepo("http://www.github.com/asha/loom-app")).toBe("asha/loom-app");
    expect(parseGitHubRepo("github.com/asha/loom-app")).toBe("asha/loom-app");
    expect(parseGitHubRepo("git@github.com:asha/loom-app.git")).toBe("asha/loom-app");
    expect(parseGitHubRepo("https://github.com/asha/loom-app/tree/main")).toBe("asha/loom-app");
  });

  it("rejects anything that is not a github repository", () => {
    // A permissive parser here would be a hole: the owner segment is what the
    // ownership check compares against.
    expect(parseGitHubRepo("https://evil.com/github.com/asha/app")).toBeNull();
    expect(parseGitHubRepo("https://gitlab.com/asha/app")).toBeNull();
    expect(parseGitHubRepo("https://github.com.evil.com/a/b")).toBeNull();
    expect(parseGitHubRepo("https://github.com/asha")).toBeNull();
    expect(parseGitHubRepo("not a url")).toBeNull();
    expect(parseGitHubRepo("")).toBeNull();
    expect(parseGitHubRepo(null)).toBeNull();
  });

  it("requires the owner to match the claimed handle, case-insensitively", () => {
    expect(repoOwnershipOk({ fullName: "asha/app", githubUsername: "asha" })).toBe(true);
    expect(repoOwnershipOk({ fullName: "Asha/app", githubUsername: "asha" })).toBe(true);
  });

  it("refuses another person's repository", () => {
    // Otherwise a project can be parked on someone else's popular repo to
    // borrow credibility they did not earn.
    expect(repoOwnershipOk({ fullName: "someone-else/app", githubUsername: "asha" })).toBe(false);
  });

  it("refuses when there is no linked identity to compare against", () => {
    expect(repoOwnershipOk({ fullName: "asha/app", githubUsername: null })).toBe(false);
    expect(repoOwnershipOk({ fullName: null, githubUsername: "asha" })).toBe(false);
  });
});