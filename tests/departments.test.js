import { describe, expect, it } from "vitest";
import { listPublicDepartments } from "@/lib/departments";

// One query feeds /about, /domains, /domains/[slug] and the public departments
// API. The invariants are that the tenant predicate is always present, the slug
// filter stays parameterised, and the optional upcoming count never becomes a
// second round-trip.

function makeSql(rows = [{ id: "d1", name: "AI / ML" }]) {
  const calls = [];
  function sql(strings, ...values) {
    if (typeof strings === "string" || !Array.isArray(strings)) return { column: strings };
    const text = strings.join("?").replace(/\s+/g, " ").trim();
    // Nested fragments (sql`0`, sql`AND ...`, sql`(SELECT ...)`) are values
    // inside the outer statement, not statements of their own.
    if (values.length === 0 || /^(AND |\(SELECT\b)/.test(text)) {
      calls.push({ text, values, fragment: true });
      return { fragment: text, values };
    }
    calls.push({ text, values, fragment: false });
    return Promise.resolve(rows);
  }
  return {
    sql,
    calls,
    outer: () => calls.filter((c) => !c.fragment),
    fragments: () => calls.filter((c) => c.fragment)
  };
}

describe("listPublicDepartments", () => {
  it("always pins the query to the caller's tenant", async () => {
    const { sql, outer } = makeSql();
    await listPublicDepartments(sql, { tenantId: "11111111-1111-4111-8111-111111111111" });
    expect(outer()).toHaveLength(1);
    expect(outer()[0].text).toMatch(/WHERE d\.tenant_id = \?::uuid/);
    expect(outer()[0].values).toContain("11111111-1111-4111-8111-111111111111");
  });

  it("uses NULL (zero rows) rather than widening when no tenant resolves", async () => {
    const { sql, outer } = makeSql();
    await listPublicDepartments(sql, {});
    expect(outer()[0].values).toContain(null);
    expect(outer()[0].text).not.toMatch(/IS NULL OR/i);
  });

  it("only returns active departments", async () => {
    const { sql, outer } = makeSql();
    await listPublicDepartments(sql, { tenantId: "t" });
    expect(outer()[0].text).toMatch(/AND d\.is_active/);
  });

  it("parameterises the slug filter instead of interpolating it", async () => {
    const { sql, outer, fragments } = makeSql();
    await listPublicDepartments(sql, { tenantId: "t", slug: "ai-ml" });
    const slugFilter = fragments().find((c) => /d\.slug = \?/.test(c.text));
    expect(slugFilter).toBeTruthy();
    expect(slugFilter.values).toEqual(["ai-ml"]);
    // The slug never appears in the assembled SQL string itself.
    expect(outer()[0].text).not.toContain("ai-ml");
  });

  it("asks for the upcoming-event count only when requested", async () => {
    const plain = makeSql();
    await listPublicDepartments(plain.sql, { tenantId: "t" });
    expect(plain.fragments().some((c) => /FROM events e/.test(c.text))).toBe(false);

    const withUpcoming = makeSql();
    await listPublicDepartments(withUpcoming.sql, { tenantId: "t", withUpcoming: true });
    const count = withUpcoming.fragments().find((c) => /FROM events e/.test(c.text));
    expect(count).toBeTruthy();
    expect(count.text).toMatch(/starts_at >= NOW\(\)/);
  });

  it("orders by vertical then name for a stable directory", async () => {
    const { sql, outer } = makeSql();
    await listPublicDepartments(sql, { tenantId: "t" });
    expect(outer()[0].text).toMatch(/ORDER BY d\.vertical, d\.name/);
  });

  it("returns the rows unchanged and issues one query", async () => {
    const rows = [{ id: "d1", members: 4 }];
    const { sql, outer } = makeSql(rows);
    await expect(listPublicDepartments(sql, { tenantId: "t" })).resolves.toBe(rows);
    expect(outer()).toHaveLength(1);
  });
});
