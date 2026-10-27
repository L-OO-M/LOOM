import { afterEach, describe, expect, it, vi } from "vitest";

// P0-2 regression: "Clear unverified" used to end in
//
//   DELETE FROM ranking_events WHERE tenant_id = ... AND user_id = ...
//
// which took verified OSS, roadmap and project evidence with it. The action may
// only reverse the ledger rows that belong to the student's provisional/rejected
// claims, matched by (kind, ref_id), and it must stay inside one tenant and one
// user.
//
// The real route is driven against an in-memory SQL double, so the assertion is
// about rows surviving, not about source text reading correctly.
const TENANT = "11111111-1111-1111-1111-111111111111";
const OTHER_TENANT = "22222222-2222-2222-2222-222222222222";
const STUDENT = "33333333-3333-3333-3333-333333333333";
const OTHER_STUDENT = "44444444-4444-4444-4444-444444444444";
const REVIEWER = "55555555-5555-5555-5555-555555555555";

function makeDb({ roadmapClaims = [], projectClaims = [], ledger = [] } = {}) {
  const state = { roadmapClaims, projectClaims, ledger, queries: [] };

  function dispatch(strings, values) {
    const text = strings.join("?").replace(/\s+/g, " ").trim();
    state.queries.push({ text, values });

    if (/SELECT student_id, node_id FROM student_roadmap_progress/.test(text)) {
      const [id, tenantId] = values;
      const found = state.roadmapClaims.find(
        (c) => c.id === id && c.tenantId === tenantId && c.state === "provisional"
      );
      return found ? [{ student_id: found.studentId, node_id: found.nodeId }] : [];
    }
    if (/SELECT node_id FROM student_roadmap_progress/.test(text)) {
      const [tenantId, studentId] = values;
      return state.roadmapClaims
        .filter(
          (c) =>
            c.tenantId === tenantId &&
            c.studentId === studentId &&
            (c.state === "provisional" || c.state === "rejected")
        )
        .map((c) => ({ node_id: c.nodeId }));
    }
    if (/SELECT id FROM projects/.test(text)) {
      const [tenantId, studentId] = values;
      return state.projectClaims
        .filter(
          (c) =>
            c.tenantId === tenantId &&
            c.studentId === studentId &&
            (c.state === "provisional" || c.state === "rejected")
        )
        .map((c) => ({ id: c.id }));
    }
    if (/UPDATE student_roadmap_progress/.test(text)) {
      const [reviewer, tenantId, studentId] = values;
      for (const c of state.roadmapClaims) {
        if (c.tenantId === tenantId && c.studentId === studentId && c.state === "provisional") {
          c.state = "rejected";
          c.reviewer = reviewer;
        }
      }
      return [];
    }
    if (/UPDATE projects/.test(text)) {
      const [reviewer, tenantId, studentId] = values;
      for (const c of state.projectClaims) {
        if (c.tenantId === tenantId && c.studentId === studentId && c.state === "provisional") {
          c.state = "rejected";
          c.reviewer = reviewer;
        }
      }
      return [];
    }
    if (/DELETE FROM ranking_events/.test(text)) {
      const [tenantId, userId, kind, refId] = values;
      const index = state.ledger.findIndex(
        (row) =>
          row.tenant_id === tenantId &&
          row.user_id === userId &&
          row.kind === kind &&
          row.ref_id === String(refId)
      );
      if (index === -1) return [];
      return state.ledger.splice(index, 1);
    }
    return [];
  }

  const sql = (strings, ...values) => Promise.resolve(dispatch(strings, values));
  return { sql, state };
}

const pendingContexts = [];
let route = null;

async function loadRoute() {
  vi.resetModules();
  vi.doMock("@/lib/auth-server", () => ({
    getRequestContext: async () => pendingContexts.shift(),
    writeAudit: async () => {},
    notify: async () => {}
  }));
  vi.doMock("@/lib/ranking", async (importOriginal) => {
    const actual = await importOriginal();
    return {
      ...actual,
      // Score materialisation is not what this test pins; the ledger rows are.
      recomputeScore: async () => null
    };
  });
  return import("@/app/api/admin/ranking/route");
}

function claim({ id, nodeId, studentId = STUDENT, tenantId = TENANT, state = "provisional" }) {
  return { id, nodeId, studentId, tenantId, state };
}

function projectClaim({ id, studentId = STUDENT, tenantId = TENANT, state = "provisional" }) {
  return { id, studentId, tenantId, state };
}

function ledgerRow({ kind, refId, userId = STUDENT, tenantId = TENANT }) {
  return { tenant_id: tenantId, user_id: userId, kind, ref_id: String(refId) };
}

async function clearAllFor({ db, claimId }) {
  pendingContexts.push({
    user: { id: REVIEWER },
    tenant: { id: TENANT },
    sql: db.sql
  });
  const { POST } = route || (route = await loadRoute());
  const response = await POST({
    json: async () => ({
      kind: "roadmap_node",
      id: claimId,
      decision: "rejected",
      clearAllForStudent: true
    })
  });
  return { response, body: await response.json() };
}

const remaining = (db) =>
  db.state.ledger.map((row) => `${row.kind}:${row.ref_id}`).sort();

afterEach(() => {
  vi.doUnmock("@/lib/auth-server");
  vi.doUnmock("@/lib/ranking");
  pendingContexts.length = 0;
  route = null;
});

describe("P0-2: clear unverified reverses only the intended claim evidence", () => {
  it("leaves verified OSS, roadmap and project evidence intact", async () => {
    const claimId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const db = makeDb({
      roadmapClaims: [
        claim({ id: claimId, nodeId: "node-provisional" }),
        claim({ id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", nodeId: "node-verified", state: "verified" })
      ],
      projectClaims: [
        projectClaim({ id: "project-provisional" }),
        projectClaim({ id: "project-verified", state: "verified" })
      ],
      ledger: [
        ledgerRow({ kind: "roadmap_done", refId: "node-provisional" }),
        ledgerRow({ kind: "roadmap_done", refId: "node-verified" }),
        ledgerRow({ kind: "project_verified", refId: "project-provisional" }),
        ledgerRow({ kind: "project_verified", refId: "project-verified" }),
        ledgerRow({ kind: "oss_verified", refId: "merged-pr-1" }),
        ledgerRow({ kind: "contest_top", refId: "contest-1" })
      ]
    });

    const { body } = await clearAllFor({ db, claimId });

    expect(body).toEqual({
      ok: true,
      data: { cleared: true, studentId: STUDENT }
    });
    expect(remaining(db)).toEqual([
      "contest_top:contest-1",
      "oss_verified:merged-pr-1",
      "project_verified:project-verified",
      "roadmap_done:node-verified"
    ]);
    // The provisional claims themselves are declined, not merely de-scored.
    expect(db.state.roadmapClaims.find((c) => c.id === claimId).state).toBe("rejected");
    expect(db.state.projectClaims.find((c) => c.id === "project-provisional").state).toBe("rejected");
    expect(db.state.roadmapClaims.find((c) => c.nodeId === "node-verified").state).toBe("verified");
  });

  it("removes only rows matching the claim's kind and refId", async () => {
    const claimId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const db = makeDb({
      roadmapClaims: [claim({ id: claimId, nodeId: "node-a" })],
      projectClaims: [projectClaim({ id: "project-a" })],
      ledger: [
        ledgerRow({ kind: "roadmap_done", refId: "node-a" }),
        ledgerRow({ kind: "project_verified", refId: "project-a" }),
        // Same ref, different kind: a verified contribution in the same node's
        // orbit must not be caught by a ref-only delete.
        ledgerRow({ kind: "oss_verified", refId: "node-a" }),
        // Same kind, different ref: another verified node survives.
        ledgerRow({ kind: "roadmap_done", refId: "node-b" }),
        // Same kind, different ref: another verified project survives.
        ledgerRow({ kind: "project_verified", refId: "project-b" })
      ]
    });

    await clearAllFor({ db, claimId });

    expect(remaining(db)).toEqual([
      "oss_verified:node-a",
      "project_verified:project-b",
      "roadmap_done:node-b"
    ]);
  });

  it("keeps tenant and user scoping on every reversal", async () => {
    const claimId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const db = makeDb({
      roadmapClaims: [claim({ id: claimId, nodeId: "shared-node" })],
      projectClaims: [projectClaim({ id: "shared-project" })],
      ledger: [
        ledgerRow({ kind: "roadmap_done", refId: "shared-node" }),
        ledgerRow({ kind: "project_verified", refId: "shared-project" }),
        // A different student in the same chapter.
        ledgerRow({ kind: "roadmap_done", refId: "shared-node", userId: OTHER_STUDENT }),
        // The same student id in a different chapter.
        ledgerRow({ kind: "project_verified", refId: "shared-project", tenantId: OTHER_TENANT })
      ]
    });

    await clearAllFor({ db, claimId });

    // Every DELETE the route ran named this tenant, this user, and a
    // kind/refId pair. No statement was scoped by tenant+user alone.
    const deletes = db.state.queries.filter((q) => /^DELETE FROM ranking_events/.test(q.text));
    expect(deletes).toHaveLength(2);
    for (const del of deletes) {
      expect(del.text).toMatch(/kind = \?/);
      expect(del.text).toMatch(/ref_id = \?/);
      expect(del.values[0]).toBe(TENANT);
      expect(del.values[1]).toBe(STUDENT);
    }
    expect(db.state.ledger.map((row) => `${row.user_id}:${row.tenant_id}:${row.kind}:${row.ref_id}`)).toEqual([
      `${OTHER_STUDENT}:${TENANT}:roadmap_done:shared-node`,
      `${STUDENT}:${OTHER_TENANT}:project_verified:shared-project`
    ]);
  });
});
