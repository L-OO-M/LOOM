import { describe, expect, it } from "vitest";
import { reviewApplication } from "@/lib/mentorship";

// Approving an application writes three tables: mentors, profiles and
// mentor_applications. These tests drive the library function against an
// in-memory client whose begin() snapshots state, so a mid-way failure proves
// the rollback rather than assuming postgres.js does it.
const TENANT = "11111111-1111-4111-8111-111111111111";
const APPLICATION = "22222222-2222-4222-8222-222222222222";
const STUDENT = "33333333-3333-4333-8333-333333333333";
const ADMIN = "44444444-4444-4444-8444-444444444444";

function makeDb({ decision = "approved", failOn = null } = {}) {
  const state = {
    application: {
      id: APPLICATION,
      student_id: STUDENT,
      tenant_id: TENANT,
      expertise: "React",
      statement: "I build things",
      status: "pending",
      reviewer_id: null
    },
    profiles: { [STUDENT]: { user_id: STUDENT, role: "student" } },
    mentors: [],
    statements: [],
    begins: 0
  };

  function dispatch(strings, values) {
    const text = strings.join("?").replace(/\s+/g, " ").trim();
    state.statements.push(text);
    if (failOn && failOn.test(text)) throw new Error("injected write failure");

    if (/FROM mentor_applications/.test(text)) {
      if (!state.application || values[0] !== APPLICATION || values[1] !== TENANT) return [];
      if (state.application.status !== "pending") return [];
      return [{ ...state.application }];
    }
    if (/INSERT INTO mentors/.test(text)) {
      state.mentors.push({ user_id: values[0], tenant_id: values[1], expertise: values[2], bio: values[3] });
      return [];
    }
    if (/UPDATE profiles/.test(text)) {
      state.profiles[values[0]] = { ...state.profiles[values[0]], role: "core" };
      return [];
    }
    if (/UPDATE mentor_applications/.test(text)) {
      state.application = {
        ...state.application,
        status: values[0],
        reviewer_id: values[1]
      };
      return [{ ...state.application }];
    }
    throw new Error(`unexpected query: ${text}`);
  }

  const sql = (strings, ...values) => Promise.resolve(dispatch(strings, values));
  sql.begin = async (fn) => {
    state.begins += 1;
    const snapshot = {
      application: { ...state.application },
      profiles: structuredClone(state.profiles),
      mentors: [...state.mentors]
    };
    try {
      return await fn((strings, ...values) => Promise.resolve(dispatch(strings, values)));
    } catch (e) {
      state.application = snapshot.application;
      state.profiles = snapshot.profiles;
      state.mentors = snapshot.mentors;
      throw e;
    }
  };
  return { sql, state, decision };
}

async function review(db, decision = "approved") {
  return reviewApplication({
    sql: db.sql,
    applicationId: APPLICATION,
    tenantId: TENANT,
    reviewerId: ADMIN,
    decision
  });
}

describe("reviewApplication transaction", () => {
  it("commits mentor, role promotion and application status together", async () => {
    const db = makeDb();
    const updated = await review(db);

    expect(db.state.begins).toBe(1);
    expect(updated.status).toBe("approved");
    expect(db.state.profiles[STUDENT].role).toBe("core");
    expect(db.state.mentors).toHaveLength(1);
    expect(db.state.application.reviewer_id).toBe(ADMIN);
  });

  it("rolls the mentor row and role promotion back when a later write fails", async () => {
    const db = makeDb({ failOn: /UPDATE mentor_applications/ });

    await expect(review(db)).rejects.toThrow("injected write failure");

    expect(db.state.application.status).toBe("pending");
    expect(db.state.profiles[STUDENT].role).toBe("student");
    expect(db.state.mentors).toHaveLength(0);
  });

  it("records only the status change for a rejection", async () => {
    const db = makeDb();
    const updated = await review(db, "rejected");

    expect(updated.status).toBe("rejected");
    expect(db.state.mentors).toHaveLength(0);
    expect(db.state.profiles[STUDENT].role).toBe("student");
  });

  it("throws NOT_FOUND without writing when the application is not pending", async () => {
    const db = makeDb();
    db.state.application.status = "approved";

    await expect(review(db)).rejects.toThrow("NOT_FOUND");
    expect(db.state.begins).toBe(1);
    expect(db.state.statements.some((s) => /INSERT INTO mentors/.test(s))).toBe(false);
  });
});
