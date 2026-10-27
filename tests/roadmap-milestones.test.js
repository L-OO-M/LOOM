import { beforeEach, describe, expect, it, vi } from "vitest";

const TENANT = "11111111-1111-4111-8111-111111111111";
const STUDENT = "student-1";

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

describe("roadmap milestone revocation", () => {
  beforeEach(() => vi.resetModules());

  it("removes roadmap achievements no longer supported when verified evidence is withdrawn", async () => {
    const revokeEvidence = vi.fn(async () => null);
    const recomputeScore = vi.fn(async () => null);
    const realRanking = await vi.importActual("@/lib/ranking");
    const sql = recorder((text) => {
      if (text.includes("SELECT id, title, is_optional FROM roadmap_nodes")) {
        return [{ id: "n1", title: "Node One", is_optional: false }];
      }
      if (text.includes("SELECT node_id FROM student_roadmap_progress")) return [];
      if (text.includes("FROM roadmap_edges")) return [{ edges: [] }];
      if (text.includes("SELECT evidence_state FROM student_roadmap_progress")) {
        return [{ evidence_state: "verified" }];
      }
      if (text.includes("INSERT INTO student_roadmap_progress")) {
        return [{ student_id: STUDENT, node_id: "n1", status: "completed", evidence_state: "provisional" }];
      }
      if (text.includes("SELECT COUNT(*)::int AS nodes FROM roadmap_nodes")) return [{ nodes: 3 }];
      if (text.includes("SELECT COUNT(*)::int AS done FROM student_roadmap_progress")) return [{ done: 0 }];
      if (text.includes("DELETE FROM student_achievements")) return [{ id: "a1", source_ref: "roadmap-first-step" }];
      if (text.includes("SELECT name FROM profiles")) return [{ name: "Student" }];
      return [];
    });

    vi.doMock("@/lib/auth-server", () => ({
      getRequestContext: async () => ({
        user: { id: STUDENT },
        profile: { role: "student" },
        tenant: { id: TENANT },
        sql
      }),
      writeAudit: async () => {},
      notify: async () => {}
    }));
    vi.doMock("next/cache", () => ({ revalidateTag: () => {} }));
    vi.doMock("@/lib/ranking", () => ({
      ...realRanking,
      revokeEvidence,
      recomputeScore
    }));

    const { POST } = await import("@/app/api/roadmap/progress/route");
    const response = await POST(new Request("http://localhost/api/roadmap/progress", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        nodeId: "n1",
        status: "completed",
        evidenceNote: "A sufficiently long evidence note."
      })
    }));

    expect(response.status).toBe(200);
    const remove = sql.calls.find((c) => c.text.includes("DELETE FROM student_achievements"));
    expect(remove).toBeTruthy();
    expect(remove.text).toContain("source_type = 'roadmap'");
    expect(remove.text).toContain("tenant_id = ?::uuid");
    expect(remove.values).toContain(TENANT);
  });
});
