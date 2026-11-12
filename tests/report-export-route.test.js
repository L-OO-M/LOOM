import { afterEach, describe, expect, it, vi } from "vitest";

const PAYLOAD = {
  scope: "semester",
  months: ["2026-01", "2026-02"],
  since: "2026-01-01",
  exported_at: "2026-03-01T00:00:00.000Z",
  tenant_id: "11111111-1111-1111-1111-111111111111",
  submitted_reports: [
    {
      department_id: "d1",
      department_name: "Web",
      vertical: "technical",
      month: "2026-01-01",
      status: "submitted",
      narrative: "A quiet month.",
      draft: { contributions_total: 2, events_held: 1, new_members: 0, workshops_upcoming: 0 }
    }
  ],
  departments: [{ id: "d1", name: "Web", vertical: "technical" }],
  contribution_counts: [],
  membership_counts: [],
  coverage: [
    {
      department_id: "d1",
      department_name: "Web",
      vertical: "technical",
      months: [
        { month: "2026-01", status: "submitted" },
        { month: "2026-02", status: "missing" }
      ]
    }
  ],
  totals: { submitted_reports: 1, departments: 1, missing_months: 1, contributions: 2 }
};

const ADMIN = { role: "admin", vertical: null, memberships: [] };
let loaderCalls = 0;
let routes = null;

async function loadRoute() {
  vi.resetModules();
  loaderCalls = 0;
  vi.doMock("@/lib/auth-server", () => ({
    getRequestContext: async () => ({
      user: { id: "u1" },
      profile: ADMIN,
      tenant: { id: "11111111-1111-1111-1111-111111111111" },
      sql: () => Promise.resolve([])
    })
  }));
  vi.doMock("@/lib/report-export", async (importOriginal) => {
    const actual = await importOriginal();
    return {
      ...actual,
      loadReportExport: async () => {
        loaderCalls += 1;
        return PAYLOAD;
      }
    };
  });
  return import("@/app/api/reports/export/route");
}

async function get(format, scope = "semester") {
  const route = routes || (routes = await loadRoute());
  const response = await route.GET(new Request(`http://localhost/api/reports/export?scope=${scope}&format=${format}`));
  return { response, text: await response.text() };
}

afterEach(() => {
  vi.doUnmock("@/lib/auth-server");
  vi.doUnmock("@/lib/report-export");
  routes = null;
  loaderCalls = 0;
});

describe("GET /api/reports/export", () => {
  it("renders CSV and PDF from one shared export payload", async () => {
    const csv = await get("csv");
    const pdf = await get("pdf");

    expect(csv.response.headers.get("content-type")).toContain("text/csv");
    expect(pdf.response.headers.get("content-type")).toBe("application/pdf");
    expect(csv.text).toContain('"Missing department-months","1"');
    expect(csv.text).toContain('"A quiet month."');
    expect(pdf.text).toContain("Missing department-months: 1");
    expect(pdf.text).toContain("A quiet month.");
    expect(loaderCalls).toBe(2);
  });

  it("keeps the JSON envelope for callers that expect it", async () => {
    const json = await get("json");
    const body = JSON.parse(json.text);

    expect(json.response.headers.get("content-type")).toContain("application/json");
    expect(body.ok).toBe(true);
    expect(body.data.totals.missing_months).toBe(1);
    expect(body.data.submitted_reports[0].narrative).toBe("A quiet month.");
  });
});
