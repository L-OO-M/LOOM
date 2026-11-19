import { describe, expect, it } from "vitest";
import { nextStepForStudent } from "@/lib/roadmap-next";

// One server-side answer to "what should this student do next?". The dashboard,
// the roadmap page and the progress API all call this, so the tests pin the
// three things that used to disagree: verified-only progress, required edges
// only, and an explicit reason when nothing is eligible.

const NODES = [
  { id: "a", title: "HTML", domain: "web", sort_order: 1 },
  { id: "b", title: "CSS", domain: "web", sort_order: 2 },
  { id: "c", title: "JavaScript", domain: "web", sort_order: 3 }
];

function makeSql({ profile = null, nodes = NODES, edges = [], verified = [] } = {}) {
  const calls = [];
  async function sql(strings, ...values) {
    const text = strings.join("?").replace(/\s+/g, " ").trim();
    calls.push({ text, values });
    if (/FROM profiles/.test(text)) return profile ? [profile] : [];
    if (/FROM roadmap_nodes/.test(text)) return nodes;
    if (/FROM roadmap_edges/.test(text)) return edges;
    if (/FROM student_roadmap_progress/.test(text)) return verified.map((node_id) => ({ node_id }));
    return [];
  }
  return { sql, calls };
}

describe("nextStepForStudent", () => {
  it("uses the requested domain without reading the profile", async () => {
    const { sql, calls } = makeSql();
    const result = await nextStepForStudent(sql, "s1", "web");
    expect(result.domain).toBe("web");
    expect(result.node?.id).toBe("a");
    expect(calls.some((c) => /FROM profiles/.test(c.text))).toBe(false);
  });

  it("falls back to the member's primary domain", async () => {
    const { sql, calls } = makeSql({ profile: { primary_domain: "web" } });
    const result = await nextStepForStudent(sql, "s1");
    expect(result.domain).toBe("web");
    expect(calls[0].values).toContain("s1");
    expect(calls[1].values).toContain("web");
  });

  it("reads the whole catalogue when the profile has no domain", async () => {
    const { sql, calls } = makeSql({ profile: { primary_domain: null } });
    const result = await nextStepForStudent(sql, "s1");
    expect(result.domain).toBe(null);
    expect(calls[1].text).toMatch(/FROM roadmap_nodes ORDER BY domain ASC/);
  });

  it("never unlocks a node behind an unverified prerequisite", async () => {
    const { sql } = makeSql({
      edges: [
        { from_id: "a", to_id: "b", kind: "required" },
        { from_id: "b", to_id: "c", kind: "required" }
      ],
      verified: []
    });
    const result = await nextStepForStudent(sql, "s1", "web");
    expect(result.node?.id).toBe("a");
    expect(result.prerequisites).toEqual([]);
    expect(result.reason).toBe("No required prerequisites are outstanding.");
  });

  it("reports the verified prerequisites of the next node", async () => {
    const { sql } = makeSql({
      edges: [
        { from_id: "a", to_id: "b", kind: "required" },
        { from_id: "b", to_id: "c", kind: "required" }
      ],
      verified: ["a"]
    });
    const result = await nextStepForStudent(sql, "s1", "web");
    expect(result.node?.id).toBe("b");
    expect(result.prerequisites.map((p) => p.title)).toEqual(["HTML"]);
    expect(result.reason).toMatch(/All required prerequisites are verified \(HTML\)/);
  });

  it("treats optional edges as routes, not walls", async () => {
    const { sql } = makeSql({
      edges: [{ from_id: "a", to_id: "b", kind: "optional" }],
      verified: []
    });
    const result = await nextStepForStudent(sql, "s1", "web");
    expect(result.node?.id).toBe("a");
  });

  it("says the track is complete when every node is verified", async () => {
    const { sql } = makeSql({ verified: ["a", "b", "c"] });
    const result = await nextStepForStudent(sql, "s1", "web");
    expect(result.node).toBe(null);
    expect(result.reason).toBe("Every node in this track is verified.");
  });

  it("names an empty catalogue instead of pointing at nothing", async () => {
    const { sql, calls } = makeSql({ nodes: [], verified: [] });
    const result = await nextStepForStudent(sql, "s1", "web");
    expect(result.node).toBe(null);
    expect(result.reason).toBe("No roadmap content is published for this domain yet.");
    // No nodes means no edge query at all.
    expect(calls.some((c) => /FROM roadmap_edges/.test(c.text))).toBe(false);
  });

  it("reports a cyclic graph rather than a blocked node", async () => {
    const { sql } = makeSql({
      nodes: [
        { id: "a", title: "HTML", domain: "web", sort_order: 1 },
        { id: "b", title: "CSS", domain: "web", sort_order: 2 }
      ],
      edges: [
        { from_id: "a", to_id: "b", kind: "required" },
        { from_id: "b", to_id: "a", kind: "required" }
      ],
      verified: []
    });
    const result = await nextStepForStudent(sql, "s1", "web");
    expect(result.node).toBe(null);
    expect(result.reason).toBe("No node is currently eligible; the graph may be cyclic.");
  });

  it("ignores edges that point outside the scoped node set", async () => {
    const { sql } = makeSql({
      nodes: [{ id: "b", title: "CSS", domain: "web", sort_order: 2 }],
      edges: [{ from_id: "outside", to_id: "b", kind: "required" }],
      verified: []
    });
    const result = await nextStepForStudent(sql, "s1", "web");
    expect(result.node?.id).toBe("b");
  });

  it("only counts verified completed rows returned by the progress query", async () => {
    const { sql, calls } = makeSql({ verified: ["a"] });
    await nextStepForStudent(sql, "s1", "web");
    const progress = calls.find((c) => /FROM student_roadmap_progress/.test(c.text));
    expect(progress.text).toMatch(/status = 'completed'/);
    expect(progress.text).toMatch(/evidence_state = 'verified'/);
    expect(progress.values).toContain("s1");
  });
});
