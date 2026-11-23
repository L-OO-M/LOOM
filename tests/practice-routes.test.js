import { beforeEach, describe, expect, it, vi } from "vitest";
import { DAY_MS, weekStart } from "@/lib/practice-domain";

const TENANT = "11111111-1111-4111-8111-111111111111";
const QUESTION = "22222222-2222-4222-8222-222222222222";

function sqlClient(handler) {
  const tag = async (strings, ...values) => handler(strings.join("?"), values);
  tag.begin = async (fn) => fn(tag);
  tag.json = (value) => value;
  return tag;
}

function request(body) {
  return new Request("http://localhost/api/admin/practice", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

async function load(route, sql, profile = { role: "admin" }) {
  vi.resetModules();
  vi.doMock("@/lib/auth-server", () => ({
    getRequestContext: async () => ({
      user: { id: "admin-1" },
      profile,
      tenant: { id: TENANT },
      sql
    }),
    writeAudit: async () => {},
    notify: async () => {}
  }));
  return import(route);
}

async function loadRefresh(sql, syncConnection) {
  vi.resetModules();
  vi.doMock("@/lib/auth-server", () => ({
    getRequestContext: async () => ({
      user: { id: "student-1" },
      profile: { role: "student", user_id: "student-1" },
      tenant: { id: TENANT },
      sql
    }),
    writeAudit: async () => {},
    notify: async () => {}
  }));
  vi.doMock("@/lib/rate-limit", () => ({
    checkRateLimit: async () => ({ ok: true })
  }));
  vi.doMock("@/lib/practice-sync", () => ({ syncConnection }));
  return import("@/app/api/practice/refresh/route");
}

// A day inside the shipped 400-day calendar window, computed at run time so the
// assertion cannot rot as the real clock advances.
const RECENT_DAY = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);

const REAL_STATS = {
  total: 253,
  easy: 60,
  medium: 141,
  hard: 52,
  ranking: 48213,
  reputation: 12,
  streak: 17,
  activeDays: 128,
  calendar: { [RECENT_DAY]: 3, "2019-01-01": 9 }
};

describe("practice week locking", () => {
  beforeEach(() => vi.resetModules());

  it("locks a released week even though the row arrives in snake_case", async () => {
    const startAt = weekStart(Date.now()) - 7 * DAY_MS;
    let writes = 0;
    const sql = sqlClient(async (text) => {
      if (text.includes("FROM practice_weeks") && text.includes("FOR UPDATE")) {
        return [{
          id: "33333333-3333-4333-8333-333333333333",
          title: "Released week",
          start_at: new Date(startAt),
          end_at: new Date(startAt + 7 * DAY_MS),
          status: "scheduled"
        }];
      }
      // Authoring eligibility reads the department list first; that is a read,
      // not a write, and must not be counted against the locked-week assertion.
      if (text.includes("FROM departments")) {
        return [{ id: "55555555-5555-4555-8555-555555555555", slug: "dsa", name: "DSA", vertical: "tech" }];
      }
      writes += 1;
      return [];
    });
    const { POST } = await load("@/app/api/admin/practice/weeks/route", sql);

    const response = await POST(request({
      id: "33333333-3333-4333-8333-333333333333",
      title: "Attempted edit",
      date: new Date(weekStart(Date.now()) + 330 * 60_000).toISOString().slice(0, 10),
      status: "draft",
      questions: []
    }));

    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("WEEK_LOCKED");
    expect(writes).toBe(0);
  });
});

describe("practice authoring scope", () => {
  beforeEach(() => vi.resetModules());

  it("lets a department lead author their own track and refuses another department's", async () => {
    const DSA = "55555555-5555-4555-8555-555555555551";
    const WEB = "55555555-5555-4555-8555-555555555552";
    let inserts = 0;
    const sql = sqlClient(async (text) => {
      if (text.includes("FROM departments")) {
        return [
          { id: DSA, slug: "dsa", name: "DSA", vertical: "tech" },
          { id: WEB, slug: "web", name: "Web", vertical: "tech" }
        ];
      }
      if (text.includes("INSERT INTO practice_weeks")) {
        inserts += 1;
        return [{ id: "66666666-6666-4666-8666-666666666666", title: "Web week", track: "web", status: "draft", start_at: new Date(), end_at: new Date() }];
      }
      return [];
    });
    const profile = {
      role: "student",
      vertical: null,
      memberships: [{ department_id: WEB, level: "dept_lead", term_end: null }],
      scopedGrants: []
    };
    const { POST } = await load("@/app/api/admin/practice/weeks/route", sql, profile);
    const date = new Date(weekStart(Date.now()) + 330 * 60_000).toISOString().slice(0, 10);

    const refused = await POST(request({ title: "DSA week", date, track: "dsa", status: "draft", questions: [] }));
    expect(refused.status).toBe(403);
    expect(inserts).toBe(0);

    const allowed = await POST(request({ title: "Web week", date, track: "web", status: "draft", questions: [] }));
    expect(allowed.status).toBe(200);
    expect(inserts).toBe(1);
  });
});

describe("practice corrections", () => {
  beforeEach(() => vi.resetModules());

  it("accepts an in-week admin grant when the question row is snake_case", async () => {
    const startAt = weekStart(Date.now()) - 7 * DAY_MS;
    const acceptedAt = new Date(startAt + DAY_MS);
    const sql = sqlClient(async (text) => {
      if (text.includes("FROM profiles")) {
        return [{ user_id: "student-1", name: "Student" }];
      }
      if (text.includes("FROM practice_questions q")) {
        return [{
          id: QUESTION,
          title: "Two Sum",
          week_id: "44444444-4444-4444-8444-444444444444",
          week_title: "Released week",
          status: "scheduled",
          start_at: new Date(startAt),
          end_at: new Date(startAt + 7 * DAY_MS)
        }];
      }
      if (text.includes("FROM practice_corrections")) return [];
      if (text.includes("INSERT INTO ranking_events")) return [{ id: "ranking-1" }];
      if (text.includes("SELECT * FROM ranking_scores")) return [];
      return [];
    });
    const { POST } = await load("@/app/api/admin/practice/corrections/route", sql);

    const response = await POST(request({
      userId: "student-1",
      questionId: QUESTION,
      credited: true,
      acceptedAt: acceptedAt.toISOString(),
      evidence: "https://leetcode.com/submissions/detail/123/",
      reason: "Verified the accepted submission"
    }));

    expect(response.status).toBe(200);
    expect((await response.json()).data).toMatchObject({ credited: true, questionId: QUESTION });
  });
});

describe("practice refresh response", () => {
  beforeEach(() => vi.resetModules());

  it("returns the synced solved count and a compact stats summary", async () => {
    const sql = sqlClient(async (text) => {
      if (text.includes("FROM practice_connections")) return [{ leetcode_username: "student" }];
      return [];
    });
    const syncConnection = vi.fn(async () => ({
      status: "ready",
      received: 1,
      matched: 1,
      credited: 1,
      stats: REAL_STATS,
      message: "Recent accepted submissions checked; solves outside a practice week are recorded but not scored."
    }));
    const { POST } = await loadRefresh(sql, syncConnection);

    const response = await POST(request({}));
    const data = (await response.json()).data;

    expect(response.status).toBe(200);
    expect(data).toMatchObject({
      status: "ready",
      received: 1,
      matched: 1,
      credited: 1,
      solved: 253
    });
    expect(data.stats).toMatchObject({
      total: 253,
      easy: 60,
      medium: 141,
      hard: 52,
      streak: 17
    });
    // The submission calendar can be years long; only the recent slice ships.
    expect(data.stats.calendar).toEqual({ [RECENT_DAY]: 3 });
  });

  it("reports a failed sync without inventing progress numbers", async () => {
    const sql = sqlClient(async (text) => {
      if (text.includes("FROM practice_connections")) return [{ leetcode_username: "student" }];
      return [];
    });
    const syncConnection = vi.fn(async () => ({
      status: "error",
      message: "LeetCode is unavailable. Recorded progress is preserved.",
      retryAfterMs: 900_000
    }));
    const { POST } = await loadRefresh(sql, syncConnection);

    const response = await POST(request({}));
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body.error.code).toBe("SYNC_FAILED");
    expect(body.data).toBeUndefined();
  });

  it("refuses to sync an account that is not linked", async () => {
    const sql = sqlClient(async () => []);
    const syncConnection = vi.fn();
    const { POST } = await loadRefresh(sql, syncConnection);

    const response = await POST(request({}));

    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("NOT_LINKED");
    expect(syncConnection).not.toHaveBeenCalled();
  });
});
