import { afterEach, describe, expect, it, vi } from "vitest";

const TENANT = "11111111-1111-4111-8111-111111111111";

let context;

function fakeSql() {
  return (strings) => {
    const text = strings.join("?").replace(/\s+/g, " ").trim();
    if (/FROM handover_checklists/.test(text)) {
      return Promise.resolve([{ id: "c1", title: "Sponsor sheet", category: "contacts", done: false, owner_id: "u1", owner_name: "Ravi" }]);
    }
    if (/FROM lead_handovers/.test(text)) return Promise.resolve([]);
    if (/FROM profiles p/.test(text)) return Promise.resolve([]);
    throw new Error(`unexpected query: ${text}`);
  };
}

async function loadRoute() {
  vi.resetModules();
  vi.doMock("@/lib/auth-server", () => ({
    getRequestContext: async () => context
  }));
  return import("@/app/api/admin/succession/route");
}

afterEach(() => {
  vi.doUnmock("@/lib/auth-server");
});

describe("GET /api/admin/succession", () => {
  it("returns the unified overview for an admin", async () => {
    context = { user: { id: "a1" }, profile: { role: "admin" }, tenant: { id: TENANT }, sql: fakeSql() };
    const { GET } = await loadRoute();
    const res = await GET();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.summary.outstanding_items).toBe(1);
    expect(body.data.items[0].owner.name).toBe("Ravi");
  });

  it("refuses a non-admin", async () => {
    context = { error: "FORBIDDEN" };
    const { GET } = await loadRoute();
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("refuses an unauthenticated request", async () => {
    context = { error: "UNAUTHORIZED" };
    const { GET } = await loadRoute();
    const res = await GET();
    expect(res.status).toBe(401);
  });
});
