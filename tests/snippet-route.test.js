import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const ROUTE = "app/api/community/snippets/[id]/route.js";

describe("snippet author edit/delete route", () => {
  it("exposes PATCH and DELETE", () => {
    const src = readFileSync(ROUTE, "utf8");
    expect(src).toMatch(/export async function PATCH/);
    expect(src).toMatch(/export async function DELETE/);
  });

  it("enforces ownership and tenant scope", () => {
    const src = readFileSync(ROUTE, "utf8");
    expect(src).toContain("author_id !== userId");
    expect(src).toContain("FORBIDDEN");
    expect(src).toContain("tenant_id = ${tid}::uuid");
  });

  it("soft-deletes by hiding rather than destroying the row", () => {
    const src = readFileSync(ROUTE, "utf8");
    expect(src).toMatch(/SET status = 'hidden'/);
    expect(src).not.toMatch(/DELETE FROM code_snippets/i);
  });

  it("audits both mutations", () => {
    const src = readFileSync(ROUTE, "utf8");
    expect(src).toContain("writeAudit");
    expect(src).toContain("updated_snippet");
    expect(src).toContain("deleted_snippet");
  });
});

describe("snippet search no longer matches inside code bodies", () => {
  it("filters on title/description/language, not s.code", () => {
    for (const f of [
      "app/(app)/student/community/snippets/page.jsx",
      "app/api/community/snippets/route.js"
    ]) {
      const src = readFileSync(f, "utf8");
      expect(src, f).not.toContain("s.code ILIKE");
      expect(src, f).toMatch(/s\.title ILIKE[\s\S]{0,120}s\.description ILIKE/);
    }
  });
});
