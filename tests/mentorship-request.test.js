import { beforeEach, describe, expect, it, vi } from "vitest";

const TENANT = "11111111-1111-4111-8111-111111111111";
const STUDENT = "student-1";
const MENTOR = "mentor-1";

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

async function load({ sql, tenant = { id: TENANT } }) {
  vi.resetModules();
  vi.doMock("@/lib/auth-server", () => ({
    getRequestContext: async () => ({
      user: { id: STUDENT },
      profile: { role: "student" },
      tenant,
      sql
    }),
    writeAudit: async () => {},
    notify: async () => {}
  }));
  const { GET, POST } = await import("@/app/api/mentorship/route");
  return { GET, POST };
}

function request(body) {
  return new Request("http://localhost/api/mentorship", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

describe("mentorship request scope", () => {
  beforeEach(() => vi.resetModules());

  it("lists only mentors in the caller's exact tenant", async () => {
    const sql = recorder(() => []);
    const { GET } = await load({ sql });

    const response = await GET();

    expect(response.status).toBe(200);
    const query = sql.calls.find((c) => c.text.includes("FROM mentors"));
    expect(query.text).toContain("m.tenant_id = ?::uuid");
    expect(query.text).not.toContain("IS NULL");
  });

  it("fails closed when the request has no chapter", async () => {
    const sql = recorder();
    const { GET, POST } = await load({ sql, tenant: null });

    expect((await GET()).status).toBe(403);
    expect((await POST(request({ mentorId: MENTOR }))).status).toBe(403);
    expect(sql.calls).toHaveLength(0);
  });

  it("refuses a duplicate open request", async () => {
    const sql = recorder((text) => {
      if (text.startsWith("SELECT * FROM mentors")) return [{ user_id: MENTOR }];
      if (text.includes("FROM mentor_sessions") && text.includes("status IN")) return [{ id: "session-1" }];
      return [];
    });
    const { POST } = await load({ sql });

    const response = await POST(request({ mentorId: MENTOR }));

    expect(response.status).toBe(409);
    expect(sql.calls.some((c) => c.text.startsWith("INSERT INTO mentor_sessions"))).toBe(false);
  });

  it("refuses a session request to yourself", async () => {
    const sql = recorder((text) => {
      if (text.startsWith("SELECT * FROM mentors")) return [{ user_id: STUDENT }];
      return [];
    });
    const { POST } = await load({ sql });

    const response = await POST(request({ mentorId: STUDENT }));

    expect(response.status).toBe(400);
    expect(sql.calls.some((c) => c.text.includes("status IN ('requested', 'scheduled')"))).toBe(false);
  });
});
