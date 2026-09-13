import { describe, expect, it } from "vitest";
import { recommendResources } from "@/lib/recommendations";

describe("recommendResources", () => {
  it("prioritizes current-node resources within the available time", () => {
    const results = recommendResources({
      currentNode: { id: "node_react" },
      domain: "web",
      level: "foundation_plus",
      minutesAvailable: 45,
      resources: [
        { id: "slow", nodeId: "node_react", domain: "web", level: "foundation_plus", minutes: 70 },
        { id: "node", nodeId: "node_react", domain: "web", level: "foundation_plus", minutes: 40 },
        { id: "other", nodeId: "node_css", domain: "web", level: "foundation", minutes: 20 }
      ]
    });

    expect(results.map((item) => item.id)).toEqual(["node", "other"]);
  });
});
