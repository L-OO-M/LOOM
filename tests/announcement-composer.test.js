import { beforeEach, describe, expect, it, vi } from "vitest";

const TENANT = "11111111-1111-4111-8111-111111111111";
const DEPT = "22222222-2222-4222-8222-222222222222";
const ANNOUNCEMENT = "33333333-3333-4333-8333-333333333333";

function recorder(handler = () => []) {
  const calls = [];
  const sql = (strings, ...values) => {
    const text = strings.join("?").replace(/\s+/g, " ").trim();
    calls.push({ text, values });
    return Promise.resolve(handler(text, values) ?? []);
  };
  sql.calls = calls;
  return sql;
}

function req(method, body, id = "") {
  return new Request(`http://localhost/api/announcements${id ? `/${id}` : ""}`, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

async function load({ sql, profile }) {
  vi.resetModules();
  const audits = [];
  const fanouts = [];
  vi.doMock("@/lib/auth-server", () => ({
    getRequestContext: async () => ({ user: { id: "lead-1" }, profile, tenant: { id: TENANT }, sql }),
    writeAudit: async (args) => { audits.push(args); }
  }));
  vi.doMock("@/lib/announcement-publish", () => ({
    fanOutAnnouncement: async (args) => { fanouts.push(args); }
  }));
  const route = await import("@/app/api/announcements/route");
  const detail = await import("@/app/api/announcements/[id]/route");
  return { ...route, ...detail, audits, fanouts };
}

const LEAD = {
  role: "dept_lead",
  vertical: "technical",
  memberships: [{ department_id: DEPT, level: "dept_lead", vertical: "technical" }]
};

describe("announcement composer lifecycle", () => {
  beforeEach(() => vi.resetModules());

  it("saves a draft without notifying anyone", async () => {
    const sql = recorder((text) => {
      if (text.startsWith("SELECT id, vertical FROM departments")) return [{ id: DEPT, vertical: "technical" }];
      if (text.startsWith("INSERT INTO announcements")) {
        return [{ id: ANNOUNCEMENT, scope: "department", department_id: DEPT, title: "Lab closed", body: "Power work", status: "draft", author_id: "lead-1" }];
      }
      return [];
    });
    const { POST, audits, fanouts } = await load({ sql, profile: LEAD });

    const res = await POST(req("POST", {
      scope: "department", departmentId: DEPT, title: "Lab closed", body: "Power work", status: "draft"
    }));

    expect(res.status).toBe(201);
    expect(fanouts).toHaveLength(0);
    expect(audits[0]).toMatchObject({ action: "saved_announcement_draft" });
  });

  it("publishes immediately through the existing API and fans out once", async () => {
    const sql = recorder((text) => {
      if (text.startsWith("SELECT id, vertical FROM departments")) return [{ id: DEPT, vertical: "technical" }];
      if (text.startsWith("INSERT INTO announcements")) {
        return [{ id: ANNOUNCEMENT, scope: "department", department_id: DEPT, title: "Lab closed", body: "Power work", status: "published", author_id: "lead-1" }];
      }
      return [];
    });
    const { POST, audits, fanouts } = await load({ sql, profile: LEAD });

    const res = await POST(req("POST", {
      scope: "department", departmentId: DEPT, title: "Lab closed", body: "Power work", status: "published"
    }));

    expect(res.status).toBe(201);
    expect(fanouts).toHaveLength(1);
    expect(fanouts[0].announcement.id).toBe(ANNOUNCEMENT);
    expect(audits[0]).toMatchObject({ action: "posted_announcement" });
  });

  it("moves a draft to published and audits who did it", async () => {
    const sql = recorder((text) => {
      if (text.startsWith("SELECT * FROM announcements")) {
        return [{ id: ANNOUNCEMENT, scope: "department", department_id: DEPT, title: "Lab closed", body: "Power work", status: "draft", author_id: "lead-1", tenant_id: TENANT }];
      }
      if (text.startsWith("UPDATE announcements")) {
        return [{ id: ANNOUNCEMENT, scope: "department", department_id: DEPT, title: "Lab closed", body: "Power work", status: "published", author_id: "lead-1" }];
      }
      return [];
    });
    const { PATCH, audits, fanouts } = await load({ sql, profile: LEAD });

    const res = await PATCH(req("PATCH", { status: "published" }, ANNOUNCEMENT), {
      params: Promise.resolve({ id: ANNOUNCEMENT })
    });

    expect(res.status).toBe(200);
    expect(fanouts).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      action: "posted_announcement",
      before: { status: "draft" },
      after: { status: "published" }
    });
  });

  it("does not let a non-author publish another lead's draft", async () => {
    const sql = recorder((text) => {
      if (text.startsWith("SELECT * FROM announcements")) {
        return [{ id: ANNOUNCEMENT, scope: "department", department_id: DEPT, title: "Other", body: "", status: "draft", author_id: "someone-else", tenant_id: TENANT }];
      }
      return [];
    });
    const { PATCH } = await load({ sql, profile: LEAD });

    const res = await PATCH(req("PATCH", { status: "published" }, ANNOUNCEMENT), {
      params: Promise.resolve({ id: ANNOUNCEMENT })
    });

    expect(res.status).toBe(403);
  });
});

describe("announcement feed lifecycle", () => {
  beforeEach(() => vi.resetModules());

  it("only returns published, unexpired rows to students", async () => {
    const sql = recorder();
    const { GET } = await load({ sql, profile: { role: "student", vertical: null, memberships: [] } });

    const res = await GET(new Request("http://localhost/api/announcements"));

    expect(res.status).toBe(200);
    const feed = sql.calls.find((c) => c.text.includes("FROM announcements"));
    expect(feed.text).toContain("a.status = 'published'");
    expect(feed.text).toContain("a.expires_at > NOW()");
  });

  it("refuses the draft view to a student", async () => {
    const sql = recorder();
    const { GET } = await load({ sql, profile: { role: "student", vertical: null, memberships: [] } });

    const res = await GET(new Request("http://localhost/api/announcements?manage=1"));

    expect(res.status).toBe(403);
  });
});
