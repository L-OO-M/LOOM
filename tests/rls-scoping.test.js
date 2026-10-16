import { describe, expect, it, vi } from "vitest";

// Minimal postgres.js stand-in. Only the surface scopedSql() touches: tagged
// template calls and begin(). Statements are recorded so we can assert on the
// SQL and the order in which settings are applied.
function fakeClient() {
  const calls = [];
  const record = (strings, values) => {
    // postgres.js receives a TemplateStringsArray; read .raw[0] for the text.
    const text = Array.isArray(strings) && Array.isArray(strings.raw) ? strings.raw.join("?") : String(strings);
    calls.push({ type: "query", sql: text, values });
    return Promise.resolve([{ ok: true }]);
  };
  const makeTx = () => {
    const tx = (strings, ...values) => record(strings, values);
    tx.begin = async (fn) => {
      calls.push({ type: "begin" });
      return fn(makeTx());
    };
    return tx;
  };
  const client = (strings, ...values) => record(strings, values);
  client.begin = async (fn) => {
    calls.push({ type: "begin" });
    return fn(makeTx());
  };
  return { client, calls };
}

describe("scopedSql", () => {
  it("applies every GUC with SET LOCAL before the statement", async () => {
    const { client, calls } = fakeClient();
    const { scopedSql } = await import("@/lib/db");
    const sql = scopedSql(client, { "app.user_id": "u1", "app.tenant_id": "t1" });

    await sql`SELECT 1`;

    expect(calls[0].type).toBe("begin");
    const settings = calls.filter((c) => c.sql?.includes("set_config"));
    expect(settings.map((c) => c.values[0])).toEqual(["app.user_id", "app.tenant_id"]);
    // Every setting must be local, so it cannot leak onto a pooled connection.
    // The `true` third argument is a literal in the template, not a binding.
    for (const call of settings) expect(call.sql).toMatch(/set_config\(\?,\s*\?,\s*true\)/);
    expect(calls.at(-1).sql).toBe("SELECT 1");
  });

  it("skips null and undefined settings instead of writing a literal 'null' GUC", async () => {
    const { client, calls } = fakeClient();
    const { scopedSql } = await import("@/lib/db");
    const sql = scopedSql(client, { "app.user_id": "u1", "app.tenant_id": null });

    await sql`SELECT 1`;

    const settings = calls.filter((c) => c.sql?.includes("set_config"));
    expect(settings).toHaveLength(1);
    expect(settings[0].values[0]).toBe("app.user_id");
  });

  it("returns the client untouched when there is nothing to scope", async () => {
    const { client } = fakeClient();
    const { scopedSql } = await import("@/lib/db");
    expect(scopedSql(client, { "app.tenant_id": undefined })).toBe(client);
  });

  // Regression: begin() used to be swallowed by the proxy's apply trap, which
  // passed the callback into a template call. Admin role promotion runs inside
  // sql.begin(...) and would have broken entirely under enforcement.
  it("applies the GUCs inside an explicit transaction", async () => {
    const { client, calls } = fakeClient();
    const { scopedSql } = await import("@/lib/db");
    const sql = scopedSql(client, { "app.tenant_id": "t1" });

    const result = await sql.begin(async (tx) => tx`UPDATE profiles SET role = 'core'`);

    expect(result).toEqual([{ ok: true }]);
    const settings = calls.filter((c) => c.sql?.includes("set_config"));
    expect(settings).toHaveLength(1);
    // The settings must precede the caller's statement, inside the same txn.
    expect(settings[0].values[0]).toBe("app.tenant_id");
    expect(settings[0].sql).toMatch(/set_config\(\?,\s*\?,\s*true\)/);
    expect(calls.at(-1).sql).toBe("UPDATE profiles SET role = 'core'");
  });

  it("keeps the transaction open across several statements in one block", async () => {
    const { client, calls } = fakeClient();
    const { scopedSql } = await import("@/lib/db");
    const sql = scopedSql(client, { "app.user_id": "u1" });

    await sql.begin(async (tx) => {
      await tx`UPDATE profiles SET role = 'core'`;
      await tx`INSERT INTO audit_logs (actor_id) VALUES ('u1')`;
    });

    expect(calls.filter((c) => c.type === "begin")).toHaveLength(1);
    // One set_config for the whole block, not one per statement.
    expect(calls.filter((c) => c.sql?.includes("set_config"))).toHaveLength(1);
    expect(calls.filter((c) => c.type === "query")).toHaveLength(3);
  });

  it("does not re-apply the GUCs for a nested begin inside a scoped transaction", async () => {
    const { client, calls } = fakeClient();
    const { scopedSql } = await import("@/lib/db");
    const sql = scopedSql(client, { "app.tenant_id": "t1" });

    await sql.begin(async (tx) => {
      await tx`UPDATE profiles SET role = 'core'`;
      await tx.begin(async (nested) => nested`INSERT INTO audit_logs (actor_id) VALUES ('u1')`);
    });

    // The GUC is already set on the enclosing transaction; re-setting it per
    // nested block would be a wasted round-trip per statement.
    expect(calls.filter((c) => c.sql?.includes("set_config"))).toHaveLength(1);
  });

  it("forwards non-template client properties to the underlying client", async () => {
    const { client } = fakeClient();
    client.someHelper = () => "passthrough";
    const { scopedSql } = await import("@/lib/db");
    const sql = scopedSql(client, { "app.tenant_id": "t1" });

    expect(sql.someHelper()).toBe("passthrough");
  });
});

describe("DATABASE_APP_URL enforcement guard", () => {
  it("treats an explicitly set DATABASE_APP_URL as the only way RLS can engage", async () => {
    const previous = process.env.DATABASE_APP_URL;
    process.env.DATABASE_APP_URL = "postgresql://loom_app.x:p@h/db";
    vi.resetModules();
    const { env } = await import("@/lib/env");
    expect(env.DATABASE_APP_URL_EXPLICIT).toBe(true);

    delete process.env.DATABASE_APP_URL;
    vi.resetModules();
    const { env: fallback } = await import("@/lib/env");
    // Falls back so nothing breaks by omission, but the flag stays false --
    // that is what stops a half-configured deploy from looking enforced.
    expect(fallback.DATABASE_APP_URL_EXPLICIT).toBe(false);
    expect(fallback.DATABASE_APP_URL).toBe(process.env.DATABASE_URL);

    if (previous !== undefined) process.env.DATABASE_APP_URL = previous;
    else delete process.env.DATABASE_APP_URL;
  });
});