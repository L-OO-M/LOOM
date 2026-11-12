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

async function load(route, sql) {
  vi.resetModules();
  vi.doMock("@/lib/auth-server", () => ({
    getRequestContext: async () => ({
      user: { id: "admin-1" },
      profile: { role: "admin" },
      tenant: { id: TENANT },
      sql
    }),
    writeAudit: async () => {},
    notify: async () => {}
  }));
  return import(route);
}

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
