import { afterEach, describe, expect, it, vi } from "vitest";

// Contest judging is the write path that finally makes `contest_top` real.
// These tests drive the route itself so they prove the evidence consequence,
// not just that the columns were added.

const TENANT = "11111111-1111-4111-8111-111111111111";
const ADMIN_ID = "22222222-2222-4222-8222-222222222222";
const STUDENT_ID = "33333333-3333-4333-8333-333333333333";
const CONTEST_ID = "44444444-4444-4444-8444-444444444444";
const SUBMISSION_ID = "55555555-5555-4555-8555-555555555555";

function makeDb({ submission = null, tenantId = TENANT } = {}) {
  const statements = [];
  let current = submission ? { ...submission } : null;

  function dispatch(strings, values) {
    const text = strings.join("?").replace(/\s+/g, " ").trim();
    statements.push({ text, values });

    if (/FROM contest_submissions s/.test(text)) {
      if (!current) return [];
      if (values[0] !== SUBMISSION_ID) return [];
      if (values[1] !== tenantId) return [];
      return [{
        id: current.id,
        student_id: current.student_id,
        contest_id: current.contest_id,
        previous_status: current.status,
        previous_score: current.score ?? null,
        previous_feedback: current.feedback ?? null,
        contest_title: "Hack Night"
      }];
    }

    if (/UPDATE contest_submissions/.test(text)) {
      current = {
        ...current,
        status: values[0],
        score: values[1],
        feedback: values[2],
        judged_by: values[3]
      };
      return [{
        id: current.id,
        contest_id: current.contest_id,
        student_id: current.student_id,
        status: current.status,
        score: current.score,
        feedback: current.feedback
      }];
    }

    throw new Error(`unexpected query: ${text}`);
  }

  const sql = (strings, ...values) => Promise.resolve(dispatch(strings, values));
  sql.begin = (fn) => fn((strings, ...values) => Promise.resolve(dispatch(strings, values)));
  sql.statements = statements;
  return { sql, statements, get submission() { return current; } };
}

const pendingContexts = [];
const evidence = [];
const revocations = [];
const recomputes = [];
const notifications = [];

async function loadRoute() {
  vi.resetModules();
  vi.doMock("@/lib/auth-server", () => ({
    getRequestContext: async () => pendingContexts.shift(),
    writeAudit: async () => {},
    notify: async (args) => { notifications.push(args); }
  }));
  vi.doMock("@/lib/ranking", () => ({
    recordEvidence: async (args) => {
      evidence.push(args);
      return { id: "evidence-1" };
    },
    revokeEvidence: async (args) => { revocations.push(args); },
    recomputeScore: async (...args) => { recomputes.push(args); }
  }));
  return import("@/app/api/admin/contests/judge/route");
}

function contextFor({ db, user = { id: ADMIN_ID } }) {
  return {
    user,
    tenant: { id: TENANT },
    sql: db.sql
  };
}

async function judge(body, options = {}) {
  const db = options.db || makeDb({ submission: options.submission });
  pendingContexts.push(options.context || contextFor({ db, user: options.user }));
  const { POST } = await loadRoute();
  const response = await POST(new Request("http://localhost/api/admin/contests/judge", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  }));
  return { response, body: await response.json(), db };
}

function submission(overrides = {}) {
  return {
    id: SUBMISSION_ID,
    contest_id: CONTEST_ID,
    student_id: STUDENT_ID,
    status: "shortlisted",
    ...overrides
  };
}

afterEach(() => {
  vi.doUnmock("@/lib/auth-server");
  vi.doUnmock("@/lib/ranking");
  pendingContexts.length = 0;
  evidence.length = 0;
  revocations.length = 0;
  recomputes.length = 0;
  notifications.length = 0;
});

describe("POST /api/admin/contests/judge", () => {
  it("awards contest_top evidence when a submission becomes the winner", async () => {
    const { response, body } = await judge(
      { submissionId: SUBMISSION_ID, status: "winner", score: 93, feedback: "Sharp build." },
      { submission: submission() }
    );

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(evidence).toHaveLength(1);
    expect(evidence[0]).toMatchObject({
      tenantId: TENANT,
      userId: STUDENT_ID,
      kind: "contest_top",
      refId: CONTEST_ID,
      verifiedBy: ADMIN_ID,
      source: "contest_judging"
    });
    expect(recomputes).toHaveLength(1);
    expect(recomputes[0][1]).toBe(TENANT);
    expect(recomputes[0][2]).toBe(STUDENT_ID);
    expect(notifications[0].title).toContain("selected");
  });

  it("revokes the old contest_top when a winner is moved out of winner", async () => {
    const { response } = await judge(
      { submissionId: SUBMISSION_ID, status: "rejected" },
      { submission: submission({ status: "winner" }) }
    );

    expect(response.status).toBe(200);
    expect(evidence).toHaveLength(0);
    expect(revocations).toEqual([{
      sql: expect.anything(),
      tenantId: TENANT,
      userId: STUDENT_ID,
      kind: "contest_top",
      refId: CONTEST_ID
    }]);
    expect(recomputes).toHaveLength(1);
  });

  it("never verifies an admin's own entry", async () => {
    const { response } = await judge(
      { submissionId: SUBMISSION_ID, status: "winner" },
      { submission: submission({ student_id: ADMIN_ID }) }
    );

    expect(response.status).toBe(200);
    expect(evidence).toHaveLength(0);
    expect(recomputes).toHaveLength(0);
  });

  it("treats an identical re-judgement as a no-op", async () => {
    const db = makeDb({
      submission: submission({ status: "winner", score: 93, feedback: "Sharp build." })
    });
    const { response, body } = await judge(
      { submissionId: SUBMISSION_ID, status: "winner", score: 93, feedback: "Sharp build." },
      { db }
    );

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.unchanged).toBe(true);
    expect(db.statements.some((s) => /UPDATE contest_submissions/.test(s.text))).toBe(false);
    expect(evidence).toHaveLength(0);
    expect(recomputes).toHaveLength(0);
    expect(notifications).toHaveLength(0);
  });

  it("does not judge a submission from another chapter", async () => {
    const db = makeDb({ submission: submission(), tenantId: "another-tenant" });
    const { response, body } = await judge(
      { submissionId: SUBMISSION_ID, status: "winner" },
      { db }
    );

    expect(response.status).toBe(404);
    expect(body.ok).toBe(false);
    expect(evidence).toHaveLength(0);
    expect(db.statements.some((s) => /UPDATE contest_submissions/.test(s.text))).toBe(false);
  });

  it("rejects an out-of-range score before touching the database", async () => {
    const { response, body } = await judge(
      { submissionId: SUBMISSION_ID, status: "winner", score: 140 },
      { submission: submission() }
    );

    expect(response.status).toBe(400);
    expect(body.ok).toBe(false);
    expect(evidence).toHaveLength(0);
  });
});
