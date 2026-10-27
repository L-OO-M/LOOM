import { beforeEach, describe, expect, it, vi } from "vitest";
import { awardOssBadges, revokeUnearnedOssBadges } from "@/lib/oss";

const TENANT = "11111111-1111-1111-1111-111111111111";
const STUDENT = "student-1";
const OSS_ID = "22222222-2222-2222-2222-222222222222";
const RAW = "https://github.com/acme/app/pull/7/";
const CANONICAL = "https://github.com/acme/app/pull/7";

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

describe("OSS badge counts", () => {
  it("counts verified contributions inside the caller's tenant only", async () => {
    const sql = recorder(() => [{ prs: 0, reviews: 0 }]);
    await awardOssBadges({ sql, studentId: STUDENT, tenantId: TENANT, projectUrl: "https://github.com/acme/app" });

    const counts = sql.calls.filter((c) => c.text.includes("COUNT(*)"));
    expect(counts).toHaveLength(2);
    for (const call of counts) {
      expect(call.text).toContain("tenant_id = ?::uuid");
      expect(call.values).toContain(TENANT);
    }
  });

  it("removes badges and achievements that are no longer earned", async () => {
    const sql = recorder((text) => {
      if (text.includes("COUNT(*)") && text.includes("contribution_type = 'pr'")) return [{ prs: 1 }];
      if (text.includes("COUNT(*)") && text.includes("contribution_type = 'review'")) return [{ reviews: 0 }];
      if (text.includes("DELETE FROM oss_badges")) return [{ badge_key: "three-merged" }];
      return [];
    });

    const removed = await revokeUnearnedOssBadges({ sql, studentId: STUDENT, tenantId: TENANT });

    expect(removed).toEqual(["three-merged"]);
    const badgeDelete = sql.calls.find((c) => c.text.includes("DELETE FROM oss_badges"));
    expect(badgeDelete.text).toContain("tenant_id = ?::uuid");
    expect(badgeDelete.text).toContain("NOT (badge_key = ANY(");
    const achievementDelete = sql.calls.find((c) => c.text.includes("DELETE FROM student_achievements"));
    expect(achievementDelete.text).toContain("source_type = 'oss'");
  });
});

describe("roadmap re-claim route", () => {
  beforeEach(() => vi.resetModules());

  it("revokes a previously verified node when the student re-claims it", async () => {
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
      body: JSON.stringify({ nodeId: "n1", status: "completed", evidenceNote: "A sufficiently long evidence note." })
    }));

    expect(response.status).toBe(200);
    expect(revokeEvidence).toHaveBeenCalledWith({
      sql, tenantId: TENANT, userId: STUDENT, kind: "roadmap_done", refId: "n1"
    });
    expect(recomputeScore).toHaveBeenCalledWith(sql, TENANT, STUDENT);
    const achievementDelete = sql.calls.find((c) => c.text.includes("DELETE FROM student_achievements"));
    expect(achievementDelete).toBeTruthy();
    expect(achievementDelete.text).toContain("source_type = 'roadmap'");
    expect(achievementDelete.values).toContain(TENANT);
  });
});

describe("OSS rejection route", () => {
  beforeEach(() => vi.resetModules());

  it("revokes both ledger identities and removes unearned badges", async () => {
    const revokeEvidence = vi.fn(async () => null);
    const recomputeScore = vi.fn(async () => null);
    const revokeUnearned = vi.fn(async () => ["first-pr"]);
    const row = {
      id: OSS_ID,
      tenant_id: TENANT,
      student_id: STUDENT,
      contribution_type: "pr",
      canonical_url: CANONICAL,
      pr_url: RAW,
      repo_url: "https://github.com/acme/app",
      status: "claimed"
    };
    const sql = recorder((text) => {
      if (text.startsWith("SELECT * FROM student_oss_contributions")) return [row];
      if (text.startsWith("UPDATE student_oss_contributions")) return [{ ...row, status: "rejected", verified_at: null }];
      return [];
    });

    vi.doMock("@/lib/auth-server", () => ({
      getRequestContext: async () => ({ user: { id: "admin-1" }, tenant: { id: TENANT }, sql }),
      writeAudit: async () => {},
      notify: async () => {}
    }));
    vi.doMock("@/lib/ranking", () => ({ recordEvidence: vi.fn(), recomputeScore, revokeEvidence }));
    vi.doMock("@/lib/oss", () => ({ awardOssBadges: vi.fn(), revokeUnearnedOssBadges: revokeUnearned }));

    const { PATCH } = await import("@/app/api/opensource/contributions/[id]/route");
    const response = await PATCH(
      new Request("http://localhost/api/opensource/contributions/x", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "rejected" })
      }),
      { params: Promise.resolve({ id: OSS_ID }) }
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.revoked).toEqual(["first-pr"]);
    expect(revokeEvidence.mock.calls.map((c) => c[0].refId).sort()).toEqual([CANONICAL, RAW].sort());
    expect(recomputeScore).toHaveBeenCalledWith(sql, TENANT, STUDENT);
    expect(revokeUnearned).toHaveBeenCalledWith({ sql, studentId: STUDENT, tenantId: TENANT });
    const update = sql.calls.find((c) => c.text.startsWith("UPDATE student_oss_contributions"));
    expect(update.text).toContain("tenant_id = ?::uuid");
    expect(update.values).toContain(TENANT);
  });
});
