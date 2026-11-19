import { describe, expect, it } from "vitest";
import { buildProof } from "@/lib/proof";

const TENANT = "11111111-1111-1111-1111-111111111111";
const USER = "user-1";

function fakeSql(responders = []) {
  const calls = [];
  const sql = (strings, ...values) => {
    const query = strings.join("?");
    calls.push({ query, values });
    for (const responder of responders) {
      if (responder.match.test(query)) {
        if (responder.reject) {
          return Promise.reject(new Error(responder.message || "simulated database error"));
        }
        const rows =
          typeof responder.rows === "function" ? responder.rows(values, query) : responder.rows;
        return Promise.resolve(rows);
      }
    }
    return Promise.resolve([]);
  };
  sql.calls = calls;
  return sql;
}

function project(overrides = {}) {
  return {
    id: "p-1",
    title: "Push project",
    repo_full_name: "student/push-project",
    evidence_state: "provisional",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-02T00:00:00.000Z",
    push_grant: true,
    ...overrides
  };
}

describe("buildProof projects", () => {
  it("marks a project verified only when a matching push grant exists", async () => {
    const sql = fakeSql([
      {
        match: /FROM projects p/,
        rows: [
          project({ id: "p-1", push_grant: true }),
          project({ id: "p-2", title: "No grant", repo_full_name: "student/no-grant", push_grant: false })
        ]
      }
    ]);

    const proof = await buildProof(sql, { userId: USER, tenantId: TENANT });
    const byId = Object.fromEntries(proof.items.map((item) => [item.id, item]));

    expect(byId["p-1"]).toMatchObject({ kind: "project", verified: true, source: "github" });
    expect(byId["p-2"]).toMatchObject({ kind: "project", verified: false, source: "project" });
    expect(proof.counts.verifiedProjects).toBe(1);
  });

  it("returns an empty proof for a missing user or tenant instead of querying", async () => {
    const sql = fakeSql();
    const proof = await buildProof(sql, { userId: null, tenantId: TENANT });
    expect(proof.items).toEqual([]);
    expect(sql.calls).toEqual([]);
  });
});

describe("buildProof counts", () => {
  it("derives every count from the same rows it returns", async () => {
    const sql = fakeSql([
      {
        match: /FROM projects p/,
        rows: [
          project({ id: "p-1", push_grant: true }),
          project({ id: "p-2", title: "Pending", push_grant: false })
        ]
      },
      {
        match: /FROM student_oss_contributions/,
        rows: [
          {
            id: "o-1",
            repo_url: "https://github.com/org/repo",
            pr_url: "https://github.com/org/repo/pull/7",
            pr_number: 7,
            title: "Fix the parser",
            status: "verified",
            merged_at: "2026-02-01T00:00:00.000Z",
            verified_at: "2026-02-01T00:00:00.000Z",
            created_at: "2026-01-30T00:00:00.000Z"
          },
          {
            id: "o-2",
            repo_url: "https://github.com/org/repo",
            pr_url: "https://github.com/org/repo/pull/9",
            pr_number: 9,
            title: "Claimed only",
            status: "claimed",
            merged_at: null,
            verified_at: null,
            created_at: "2026-02-02T00:00:00.000Z"
          }
        ]
      },
      {
        match: /FROM practice_connections/,
        rows: [{ username: "solver", total: "12", synced_at: "2026-03-01T00:00:00.000Z" }]
      },
      {
        match: /FROM practice_solves/,
        rows: [{ total: 3, last_at: "2026-03-02T00:00:00.000Z" }]
      },
      {
        match: /FROM certificates/,
        rows: [
          {
            id: "c-1",
            title: "Hackathon winner",
            verification_code: "ABC123",
            issued_at: "2026-03-03T00:00:00.000Z"
          }
        ]
      },
      {
        match: /FROM student_daily_activity/,
        rows: [
          {
            active_days: 4,
            last_day: "2026-03-04",
            commits: 9,
            pull_requests: 2,
            reviews: 1
          }
        ]
      }
    ]);

    const proof = await buildProof(sql, { userId: USER, tenantId: TENANT });
    const items = proof.items;
    const total = (kind, predicate = () => true) =>
      items.filter((item) => item.kind === kind && predicate(item)).length;

    expect(proof.counts.verifiedProjects).toBe(total("project", (item) => item.verified));
    expect(proof.counts.mergedPrs).toBe(total("oss", (item) => item.verified));
    expect(proof.counts.certificates).toBe(total("certificate"));
    expect(proof.counts.solvedProblems).toBe(12);
    expect(proof.counts.activeDays).toBe(4);

    // The claimed-only contribution is still shown honestly, but it is not counted.
    const claimed = items.find((item) => item.id === "o-2");
    expect(claimed).toMatchObject({ verified: false, source: "student_claim" });
  });
});

describe("buildProof defensive reads", () => {
  it("degrades to zero when the leetcode_stats column does not exist yet", async () => {
    const sql = fakeSql([
      {
        match: /leetcode_stats/,
        reject: true,
        message: 'column "leetcode_stats" does not exist'
      },
      {
        match: /FROM practice_solves/,
        rows: [{ total: 0, last_at: null }]
      }
    ]);

    const proof = await buildProof(sql, { userId: USER, tenantId: TENANT });

    expect(proof.counts.solvedProblems).toBe(0);
    expect(proof.items.some((item) => item.kind === "leetcode")).toBe(false);
    // Proves the fallback actually ran after the missing column threw.
    expect(sql.calls.some((call) => /leetcode_stats/.test(call.query))).toBe(true);
    expect(sql.calls.some((call) => /FROM practice_solves/.test(call.query))).toBe(true);
  });

  it("never writes: every statement buildProof issues is a read", async () => {
    const sql = fakeSql();
    await buildProof(sql, { userId: USER, tenantId: TENANT });

    expect(sql.calls.length).toBeGreaterThan(0);
    for (const call of sql.calls) {
      expect(call.query.trim().toUpperCase().startsWith("SELECT")).toBe(true);
      expect(call.query).not.toMatch(/\b(INSERT|UPDATE|DELETE|TRUNCATE|ALTER|CREATE|DROP)\b/);
    }
  });
});

describe("buildProof human review decisions", () => {
  const pendingProject = project({
    id: "p-2",
    title: "Awaiting review",
    repo_full_name: null,
    push_grant: false
  });

  it("flips an unverified item to verified with source review when approved", async () => {
    const sql = fakeSql([
      { match: /FROM projects p/, rows: [pendingProject] },
      {
        match: /FROM proof_reviews/,
        rows: [
          {
            signal: "project:p-2",
            decision: "approved",
            note: "Reviewed the repository by hand",
            decided_at: "2026-04-01T00:00:00.000Z"
          }
        ]
      }
    ]);

    const proof = await buildProof(sql, { userId: USER, tenantId: TENANT });
    expect(proof.items).toHaveLength(1);
    expect(proof.items[0]).toMatchObject({ id: "p-2", verified: true, source: "review" });
    expect(proof.counts.verifiedProjects).toBe(1);
  });

  it("keeps a rejected item unverified and does not delete it", async () => {
    const sql = fakeSql([
      { match: /FROM projects p/, rows: [pendingProject] },
      {
        match: /FROM proof_reviews/,
        rows: [{ signal: "project:p-2", decision: "rejected", note: null, decided_at: "2026-04-01T00:00:00.000Z" }]
      }
    ]);

    const proof = await buildProof(sql, { userId: USER, tenantId: TENANT });
    expect(proof.items).toHaveLength(1);
    expect(proof.items[0]).toMatchObject({ id: "p-2", verified: false, source: "review" });
    expect(proof.counts.verifiedProjects).toBe(0);
  });

  it("does not let a human rejection downgrade a machine-verified project", async () => {
    const sql = fakeSql([
      { match: /FROM projects p/, rows: [project({ id: "p-1", push_grant: true })] },
      { match: /FROM proof_reviews/, rows: [{ signal: "project:p-1", decision: "rejected" }] }
    ]);

    const proof = await buildProof(sql, { userId: USER, tenantId: TENANT });
    expect(proof.items[0]).toMatchObject({ id: "p-1", verified: true, source: "github" });
  });
});
