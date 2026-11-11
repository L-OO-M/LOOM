import { beforeEach, describe, expect, it, vi } from "vitest";

const TENANT = "11111111-1111-4111-8111-111111111111";
const MOU = "22222222-2222-4222-8222-222222222222";
const TASK = "33333333-3333-4333-8333-333333333333";

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

function req(method, body) {
  return new Request(`http://localhost/api/lead/mous/${MOU}/renewal`, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

async function loadRoute({ sql, profile, mou = { id: MOU, title: "Cloud credits", vertical: "technical" } }) {
  vi.resetModules();
  const audits = [];
  const notifications = [];
  vi.doMock("@/lib/requirePermission", () => ({
    requireCan: async () => ({ user: { id: "lead-1" }, profile, tenant: { id: TENANT }, sql }),
    toGuardResponse: () => null
  }));
  vi.doMock("@/lib/auth-server", () => ({
    writeAudit: async (args) => { audits.push(args); },
    notify: async (args) => { notifications.push(args); }
  }));
  vi.doMock("@/lib/mou", () => ({ getMou: async () => mou }));
  const mod = await import("@/app/api/lead/mous/[id]/renewal/route");
  return { ...mod, audits, notifications };
}

describe("MoU renewal tasks", () => {
  beforeEach(() => vi.resetModules());

  it("opens an owned renewal task with a next action and due date", async () => {
    const sql = recorder((text) => {
      if (text.startsWith("SELECT user_id, name FROM profiles")) return [{ user_id: "lead-1", name: "Asha" }];
      if (text.startsWith("SELECT id FROM mou_renewal_tasks")) return [];
      if (text.startsWith("INSERT INTO mou_renewal_tasks")) {
        return [{ id: TASK, mou_id: MOU, owner_id: "lead-1", next_action: "Call sponsor", due_on: "2030-01-10", status: "open" }];
      }
      return [];
    });
    const { POST, audits } = await loadRoute({
      sql,
      profile: { role: "vertical_lead", vertical: "technical", memberships: [] }
    });

    const res = await POST(req("POST", { nextAction: "Call sponsor", dueOn: "2030-01-10" }), {
      params: Promise.resolve({ id: MOU })
    });
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.data.task.owner_id).toBe("lead-1");
    expect(json.data.task.next_action).toBe("Call sponsor");
    expect(audits[0]).toMatchObject({ action: "mou.renewal_open", resource: "mou_renewal_tasks" });
  });

  it("refuses a renewal task for a MoU outside the lead's vertical", async () => {
    const sql = recorder();
    const { POST } = await loadRoute({
      sql,
      profile: { role: "vertical_lead", vertical: "technical", memberships: [] },
      mou: { id: MOU, title: "Other domain", vertical: "non_technical" }
    });

    const res = await POST(req("POST", { nextAction: "Call sponsor" }), {
      params: Promise.resolve({ id: MOU })
    });

    expect(res.status).toBe(403);
    expect((await res.json()).error.message).toMatch(/another domain/i);
  });

  it("closes a task with who closed it and when", async () => {
    const sql = recorder((text) => {
      if (text.startsWith("UPDATE mou_renewal_tasks")) {
        return [{ id: TASK, mou_id: MOU, status: "done", closed_by: "lead-1", closed_at: "2030-01-02T10:00:00.000Z" }];
      }
      return [];
    });
    const { PATCH, audits } = await loadRoute({
      sql,
      profile: { role: "vertical_lead", vertical: "technical", memberships: [] }
    });

    const res = await PATCH(req("PATCH", { action: "close", taskId: TASK }), {
      params: Promise.resolve({ id: MOU })
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.task.status).toBe("done");
    expect(json.data.task.closed_by).toBe("lead-1");
    expect(audits[0]).toMatchObject({ action: "mou.renewal_close" });
  });
});

describe("MoU sponsorship link", () => {
  beforeEach(() => vi.resetModules());

  async function loadCreate({ sql, profile }) {
    vi.doUnmock("@/lib/mou");
    vi.doMock("@/lib/requirePermission", () => ({
      requireCan: async () => ({ user: { id: "lead-1" }, profile, tenant: { id: TENANT }, sql }),
      toGuardResponse: () => null
    }));
    vi.doMock("@/lib/auth-server", () => ({ writeAudit: async () => {} }));
    return import("@/app/api/lead/mous/route");
  }

  it("links a same-domain sponsorship to the MoU", async () => {
    const SPONSOR = "44444444-4444-4444-8444-444444444444";
    const sql = recorder((text) => {
      if (text.startsWith("SELECT id, vertical FROM sponsorships")) return [{ id: SPONSOR, vertical: "technical" }];
      if (text.startsWith("INSERT INTO mous")) {
        return [{ id: MOU, title: "Cloud credits", partner_name: "Acme", sponsorship_id: SPONSOR }];
      }
      return [];
    });
    const { POST } = await loadCreate({
      sql,
      profile: { role: "vertical_lead", vertical: "technical", memberships: [] }
    });

    const res = await POST(new Request("http://localhost/api/lead/mous", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Cloud credits", partnerName: "Acme", sponsorshipId: SPONSOR })
    }));
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.data.mou.sponsorship_id).toBe(SPONSOR);
    expect(sql.calls.some((c) => c.text.startsWith("INSERT INTO mous") && c.values.includes(SPONSOR))).toBe(true);
  });

  it("refuses linking a sponsorship from another domain", async () => {
    const SPONSOR = "55555555-5555-4555-8555-555555555555";
    const sql = recorder((text) => {
      if (text.startsWith("SELECT id, vertical FROM sponsorships")) return [{ id: SPONSOR, vertical: "non_technical" }];
      return [];
    });
    const { POST } = await loadCreate({
      sql,
      profile: { role: "vertical_lead", vertical: "technical", memberships: [] }
    });

    const res = await POST(new Request("http://localhost/api/lead/mous", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Cloud credits", partnerName: "Acme", sponsorshipId: SPONSOR })
    }));

    expect(res.status).toBe(403);
  });
});
