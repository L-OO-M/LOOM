import { describe, expect, it } from "vitest";
import { handoverScope, applyHandoverTransfer, handoverWorkPreview, UUID_PATTERN, ROLE_LABELS } from "@/lib/handover";

const member = (role, extra = {}) => ({
  role,
  vertical: null,
  memberships: [],
  roleTermEnd: null,
  ...extra
});

describe("handover scope", () => {
  it("rejects students and core members", () => {
    expect(handoverScope(member("student")).error).toBeTruthy();
    expect(handoverScope(member("core")).error).toBeTruthy();
  });

  it("derives the department a head actually leads", () => {
    const scope = handoverScope(member("dept_lead", {
      memberships: [
        { department_id: "d1", level: "core", name: "AI / ML", vertical: "technical" },
        { department_id: "d2", level: "dept_lead", name: "Web", vertical: "technical" }
      ]
    }));
    expect(scope).toEqual({
      role: "dept_lead",
      departmentId: "d2",
      departmentName: "Web",
      vertical: "technical"
    });
  });

  it("refuses to hand over one of several led departments", () => {
    const scope = handoverScope(member("dept_lead", {
      memberships: [
        { department_id: "d1", level: "dept_lead", name: "AI / ML", vertical: "technical" },
        { department_id: "d2", level: "dept_lead", name: "Web", vertical: "technical" }
      ]
    }));
    expect(scope.error).toContain("more than one department");
  });

  it("ignores expired department seats when resolving a handover", () => {
    const scope = handoverScope(member("dept_lead", {
      memberships: [{
        department_id: "d1",
        level: "dept_lead",
        name: "AI / ML",
        vertical: "technical",
        term_end: "2020-01-01"
      }]
    }));
    expect(scope.error).toContain("do not lead a department");
  });

  it("keeps a vertical lead inside their own vertical", () => {
    expect(handoverScope(member("vertical_lead", {
      tenantId: "tenant-1",
      vertical: "non_technical",
      scopedGrants: [{
        tenant_id: "tenant-1",
        role_name: "vertical_lead",
        scope_type: "vertical",
        scope_id: "non_technical",
        is_active: true,
        revoked_at: null,
        starts_at: null,
        expires_at: null
      }]
    }))).toEqual({
      role: "vertical_lead",
      vertical: "non_technical"
    });
    expect(handoverScope(member("vertical_lead")).error).toContain("vertical is not set");
  });

  it("rejects a stale vertical role label without an active grant", () => {
    expect(handoverScope(member("vertical_lead", {
      tenantId: "tenant-1",
      vertical: "technical",
      scopedGrants: []
    })).error).toMatch(/grant is inactive/i);
  });

  it("lets an admin hand over the admin seat", () => {
    expect(handoverScope(member("admin"))).toEqual({ role: "admin" });
  });

  it("does not let an expired term hand over a seat", () => {
    const scope = handoverScope(member("dept_lead", {
      roleTermEnd: "2020-01-01",
      memberships: [{ department_id: "d1", level: "dept_lead", name: "AI / ML", vertical: "technical" }]
    }));
    expect(scope.error).toBeTruthy();
  });

  it("recognises UUID account ids and labels every handover role", () => {
    expect(UUID_PATTERN.test("11111111-1111-4111-8111-111111111111")).toBe(true);
    expect(UUID_PATTERN.test("not-a-uuid")).toBe(false);
    expect(Object.keys(ROLE_LABELS)).toEqual(["dept_lead", "vertical_lead", "admin"]);
  });
});

describe("applyHandoverTransfer", () => {
  const TENANT = "22222222-2222-4222-8222-222222222222";

  function recordingTx(toUserId) {
    const statements = [];
    const tx = (strings, ...values) => {
      const text = strings.join("?").replace(/\s+/g, " ").trim();
      statements.push({ text, values });
      if (/^UPDATE profiles SET role = \?/.test(text)) {
        return Promise.resolve([{ user_id: toUserId, name: "Successor", role: "admin" }]);
      }
      return Promise.resolve([]);
    };
    return { tx, statements };
  }

  it("reassigns planner sessions by raw text id, never through ::uuid", async () => {
    // 058 converted planner_sessions.owner_user_id from uuid to text because
    // account keys are not always UUIDs. Casting the assignment back to uuid
    // throws for precisely those ids, aborting the whole transfer.
    const fromUserId = "auth0|66f1e2d3";
    const toUserId = "auth0|77a2f3e4";
    const { tx, statements } = recordingTx(toUserId);

    const result = await applyHandoverTransfer(tx, {
      tenantId: TENANT,
      actorId: "auth0|admin",
      handover: { from_user_id: fromUserId, to_user_id: toUserId, role: "admin", transfer_planner: true }
    });

    const planner = statements.find((s) => /^UPDATE planner_sessions/.test(s.text));
    expect(planner).toBeTruthy();
    expect(planner.text).not.toMatch(/owner_user_id(\s*=\s*\?)?::uuid/);
    expect(planner.values).toContain(fromUserId);
    expect(planner.values).toContain(toUserId);
    expect(result.planner).toBe(0);
  });

  it("moves only the outgoing head's own open work in that department", async () => {
    const fromUserId = "auth0|outgoing";
    const toUserId = "auth0|incoming";
    const departmentId = "33333333-3333-4333-8333-333333333333";
    const { tx, statements } = recordingTx(toUserId);

    const result = await applyHandoverTransfer(tx, {
      tenantId: TENANT,
      actorId: "auth0|admin",
      handover: {
        from_user_id: fromUserId,
        to_user_id: toUserId,
        role: "dept_lead",
        department_id: departmentId,
        transfer_tasks: true
      }
    });

    const moved = statements.find((s) => /^UPDATE department_tasks/.test(s.text));
    expect(moved).toBeTruthy();
    // Only the outgoing head's rows, only this department, only unfinished work.
    expect(moved.text).toContain("assignee_id = ?");
    expect(moved.values).toContain(fromUserId);
    expect(moved.values).toContain(departmentId);
    expect(moved.text).toContain("is_active");
    expect(moved.text).toMatch(/status IN \('assigned', 'in_progress', 'blocked'\)/);
    // A handover changes who leads, never who does what.
    expect(moved.text).not.toMatch(/assignee_id IS NOT NULL/);
    expect(moved.values).toContain(toUserId);
    expect(result.tasks).toBe(0);
  });

  it("leaves department work alone when the flag is off or the seat is not a department", async () => {
    const off = recordingTx("auth0|incoming");
    await applyHandoverTransfer(off.tx, {
      tenantId: TENANT,
      actorId: "auth0|admin",
      handover: {
        from_user_id: "auth0|outgoing",
        to_user_id: "auth0|incoming",
        role: "dept_lead",
        department_id: "33333333-3333-4333-8333-333333333333",
        transfer_tasks: false
      }
    });
    expect(off.statements.some((s) => /^UPDATE department_tasks/.test(s.text))).toBe(false);

    const vertical = recordingTx("auth0|incoming");
    await applyHandoverTransfer(vertical.tx, {
      tenantId: TENANT,
      actorId: "auth0|admin",
      handover: {
        from_user_id: "auth0|outgoing",
        to_user_id: "auth0|incoming",
        role: "vertical_lead",
        vertical: "technical",
        transfer_tasks: true
      }
    });
    expect(vertical.statements.some((s) => /^UPDATE department_tasks/.test(s.text))).toBe(false);
  });
});

describe("handoverWorkPreview", () => {
  const TENANT = "22222222-2222-4222-8222-222222222222";

  function fakeSql(rows) {
    const sql = async () => rows;
    return sql;
  }

  it("separates the head's own work from work nobody owns", async () => {
    const rows = [
      { department_id: "d1", assignee_id: "auth0|head", open: 3 },
      { department_id: "d1", assignee_id: null, open: 2 },
      { department_id: "d1", assignee_id: "auth0|member", open: 5 }
    ];
    const preview = await handoverWorkPreview(fakeSql(rows), {
      tenantId: TENANT,
      handovers: [{ id: "h1", department_id: "d1", from_user_id: "auth0|head" }]
    });
    expect(preview.get("h1")).toEqual({ ownOpen: 3, unassigned: 2 });
  });

  it("never counts a member's load as part of the transfer", async () => {
    const rows = [{ department_id: "d1", assignee_id: "auth0|member", open: 9 }];
    const preview = await handoverWorkPreview(fakeSql(rows), {
      tenantId: TENANT,
      handovers: [{ id: "h1", department_id: "d1", from_user_id: "auth0|head" }]
    });
    expect(preview.get("h1")).toEqual({ ownOpen: 0, unassigned: 0 });
  });

  it("answers for every handover in one pass and skips non-department seats", async () => {
    const rows = [{ department_id: "d1", assignee_id: "auth0|head", open: 1 }];
    const preview = await handoverWorkPreview(fakeSql(rows), {
      tenantId: TENANT,
      handovers: [
        { id: "h1", department_id: "d1", from_user_id: "auth0|head" },
        { id: "h2", department_id: "d2", from_user_id: "auth0|other" },
        { id: "h3", department_id: null, from_user_id: "auth0|vertical" }
      ]
    });
    expect(preview.size).toBe(3);
    expect(preview.get("h2")).toEqual({ ownOpen: 0, unassigned: 0 });
    expect(preview.get("h3")).toEqual({ ownOpen: 0, unassigned: 0 });
  });

  it("does not query at all when no handover is tied to a department", async () => {
    let called = false;
    const sql = async () => {
      called = true;
      return [];
    };
    const preview = await handoverWorkPreview(sql, {
      tenantId: TENANT,
      handovers: [{ id: "h1", department_id: null, from_user_id: "auth0|vertical" }]
    });
    expect(called).toBe(false);
    expect(preview.get("h1")).toEqual({ ownOpen: 0, unassigned: 0 });
  });
});
