import { describe, expect, it } from "vitest";
import { loadDomainCatalogue } from "@/lib/roadmap";

function sqlReturning(rows) {
  const sql = () => Promise.resolve(rows);
  return sql;
}

describe("loadDomainCatalogue", () => {
  it("offers only primary tracks that have nodes, in canonical order", async () => {
    const sql = sqlReturning([
      { domain: "web", nodes: 33 },
      { domain: "backend", nodes: 26 },
      { domain: "ai_ml", nodes: 62 },
      { domain: "design", nodes: 5 }
    ]);

    const domains = await loadDomainCatalogue(sql);

    // ai_ml precedes web in PRIMARY_DOMAINS; backend (support-only) and an
    // unknown domain never become options.
    expect(domains.map((domain) => domain.key)).toEqual(["ai_ml", "web"]);
    expect(domains[0]).toEqual({
      key: "ai_ml",
      label: "AI / ML",
      blurb: expect.stringContaining("Models"),
      glyph: "AI",
      nodes: 62
    });
  });

  it("returns an empty list when no roadmap is published", async () => {
    const domains = await loadDomainCatalogue(sqlReturning([]));
    expect(domains).toEqual([]);
  });
});
