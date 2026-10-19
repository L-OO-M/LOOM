import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { LINKS } from "@/load/seed-node-resources";

// Why the UI looked empty even when a mapping existed: the node detail page's
// query decides what is visible. These tests pin that it filters on nothing but
// the node itself, so a valid mapping can never be hidden by a type/domain/
// status/URL predicate, and that the canonical source and the database agree.

const PAGE = fs.readFileSync(
  path.join(process.cwd(), "app/(app)/student/roadmap/[nodeId]/page.jsx"),
  "utf8"
);

const QUERY = PAGE.slice(PAGE.indexOf("SELECT r.* FROM resources r"));

describe("node study-material query", () => {
  it("joins the mapping table directly, with no extra predicate", () => {
    expect(QUERY).toMatch(/JOIN\s+roadmap_node_resources\s+m\s+ON\s+m\.resource_id\s*=\s*r\.id/);
    expect(QUERY).toMatch(/WHERE\s+m\.node_id\s*=\s*\$\{nodeId\}/);
  });

  it("never filters out rows by url, kind, domain or status", () => {
    // The reported symptom was a resource that existed and was mapped but was
    // not shown. Only the node id may narrow this result set.
    const whereClause = QUERY.slice(0, QUERY.indexOf("ORDER BY"));
    for (const forbidden of ["r.url", "r.kind", "r.domain", "r.status", "IS NOT NULL", "IS NULL"]) {
      expect(whereClause, forbidden).not.toContain(forbidden);
    }
  });

  it("keeps the per-node ordering the shelf is written in", () => {
    expect(QUERY).toMatch(/ORDER BY m\.sort_order ASC/);
  });
});

describe("canonical source vs. database contract", () => {
  it("maps every node exactly once per resource (no duplicate pairs)", () => {
    const seen = new Set();
    for (const [nodeId, resourceId] of LINKS) {
      const key = `${nodeId}::${resourceId}`;
      expect(seen.has(key), `duplicate ${key}`).toBe(false);
      seen.add(key);
    }
  });

  it("keeps the legacy placeholder ids exactly as the database stores them", () => {
    // These ids are NOT in load/roadmap-data/ (they come from migration 011).
    // If a mapping referenced a typo'd id, the seeder's existence check would
    // abort — this asserts the ids we rely on are the ones we ship.
    const legacy = LINKS.filter(([n]) => n.startsWith("node_")).map(([n]) => n);
    expect([...new Set(legacy)].sort()).toEqual([
      "node_database",
      "node_deploy",
      "node_git_github",
      "node_html_css",
      "node_javascript",
      "node_node",
      "node_react",
    ]);
  });

  it("does not touch the roadmap graph files from this seeder", () => {
    // Graph shape lives in load/roadmap-data/*.json; the resource seeder only
    // ever writes roadmap_node_resources. Guard against a future edit that
    // smuggles node/edge writes in here.
    const src = fs.readFileSync(
      path.join(process.cwd(), "load/seed-node-resources.js"),
      "utf8"
    );
    expect(src).not.toMatch(/INSERT INTO roadmap_nodes/i);
    expect(src).not.toMatch(/INSERT INTO roadmap_edges/i);
    expect(src).not.toMatch(/UPDATE roadmap_nodes/i);
    expect(src).toMatch(/INSERT INTO roadmap_node_resources/i);
  });
});