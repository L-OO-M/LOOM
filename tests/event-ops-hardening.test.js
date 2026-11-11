import { beforeEach, describe, expect, it, vi } from "vitest";

const TENANT = "11111111-1111-4111-8111-111111111111";
const EVENT = "22222222-2222-4222-8222-222222222222";
const ADMIN = "admin-1";

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

describe("event attendee export", () => {
  beforeEach(() => vi.resetModules());

  it("returns a CSV with the attendee roster for the tenant's event", async () => {
    const sql = recorder((text) => {
      if (text.startsWith("SELECT id, title FROM events")) {
        return [{ id: EVENT, title: "Hack night" }];
      }
      if (text.startsWith("SELECT r.status")) {
        return [{
          status: "attended",
          check_in_code: "LOOM-AB12CD34",
          registered_at: new Date("2030-01-01T10:00:00.000Z"),
          feedback_score: 5,
          student_name: "Asha Rao",
          email: "asha@example.com",
          primary_domain: "web",
        }];
      }
      return [];
    });
    const ctx = { user: { id: ADMIN }, tenant: { id: TENANT }, sql };
    vi.doMock("@/lib/requirePermission", () => ({
      requireCan: async () => ctx,
      toGuardResponse: () => null
    }));
    const { GET } = await import("@/app/api/admin/events/[id]/attendees/export/route");

    const res = await GET(new Request(`http://localhost/api/admin/events/${EVENT}/attendees/export`), {
      params: Promise.resolve({ id: EVENT })
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    expect(res.headers.get("content-disposition")).toContain("hack-night.csv");
    const body = await res.text();
    expect(body).toContain('"Asha Rao"');
    expect(body).toContain('"LOOM-AB12CD34"');
    expect(body).toContain('"attended"');
  });
});

describe("event detail change notifications", () => {
  beforeEach(() => vi.resetModules());

  it("notifies registered students when an event is cancelled", async () => {
    const notifications = [];
    const sql = recorder((text) => {
      if (text.startsWith("SELECT * FROM events")) {
        return [{
          id: EVENT,
          tenant_id: TENANT,
          title: "Hack night",
          description: "Build",
          starts_at: "2030-01-01T10:00:00.000Z",
          location: "Lab",
          capacity: 40,
          speaker_name: null,
          is_online: false,
          status: "upcoming"
        }];
      }
      if (text.startsWith("UPDATE events")) {
        return [{ id: EVENT, title: "Hack night", status: "cancelled" }];
      }
      if (text.startsWith("SELECT student_id FROM event_registrations")) {
        return [{ student_id: "student-1" }, { student_id: "student-2" }];
      }
      return [];
    });
    vi.doMock("@/lib/requirePermission", () => ({
      requireCan: async () => ({ user: { id: ADMIN }, tenant: { id: TENANT }, sql }),
      toGuardResponse: () => null
    }));
    vi.doMock("@/lib/auth-server", () => ({
      writeAudit: async () => {},
      notify: async (args) => { notifications.push(args); }
    }));
    const { PATCH } = await import("@/app/api/admin/events/[id]/route");

    const res = await PATCH(new Request(`http://localhost/api/admin/events/${EVENT}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "cancelled" })
    }), { params: Promise.resolve({ id: EVENT }) });

    expect(res.status).toBe(200);
    expect(notifications).toHaveLength(2);
    expect(notifications[0]).toMatchObject({
      userId: "student-1",
      type: "event_update",
      title: "Event cancelled: Hack night"
    });
  });

  it("does not notify for a non-material edit", async () => {
    const notifications = [];
    const sql = recorder((text) => {
      if (text.startsWith("SELECT * FROM events")) {
        return [{
          id: EVENT,
          tenant_id: TENANT,
          title: "Hack night",
          description: "Build",
          starts_at: "2030-01-01T10:00:00.000Z",
          location: "Lab",
          capacity: 40,
          speaker_name: null,
          is_online: false,
          status: "upcoming"
        }];
      }
      if (text.startsWith("UPDATE events")) {
        return [{ id: EVENT, title: "Hack night", status: "upcoming" }];
      }
      return [];
    });
    vi.doMock("@/lib/requirePermission", () => ({
      requireCan: async () => ({ user: { id: ADMIN }, tenant: { id: TENANT }, sql }),
      toGuardResponse: () => null
    }));
    vi.doMock("@/lib/auth-server", () => ({
      writeAudit: async () => {},
      notify: async (args) => { notifications.push(args); }
    }));
    const { PATCH } = await import("@/app/api/admin/events/[id]/route");

    const res = await PATCH(new Request(`http://localhost/api/admin/events/${EVENT}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ capacity: 50 })
    }), { params: Promise.resolve({ id: EVENT }) });

    expect(res.status).toBe(200);
    expect(notifications).toHaveLength(0);
  });
});
