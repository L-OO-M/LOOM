import { afterEach, describe, expect, it, vi } from "vitest";

// A submitted department report is a filed record, not a working draft. These
// tests drive both report routes against an in-memory SQL double so the
// assertions are about rows surviving, not about source text looking right.
//
// PATCH: once status is "submitted", any non-admin change (draft edit or a
// same-status re-submit) is a 403. Admins may reopen to "draft" and then edit.
// compile POST: the upsert may only overwrite a draft; a submitted row comes
// back with no RETURNING row and the route answers 409 REPORT_LOCKED.

const TENANT = "11111111-1111-1111-1111-111111111111";
const DEPT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const REPORT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const ADMIN = { id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", role: "admin", memberships: [] };
const LEAD = {
  id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  role: "dept_lead",
  memberships: [{ department_id: DEPT, level: "dept_lead" }]
};

function makeDb({ reports = [] } = {}) {
  const state = {
    departments: {
      [DEPT]: { id: DEPT, tenant_id: TENANT, vertical: "technical", name: "Web" }
    },
    reports,
    queries: []
  };

  function dispatch(strings, values) {
    const text = strings.join("?").replace(/\s+/g, " ").trim();
    state.queries.push({ text, values });

    if (/FROM departments WHERE id = \?/.test(text)) {
      const [id, tid] = values;
      const dept = state.departments[id];
      if (!dept) return [];
      if (tid !== null && dept.tenant_id !== tid) return [];
      return [{ ...dept }];
    }

    if (/FROM member_contributions/.test(text)) return [];
    if (/FROM events/.test(text)) return [];
    if (/COUNT\(\*\).*FROM department_memberships/.test(text)) return [{ c: 0 }];

    if (/INSERT INTO dept_reports/.test(text)) {
      const [tid, departmentId, month, draft] = values;
      const existing = state.reports.find((r) => r.department_id === departmentId && r.month === month);
      if (existing) {
        // ON CONFLICT ... DO UPDATE ... WHERE status = 'draft': the WHERE gate
        // makes a submitted row invisible to this upsert, so no row comes back.
        if (existing.status !== "draft") return [];
        existing.draft = draft;
        return [{ ...existing }];
      }
      const row = {
        id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
        tenant_id: tid,
        department_id: departmentId,
        month,
        draft,
        status: "draft",
        submitted_by: null,
        submitted_at: null
      };
      state.reports.push(row);
      return [{ ...row }];
    }

    if (/FROM dept_reports r JOIN departments d/.test(text)) {
      const [id, tid] = values;
      const report = state.reports.find((r) => r.id === id);
      if (!report) return [];
      if (tid !== null && report.tenant_id !== tid) return [];
      const dept = state.departments[report.department_id] || {};
      return [{ ...report, vertical: dept.vertical ?? null }];
    }

    if (/UPDATE dept_reports SET/.test(text)) {
      const [draft, status, , submittedBy, , id] = values;
      const report = state.reports.find((r) => r.id === id);
      if (!report) return [];
      if (draft !== null && draft !== undefined) report.draft = draft;
      if (status) report.status = status;
      if (status === "submitted") report.submitted_by = submittedBy;
      return [{ ...report }];
    }

    throw new Error(`unexpected query: ${text}`);
  }

  const sql = (strings, ...values) => Promise.resolve(dispatch(strings, values));
  sql.json = (value) => value;
  return { sql, state };
}

const pendingContexts = [];
let routes = null;

async function loadRoutes() {
  vi.resetModules();
  vi.doMock("@/lib/auth-server", () => ({
    getRequestContext: async () => pendingContexts.shift(),
    writeAudit: async () => {},
    notify: async () => {}
  }));
  const collection = await import("@/app/api/reports/route");
  const single = await import("@/app/api/reports/[id]/route");
  return { collection, single };
}

function contextFor({ db, profile }) {
  return {
    user: { id: profile.id },
    profile,
    tenant: { id: TENANT },
    sql: db.sql
  };
}

async function patch({ db, profile, id = REPORT, body }) {
  pendingContexts.push(contextFor({ db, profile }));
  const { single } = routes || (routes = await loadRoutes());
  const response = await single.PATCH(
    new Request(`http://localhost/api/reports/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    }),
    { params: Promise.resolve({ id }) }
  );
  return { response, body: await response.json() };
}

async function compile({ db, profile, body }) {
  pendingContexts.push(contextFor({ db, profile }));
  const { collection } = routes || (routes = await loadRoutes());
  const response = await collection.POST(
    new Request("http://localhost/api/reports", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    })
  );
  return { response, body: await response.json() };
}

function report({ status = "draft", draft = { note: "initial" } } = {}) {
  return {
    id: REPORT,
    tenant_id: TENANT,
    department_id: DEPT,
    month: "2026-05-01",
    draft,
    status,
    submitted_by: status === "submitted" ? LEAD.id : null,
    submitted_at: status === "submitted" ? "2026-05-20T00:00:00.000Z" : null
  };
}

afterEach(() => {
  vi.doUnmock("@/lib/auth-server");
  pendingContexts.length = 0;
  routes = null;
});

describe("PATCH /api/reports/[id] — submitted reports are locked", () => {
  it("rejects a non-admin draft edit after submit with 403 and leaves the row untouched", async () => {
    const original = report({ status: "submitted" });
    const db = makeDb({ reports: [original] });

    const { response, body } = await patch({
      db,
      profile: LEAD,
      body: { draft: { note: "tampered" } }
    });

    expect(response.status).toBe(403);
    expect(body).toEqual({
      ok: false,
      error: {
        code: "FORBIDDEN",
        message: "Report is locked once submitted — only an admin can reopen it"
      }
    });
    expect(db.state.reports[0].draft).toEqual({ note: "initial" });
    expect(db.state.reports[0].status).toBe("submitted");
    expect(db.state.queries.some((q) => /UPDATE dept_reports SET/.test(q.text))).toBe(false);
  });

  it("rejects a non-admin same-status submit after submit with 403", async () => {
    const db = makeDb({ reports: [report({ status: "submitted" })] });

    const { response, body } = await patch({ db, profile: LEAD, body: { status: "submitted" } });

    expect(response.status).toBe(403);
    expect(body.error.code).toBe("FORBIDDEN");
    expect(body.error.message).toBe("Report is locked once submitted — only an admin can reopen it");
    expect(db.state.queries.some((q) => /UPDATE dept_reports SET/.test(q.text))).toBe(false);
  });

  it("lets an admin reopen a submitted report", async () => {
    const db = makeDb({ reports: [report({ status: "submitted" })] });

    const { response, body } = await patch({ db, profile: ADMIN, body: { status: "draft" } });

    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true, data: { report: expect.objectContaining({ status: "draft" }) } });
    expect(db.state.reports[0].status).toBe("draft");
  });

  it("lets an admin edit the report after reopening it", async () => {
    const db = makeDb({ reports: [report({ status: "submitted" })] });

    const reopened = await patch({ db, profile: ADMIN, body: { status: "draft" } });
    expect(reopened.response.status).toBe(200);

    const edited = await patch({
      db,
      profile: ADMIN,
      body: { draft: { note: "admin revision" } }
    });

    expect(edited.response.status).toBe(200);
    expect(db.state.reports[0].status).toBe("draft");
    expect(db.state.reports[0].draft).toEqual({ note: "admin revision" });
  });
});

describe("POST /api/reports — compile never overwrites a submitted report", () => {
  it("refuses to recompile a submitted row with 409 REPORT_LOCKED and does not mutate it", async () => {
    const original = report({ status: "submitted", draft: { note: "filed" } });
    const db = makeDb({ reports: [original] });

    const { response, body } = await compile({
      db,
      profile: LEAD,
      body: { departmentId: DEPT, month: "2026-05" }
    });

    expect(response.status).toBe(409);
    expect(body).toEqual({
      ok: false,
      error: {
        code: "REPORT_LOCKED",
        message: "This report is submitted and can no longer be recompiled — an admin must reopen it first"
      }
    });
    expect(db.state.reports).toHaveLength(1);
    expect(db.state.reports[0].status).toBe("submitted");
    expect(db.state.reports[0].draft).toEqual({ note: "filed" });
  });

  it("still updates a draft report with freshly compiled counts", async () => {
    const db = makeDb({ reports: [report({ status: "draft", draft: { note: "stale" } })] });

    const { response, body } = await compile({
      db,
      profile: LEAD,
      body: { departmentId: DEPT, month: "2026-05" }
    });

    expect(response.status).toBe(201);
    expect(body.ok).toBe(true);
    expect(body.data.report.status).toBe("draft");
    expect(db.state.reports).toHaveLength(1);
    expect(db.state.reports[0].draft).toMatchObject({
      month: "2026-05-01",
      contributions_total: 0,
      new_members: 0
    });
    expect(db.state.reports[0].draft.compiled_at).toEqual(expect.any(String));
  });
});
