import { describe, expect, it } from "vitest";
import {
  DEPARTMENT_CATALOG,
  DEPARTMENT_SLUGS,
  LEGACY_DEPARTMENT_REDIRECT,
  VERTICAL_LABEL,
  catalogCounts,
  departmentArt,
  departmentMeta,
  departmentsByVertical,
  isCatalogDepartment,
  legacyDepartmentRedirect
} from "@/lib/department-catalog";

// The catalogue is the single source for department identity: slugs, names,
// aliases, cover art and legacy redirects. Three other places depend on it —
// load/seed-departments.js, load/migrations/*, and lib/permissions.js — so the
// invariants below are what stop a slug existing in one file and not another.
// (A real bug class: `department_slug` was read while sessions carried `slug`,
// which silently disabled every department permission.)

describe("department catalogue", () => {
  it("ships exactly thirteen departments: six technical, seven non-technical", () => {
    expect(DEPARTMENT_CATALOG).toHaveLength(13);
    expect(catalogCounts()).toEqual({ technical: 6, nonTechnical: 7, total: 13 });
    expect(departmentsByVertical("technical")).toHaveLength(6);
    expect(departmentsByVertical("non_technical")).toHaveLength(7);
  });

  it("uses the audited slugs, in a stable order", () => {
    expect(DEPARTMENT_SLUGS).toEqual([
      "ai_ml",
      "web",
      "cybersecurity",
      "dsa",
      "blockchain",
      "embedded",
      "design",
      "documentation",
      "smm_content",
      "publicity",
      "sponsorship",
      "management",
      "public_relations"
    ]);
  });

  it("has no alias that can resolve to two departments", () => {
    const seen = new Map();
    for (const d of DEPARTMENT_CATALOG) {
      const keys = [d.slug, d.name, d.shortName, ...d.aliases].map((v) =>
        String(v).toLowerCase().replace(/[\s_\-&/]+/g, " ").trim()
      );
      for (const key of keys) {
        const owner = seen.get(key);
        // A department may repeat its own name as a short name; two different
        // departments sharing a key is the ambiguity that matters.
        expect(owner === undefined || owner === d.slug, `${key} claimed by ${owner} and ${d.slug}`).toBe(true);
        seen.set(key, d.slug);
      }
    }
    // One glyph per department keeps the workspace masthead readable.
    const glyphs = DEPARTMENT_CATALOG.map((d) => d.glyph);
    expect(new Set(glyphs).size).toBe(glyphs.length);
  });

  it("gives every department a vertical the schema accepts", () => {
    for (const d of DEPARTMENT_CATALOG) {
      expect(["technical", "non_technical"]).toContain(d.vertical);
      expect(VERTICAL_LABEL[d.vertical]).toBeTruthy();
    }
  });

  it("gives every department a name, a description and a real scope of work", () => {
    for (const d of DEPARTMENT_CATALOG) {
      expect(d.name.length).toBeGreaterThan(2);
      expect(d.tagline.length).toBeGreaterThan(10);
      expect(d.description.length).toBeGreaterThan(40);
      expect(d.owns.length).toBeGreaterThanOrEqual(3);
      for (const item of d.owns) expect(item.length).toBeGreaterThan(10);
      expect(d.modules.length).toBeGreaterThan(0);
    }
  });

  it("only names workspace modules the workspace page can render", () => {
    const known = new Set([
      "events", "tasks", "reports", "contributions", "assets", "budget", "leads", "announcements"
    ]);
    for (const d of DEPARTMENT_CATALOG) {
      for (const m of d.modules) expect(known.has(m), `${d.slug} references unknown module ${m}`).toBe(true);
    }
  });

  it("points every department at its own cover under /departments/", () => {
    for (const d of DEPARTMENT_CATALOG) {
      expect(departmentArt(d.slug)).toBe(`/departments/${d.slug}.png`);
      expect(departmentArt(d.name)).toBe(`/departments/${d.slug}.png`);
      expect(departmentArt(d.shortName)).toBe(`/departments/${d.slug}.png`);
    }
  });

  it("resolves names and aliases to the right department", () => {
    expect(departmentMeta("AI/ML").slug).toBe("ai_ml");
    expect(departmentMeta("Machine Learning").slug).toBe("ai_ml");
    expect(departmentMeta("Backend").slug).toBe("web");
    expect(departmentMeta("DevOps").slug).toBe("web");
    expect(departmentMeta("Cyber Security").slug).toBe("cybersecurity");
    expect(departmentMeta("SMM").slug).toBe("smm_content");
    expect(departmentMeta("PR").slug).toBe("public_relations");
    expect(departmentMeta("Event Ops").slug).toBe("management");
    expect(departmentMeta("Sponsorship").slug).toBe("sponsorship");
  });

  it("refuses to guess for unknown departments", () => {
    expect(departmentMeta("Sports")).toBe(null);
    expect(departmentMeta("")).toBe(null);
    expect(departmentMeta(null)).toBe(null);
    expect(departmentArt("Sports")).toBe(null);
    expect(isCatalogDepartment("Sports")).toBe(false);
    expect(isCatalogDepartment("design")).toBe(true);
  });

  it("redirects retired slugs to the department that absorbed them", () => {
    expect(LEGACY_DEPARTMENT_REDIRECT).toEqual({
      backend: "web",
      devops: "web",
      pr_outreach: "public_relations",
      sponsorship_evm: "sponsorship"
    });
    expect(legacyDepartmentRedirect("sponsorship_evm")).toBe("sponsorship");
    expect(legacyDepartmentRedirect("/backend")).toBe("web");
    expect(legacyDepartmentRedirect("devops")).toBe("web");
    expect(legacyDepartmentRedirect("pr_outreach")).toBe("public_relations");
    // Current slugs are not redirects — redirecting them would be a loop.
    expect(legacyDepartmentRedirect("web")).toBe(null);
    expect(legacyDepartmentRedirect("sponsorship")).toBe(null);
    expect(legacyDepartmentRedirect("")).toBe(null);
  });

  it("still draws art for a retired slug instead of a blank card", () => {
    expect(departmentArt("backend")).toBe("/departments/web.png");
    expect(departmentArt("devops")).toBe("/departments/web.png");
    expect(departmentArt("pr_outreach")).toBe("/departments/public_relations.png");
    expect(departmentArt("sponsorship_evm")).toBe("/departments/sponsorship.png");
  });

  it("normalises case, spacing and punctuation", () => {
    expect(departmentArt("WEB-development")).toBe(departmentArt("web development"));
    expect(departmentArt("Public   Relations")).toBe("/departments/public_relations.png");
    expect(departmentMeta("  design  ").slug).toBe("design");
  });
});
