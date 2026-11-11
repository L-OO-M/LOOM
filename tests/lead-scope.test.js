import { describe, expect, it, vi, beforeEach } from "vitest";
import { getLeadOverview } from "@/lib/lead";

// The page test below mocks @/lib/mou so it can observe the arguments the page
// passes. Filter tests intentionally use the real implementation.
const { listMous: realListMous } = await vi.importActual("@/lib/mou");

/**
 * Tagged-template recorder that understands nested `sql\`...\`` fragments.
 * Fragments are thenable, so awaiting a top-level query records it while a
 * nested fragment is simply inlined into its parent's text.
 */
function recorder(handler = () => []) {
  const calls = [];

  function render(strings, values) {
    let text = strings[0];
    for (let i = 0; i < values.length; i += 1) {
      const value = values[i];
      text += (value && value.__sqlFragment ? value.text : "?") + strings[i + 1];
    }
    return text;
  }

  function flatten(values) {
    return values.flatMap((value) =>
      value && value.__sqlFragment ? flatten(value.values) : [value]
    );
  }

  const sql = (strings, ...values) => {
    const text = render(strings, values);
    return {
      __sqlFragment: true,
      text,
      values,
      then(resolve, reject) {
        const rows = handler(text, values) ?? [];
        calls.push({ text, values: flatten(values) });
        return Promise.resolve(rows).then(resolve, reject);
      }
    };
  };

  sql.calls = calls;
  return sql;
}

function overviewSql() {
  return recorder((text) => {
    if (text.includes("FROM departments d")) {
      return [{ id: "d1", name: "AI / ML", slug: "ai_ml", vertical: "technical" }];
    }
    return [];
  });
}

function queryCall(sql, needle) {
  return sql.calls.find((call) => call.text.includes(needle));
}

const admin = { id: "a", role: "admin", vertical: null, memberships: [] };
const deptLead = {
  id: "d",
  role: "dept_lead",
  vertical: "technical",
  memberships: [{ department_id: "d1", level: "dept_lead" }]
};
const verticalLead = { id: "v", role: "vertical_lead", vertical: "technical", memberships: [] };

async function overviewFor(profile) {
  const sql = overviewSql();
  await getLeadOverview(sql, { userId: profile.id, profile, tenant: { id: "tenant-1" } });
  return sql;
}

describe("lead workshop scope", () => {
  it("limits a vertical lead to their vertical and chapter-wide events", async () => {
    const sql = await overviewFor(verticalLead);
    const workshops = sql.calls.find((call) =>
      call.text.includes("registered_count") && call.text.includes("status <> 'cancelled'")
    );

    expect(workshops).toBeTruthy();
    expect(workshops.text).not.toMatch(/OR\s+TRUE/i);
    expect(workshops.text).toContain("d.vertical");
    expect(workshops.text).toContain("e.department_id IS NULL");
    expect(workshops.values).toContain("technical");
  });

  it("keeps the admin workshop scope unfiltered", async () => {
    const sql = await overviewFor(admin);
    const workshops = sql.calls.find((call) =>
      call.text.includes("registered_count") && call.text.includes("status <> 'cancelled'")
    );

    expect(workshops).toBeTruthy();
    expect(workshops.text).toContain("TRUE");
    expect(workshops.text).not.toContain("d.vertical =");
    expect(workshops.text).not.toContain("e.department_id IS NULL");
  });

  it("keeps a dept lead limited to led department ids", async () => {
    const sql = await overviewFor(deptLead);
    const workshops = sql.calls.find((call) =>
      call.text.includes("registered_count") && call.text.includes("status <> 'cancelled'")
    );

    expect(workshops).toBeTruthy();
    expect(workshops.text).toContain("e.department_id = ANY");
    expect(workshops.text).not.toContain("TRUE");
    expect(workshops.text).not.toContain("d.vertical");
  });
});

describe("lead proposed-event scope", () => {
  it("limits a vertical lead's proposed queue to their vertical plus chapter-wide events", async () => {
    const sql = await overviewFor(verticalLead);
    const proposed = queryCall(sql, "status = 'proposed'");

    expect(proposed).toBeTruthy();
    expect(proposed.text).not.toMatch(/OR\s+TRUE/i);
    expect(proposed.text).toContain("d.vertical");
    expect(proposed.text).toContain("e.department_id IS NULL");
    expect(proposed.values).toContain("technical");
  });

  it("keeps the admin proposed queue unfiltered", async () => {
    const sql = await overviewFor(admin);
    const proposed = queryCall(sql, "status = 'proposed'");

    expect(proposed).toBeTruthy();
    expect(proposed.text).toContain("TRUE");
    expect(proposed.text).not.toContain("d.vertical =");
  });

  it("does not give a dept lead a proposed-event queue", async () => {
    const sql = await overviewFor(deptLead);

    expect(queryCall(sql, "status = 'proposed'")).toBeUndefined();
  });
});

describe("MoU vertical filter", () => {
  it("adds a vertical predicate when a vertical is supplied", async () => {
    const sql = recorder();
    await realListMous(sql, { tenantId: "tenant-1", vertical: "technical" });

    expect(sql.calls[0].text).toContain("m.vertical");
    expect(sql.calls[0].text).toContain("IS NULL");
    expect(sql.calls[0].values).toContain("technical");
  });

  it("treats null and empty vertical as all MoUs", async () => {
    for (const vertical of [null, ""]) {
      const sql = recorder();
      await realListMous(sql, { tenantId: "tenant-1", vertical });
      expect(sql.calls[0].values).toContain(vertical);
    }
  });
});

const mocks = vi.hoisted(() => ({
  listMous: vi.fn(async () => []),
  listRenewals: vi.fn(async () => []),
  ctx: { current: null }
}));

vi.mock("@/lib/mou", () => ({
  listMous: mocks.listMous,
  listRenewals: mocks.listRenewals,
  MOU_EXPIRING_DAYS: 30
}));

vi.mock("@/lib/auth-server", () => ({
  getRequestContext: async () => mocks.ctx.current
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("redirect");
  })
}));

vi.mock("@/components/AppShell", () => ({ AppShell: () => null }));
vi.mock("@/components/loom/WorkspaceMasthead", () => ({
  WorkspaceMasthead: () => null,
  WorkspaceSection: () => null
}));
vi.mock("@/components/lead/MouBoard", () => ({ MouBoard: () => null }));

const Page = (await import("@/app/(app)/lead/mous/page.jsx")).default;

function pageContext(role, vertical) {
  return {
    user: { id: "u1" },
    profile: { role, vertical, memberships: [] },
    tenant: { id: "tenant-1" },
    sql: async () => []
  };
}

describe("/lead/mous vertical handoff", () => {
  beforeEach(() => {
    mocks.listMous.mockClear();
  });

  it("passes the profile vertical for a vertical lead", async () => {
    mocks.ctx.current = pageContext("vertical_lead", "technical");
    await Page();

    const options = mocks.listMous.mock.calls[0][1];
    expect(options.tenantId).toBe("tenant-1");
    expect(options.vertical).toBe("technical");
  });

  it("does not pass a vertical for admin or dept lead", async () => {
    for (const role of ["admin", "dept_lead"]) {
      mocks.listMous.mockClear();
      mocks.ctx.current = pageContext(role, "technical");
      await Page();

      const options = mocks.listMous.mock.calls[0][1];
      expect(options).not.toHaveProperty("vertical");
    }
  });
});
