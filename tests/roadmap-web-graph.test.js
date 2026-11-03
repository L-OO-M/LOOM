import { describe, expect, it } from "vitest";
import fs from "node:fs";

// Guards for the merged Web roadmap graph and the rekeying that
// load/seed-roadmaps.js performs. The seed file is not imported by the app, so
// these assertions are about the data the seeder will write: node count, edge
// count, reachability, and that every legacy id it retires has a real
// replacement in the same graph.

const web = JSON.parse(fs.readFileSync("load/roadmap-data/web.json", "utf8"));

const nodes = new Map();
for (const group of web.groups) {
  for (const node of group.nodes) nodes.set(node.id, node);
}

const edges = [];
for (const group of web.groups) {
  for (const edge of group.edges || []) edges.push(edge);
}

// Mirrors LEGACY_NODE_MAP in load/seed-roadmaps.js. A typo in either place must
// fail here rather than silently skip a student's progress rekey.
const LEGACY_NODE_MAP = {
  node_html_css: "web_html5",
  node_javascript: "web_javascript_core",
  node_git_github: "web_git_github",
  node_react: "web_react_fundamentals"
};

const internalEdges = edges.filter((e) => nodes.has(e.from_id) && nodes.has(e.to_id));

describe("web roadmap seed data", () => {
  it("has 33 nodes", () => {
    expect(nodes.size).toBe(33);
  });

  it("has 38 prerequisite edges inside the web domain", () => {
    expect(internalEdges).toHaveLength(38);
  });

  it("keeps the one intentional cross-domain edge", () => {
    const external = edges.filter((e) => !nodes.has(e.from_id) || !nodes.has(e.to_id));
    expect(external).toEqual([
      expect.objectContaining({ from_id: "web_dsa_track", to_id: "dsa_striver" })
    ]);
  });

  it("can reach every web node from web_html5", () => {
    const adjacency = new Map([...nodes.keys()].map((id) => [id, []]));
    for (const edge of internalEdges) adjacency.get(edge.from_id).push(edge.to_id);

    const seen = new Set(["web_html5"]);
    const stack = ["web_html5"];
    while (stack.length) {
      for (const next of adjacency.get(stack.pop()) || []) {
        if (!seen.has(next)) {
          seen.add(next);
          stack.push(next);
        }
      }
    }

    expect([...seen].sort()).toEqual([...nodes.keys()].sort());
  });

  it("retires only ids the merged graph replaced, and each replacement exists", () => {
    for (const [oldId, newId] of Object.entries(LEGACY_NODE_MAP)) {
      expect(nodes.has(oldId), `${oldId} is still part of the seeded graph`).toBe(false);
      expect(nodes.has(newId), `${newId} is missing from web.json`).toBe(true);
    }
  });
});
