import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

const TENANT_ID = randomUUID();
const USER_ID = randomUUID();
const QUESTION_ID = randomUUID();
const SESSION_ID = randomUUID();
const NOW = new Date("2026-11-20T10:00:00.000Z");

function makeSql(rules = []) {
  const calls = [];
  const sql = async (strings, ...values) => {
    const text = strings.join("?");
    calls.push({ text, values });
    for (const rule of rules) {
      if (rule.match.test(text)) {
        return typeof rule.result === "function" ? rule.result({ text, values }) : rule.result;
      }
    }
    return [];
  };
  sql.calls = calls;
  return sql;
}

async function loadRoute({ context, sql, scorecard = vi.fn() }) {
  vi.resetModules();
  vi.doMock("@/lib/auth-server", () => ({
    getRequestContext: vi.fn(async () => context ?? { user: { id: USER_ID }, tenant: { id: TENANT_ID }, sql })
  }));
  vi.doMock("@/lib/rate-limit", () => ({
    checkRateLimit: vi.fn(async () => ({ ok: true }))
  }));
  vi.doMock("@/lib/practice-progress", () => ({
    loadSessionScorecard: scorecard
  }));
  const { POST } = await import("@/app/api/practice/session/route");
  return { POST, scorecard };
}

function request(body) {
  return { json: async () => body };
}

afterEach(() => {
  vi.doUnmock("@/lib/auth-server");
  vi.doUnmock("@/lib/rate-limit");
  vi.doUnmock("@/lib/practice-progress");
});

describe("POST /api/practice/session", () => {
  it("rejects unauthenticated callers before touching the database", async () => {
    const sql = makeSql();
    const { POST } = await loadRoute({ context: { error: "UNAUTHORIZED" }, sql });

    const response = await POST(request({ action: "start" }));
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload.error.code).toBe("UNAUTHORIZED");
    expect(sql.calls).toHaveLength(0);
  });

  it("resumes an existing active session instead of creating a duplicate", async () => {
    const sql = makeSql([
      {
        match: /FROM practice_sessions/,
        result: [{ id: SESSION_ID, started_at: NOW, completed_at: null }]
      }
    ]);
    const { POST } = await loadRoute({ sql });

    const response = await POST(request({ action: "start" }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data.resumed).toBe(true);
    expect(payload.data.session.id).toBe(SESSION_ID);
    expect(sql.calls.some((call) => /INSERT INTO practice_sessions/.test(call.text))).toBe(false);
  });

  it("creates a session when none is active", async () => {
    const sql = makeSql([
      { match: /FROM practice_sessions/, result: [] },
      {
        match: /INSERT INTO practice_sessions/,
        result: [{ id: SESSION_ID, started_at: NOW, completed_at: null }]
      }
    ]);
    const { POST } = await loadRoute({ sql });

    const payload = await (await POST(request({ action: "start" }))).json();

    expect(payload.data.resumed).toBe(false);
    expect(payload.data.session.id).toBe(SESSION_ID);
  });

  it("records attempts with server-side tenant and user ids only", async () => {
    const sql = makeSql([
      { match: /FROM practice_questions/, result: [{ id: QUESTION_ID }] },
      {
        match: /FROM practice_sessions/,
        result: [{ id: SESSION_ID, started_at: NOW, completed_at: null }]
      },
      {
        match: /INSERT INTO practice_attempts/,
        result: [{
          id: randomUUID(),
          question_id: QUESTION_ID,
          session_id: SESSION_ID,
          outcome: "attempted",
          source: "self",
          created_at: NOW
        }]
      }
    ]);
    const { POST } = await loadRoute({ sql });

    const response = await POST(request({
      action: "attempt",
      questionId: QUESTION_ID,
      outcome: "attempted",
      tenantId: "11111111-1111-4111-8111-111111111111",
      userId: "22222222-2222-4222-8222-222222222222"
    }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data.attempt).toMatchObject({
      questionId: QUESTION_ID,
      sessionId: SESSION_ID,
      outcome: "attempted",
      source: "self"
    });
    const insert = sql.calls.find((call) => /INSERT INTO practice_attempts/.test(call.text));
    expect(insert.values).toContain(TENANT_ID);
    expect(insert.values).toContain(USER_ID);
    expect(insert.values).not.toContain("11111111-1111-4111-8111-111111111111");
    expect(insert.values).not.toContain("22222222-2222-4222-8222-222222222222");
  });

  it("refuses attempts against a question from another chapter", async () => {
    const sql = makeSql([{ match: /FROM practice_questions/, result: [] }]);
    const { POST } = await loadRoute({ sql });

    const response = await POST(request({
      action: "attempt",
      questionId: QUESTION_ID,
      outcome: "solved"
    }));
    const payload = await response.json();

    expect(response.status).toBe(404);
    expect(payload.error.code).toBe("QUESTION_NOT_FOUND");
    expect(sql.calls.some((call) => /INSERT INTO practice_attempts/.test(call.text))).toBe(false);
  });

  it("refuses attempts against another user's session", async () => {
    const sql = makeSql([
      { match: /FROM practice_questions/, result: [{ id: QUESTION_ID }] },
      { match: /FROM practice_sessions/, result: [] }
    ]);
    const { POST } = await loadRoute({ sql });

    const response = await POST(request({
      action: "attempt",
      questionId: QUESTION_ID,
      outcome: "attempted",
      sessionId: SESSION_ID
    }));

    expect(response.status).toBe(404);
    expect(sql.calls.some((call) => /INSERT INTO practice_attempts/.test(call.text))).toBe(false);
  });

  it("completes a session and returns its real scorecard", async () => {
    const scorecard = vi.fn(async () => ({ sessionId: SESSION_ID, hasActivity: true, score: 50 }));
    const sql = makeSql([
      {
        match: /UPDATE practice_sessions/,
        result: [{ id: SESSION_ID, started_at: NOW, completed_at: NOW }]
      }
    ]);
    const { POST } = await loadRoute({ sql, scorecard });

    const response = await POST(request({ action: "complete", sessionId: SESSION_ID }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data.session.completedAt).toBe(NOW.getTime());
    expect(payload.data.scorecard).toEqual({ sessionId: SESSION_ID, hasActivity: true, score: 50 });
    expect(scorecard).toHaveBeenCalledWith(sql, {
      tenantId: TENANT_ID,
      userId: USER_ID,
      sessionId: SESSION_ID
    });
  });

  it("returns 404 when completing a session that is not the caller's", async () => {
    const scorecard = vi.fn();
    const sql = makeSql([
      { match: /UPDATE practice_sessions/, result: [] },
      { match: /FROM practice_sessions/, result: [] }
    ]);
    const { POST } = await loadRoute({ sql, scorecard });

    const response = await POST(request({ action: "complete", sessionId: SESSION_ID }));
    const payload = await response.json();

    expect(response.status).toBe(404);
    expect(payload.error.code).toBe("SESSION_NOT_FOUND");
    expect(scorecard).not.toHaveBeenCalled();
  });

  it("rejects malformed payloads", async () => {
    const sql = makeSql();
    const { POST } = await loadRoute({ sql });

    const response = await POST(request({ action: "attempt", questionId: "nope" }));

    expect(response.status).toBe(400);
    expect(sql.calls).toHaveLength(0);
  });
});
