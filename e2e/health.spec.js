const { test, expect } = require("@playwright/test");

// The health endpoint used to return status "ready" and database
// "supabase_postgres" as hardcoded literals, never opening a connection. These
// assert the reported state is actually derived, and that the unauthenticated
// response carries no infrastructure detail.
test.describe("health endpoint", () => {
  test("reports real check results rather than hardcoded literals", async ({ request }) => {
    const res = await request.get("/api/health");
    const body = await res.json();

    expect(body.ok).toBe(true);
    const data = body.data;

    // Must be one of the two derived values, and consistent with the HTTP status.
    expect(["ready", "degraded"]).toContain(data.status);
    expect([200, 503]).toContain(res.status());
    expect((res.status() === 200) === (data.status === "ready")).toBe(true);

    // Previously the literal string "supabase_postgres".
    expect(data.checks.database).not.toBe("supabase_postgres");
    expect(["ok", "unreachable"]).toContain(data.checks.database);

    // Isolation state must be reported from the flag, not assumed.
    expect(data.isolation).toBeTruthy();
    expect(typeof data.isolation.flag).toBe("boolean");
    expect(typeof data.isolation.effective).toBe("boolean");

    // effective implies both the flag and a non-BYPASSRLS role.
    if (data.isolation.effective) {
      expect(data.isolation.flag).toBe(true);
      expect(data.isolation.connection).toBe("loom_app");
    }
  });

  test("does not leak infrastructure details to an anonymous caller", async ({ request }) => {
    const res = await request.get("/api/health");
    const raw = await res.text();

    expect(raw).not.toContain("pooler.supabase.com");
    expect(raw).not.toContain("PASSWORD");
    expect(raw).not.toContain("DATABASE_URL");
    // Tenant identity beyond the slug is not published.
    expect(raw).not.toMatch(/"id"\s*:\s*"[0-9a-f]{8}-[0-9a-f]{4}-/i);
  });
});