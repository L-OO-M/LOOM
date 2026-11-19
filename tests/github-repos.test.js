import { describe, expect, it } from "vitest";
import { ownedRepos, rememberRepoMetadata } from "@/lib/github-repos";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function repo(overrides = {}) {
  return {
    githubId: 1,
    owner: "student",
    name: "project",
    fullName: "student/project",
    htmlUrl: "https://github.com/student/project",
    description: "A project",
    language: "JavaScript",
    stars: 3,
    forks: 1,
    openIssues: 0,
    topics: ["nextjs"],
    isPrivate: false,
    isFork: false,
    defaultBranch: "main",
    pushedAt: "2026-01-02T03:04:05.000Z",
    canPush: true,
    canAdmin: false,
    ...overrides
  };
}

function fakeSql() {
  const calls = [];
  const sql = (strings, ...values) => {
    calls.push({ query: strings.join("?"), values });
    return Promise.resolve([{ id: values[0] }]);
  };
  sql.calls = calls;
  return sql;
}

describe("ownedRepos", () => {
  it("keeps only repos the linked account owns and can push to", () => {
    const repos = [
      repo(),
      repo({ fullName: "org/project", owner: "org" }),
      repo({ fullName: "student/readonly", canPush: false })
    ];
    expect(ownedRepos(repos, "student").map((r) => r.fullName)).toEqual(["student/project"]);
  });
});

describe("rememberRepoMetadata", () => {
  it("upserts repository metadata in a single bulk round trip", async () => {
    const sql = fakeSql();
    await rememberRepoMetadata({
      sql,
      userId: "student-1",
      tenantId: "tenant-1",
      login: "student",
      repos: [repo()]
    });

    // Exactly one INSERT ... SELECT ... FROM jsonb_to_recordset
    expect(sql.calls).toHaveLength(1);
    const call = sql.calls[0];
    expect(call.query).toContain("INSERT INTO repositories");
    expect(call.query).toContain("jsonb_to_recordset");
    expect(call.query).toContain("ON CONFLICT (student_id, (lower(full_name)))");
    // No grant insert — grants are explicit-only now
    expect(call.query).not.toContain("github_repo_grants");
  });

  it("returns the upserted rows with all columns", async () => {
    const sql = fakeSql();
    await rememberRepoMetadata({
      sql,
      userId: "student-1",
      tenantId: "tenant-1",
      login: "student",
      repos: [repo()]
    });

    // fakeSql wraps values in an array; the first arg is the userId
    expect(sql.calls[0].values[0]).toBe("student-1");
    // jsonb_to_recordset requires the parameter to BE an array. A pre-stringified
    // value double-encodes under the explicit ::jsonb cast and the statement
    // throws "cannot call jsonb_to_recordset on a non-array" at runtime.
    expect(sql.calls[0].values.some((value) => Array.isArray(value))).toBe(true);
    expect(sql.calls[0].values.some((value) => typeof value === "string" && value.startsWith("[{"))).toBe(false);
    // The RETURNING * should include all repository columns
    expect(sql.calls[0].query).toContain("RETURNING *");
  });
});

describe("rememberRepoMetadata with multiple repos", () => {
  it("upserts many repos in one statement", async () => {
    const sql = fakeSql();
    await rememberRepoMetadata({
      sql,
      userId: "student-1",
      tenantId: "tenant-1",
      login: "student",
      repos: [
        repo({ fullName: "student/project1" }),
        repo({ fullName: "student/project2" }),
        repo({ fullName: "student/project3" })
      ]
    });

    // Still one statement for all repos
    expect(sql.calls).toHaveLength(1);
    expect(sql.calls[0].query).toContain("jsonb_to_recordset");
    // Should return 3 rows
    expect(sql.calls[0].query).toContain("RETURNING *");
  });

  it("handles empty repo list gracefully", async () => {
    const sql = fakeSql();
    await rememberRepoMetadata({
      sql,
      userId: "student-1",
      tenantId: "tenant-1",
      login: "student",
      repos: []
    });

    // No-op, no SQL sent
    expect(sql.calls).toHaveLength(0);
  });
});