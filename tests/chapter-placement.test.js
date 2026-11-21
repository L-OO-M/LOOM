import { beforeEach, describe, expect, it, vi } from "vitest";

// Which chapter a member lands in is an isolation boundary, so the guard around
// it is the feature: a first-run onboarding save may move the account, and
// nothing else may. These tests pin that boundary rather than the SQL text.

const USER = "student-1";
const FROM = "11111111-1111-4111-8111-111111111111";
const TO = "22222222-2222-4222-8222-222222222222";
const TARGET = { id: TO, slug: "other-college", name: "Other College" };

function recorder(handler = () => []) {
  const calls = [];
  const run = (strings, ...values) => {
    const text = strings.join("?").replace(/\s+/g, " ").trim();
    calls.push({ text, values });
    return Promise.resolve(handler(text, values) ?? []);
  };
  run.calls = calls;
  run.begin = async (fn) => fn(run);
  return run;
}

function request(body) {
  return new Request("http://localhost/api/profile", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

async function load({ before, elevated = 0, platformAdmin = 0, match = TARGET, session = recorder() }) {
  const owner = recorder((text) => {
    if (text.includes("AS elevated")) return [{ elevated, platform_admin: platformAdmin }];
    return [];
  });
  const ctxSql = recorder((text) => {
    if (text.startsWith("SELECT * FROM profiles")) return [before];
    return [{ ...before, institution: "Other College" }];
  });

  vi.resetModules();
  vi.doMock("@/lib/db", () => ({ getSql: () => owner }));
  vi.doMock("@/lib/chapters", () => ({
    matchChapterForInstitution: async () => match,
    listInstitutions: async () => [],
    normalizeInstitution: (value) => String(value ?? "").toLowerCase().trim()
  }));
  vi.doMock("@/lib/auth-server", () => ({
    getRequestContext: async () => ({
      user: { id: USER },
      profile: { role: "student" },
      tenant: { id: FROM },
      sql: ctxSql
    }),
    writeAudit: async (...args) => { audit.push(args[0]); }
  }));

  const audit = [];
  const mod = await import("@/app/api/profile/route");
  return { PATCH: mod.PATCH, owner, ctxSql, audit, session };
}

const base = {
  user_id: USER,
  name: "Yash",
  tenant_id: FROM,
  onboarding_completed: false,
  institution: null
};

describe("profile PATCH -> chapter placement", () => {
  beforeEach(() => vi.resetModules());

  it("moves an unfinished onboarding into the chapter that serves the college", async () => {
    const { PATCH, owner, audit } = await load({ before: base });

    const response = await PATCH(request({ institution: "Other College", onboardingCompleted: true }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.chapter).toMatchObject({ moved: true, chapter: { slug: "other-college" } });
    expect(body.data.profile.tenant_id).toBe(TO);
    const moved = owner.calls.find((c) => c.text.startsWith("UPDATE profiles SET tenant_id"));
    expect(moved, "the profile row must be re-homed").toBeTruthy();
    expect(audit.map((a) => a.action)).toContain("changed_chapter");
  });

  it("refuses the move once onboarding is complete and reports why", async () => {
    const { PATCH, owner } = await load({ before: { ...base, onboarding_completed: true } });

    const response = await PATCH(request({ institution: "Other College" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.chapter).toMatchObject({ moved: false, reason: "onboarding_complete" });
    expect(owner.calls.some((c) => c.text.startsWith("UPDATE profiles SET tenant_id"))).toBe(false);
  });

  it("refuses the move for someone holding a position in their chapter", async () => {
    const { PATCH, owner } = await load({ before: base, elevated: 1 });

    const response = await PATCH(request({ institution: "Other College" }));
    const body = await response.json();

    expect(body.data.chapter).toMatchObject({ moved: false, reason: "holds_position" });
    expect(owner.calls.some((c) => c.text.startsWith("UPDATE profiles SET tenant_id"))).toBe(false);
  });

  it("refuses the move for a platform admin", async () => {
    const { PATCH } = await load({ before: base, platformAdmin: 1 });

    const body = await (await PATCH(request({ institution: "Other College" }))).json();

    expect(body.data.chapter).toMatchObject({ moved: false, reason: "holds_position" });
  });

  it("keeps the account where it is when no chapter claims the college", async () => {
    const { PATCH, owner } = await load({ before: base, match: null });

    const body = await (await PATCH(request({ institution: "Some Unclaimed College" }))).json();

    expect(body.data.chapter).toMatchObject({ moved: false, reason: "chapter_unknown" });
    expect(owner.calls).toHaveLength(0);
  });

  it("does nothing when the college is left blank", async () => {
    const { PATCH, owner } = await load({ before: base });

    const body = await (await PATCH(request({ name: "Yash Bansal" }))).json();

    expect(body.data.chapter).toMatchObject({ moved: false, reason: "no_institution" });
    expect(owner.calls).toHaveLength(0);
  });

  it("does not re-home an account already in the matching chapter", async () => {
    const { PATCH } = await load({ before: { ...base, tenant_id: TO } });

    const body = await (await PATCH(request({ institution: "Other College" }))).json();

    expect(body.data.chapter).toMatchObject({ moved: false, reason: "already_there" });
  });
});
