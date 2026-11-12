import { describe, expect, it } from "vitest";
import { domainProgress, eligibleRoadmapNodes, nextRoadmapNode, splitVerifiedProgress } from "@/lib/roadmap";

const node = (id, sort_order) => ({ id, sort_order });

describe("nextRoadmapNode", () => {
  it("respects prerequisite edges inside the domain", () => {
    const nodes = [node("a", 1), node("b", 2), node("c", 3)];
    const edges = [
      { from_id: "a", to_id: "b", kind: "required" },
      { from_id: "b", to_id: "c", kind: "required" }
    ];
    expect(nextRoadmapNode({ nodes, edges, completedIds: ["a"] })?.id).toBe("b");
    expect(nextRoadmapNode({ nodes, edges, completedIds: ["a", "b"] })?.id).toBe("c");
  });

  it("does not let an unverified claim clear a prerequisite", () => {
    const nodes = [node("a", 1), node("b", 2)];
    const edges = [{ from_id: "a", to_id: "b", kind: "required" }];
    // The caller passes only verified ids; "a" completed-but-unverified is not
    // in the set, so "b" must not become the next step.
    expect(nextRoadmapNode({ nodes, edges, completedIds: [] })?.id).toBe("a");
  });

  it("falls back to sort order when the graph has no edges", () => {
    const nodes = [node("a", 2), node("b", 1)];
    expect(nextRoadmapNode({ nodes, edges: [], completedIds: ["b"] })?.id).toBe("a");
  });

  it("returns null when every node is verified", () => {
    const nodes = [node("a", 1), node("b", 2)];
    expect(nextRoadmapNode({ nodes, completedIds: ["a", "b"] })).toBeNull();
  });

  it("orders eligible nodes by domain, then difficulty, then sort order", () => {
    const nodes = [
      { id: "advanced-web", domain: "web", difficulty_level: "advanced", sort_order: 1 },
      { id: "beginner-web", domain: "web", difficulty_level: "beginner", sort_order: 2 },
      { id: "beginner-ai", domain: "ai_ml", difficulty_level: "beginner", sort_order: 3 }
    ];
    const ranked = eligibleRoadmapNodes({ nodes, completedIds: [], domainOrder: ["ai_ml", "web"] });
    expect(ranked.map((n) => n.id)).toEqual(["beginner-ai", "beginner-web", "advanced-web"]);
  });

  it("never returns a node with an unfinished required prerequisite", () => {
    const nodes = [
      { id: "a", sort_order: 1 },
      { id: "blocked", sort_order: 2 },
      { id: "free", sort_order: 3 }
    ];
    const edges = [{ from_id: "a", to_id: "blocked", kind: "required" }];
    const ids = eligibleRoadmapNodes({ nodes, edges, completedIds: [] }).map((n) => n.id);
    expect(ids).toContain("a");
    expect(ids).toContain("free");
    expect(ids).not.toContain("blocked");
  });

  it("lets an optional edge through", () => {
    const nodes = [node("a", 1), node("b", 2)];
    const edges = [{ from_id: "a", to_id: "b", kind: "optional" }];
    expect(nextRoadmapNode({ nodes, edges, completedIds: ["a"] })?.id).toBe("b");
  });
});

describe("domainProgress", () => {
  it("uses only this domain's nodes as the denominator", () => {
    const nodes = [node("a", 1), node("b", 2), node("c", 3), node("d", 4)];
    expect(domainProgress({ nodes, verifiedIds: ["a", "b"] })).toEqual({
      total: 4,
      done: 2,
      remaining: 2,
      percent: 50
    });
  });

  it("ignores verified ids from other domains", () => {
    const nodes = [node("a", 1), node("b", 2)];
    expect(domainProgress({ nodes, verifiedIds: ["z"] }).done).toBe(0);
  });

  it("reports zero rather than NaN for an empty domain", () => {
    expect(domainProgress({ nodes: [], verifiedIds: [] })).toEqual({
      total: 0,
      done: 0,
      remaining: 0,
      percent: 0
    });
  });
});

describe("splitVerifiedProgress", () => {
  it("keeps provisional claims out of verified progress", () => {
    const split = splitVerifiedProgress([
      { node_id: "a", status: "completed", evidence_state: "verified" },
      { node_id: "b", status: "completed", evidence_state: "provisional" },
      { node_id: "c", status: "active", evidence_state: null }
    ]);
    expect(split.verifiedIds).toEqual(["a"]);
    expect(split.provisionalIds).toEqual(["b"]);
    expect(split.claimedIds).toEqual(["a", "b"]);
  });

  it("returns an honest empty state when every claim is provisional", () => {
    const split = splitVerifiedProgress([
      { node_id: "a", status: "completed", evidence_state: "provisional" }
    ]);
    expect(split.verifiedIds).toEqual([]);
    expect(split.provisionalIds).toEqual(["a"]);
  });
});
