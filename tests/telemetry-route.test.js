import { beforeEach, describe, expect, it, vi } from "vitest";

const TENANT = "11111111-1111-4111-8111-111111111111";

function request(body, headers = {}) {
  return new Request("http://localhost/api/telemetry", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "sec-fetch-site": "same-origin",
      "user-agent": "Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 Safari/605.1.15",
      ...headers
    },
    body: JSON.stringify(body)
  });
}

async function loadRoute(ctx, tenant = { id: TENANT }) {
  vi.resetModules();
  const calls = [];
  const sql = (strings, ...values) => {
    calls.push({ text: strings.join("?"), values });
    return Promise.resolve([]);
  };
  sql.json = (value) => value;
  vi.doMock("@/lib/auth-server", () => ({ getRequestContext: async () => ctx }));
  vi.doMock("@/lib/tenant", () => ({ getTenantFromRequest: async () => tenant }));
  vi.doMock("@/lib/db", () => ({ getSql: () => sql }));
  vi.doMock("@/lib/rate-limit", () => ({
    checkRateLimit: async () => ({ ok: true, retryAfter: 0 }),
    clientIp: () => "203.0.113.9"
  }));
  const { POST } = await import("@/app/api/telemetry/route");
  return { POST, calls };
}

describe("telemetry ingest", () => {
  beforeEach(() => vi.resetModules());

  it("stores a signed-in page view on the session's tenant", async () => {
    const { POST, calls } = await loadRoute({
      user: { id: "user-1" },
      profile: { role: "student", analytics_opt_out: false },
      tenant: { id: TENANT }
    });
    const response = await POST(
      request({ events: [{ event: "page_view", path: "/student/practice?week=3", sessionKey: "session-abc" }] })
    );
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.data.stored).toBe(1);
    const insert = calls.find((call) => call.text.includes("INSERT INTO page_views"));
    expect(insert).toBeTruthy();
    expect(insert.values).toContain(TENANT);
    expect(insert.values).toContain("user-1");
    expect(insert.values).toContain("/student/practice");
  });

  it("accepts anonymous public traffic and resolves the tenant from the request", async () => {
    const { POST, calls } = await loadRoute({ user: null, profile: null, tenant: null, error: "UNAUTHORIZED" });
    const response = await POST(request({ events: [{ event: "page_view", path: "/events" }] }));
    expect((await response.json()).data.stored).toBe(1);
    const insert = calls.find((call) => call.text.includes("INSERT INTO page_views"));
    expect(insert.values).toContain(TENANT);
    expect(insert.values).toContain(null);
  });

  it("does not write for an account that turned analytics off", async () => {
    const { POST, calls } = await loadRoute({
      user: { id: "user-1" },
      profile: { role: "student", analytics_opt_out: true },
      tenant: { id: TENANT }
    });
    const response = await POST(request({ events: [{ event: "page_view", path: "/student" }] }));
    expect((await response.json()).data).toMatchObject({ stored: 0, optedOut: true });
    expect(calls).toHaveLength(0);
  });

  it("drops bots and cross-site posts before any query", async () => {
    const { POST, calls } = await loadRoute({ user: null, profile: null, tenant: null });
    const bot = await POST(
      request({ events: [{ event: "page_view", path: "/student" }] }, { "user-agent": "Googlebot/2.1" })
    );
    const cross = await POST(
      request({ events: [{ event: "page_view", path: "/student" }] }, { "sec-fetch-site": "cross-site" })
    );
    expect((await bot.json()).data.stored).toBe(0);
    expect((await cross.json()).data.stored).toBe(0);
    expect(calls).toHaveLength(0);
  });

  it("writes tour events and merges completion into the profile", async () => {
    const { POST, calls } = await loadRoute({
      user: { id: "user-1" },
      profile: { role: "student", analytics_opt_out: false },
      tenant: { id: TENANT }
    });
    const response = await POST(
      request({
        events: [
          {
            event: "tour_complete",
            path: "/student",
            target: "student",
            metadata: { tour: "student", version: 1 }
          }
        ]
      })
    );
    expect((await response.json()).data.stored).toBe(1);
    expect(calls.some((call) => call.text.includes("INSERT INTO ui_events"))).toBe(true);
    const update = calls.find((call) => call.text.includes("UPDATE profiles SET tour_state"));
    expect(update).toBeTruthy();
    expect(update.values).toContainEqual({ student: 1 });
  });

  it("drops unknown and over-long batches", async () => {
    const { POST, calls } = await loadRoute({ user: null, profile: null, tenant: null });
    const unknown = await POST(request({ events: [{ event: "purchase", path: "/" }] }));
    expect((await unknown.json()).data.stored).toBe(0);
    const many = { events: Array.from({ length: 11 }, () => ({ event: "page_view", path: "/" })) };
    const over = await POST(request(many));
    expect(over.status).toBe(413);
    expect(calls).toHaveLength(0);
  });
});
