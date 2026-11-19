import { describe, expect, it } from "vitest";
import { listReportRevisions, recordReportRevision } from "@/lib/report-revisions";

// dept_reports holds only the live row; report_revisions is the audit trail.
// The revision number is computed by the database in the same statement as the
// insert, and every read is tenant-scoped. Both properties are silent when
// wrong, hence these contract tests.

function makeSql(result = [{ revision: 3, status: "submitted", actor_id: "u1", created_at: "2026-11-01" }]) {
  const calls = [];
  function sql(strings, ...values) {
    const text = strings.join("?").replace(/\s+/g, " ").trim();
    calls.push({ text, values });
    return Promise.resolve(result);
  }
  sql.json = (value) => ({ __json: value });
  return { sql, calls };
}

describe("recordReportRevision", () => {
  it("requires a report id before issuing SQL", async () => {
    const { sql, calls } = makeSql();
    await expect(recordReportRevision({ sql, report: {} })).rejects.toThrow(/report\.id is required/);
    await expect(recordReportRevision({ sql, report: null })).rejects.toThrow(/report\.id is required/);
    expect(calls).toHaveLength(0);
  });

  it("computes revision n+1 inside the insert statement", async () => {
    const { sql, calls } = makeSql();
    await recordReportRevision({
      sql,
      report: { id: "r1", tenant_id: "t1", status: "submitted", draft: { body: "x" } },
      actorId: "u1"
    });
    expect(calls[0].text).toMatch(/COALESCE\(MAX\(revision\), 0\) \+ 1/);
    expect(calls[0].text).toMatch(/FROM report_revisions\s+WHERE report_id = \?/);
    expect(calls[0].values).toContain("r1");
  });

  it("persists the draft as JSON, not as a stringified blob", async () => {
    const { sql, calls } = makeSql();
    await recordReportRevision({
      sql,
      report: { id: "r1", tenant_id: "t1", status: "draft", draft: { body: "hello" } },
      actorId: null
    });
    expect(calls[0].values).toContainEqual({ __json: { body: "hello" } });
  });

  it("defaults a missing draft to an empty object", async () => {
    const { sql, calls } = makeSql();
    await recordReportRevision({ sql, report: { id: "r1", status: "submitted" }, actorId: "u1" });
    expect(calls[0].values).toContainEqual({ __json: {} });
  });

  it("allows a null tenant and actor without inventing values", async () => {
    const { sql, calls } = makeSql();
    await recordReportRevision({ sql, report: { id: "r1", status: "draft" } });
    expect(calls[0].values).toContain(null);
  });

  it("returns the row produced by the returning clause", async () => {
    const { sql } = makeSql([{ revision: 7 }]);
    await expect(
      recordReportRevision({ sql, report: { id: "r1", status: "submitted" }, actorId: "u1" })
    ).resolves.toEqual({ revision: 7 });
  });
});

describe("listReportRevisions", () => {
  it("scopes every read to the tenant", async () => {
    const { sql, calls } = makeSql([]);
    await listReportRevisions({ sql, reportId: "r1", tenantId: "t1" });
    expect(calls[0].text).toMatch(/report_id = \?/);
    expect(calls[0].text).toMatch(/tenant_id = \?::uuid/);
    expect(calls[0].values).toEqual(["r1", "t1", 25]);
  });

  it("defaults to the newest 25 revisions", async () => {
    const { sql, calls } = makeSql([]);
    await listReportRevisions({ sql, reportId: "r1", tenantId: "t1" });
    expect(calls[0].text).toMatch(/ORDER BY revision DESC/);
    expect(calls[0].values[2]).toBe(25);
  });

  it("honours an explicit limit", async () => {
    const { sql, calls } = makeSql([]);
    await listReportRevisions({ sql, reportId: "r1", tenantId: "t1", limit: 5 });
    expect(calls[0].values[2]).toBe(5);
  });

  it("passes a missing tenant through as NULL (zero rows, never all tenants)", async () => {
    const { sql, calls } = makeSql([]);
    await listReportRevisions({ sql, reportId: "r1" });
    expect(calls[0].values).toContain(null);
    expect(calls[0].text).not.toMatch(/IS NULL OR/i);
  });
});
