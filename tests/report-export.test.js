import { describe, expect, it } from "vitest";
import { buildCoverage, reportCsv, reportPdf, reportMonths } from "@/lib/report-export";

const PAYLOAD = {
  scope: "semester",
  months: ["2026-01", "2026-02"],
  since: "2026-01-01",
  exported_at: "2026-03-01T00:00:00.000Z",
  tenant_id: "11111111-1111-1111-1111-111111111111",
  submitted_reports: [
    {
      id: "r1",
      department_id: "d1",
      department_name: "Web",
      vertical: "technical",
      month: "2026-01-01",
      status: "submitted",
      submitted_by_name: "Asha",
      submitted_at: "2026-02-02T00:00:00.000Z",
      narrative: "Two workshops shipped. One venue moved.",
      draft: {
        contributions_total: 4,
        events_held: 2,
        new_members: 3,
        workshops_upcoming: 1
      }
    }
  ],
  departments: [
    { id: "d1", name: "Web", vertical: "technical" },
    { id: "d2", name: "Design", vertical: "non_technical" }
  ],
  contribution_counts: [{ department_id: "d1", kind: "code", n: 4 }],
  membership_counts: [{ department_id: "d1", n: 12 }],
  coverage: [
    {
      department_id: "d1",
      department_name: "Web",
      vertical: "technical",
      months: [
        { month: "2026-01", status: "submitted" },
        { month: "2026-02", status: "missing" }
      ]
    },
    {
      department_id: "d2",
      department_name: "Design",
      vertical: "non_technical",
      months: [
        { month: "2026-01", status: "missing" },
        { month: "2026-02", status: "missing" }
      ]
    }
  ],
  totals: {
    submitted_reports: 1,
    departments: 2,
    missing_months: 3,
    contributions: 4
  }
};

describe("report export renderers", () => {
  it("includes the narrative and the same totals in CSV", () => {
    const csv = reportCsv(PAYLOAD);

    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain('"Two workshops shipped. One venue moved."');
    expect(csv).toContain('"Submitted reports","1"');
    expect(csv).toContain('"Missing department-months","3"');
    expect(csv).toContain('"Web","2026-02","missing"');
    expect(csv).toContain('"Design","2026-01","missing"');
  });

  it("includes the narrative and the same totals in PDF", () => {
    const pdf = reportPdf(PAYLOAD).toString("latin1");

    expect(pdf.startsWith("%PDF-1.4")).toBe(true);
    expect(pdf).toContain("Submitted reports: 1");
    expect(pdf).toContain("Missing department-months: 3");
    expect(pdf).toContain("Two workshops shipped. One venue moved.");
    expect(pdf).toContain("Web - January 2026");
    expect(pdf).toContain("2026-02: missing");
    expect(pdf).toContain("%%EOF");
  });

  it("marks a department-month submitted only when a submitted report exists", () => {
    const coverage = buildCoverage({
      departments: [
        { id: "d1", name: "Web", vertical: "technical" },
        { id: "d2", name: "Design", vertical: "non_technical" }
      ],
      reports: [{ department_id: "d1", month: "2026-01-01" }],
      months: ["2026-01", "2026-02"]
    });

    expect(coverage[0].months).toEqual([
      { month: "2026-01", status: "submitted" },
      { month: "2026-02", status: "missing" }
    ]);
    expect(coverage[1].months.every((m) => m.status === "missing")).toBe(true);
  });

  it("builds the same month window for every format", () => {
    const now = new Date("2026-03-15T00:00:00Z");
    expect(reportMonths("semester", now)).toEqual([
      "2025-10", "2025-11", "2025-12", "2026-01", "2026-02", "2026-03"
    ]);
    expect(reportMonths("annual", now)).toHaveLength(12);
    expect(reportMonths("something-else", now)).toEqual(reportMonths("semester", now));
  });
});
