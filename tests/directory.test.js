import { describe, expect, it } from "vitest";
import { listDirectory, getEntry } from "@/lib/directory";

function recorder(results) {
  const calls = [];
  const sql = (strings, ...values) => {
    calls.push({ text: strings.join("?"), values });
    return Promise.resolve(results.shift() ?? []);
  };
  sql.calls = calls;
  return sql;
}

describe("leadership directory queries", () => {
  it("scopes the list to the tenant", async () => {
    const rows = [{ id: "e1", name: "Asha Rao", title: "Department Lead" }];
    const sql = recorder([rows]);
    const result = await listDirectory(sql, { tenantId: "tenant-1" });
    expect(result).toEqual(rows);
    expect(sql.calls[0].values).toContain("tenant-1");
  });

  it("passes filters through", async () => {
    const sql = recorder([[]]);
    await listDirectory(sql, {
      tenantId: "tenant-1", departmentId: "d1", vertical: "technical", current: true, q: "lead"
    });
    const values = sql.calls[0].values;
    expect(values).toContain("tenant-1");
    expect(values).toContain("d1");
    expect(values).toContain("technical");
    expect(values).toContain("lead");
  });

  it("returns one entry scoped to the tenant", async () => {
    const sql = recorder([[{ id: "e1", name: "Asha Rao" }]]);
    const entry = await getEntry(sql, { tenantId: "tenant-1", id: "e1" });
    expect(entry.name).toBe("Asha Rao");
  });

  it("returns null when the entry is not in this tenant", async () => {
    expect(await getEntry(recorder([[]]), { tenantId: "tenant-1", id: "e1" })).toBeNull();
  });
});
