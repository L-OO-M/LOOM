import { describe, expect, it } from "vitest";
import { MOU_PARTNER_TYPES, MOU_STATUSES, listMous, getMou, nextDocumentVersion } from "@/lib/mou";

function recorder(results) {
  const calls = [];
  const sql = (strings, ...values) => {
    calls.push({ text: strings.join("?"), values });
    return Promise.resolve(results.shift() ?? []);
  };
  sql.calls = calls;
  return sql;
}

describe("MoU constants", () => {
  it("keeps the documented status and partner sets", () => {
    expect(MOU_STATUSES).toEqual(["draft", "sent", "active", "expired", "terminated"]);
    expect(MOU_PARTNER_TYPES).toContain("sponsor");
    expect(MOU_PARTNER_TYPES).toContain("college");
  });
});

describe("MoU queries", () => {
  it("scopes the list query to the tenant", async () => {
    const rows = [{ id: "m1", title: "Cloud credits" }];
    const sql = recorder([rows]);
    const result = await listMous(sql, { tenantId: "tenant-1" });
    expect(result).toEqual(rows);
    expect(sql.calls[0].values).toContain("tenant-1");
  });

  it("returns an MoU with its document history", async () => {
    const sql = recorder([
      [{ id: "m1", title: "Cloud credits" }],
      [{ label: "Agreement", version: 2 }, { label: "Agreement", version: 1 }]
    ]);
    const mou = await getMou(sql, { tenantId: "tenant-1", id: "m1" });
    expect(mou.title).toBe("Cloud credits");
    expect(mou.documents).toHaveLength(2);
  });

  it("returns null for an MoU outside the tenant", async () => {
    expect(await getMou(recorder([[]]), { tenantId: "tenant-1", id: "m1" })).toBeNull();
  });

  it("computes the next label version, starting at 1", async () => {
    expect(await nextDocumentVersion(recorder([[{ next: 3 }]]), { tenantId: "t", mouId: "m", label: "Agreement" })).toBe(3);
    expect(await nextDocumentVersion(recorder([[{}]]), { tenantId: "t", mouId: "m", label: "Agreement" })).toBe(1);
  });
});
