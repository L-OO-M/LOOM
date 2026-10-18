import { describe, expect, it } from "vitest";
import {
  ASSET_KINDS, normalizeTags, listCategories, listAssets, getAsset, categoryBelongsToTenant
} from "@/lib/assets";

// Minimal stand-in for the postgres.js tagged-template client. Returns canned
// rows in order and records the interpolated values so tests can assert that a
// tenant id actually reached the query.
function recorder(results) {
  const calls = [];
  const sql = (strings, ...values) => {
    calls.push({ text: strings.join("?"), values });
    return Promise.resolve(results.shift() ?? []);
  };
  sql.calls = calls;
  return sql;
}

describe("normalizeTags", () => {
  it("accepts a comma-separated string and trims entries", () => {
    expect(normalizeTags(" logo , brand, 2026 ")).toEqual(["logo", "brand", "2026"]);
  });

  it("accepts an array and de-duplicates case-insensitively", () => {
    expect(normalizeTags(["Logo", "logo", "LOGO", "brand"])).toEqual(["Logo", "brand"]);
  });

  it("drops blanks and caps the count", () => {
    expect(normalizeTags("a,,b,,")).toEqual(["a", "b"]);
    expect(normalizeTags("1,2,3,4,5,6,7,8,9,10").length).toBe(8);
  });

  it("never throws on odd input", () => {
    expect(normalizeTags(undefined)).toEqual([]);
    expect(normalizeTags(null)).toEqual([]);
    expect(normalizeTags(42)).toEqual(["42"]);
  });
});

describe("asset categories and listing", () => {
  it("exposes the expected kinds", () => {
    expect(ASSET_KINDS).toContain("logo");
    expect(ASSET_KINDS).toContain("link");
  });

  it("lists categories scoped to the tenant", async () => {
    const rows = [{ id: "c1", name: "Logos", slug: "logos" }];
    const sql = recorder([rows]);
    const result = await listCategories(sql, "tenant-1");
    expect(result).toEqual(rows);
    expect(sql.calls[0].values[0]).toBe("tenant-1");
  });

  it("passes the tenant id into the asset list query", async () => {
    const rows = [{ id: "a1", title: "Logo" }];
    const sql = recorder([rows]);
    const result = await listAssets(sql, { tenantId: "tenant-1", q: "logo" });
    expect(result).toEqual(rows);
    expect(sql.calls[0].values).toContain("tenant-1");
  });

  it("returns an asset with its versions, newest first", async () => {
    const sql = recorder([
      [{ id: "a1", current_version: 2 }],
      [{ version: 2 }, { version: 1 }]
    ]);
    const asset = await getAsset(sql, { tenantId: "tenant-1", id: "a1" });
    expect(asset.current_version).toBe(2);
    expect(asset.versions).toHaveLength(2);
  });

  it("returns null when the asset is not in this tenant", async () => {
    const sql = recorder([[]]);
    expect(await getAsset(sql, { tenantId: "tenant-1", id: "a1" })).toBeNull();
  });

  it("treats a missing category as valid, and checks the rest against the tenant", async () => {
    expect(await categoryBelongsToTenant(recorder([]), "tenant-1", null)).toBe(true);
    expect(await categoryBelongsToTenant(recorder([[{ id: "c1" }]]), "tenant-1", "c1")).toBe(true);
    expect(await categoryBelongsToTenant(recorder([[]]), "tenant-1", "c9")).toBe(false);
  });
});
