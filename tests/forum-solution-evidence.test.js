import { beforeEach, describe, expect, it, vi } from "vitest";

const TENANT = "11111111-1111-4111-8111-111111111111";
const THREAD = "22222222-2222-4222-8222-222222222222";
const AUTHOR = "thread-author";
const ANSWER = "33333333-3333-4333-8333-333333333333";
const OLD_ANSWER = "44444444-4444-4444-8444-444444444444";
const HELPER = "helper-1";
const OLD_HELPER = "helper-2";

function recorder(handler = () => []) {
  const calls = [];
  const sql = (strings, ...values) => {
    const text = strings.join("?").replace(/\s+/g, " ").trim();
    calls.push({ text, values });
    return Promise.resolve(handler(text, values) ?? []);
  };
  sql.calls = calls;
  sql.begin = async (fn) => fn(sql);
  return sql;
}

async function load({ sql }) {
  vi.resetModules();
  vi.doMock("@/lib/auth-server", () => ({
    getRequestContext: async () => ({
      user: { id: AUTHOR },
      profile: { role: "student" },
      tenant: { id: TENANT },
      sql
    }),
    writeAudit: async () => {},
    notify: async () => {}
  }));
  const recordEvidence = vi.fn(async () => ({}));
  const revokeEvidence = vi.fn(async () => ({}));
  const recomputeScore = vi.fn(async () => ({}));
  vi.doMock("@/lib/ranking", () => ({ recordEvidence, revokeEvidence, recomputeScore }));
  const { PATCH } = await import("@/app/api/community/threads/[id]/route");
  return { PATCH, recordEvidence, revokeEvidence, recomputeScore };
}

function request(body) {
  return new Request(`http://localhost/api/community/threads/${THREAD}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

describe("forum solution evidence", () => {
  beforeEach(() => vi.resetModules());

  it("moves evidence when a different reply becomes the solution", async () => {
    const sql = recorder((text) => {
      if (text.startsWith("SELECT * FROM forum_threads")) return [{ id: THREAD, author_id: AUTHOR }];
      if (text.includes("SELECT id, author_id, is_answer FROM forum_replies")) {
        return [{ id: ANSWER, author_id: HELPER, is_answer: false }];
      }
      if (text.includes("SELECT id, author_id FROM forum_replies")) {
        return [{ id: OLD_ANSWER, author_id: OLD_HELPER }];
      }
      return [];
    });
    const { PATCH, recordEvidence, revokeEvidence, recomputeScore } = await load({ sql });

    const response = await PATCH(request({ action: "solve", replyId: ANSWER }), { params: Promise.resolve({ id: THREAD }) });

    expect(response.status).toBe(200);
    expect(revokeEvidence).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: TENANT, userId: OLD_HELPER, kind: "solution_accepted", refId: OLD_ANSWER
    }));
    expect(recordEvidence).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: TENANT, userId: HELPER, kind: "solution_accepted", refId: ANSWER, verifiedBy: AUTHOR
    }));
    expect(recomputeScore).toHaveBeenCalledWith(sql, TENANT, HELPER);
    expect(recomputeScore).toHaveBeenCalledWith(sql, TENANT, OLD_HELPER);
  });

  it("revokes the accepted-answer evidence when a solution is removed", async () => {
    const sql = recorder((text) => {
      if (text.startsWith("SELECT * FROM forum_threads")) return [{ id: THREAD, author_id: AUTHOR }];
      if (text.includes("SELECT id, author_id FROM forum_replies") && text.includes("is_answer = true")) {
        return [{ id: ANSWER, author_id: HELPER }];
      }
      return [];
    });
    const { PATCH, revokeEvidence, recomputeScore } = await load({ sql });

    const response = await PATCH(request({ action: "unsolve" }), { params: Promise.resolve({ id: THREAD }) });

    expect(response.status).toBe(200);
    expect(revokeEvidence).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: TENANT, userId: HELPER, kind: "solution_accepted", refId: ANSWER
    }));
    expect(recomputeScore).toHaveBeenCalledWith(sql, TENANT, HELPER);
    const threadUpdate = sql.calls.find((c) => c.text.startsWith("UPDATE forum_threads SET solved = false"));
    expect(threadUpdate).toBeTruthy();
  });

  it("does not score a reply the author writes to their own thread", async () => {
    const sql = recorder((text) => {
      if (text.startsWith("SELECT * FROM forum_threads")) return [{ id: THREAD, author_id: AUTHOR }];
      if (text.includes("SELECT id, author_id, is_answer FROM forum_replies")) {
        return [{ id: ANSWER, author_id: AUTHOR, is_answer: false }];
      }
      return [];
    });
    const { PATCH, recordEvidence } = await load({ sql });

    const response = await PATCH(request({ action: "solve", replyId: ANSWER }), { params: Promise.resolve({ id: THREAD }) });

    expect(response.status).toBe(200);
    expect(recordEvidence).not.toHaveBeenCalled();
  });
});
