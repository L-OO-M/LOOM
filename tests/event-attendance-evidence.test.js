import { beforeEach, describe, expect, it, vi } from "vitest";

const TENANT = "11111111-1111-4111-8111-111111111111";
const EVENT = "22222222-2222-4222-8222-222222222222";
const ADMIN = "admin-1";
const STUDENT = "student-1";

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
      user: { id: ADMIN },
      profile: { role: "admin" },
      tenant: { id: TENANT },
      sql
    }),
    writeAudit: async () => {},
    notify: async () => {}
  }));
  vi.doMock("@/lib/certificates", () => ({ signCertificate: () => "signed" }));
  const recordEvidence = vi.fn(async () => ({}));
  const recomputeScore = vi.fn(async () => ({}));
  vi.doMock("@/lib/ranking", () => ({ recordEvidence, recomputeScore }));
  const mod = await import("@/app/api/admin/events/[id]/attendance/route");
  return { POST: mod.POST, recordEvidence, recomputeScore };
}

function request(studentId) {
  return new Request(`http://localhost/api/admin/events/${EVENT}/attendance`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ studentId })
  });
}

describe("event check-in evidence", () => {
  beforeEach(() => vi.resetModules());

  it("records verifier-backed attendance and recomputes the student's score", async () => {
    const sql = recorder((text) => {
      if (text.startsWith("SELECT * FROM events")) {
        return [{ id: EVENT, title: "Hack night", status: "upcoming", starts_at: "2020-01-01T00:00:00Z" }];
      }
      if (text.startsWith("SELECT * FROM event_registrations")) {
        return [{ id: "reg-1", student_id: STUDENT }];
      }
      if (text.startsWith("INSERT INTO certificates")) {
        return [{ verification_code: "CERT-1" }];
      }
      return [];
    });
    const { POST, recordEvidence, recomputeScore } = await load({ sql });

    const response = await POST(request(STUDENT), { params: Promise.resolve({ id: EVENT }) });

    expect(response.status).toBe(200);
    expect(recordEvidence).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: TENANT,
      userId: STUDENT,
      kind: "event_attended",
      refId: EVENT,
      verifiedBy: ADMIN
    }));
    expect(recomputeScore).toHaveBeenCalledWith(sql, TENANT, STUDENT);
  });

  it("does not let staff verify their own attendance", async () => {
    const sql = recorder((text) => {
      if (text.startsWith("SELECT * FROM events")) {
        return [{ id: EVENT, title: "Hack night", status: "upcoming", starts_at: "2020-01-01T00:00:00Z" }];
      }
      if (text.startsWith("SELECT * FROM event_registrations")) {
        return [{ id: "reg-2", student_id: ADMIN }];
      }
      if (text.startsWith("INSERT INTO certificates")) {
        return [{ verification_code: "CERT-2" }];
      }
      return [];
    });
    const { POST, recordEvidence, recomputeScore } = await load({ sql });

    const response = await POST(request(ADMIN), { params: Promise.resolve({ id: EVENT }) });

    expect(response.status).toBe(200);
    expect(recordEvidence).not.toHaveBeenCalled();
    expect(recomputeScore).not.toHaveBeenCalled();
  });
});
