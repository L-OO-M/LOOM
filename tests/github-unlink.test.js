import { beforeEach, describe, expect, it, vi } from "vitest";

const TENANT = "11111111-1111-4111-8111-111111111111";
const USER = "student-1";

function recorder(handler = () => []) {
  const calls = [];
  const sql = (strings, ...values) => {
    const text = strings.join("?").replace(/\s+/g, " ").trim();
    calls.push({ text, values });
    return Promise.resolve(handler(text, values) ?? []);
  };
  sql.calls = calls;
  return sql;
}

describe("GitHub unlink", () => {
  beforeEach(() => vi.resetModules());

  it("downgrades GitHub-verified projects and scopes revocation to the tenant", async () => {
    const sql = recorder((text) => {
      if (text.startsWith("SELECT github_username")) return [{ github_username: "octocat" }];
      if (text.startsWith("DELETE FROM ranking_events")) return [{ ref_id: "project-1" }];
      if (text.startsWith("UPDATE projects")) return [{ id: "project-1" }];
      return [];
    });
    const audit = [];
    const recomputeScore = vi.fn(async () => {});
    vi.doMock("@/lib/auth-server", () => ({
      getRequestContext: async () => ({
        user: { id: USER },
        profile: { role: "student" },
        tenant: { id: TENANT },
        sql
      }),
      writeAudit: async (args) => audit.push(args)
    }));
    vi.doMock("@/lib/ranking", () => ({ recomputeScore }));
    const { DELETE } = await import("@/app/api/github/route");

    const response = await DELETE();

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.downgradedProjects).toBe(1);
    expect(body.data.revokedEvidence).toBe(1);

    const update = sql.calls.find((c) => c.text.startsWith("UPDATE projects"));
    expect(update.text).toContain("evidence_state = 'provisional'");
    expect(update.text).toContain("verified_by LIKE 'github:%'");
    expect(update.text).toContain("tenant_id = ?::uuid");
    expect(update.values).toContain(TENANT);
    expect(recomputeScore).toHaveBeenCalledWith(sql, TENANT, USER);
    expect(audit[0].after.downgradedProjects).toBe(1);
  });
});

describe("GitHub OAuth callback identity", () => {
  beforeEach(() => vi.resetModules());

  it("refuses to switch to a different GitHub account without unlinking", async () => {
    const sql = recorder((text) => {
      if (text.includes("WHERE github_user_id = ?") && text.includes("user_id <>")) return [];
      if (text.startsWith("SELECT github_user_id FROM github_connections")) return [{ github_user_id: 123 }];
      return [];
    });
    const audit = [];
    vi.doMock("@/lib/auth-server", () => ({
      getRequestContext: async () => ({
        user: { id: USER },
        profile: { role: "student" },
        tenant: { id: TENANT },
        sql
      }),
      writeAudit: async (args) => audit.push(args),
      notify: async () => {}
    }));
    vi.doMock("@/lib/env", () => ({
      env: {
        NEXT_PUBLIC_APP_URL: "http://localhost",
        GITHUB_CLIENT_ID: "client-id",
        GITHUB_CLIENT_SECRET: "client-secret",
        GITHUB_WEBHOOK_SECRET: "webhook-secret"
      }
    }));
    vi.doMock("@/lib/crypto", () => ({ seal: (v) => `sealed:${v}` }));
    vi.doMock("@/lib/ranking", () => ({
      recomputeScore: async () => {},
      recordEvidence: async () => {}
    }));
    vi.doMock("@/lib/github-oauth", () => ({
      verifyState: () => ({ ok: true, nonce: "nonce-1", userId: USER }),
      isValidPkceVerifier: () => true,
      exchangeCode: async () => ({ ok: true, accessToken: "token", scopes: ["repo"], expiresIn: null }),
      fetchAuthenticatedUser: async () => ({ ok: true, id: 999, login: "different-user" }),
      fetchRepoPermissions: async () => ({ ok: false, reason: "NOT_CALLED" }),
      ensureWebhook: async () => ({ ok: true, installed: false })
    }));

    const { GET } = await import("@/app/api/github/oauth/callback/route");
    const request = new Request("http://localhost/api/github/oauth/callback?code=abc&state=signed", {
      headers: { cookie: `loom_gh_oauth=nonce-1.${"v".repeat(43)}.` }
    });

    const response = await GET(request);

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toContain("error=github_unlink_first");
    expect(sql.calls.some((c) => c.text.startsWith("INSERT INTO github_connections"))).toBe(false);
    expect(audit.some((a) => a.resourceId === "IDENTITY_SWAP_REQUIRES_UNLINK")).toBe(true);
  });
});

describe("GitHub webhook revocation", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doUnmock("@/lib/github-oauth");
    vi.doUnmock("@/lib/env");
    vi.doUnmock("@/lib/crypto");
  });

  function hookFetch({ hooks, listStatus = 200, deleteStatus = 204 } = {}) {
    const calls = [];
    const fetchImpl = async (url, init = {}) => {
      calls.push({ url: String(url), method: init.method || "GET" });
      if ((init.method || "GET") === "GET") {
        return new Response(JSON.stringify(listStatus === 200 ? hooks : { message: "nope" }), {
          status: listStatus,
          headers: { "content-type": "application/json" }
        });
      }
      return new Response(null, { status: deleteStatus });
    };
    fetchImpl.calls = calls;
    return fetchImpl;
  }

  it("removes only hooks pointing at this deployment", async () => {
    const { removeWebhook } = await import("@/lib/github-oauth");
    const fetchImpl = hookFetch({
      hooks: [
        { id: 1, config: { url: "https://loom.example/api/github/webhook" } },
        { id: 2, config: { url: "https://other.example/api/github/webhook" } }
      ]
    });
    const result = await removeWebhook({
      accessToken: "token",
      fullName: "owner/repo",
      webhookUrl: "https://loom.example/api/github/webhook",
      fetchImpl
    });
    expect(result).toEqual({ ok: true, removed: 1 });
    expect(fetchImpl.calls.map((c) => c.method + " " + c.url)).toEqual([
      "GET https://api.github.com/repos/owner/repo/hooks",
      "DELETE https://api.github.com/repos/owner/repo/hooks/1"
    ]);
  });

  it("reports admin/API failures without throwing", async () => {
    const { removeWebhook } = await import("@/lib/github-oauth");
    const result = await removeWebhook({
      accessToken: "token",
      fullName: "owner/repo",
      webhookUrl: "https://loom.example/api/github/webhook",
      fetchImpl: hookFetch({ listStatus: 403 })
    });
    expect(result).toEqual({ ok: false, reason: "NEEDS_ADMIN" });
  });

  it("is a no-op when the hook is already absent", async () => {
    const { removeWebhook } = await import("@/lib/github-oauth");
    const fetchImpl = hookFetch({ hooks: [] });
    const result = await removeWebhook({
      accessToken: "token",
      fullName: "owner/repo",
      webhookUrl: "https://loom.example/api/github/webhook",
      fetchImpl
    });
    expect(result).toEqual({ ok: true, removed: 0 });
    expect(fetchImpl.calls).toHaveLength(1);
  });
});
