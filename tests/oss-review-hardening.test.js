import { afterEach, describe, expect, it, vi } from "vitest";

const TENANT = "11111111-1111-4111-8111-111111111111";
const STUDENT = "22222222-2222-4222-8222-222222222222";
const CONTRIBUTION = "33333333-3333-4333-8333-333333333333";

const contexts = [];

function makeSql(handler = () => []) {
  const calls = [];
  const sql = (strings, ...values) => {
    const text = strings.join("?").replace(/\s+/g, " ").trim();
    calls.push({ text, values });
    return Promise.resolve(handler(text, values) ?? []);
  };
  sql.calls = calls;
  return sql;
}

async function loadReview() {
  vi.resetModules();
  vi.doMock("@/lib/auth-server", () => ({
    getRequestContext: async () => contexts.shift(),
    writeAudit: async () => {},
    notify: async () => {}
  }));
  return import("@/app/api/opensource/contributions/[id]/route");
}

afterEach(() => {
  vi.doUnmock("@/lib/auth-server");
  contexts.length = 0;
});

describe("OSS review hardening", () => {
  it("requires the reviewer to confirm the linked claim before verifying", async () => {
    const row = {
      id: CONTRIBUTION, tenant_id: TENANT, student_id: STUDENT,
      contribution_type: "pr", canonical_url: "https://github.com/acme/app/pull/1",
      pr_url: "https://github.com/acme/app/pull/1", repo_url: "https://github.com/acme/app",
      status: "claimed"
    };
    const sql = makeSql((text) => {
      if (text.startsWith("SELECT * FROM student_oss_contributions")) return [row];
      return [];
    });
    contexts.push({ user: { id: "admin-1" }, tenant: { id: TENANT }, sql });

    const { PATCH } = await loadReview();
    const response = await PATCH(
      new Request("http://localhost/api/opensource/contributions/x", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "verified" })
      }),
      { params: Promise.resolve({ id: CONTRIBUTION }) }
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("REVIEW_CONFIRMATION_REQUIRED");
    expect(sql.calls.some((c) => /UPDATE student_oss_contributions/.test(c.text))).toBe(false);
  });

  it("refuses a second student claiming the same issue", async () => {
    vi.resetModules();
    vi.doMock("@/lib/auth-server", () => ({
      getRequestContext: async () => contexts.shift(),
      writeAudit: async () => {}
    }));
    const sql = makeSql((text) => {
      if (text.startsWith("SELECT id, student_id FROM student_oss_contributions")) {
        return [{ id: "other", student_id: "someone-else" }];
      }
      if (text.startsWith("SELECT * FROM open_source_projects")) {
        return [{ id: "p1", owner: "acme", repo_name: "app", github_repo_url: "https://github.com/acme/app" }];
      }
      return [];
    });
    contexts.push({ user: { id: STUDENT }, tenant: { id: TENANT }, sql });
    const { POST } = await import("@/app/api/opensource/contributions/route");

    const response = await POST(new Request("http://localhost/api/opensource/contributions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prUrl: "https://github.com/acme/app/issues/7" })
    }));
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error.code).toBe("ISSUE_ALREADY_CLAIMED");
    expect(sql.calls.some((c) => /INSERT INTO student_oss_contributions/.test(c.text))).toBe(false);
  });
});
