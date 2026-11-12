import { afterEach, describe, expect, it, vi } from "vitest";
import { checklistProgress, checklistTemplate } from "@/lib/people";

const TENANT = "11111111-1111-4111-8111-111111111111";
const ADMIN = "99999999-9999-4999-8999-999999999999";
const TARGET = "22222222-2222-4222-8222-222222222222";

function jsonRequest(body) {
  return new Request("http://localhost/api/admin/students/x/status", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

function makeStatusDb({ target = { user_id: TARGET, name: "Asha", role: "core", account_status: "active", status_reason: null }, checklist = [], admins = 2 } = {}) {
  const state = { statements: [], begins: 0, profiles: { ...target }, mentorsPaused: false };
  function dispatch(strings, values) {
    const text = strings.join("?").replace(/\s+/g, " ").trim();
    state.statements.push(text);
    if (/FROM profiles/.test(text)) return [state.profiles];
    if (/FROM platform_admins/.test(text)) return [];
    if (/COUNT\(\*\)::int AS admins/.test(text)) return [{ admins }];
    if (/FROM people_checklist_items/.test(text)) return checklist;
    if (/UPDATE profiles/.test(text)) {
      state.profiles = { ...state.profiles, account_status: values[0], status_reason: values[1] };
      return [state.profiles];
    }
    if (/UPDATE mentors/.test(text)) {
      state.mentorsPaused = true;
      return [];
    }
    throw new Error(`unexpected query: ${text}`);
  }
  const sql = (strings, ...values) => Promise.resolve(dispatch(strings, values));
  sql.begin = async (fn) => {
    state.begins += 1;
    return fn((strings, ...values) => Promise.resolve(dispatch(strings, values)));
  };
  return { sql, state };
}

const contexts = [];
const audits = [];
const notices = [];

async function loadStatusRoute() {
  vi.resetModules();
  vi.doMock("@/lib/auth-server", () => ({
    getRequestContext: async () => contexts.shift(),
    writeAudit: async (args) => { audits.push(args); },
    notify: async (args) => { notices.push(args); }
  }));
  return import("@/app/api/admin/students/[id]/status/route");
}

async function patchStatus(body, db = makeStatusDb()) {
  contexts.push({ user: { id: ADMIN }, profile: { role: "admin" }, tenant: { id: TENANT }, sql: db.sql });
  const { PATCH } = await loadStatusRoute();
  return PATCH(jsonRequest(body), { params: Promise.resolve({ id: TARGET }) });
}

afterEach(() => {
  vi.doUnmock("@/lib/auth-server");
  contexts.length = 0;
  audits.length = 0;
  notices.length = 0;
});

describe("people checklists", () => {
  it("merges role items with the shared base and reports outstanding work", () => {
    const template = checklistTemplate("dept_lead", "offboarding");
    expect(template.map((i) => i.key)).toContain("successor_named");
    const progress = checklistProgress(
      [{ kind: "offboarding", item_key: "handover_filed", done: true }],
      "dept_lead",
      "offboarding"
    );
    expect(progress.done).toBe(1);
    expect(progress.total).toBeGreaterThan(progress.done);
    expect(progress.outstanding.map((i) => i.key)).not.toContain("handover_filed");
  });

  it("dedupes a key that exists in both the base and role template", () => {
    const progress = checklistProgress([], "vertical_lead", "onboarding");
    const keys = progress.items.map((i) => i.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toContain("budget_brief");
  });
});

describe("PATCH /api/admin/students/[id]/status", () => {
  it("suspends an account in one transaction and pauses mentor availability", async () => {
    const db = makeStatusDb();
    const res = await patchStatus({ status: "suspended", reason: "Code of conduct review" }, db);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.profile.account_status).toBe("suspended");
    expect(db.state.begins).toBe(1);
    expect(db.state.mentorsPaused).toBe(true);
    expect(audits.at(-1).action).toBe("marked_account_suspended");
  });

  it("refuses to suspend the last active admin inside the transaction", async () => {
    const db = makeStatusDb({ target: { user_id: TARGET, name: "Asha", role: "admin", account_status: "active", status_reason: null } });
    const res = await patchStatus({ status: "suspended", reason: "Stepping down" }, db);
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error.code).toBe("FORBIDDEN");
    expect(db.state.begins).toBe(1);
    expect(db.state.profiles.account_status).toBe("active");
  });

  it("refuses to close an account with outstanding offboarding", async () => {
    const db = makeStatusDb({ checklist: [] });
    const res = await patchStatus({ status: "deactivated", reason: "Leaving chapter" }, db);
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error.code).toBe("OFFBOARDING_OUTSTANDING");
    expect(body.error.details.outstanding.length).toBeGreaterThan(0);
    expect(db.state.begins).toBe(0);
  });

  it("does not reactivate without an explicit confirmation", async () => {
    const db = makeStatusDb({ target: { user_id: TARGET, name: "Asha", role: "core", account_status: "suspended", status_reason: "review" } });
    const res = await patchStatus({ status: "active" }, db);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error.code).toBe("CONFIRM_REQUIRED");
    expect(db.state.begins).toBe(0);
  });

  it("reactivates only when confirmed and notifies the member", async () => {
    const db = makeStatusDb({ target: { user_id: TARGET, name: "Asha", role: "core", account_status: "suspended", status_reason: "review" } });
    const res = await patchStatus({ status: "active", confirm: true }, db);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.profile.account_status).toBe("active");
    expect(audits.at(-1).action).toBe("reactivated_account");
    expect(notices.at(-1).type).toBe("account_reactivated");
  });
});
