import { describe, expect, it } from "vitest";
import { GLOBAL_TABLES, globalCatalogScope, isGlobalCatalog, scope } from "@/lib/tenant-scope";

// `scope()` is the only approved way to build a tenant predicate. The security
// property under test is that a missing tenant narrows to zero rows; it must
// never widen to "every chapter". globalCatalogScope() is the single audited
// escape hatch and refuses any table that is not explicitly global.

describe("scope", () => {
  it("passes a real tenant id through unchanged", () => {
    expect(scope("11111111-1111-4111-8111-111111111111")).toBe("11111111-1111-4111-8111-111111111111");
  });

  it("maps every empty tenant to null so SQL reads tenant_id = NULL", () => {
    expect(scope(null)).toBe(null);
    expect(scope(undefined)).toBe(null);
    expect(scope("")).toBe(null);
  });

  it("does not silently convert a falsy-but-present value into a wildcard", () => {
    // Only the three documented empties map to null. 0 is not a tenant id and
    // producing it unchanged is preferable to pretending it means "all".
    expect(scope(0)).toBe(0);
    expect(scope(false)).toBe(false);
  });

  it("does not trim or rewrite ids, which are uuids not user input", () => {
    expect(scope("  tenant  ")).toBe("  tenant  ");
  });
});

describe("global catalog", () => {
  it("declares only open_source_projects as global", () => {
    expect(GLOBAL_TABLES).toEqual(["open_source_projects"]);
    expect(isGlobalCatalog("open_source_projects")).toBe(true);
  });

  it("refuses every strict table", () => {
    for (const table of ["profiles", "projects", "events", "departments", "roadmap_nodes"]) {
      expect(isGlobalCatalog(table)).toBe(false);
    }
    expect(isGlobalCatalog(null)).toBe(false);
    expect(isGlobalCatalog(undefined)).toBe(false);
  });
});

describe("globalCatalogScope", () => {
  // Minimal tagged-template double: nested sql(column) and the returned
  // fragment are inspected structurally, without a database.
  function makeSql() {
    const calls = [];
    function sql(strings, ...values) {
      if (typeof strings === "string") return { column: strings };
      const text = strings.join("?");
      calls.push({ text, values });
      return { text, values };
    }
    return { sql, calls };
  }

  it("throws for a tenant-owned table so the escape hatch cannot be copied", () => {
    const { sql } = makeSql();
    expect(() => globalCatalogScope(sql, "tid", "profiles")).toThrow(/not a global catalogue/);
    expect(() => globalCatalogScope(sql, "tid", "events")).toThrow(/not a global catalogue/);
  });

  it("builds the NULL-or-tenant predicate only for a global table", () => {
    const { sql, calls } = makeSql();
    const fragment = globalCatalogScope(sql, "11111111-1111-4111-8111-111111111111", "open_source_projects");
    expect(calls).toHaveLength(1);
    expect(calls[0].text).toContain("IS NULL OR");
    expect(calls[0].values).toContain("11111111-1111-4111-8111-111111111111");
    expect(fragment.text).toContain("IS NULL OR");
  });

  it("accepts a custom column but keeps the same NULL-or-equal shape", () => {
    const { sql, calls } = makeSql();
    globalCatalogScope(sql, "tid", "open_source_projects", "owner_tenant_id");
    expect(calls[0].values).toContainEqual({ column: "owner_tenant_id" });
    expect(calls[0].text).toContain("IS NULL OR");
  });

  it("passes a missing tenant through as NULL, matching global rows only", () => {
    const { sql, calls } = makeSql();
    globalCatalogScope(sql, null, "open_source_projects");
    expect(calls[0].values).toContain(null);
  });
});
