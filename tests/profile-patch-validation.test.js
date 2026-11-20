import { beforeEach, describe, expect, it, vi } from "vitest";

const USER = "student-1";
const TENANT = "11111111-1111-4111-8111-111111111111";

function patchRequest(body) {
  return new Request("http://localhost/api/profile", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body)
  });
}

function makeSql() {
  const calls = [];
  const sql = (strings, ...values) => {
    const text = strings.join("?").replace(/\s+/g, " ").trim();
    calls.push({ text, values });
    if (text.startsWith("SELECT")) return Promise.resolve([{ name: "Yash Bansal" }]);
    return Promise.resolve([{ name: "Yash Bansal", primary_domain: "web", year: 3 }]);
  };
  return { sql, calls };
}

async function load() {
  const { sql, calls } = makeSql();
  vi.resetModules();
  vi.doMock("@/lib/auth-server", () => ({
    getRequestContext: async () => ({
      user: { id: USER },
      profile: { role: "student" },
      tenant: { id: TENANT },
      sql
    }),
    writeAudit: async () => {}
  }));
  const mod = await import("@/app/api/profile/route");
  return { ...mod, calls };
}

describe("PATCH /api/profile input tolerance", () => {
  beforeEach(() => vi.resetModules());

  it("accepts the shape a real form sends: padded text, string year, label domain", async () => {
    const { PATCH, calls } = await load();

    const response = await PATCH(
      patchRequest({
        name: "  Yash Bansal  ",
        department: "  CSE  ",
        enrollmentNumber: "  ",
        year: "3",
        primaryDomain: "Web Development",
        onboardingCompleted: true
      })
    );

    expect(response.status).toBe(200);
    expect(calls.some((call) => call.text.includes("UPDATE profiles"))).toBe(true);
  });

  it("treats a blank optional field as 'leave it alone' instead of an error", async () => {
    const { PATCH } = await load();

    const response = await PATCH(patchRequest({ name: "Yash Bansal", department: "", year: "", primaryDomain: "" }));

    expect(response.status).toBe(200);
  });

  it("names the field when the year is out of range", async () => {
    const { PATCH } = await load();

    const response = await PATCH(patchRequest({ year: 9 }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.details.field).toBe("year");
    expect(body.error.message).toMatch(/between 1 and 6/i);
  });

  it("names the field when the track is not a real primary domain", async () => {
    const { PATCH } = await load();

    const response = await PATCH(patchRequest({ primaryDomain: "astrology" }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.details.field).toBe("primaryDomain");
    expect(body.error.message).toMatch(/available tracks/i);
  });

  it("names the field when the name is too short", async () => {
    const { PATCH } = await load();

    const response = await PATCH(patchRequest({ name: "A" }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.details.field).toBe("name");
    expect(body.error.message).toMatch(/at least 2 characters/i);
  });

  it("does not leak a parser error when the body is not JSON", async () => {
    const { PATCH } = await load();

    const response = await PATCH(patchRequest("<html>not json</html>"));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.message).toMatch(/JSON body/i);
  });
});
