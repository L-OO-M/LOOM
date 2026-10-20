import { describe, expect, it } from "vitest";
import { ownedRepos, rememberRepos } from "@/lib/github-repos";

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

describe("rememberRepos", () => {
  it("supplies the non-defaulted repositories id", async () => {
    const sql = fakeSql();
    await rememberRepos({
      sql,
      userId: "student-1",
      tenantId: "tenant-1",
      login: "student",
      githubUserId: 42,
      repos: [repo()]
    });

    expect(sql.calls).toHaveLength(2);
    expect(sql.calls[0].query).toContain("INSERT INTO repositories");
    expect(sql.calls[0].query).toContain("(id, student_id");
    expect(sql.calls[0].values[0]).toMatch(UUID);
    expect(sql.calls[1].query).toContain("INSERT INTO github_repo_grants");
  });

  it("writes the same grant row the project route verifies", async () => {
    const sql = fakeSql();
    await rememberRepos({
      sql,
      userId: "student-1",
      tenantId: "tenant-1",
      login: "student",
      githubUserId: 42,
      repos: [repo()]
    });

    const grant = sql.calls[1];
    expect(grant.query).toContain("github_repo_grants");
    expect(grant.values).toContain("student/project");
    expect(grant.values).toContain(42);
  });
});
