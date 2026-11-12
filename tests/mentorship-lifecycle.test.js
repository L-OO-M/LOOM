import { afterEach, describe, expect, it, vi } from "vitest";

// Mentorship used to stop at "requested": no participant could accept,
// decline, complete, or cancel. These tests drive the transition route so the
// guards (actor, tenant, state machine) are proven rather than assumed.

const TENANT = "11111111-1111-4111-8111-111111111111";
const OTHER_TENANT = "99999999-9999-4999-8999-999999999999";
const MENTOR = "22222222-2222-4222-8222-222222222222";
const STUDENT = "33333333-3333-4333-8333-333333333333";
const SESSION = "44444444-4444-4444-8444-444444444444";

function makeDb({ session, tenantId = TENANT } = {}) {
  const statements = [];
  let current = session ? { ...session } : null;

  function dispatch(strings, values) {
    const text = strings.join("?").replace(/\s+/g, " ").trim();
    statements.push({ text, values });

    if (/FROM mentor_sessions s/.test(text)) {
      if (!current) return [];
      if (values[0] !== tenantId) return [];
      if (values[1] !== SESSION) return [];
      const actor = values[2];
      if (current.student_id !== actor && current.mentor_id !== actor) return [];
      return [{
        ...current,
        mentor_name: "Asha",
        student_name: "Ravi"
      }];
    }

    if (/UPDATE mentor_sessions/.test(text)) {
      current = { ...current, status: values[0], scheduled_at: values[1] ?? current.scheduled_at };
      return [{ ...current }];
    }

    throw new Error(`unexpected query: ${text}`);
  }

  const sql = (strings, ...values) => Promise.resolve(dispatch(strings, values));
  sql.statements = statements;
  return { sql, statements, get session() { return current; } };
}

const pendingContexts = [];
const audits = [];
const notifications = [];

async function loadRoute() {
  vi.resetModules();
  vi.doMock("@/lib/auth-server", () => ({
    getRequestContext: async () => pendingContexts.shift(),
    writeAudit: async (args) => { audits.push(args); },
    notify: async (args) => { notifications.push(args); }
  }));
  return import("@/app/api/mentorship/[id]/route");
}

async function patch({ db, userId, status, scheduledAt, session }) {
  const local = db || makeDb({ session });
  pendingContexts.push({ user: { id: userId }, tenant: { id: TENANT }, sql: local.sql });
  const { PATCH } = await loadRoute();
  const response = await PATCH(
    new Request(`http://localhost/api/mentorship/${SESSION}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status, ...(scheduledAt ? { scheduledAt } : {}) })
    }),
    { params: Promise.resolve({ id: SESSION }) }
  );
  return { response, body: await response.json(), db: local };
}

function session(overrides = {}) {
  return {
    id: SESSION,
    mentor_id: MENTOR,
    student_id: STUDENT,
    status: "requested",
    scheduled_at: null,
    ...overrides
  };
}

afterEach(() => {
  vi.doUnmock("@/lib/auth-server");
  pendingContexts.length = 0;
  audits.length = 0;
  notifications.length = 0;
});

describe("PATCH /api/mentorship/[id]", () => {
  it("lets the mentor accept a requested session and notifies the student", async () => {
    const { response, body, db } = await patch({
      userId: MENTOR,
      status: "scheduled",
      session: session()
    });

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(db.session.status).toBe("scheduled");
    expect(audits[0].action).toBe("mentorship_accepted");
    expect(notifications[0]).toMatchObject({ userId: STUDENT, type: "mentorship" });
  });

  it("lets the student cancel but not mark a session completed", async () => {
    const cancel = await patch({
      userId: STUDENT,
      status: "cancelled",
      session: session({ status: "scheduled" })
    });
    expect(cancel.response.status).toBe(200);

    const complete = await patch({
      userId: STUDENT,
      status: "completed",
      session: session({ status: "scheduled" })
    });
    expect(complete.response.status).toBe(409);
    expect(complete.body.error.code).toBe("INVALID_TRANSITION");
  });

  it("rejects a completed session moving back to scheduled", async () => {
    const { response, body } = await patch({
      userId: MENTOR,
      status: "scheduled",
      session: session({ status: "completed" })
    });

    expect(response.status).toBe(409);
    expect(body.error.code).toBe("INVALID_TRANSITION");
  });

  it("hides a session whose mentor is outside the caller's chapter", async () => {
    const db = makeDb({ session: session(), tenantId: OTHER_TENANT });
    const { response } = await patch({ db, userId: MENTOR, status: "scheduled" });

    expect(response.status).toBe(404);
    expect(db.statements.some((s) => /UPDATE mentor_sessions/.test(s.text))).toBe(false);
  });

  it("does not let an unrelated member touch the session", async () => {
    const { response } = await patch({
      userId: "55555555-5555-4555-8555-555555555555",
      status: "scheduled",
      session: session()
    });

    expect(response.status).toBe(404);
  });

  it("lets either side reschedule a live session with a new time", async () => {
    const next = "2026-12-01T10:00:00.000Z";
    const { response, db, body } = await patch({
      userId: STUDENT,
      status: "scheduled",
      scheduledAt: next,
      session: session({ status: "scheduled", scheduled_at: "2026-11-20T10:00:00.000Z" })
    });
    expect(response.status).toBe(200);
    expect(db.session.status).toBe("scheduled");
    expect(new Date(db.session.scheduled_at).toISOString()).toBe(next);
    expect(audits[0].action).toBe("mentorship_rescheduled");
    expect(notifications[0].userId).toBe(MENTOR);
    expect(body.ok).toBe(true);
  });

  it("refuses a reschedule without a new time", async () => {
    const { response, body, db } = await patch({
      userId: MENTOR,
      status: "scheduled",
      session: session({ status: "scheduled", scheduled_at: "2026-11-20T10:00:00.000Z" })
    });
    expect(response.status).toBe(400);
    expect(body.error.code).toBe("SCHEDULED_AT_REQUIRED");
    expect(db.statements.some((s) => /UPDATE mentor_sessions/.test(s.text))).toBe(false);
  });

  it("rejects an unknown status before reading the session", async () => {
    const { response } = await patch({
      userId: MENTOR,
      status: "exploded",
      session: session()
    });

    expect(response.status).toBe(400);
  });
});
