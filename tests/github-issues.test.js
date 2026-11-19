import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyIssueEvent,
  formatIssueBody,
  issueMarker,
  issuesConfig,
  issuesReady,
  statusForIssue,
  syncFeatureRequestToGitHub,
  syncStatusToGitHub
} from "@/lib/github-issues";

// The GitHub Issues bridge is optional and must never become the reason a
// feature request is lost. These tests pin the no-op behaviour when it is off,
// the marker that prevents duplicates, and the state mapping that keeps the
// LOOM board and the GitHub issue telling the same story.

const ENV_KEYS = ["GITHUB_ISSUES_REPO", "GITHUB_ISSUES_TOKEN"];
const REPO = "loom/chapter-ops";
const TOKEN = "ghp_" + "a".repeat(24);
let savedEnv = {};

function makeSql(results = []) {
  const calls = [];
  const queue = [...results];
  function sql(strings, ...values) {
    const text = strings.join("?").replace(/\s+/g, " ").trim();
    calls.push({ text, values });
    return Promise.resolve(queue.length ? queue.shift() : []);
  }
  return { sql, calls };
}

function configure() {
  process.env.GITHUB_ISSUES_REPO = REPO;
  process.env.GITHUB_ISSUES_TOKEN = TOKEN;
}

function issue(over = {}) {
  return {
    number: 12,
    html_url: "https://github.com/loom/chapter-ops/issues/12",
    state: "open",
    state_reason: null,
    ...over
  };
}

beforeEach(() => {
  savedEnv = {};
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

describe("configuration", () => {
  it("is off and exposes no token until both values are valid", () => {
    expect(issuesConfig()).toEqual({ configured: false, repo: null, hasToken: false, token: null });
    expect(issuesReady()).toBe(false);

    process.env.GITHUB_ISSUES_REPO = REPO;
    expect(issuesConfig().configured).toBe(false);

    process.env.GITHUB_ISSUES_TOKEN = "too-short";
    expect(issuesConfig()).toMatchObject({ configured: false, repo: REPO, hasToken: false, token: null });
  });

  it("rejects a malformed repository instead of calling GitHub", () => {
    process.env.GITHUB_ISSUES_REPO = "not-a-repo";
    process.env.GITHUB_ISSUES_TOKEN = TOKEN;
    expect(issuesConfig()).toMatchObject({ configured: false, repo: null, hasToken: true, token: null });
  });

  it("enables the bridge only for a valid repo and a plausible token", () => {
    configure();
    expect(issuesConfig()).toMatchObject({ configured: true, repo: REPO, token: TOKEN });
    expect(issuesReady()).toBe(true);
  });
});

describe("issueMarker and formatIssueBody", () => {
  it("writes a stable hidden marker that a later sync can find", () => {
    expect(issueMarker("fr-1")).toBe("<!-- loom-feature-request:fr-1 -->");
    const body = formatIssueBody({ id: "fr-1", description: "x" }, {});
    expect(body.startsWith("<!-- loom-feature-request:fr-1 -->")).toBe(true);
  });

  it("includes optional sections only when the request has them", () => {
    const short = formatIssueBody(
      { id: "fr-2", description: "A short idea", title: "Idea" },
      { tenantName: "LOOM", appUrl: "https://lets-loom.xyz" }
    );
    expect(short).toContain("A short idea");
    expect(short).toContain("- **Category:** general");
    expect(short).toContain("- **Chapter:** LOOM");
    expect(short).toContain("- **Requested by:** a member");
    expect(short).toContain("- **Status in LOOM:** pending");
    expect(short).not.toContain("### Integration");
    expect(short).not.toContain("### Trade-offs");

    const full = formatIssueBody({
      id: "fr-3",
      description: "Idea",
      integration: "Hooks into events",
      tradeoffs: "More cron work",
      implementation: "A small worker"
    });
    expect(full).toContain("### Integration\nHooks into events");
    expect(full).toContain("### Trade-offs\nMore cron work");
    expect(full).toContain("### Implementation notes\nA small worker");
  });

  it("normalises the trailing slash of the app URL", () => {
    const body = formatIssueBody({ id: "fr-4", description: "x" }, { appUrl: "https://lets-loom.xyz///" });
    expect(body).toContain("https://lets-loom.xyz/admin/feature-requests");
    expect(body).not.toContain("xyz///");
  });

  it("omits the link entirely when no origin is known", () => {
    const body = formatIssueBody({ id: "fr-5", description: "x" }, {});
    expect(body).toMatch(/_Synced from LOOM_/);
    expect(body).not.toContain("/admin/feature-requests");
  });
});

describe("statusForIssue", () => {
  it("maps GitHub's decision states onto the LOOM board", () => {
    expect(statusForIssue(issue({ state: "closed", state_reason: "completed" }))).toBe("built");
    expect(statusForIssue(issue({ state: "closed", state_reason: "not_planned" }))).toBe("rejected");
    expect(statusForIssue(issue({ state: "closed", state_reason: null }))).toBe("built");
  });

  it("does not decide anything for an open issue", () => {
    expect(statusForIssue(issue({ state: "open" }))).toBe(null);
    expect(statusForIssue(null)).toBe(null);
    expect(statusForIssue(undefined)).toBe(null);
  });
});

describe("applyIssueEvent", () => {
  it("ignores events without a repo or a numeric issue number", async () => {
    const { sql, calls } = makeSql();
    await expect(applyIssueEvent({ sql, repo: null, issue: issue() })).resolves.toBe(null);
    await expect(applyIssueEvent({ sql, repo: REPO, issue: { number: "12" } })).resolves.toBe(null);
    await expect(applyIssueEvent({ sql, repo: REPO, issue: null })).resolves.toBe(null);
    expect(calls).toHaveLength(0);
  });

  it("updates by repo and number, never by a webhook tenant", async () => {
    const { sql, calls } = makeSql([[{ id: "fr-1", status: "built" }]]);
    const row = await applyIssueEvent({
      sql,
      repo: REPO,
      issue: issue({ state: "closed", state_reason: "completed" })
    });
    expect(row).toEqual({ id: "fr-1", status: "built" });
    expect(calls[0].text).toMatch(/WHERE github_issue_repo = \?/);
    expect(calls[0].text).toMatch(/github_issue_number = \?/);
    expect(calls[0].values).toContain(REPO);
    expect(calls[0].values).toContain(12);
    expect(calls[0].values).toContain("built");
  });

  it("only revives a built/rejected request when the issue is reopened", async () => {
    const { sql, calls } = makeSql([[]]);
    await applyIssueEvent({ sql, repo: REPO, issue: issue({ state: "open" }) });
    expect(calls[0].text).toMatch(/status IN \('built', 'rejected'\) THEN 'in_progress'/);
    expect(calls[0].values).toContain(null);
  });

  it("returns null when no linked request exists", async () => {
    const { sql } = makeSql([[]]);
    await expect(
      applyIssueEvent({ sql, repo: REPO, issue: issue() })
    ).resolves.toBe(null);
  });
});

describe("syncFeatureRequestToGitHub", () => {
  it("does nothing without a saved row", async () => {
    const { sql, calls } = makeSql();
    await expect(syncFeatureRequestToGitHub({ sql })).resolves.toMatchObject({ ok: false, code: "NO_ROW" });
    expect(calls).toHaveLength(0);
  });

  it("is a no-op when the bridge is not configured", async () => {
    const { sql, calls } = makeSql();
    const row = { id: "fr-1", title: "Idea" };
    await expect(syncFeatureRequestToGitHub({ sql, row })).resolves.toEqual({
      ok: false,
      code: "NOT_CONFIGURED",
      row
    });
    expect(calls).toHaveLength(0);
  });

  it("creates one issue with a marker and stores the link scoped to the row's tenant", async () => {
    configure();
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => issue({ number: 7, state: "open" })
    }));
    vi.stubGlobal("fetch", fetchMock);
    const { sql, calls } = makeSql([[{ id: "fr-1", github_issue_number: 7 }]]);

    const result = await syncFeatureRequestToGitHub({
      sql,
      row: { id: "fr-1", title: "Dark mode", description: "Please" },
      tenantId: "t1",
      tenantName: "LOOM",
      appUrl: "https://lets-loom.xyz"
    });

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`https://api.github.com/repos/${REPO}/issues`);
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe(`Bearer ${TOKEN}`);
    const body = JSON.parse(init.body);
    expect(body.title).toBe("[Feature] Dark mode");
    expect(body.body).toContain("<!-- loom-feature-request:fr-1 -->");
    expect(body).not.toContain(TOKEN);
    expect(calls[0].values).toContain("t1");
    expect(calls[0].text).toMatch(/tenant_id = \?::uuid/);
  });

  it("truncates an overlong title before sending it", async () => {
    configure();
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => issue() }));
    vi.stubGlobal("fetch", fetchMock);
    const { sql } = makeSql([[{ id: "fr-1" }]]);
    await syncFeatureRequestToGitHub({ sql, row: { id: "fr-1", title: "x".repeat(500) }, tenantId: "t1" });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).title.length).toBeLessThanOrEqual(210);
  });

  it("records a readable error and returns the failure when GitHub rejects the create", async () => {
    configure();
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 403 })));
    const { sql, calls } = makeSql([[{ id: "fr-1", github_issue_error: "GitHub refused the request (403)." }]]);
    const result = await syncFeatureRequestToGitHub({
      sql,
      row: { id: "fr-1", title: "Idea" },
      tenantId: "t1"
    });
    expect(result).toMatchObject({ ok: false, code: "GITHUB_403", status: 403 });
    expect(result.message).toMatch(/issues:write/);
    expect(calls[0].text).toMatch(/github_issue_error = \?/);
    expect(calls[0].values[0]).toMatch(/403/);
  });

  it("does not throw when GitHub is unreachable", async () => {
    configure();
    vi.stubGlobal("fetch", vi.fn(async () => {
      const error = new Error("timeout");
      error.name = "TimeoutError";
      throw error;
    }));
    const { sql } = makeSql([[{ id: "fr-1" }]]);
    const result = await syncFeatureRequestToGitHub({
      sql,
      row: { id: "fr-1", title: "Idea" },
      tenantId: "t1"
    });
    expect(result).toMatchObject({ ok: false, code: "GITHUB_TIMEOUT" });
  });
});

describe("syncStatusToGitHub", () => {
  it("does nothing when the request is not linked", async () => {
    const { sql } = makeSql();
    await expect(syncStatusToGitHub({ sql, row: { id: "fr-1" }, status: "built" })).resolves.toEqual({
      ok: false,
      code: "NOT_LINKED"
    });
  });

  it("does nothing when the bridge is not configured", async () => {
    const { sql } = makeSql();
    await expect(
      syncStatusToGitHub({ sql, row: { id: "fr-1", github_issue_number: 4 }, status: "built" })
    ).resolves.toEqual({ ok: false, code: "NOT_CONFIGURED" });
  });

  it("closes as completed and comments when the request ships", async () => {
    configure();
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({}) }));
    vi.stubGlobal("fetch", fetchMock);
    const { sql, calls } = makeSql([[], [{ id: "fr-1" }]]);

    const result = await syncStatusToGitHub({
      sql,
      row: { id: "fr-1", github_issue_number: 4, github_issue_url: "https://github.com/x/y/issues/4" },
      tenantId: "t1",
      status: "built",
      note: "Shipped in v2"
    });

    expect(result).toEqual({ ok: true });
    const patch = fetchMock.mock.calls[0];
    expect(patch[0]).toContain("/issues/4");
    expect(JSON.parse(patch[1].body)).toEqual({ state: "closed", state_reason: "completed" });
    const comment = fetchMock.mock.calls[1];
    expect(comment[0]).toContain("/issues/4/comments");
    expect(JSON.parse(comment[1].body).body).toContain("Shipped in LOOM");
    expect(JSON.parse(comment[1].body).body).toContain("Shipped in v2");
    expect(calls[0].values).toContain("closed");
  });

  it("closes as not planned when the request is rejected", async () => {
    configure();
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({}) }));
    vi.stubGlobal("fetch", fetchMock);
    const { sql } = makeSql([[], [{ id: "fr-1" }]]);
    await syncStatusToGitHub({
      sql,
      row: { id: "fr-1", github_issue_number: 4, github_issue_url: "u" },
      tenantId: "t1",
      status: "rejected"
    });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      state: "closed",
      state_reason: "not_planned"
    });
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).body).toContain("Not moving forward");
  });

  it("reopens the issue for any non-terminal status", async () => {
    configure();
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({}) }));
    vi.stubGlobal("fetch", fetchMock);
    const { sql } = makeSql([[{ id: "fr-1" }]]);
    const result = await syncStatusToGitHub({
      sql,
      row: { id: "fr-1", github_issue_number: 4, github_issue_url: "u" },
      tenantId: "t1",
      status: "in_progress"
    });
    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ state: "open" });
  });

  it("records the error when the close fails, without throwing", async () => {
    configure();
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 404 })));
    const { sql, calls } = makeSql([[{ id: "fr-1" }]]);
    const result = await syncStatusToGitHub({
      sql,
      row: { id: "fr-1", github_issue_number: 4, github_issue_url: "u" },
      tenantId: "t1",
      status: "built"
    });
    expect(result).toMatchObject({ ok: false, code: "GITHUB_404" });
    expect(calls[0].text).toMatch(/github_issue_error/);
  });
});
