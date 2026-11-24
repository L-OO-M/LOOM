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
  // The chapter move needs an owner connection and the institution catalogue.
  // Neither is under test here (chapter-placement.test.js owns that), so stub
  // them to "no claimed chapter" and keep this file about field persistence.
  vi.doMock("@/lib/db", () => ({ getSql: () => sql }));
  vi.doMock("@/lib/chapters", () => ({
    matchChapterForInstitution: async () => null,
    listInstitutions: async () => [],
    normalizeInstitution: (value) => String(value ?? "").toLowerCase().trim()
  }));
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

  it("saves the analytics opt-out without touching other profile fields", async () => {
    const { PATCH, calls } = await load();

    const response = await PATCH(patchRequest({ analyticsOptOut: true }));
    expect(response.status).toBe(200);
    const update = calls.find((call) => call.text.startsWith("UPDATE profiles SET"));
    expect(update).toBeTruthy();
    expect(update.text).toContain("analytics_opt_out = COALESCE(");
    expect(update.values).toContain(true);
  });

  // Onboarding and settings submit the same shape. If one column is missing from
  // the UPDATE the member sees "Saved." while a field they typed is dropped, and
  // that is indistinguishable from success. Pin every column and every value.
  it("persists every onboarding field and marks onboarding complete", async () => {
    const { PATCH, calls } = await load();

    const response = await PATCH(
      patchRequest({
        name: "Ishaan Sharma",
        enrollmentNumber: "E12345",
        department: "Computer Science",
        year: 2,
        institution: "Some College",
        location: "Pune",
        primaryDomain: "web",
        onboardingCompleted: true
      })
    );

    expect(response.status).toBe(200);
    const update = calls.find((call) => call.text.startsWith("UPDATE profiles SET"));
    expect(update).toBeTruthy();
    for (const column of [
      "name",
      "enrollment_number",
      "department",
      "year",
      "primary_domain",
      "institution",
      "location",
      "onboarding_completed"
    ]) {
      expect(update.text).toContain(`${column} = COALESCE(`);
    }
    expect(update.values).toEqual(
      expect.arrayContaining(["Ishaan Sharma", "E12345", "Computer Science", 2, "Some College", "Pune", "web", true])
    );
  });
});
