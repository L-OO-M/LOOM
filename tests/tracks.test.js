import { describe, expect, it } from "vitest";
import { isTrackDomain, loadFollowedTracks, trackProgress, trackedDomains } from "@/lib/tracks";

const nodes = [
  { id: "w1", domain: "web", title: "HTML" },
  { id: "w2", domain: "web", title: "CSS" },
  { id: "w3", domain: "web", title: "JS" },
  { id: "a1", domain: "ai_ml", title: "Linear algebra" },
  { id: "a2", domain: "ai_ml", title: "PyTorch" },
  { id: "d1", domain: "dsa", title: "Arrays" }
];

describe("trackedDomains", () => {
  it("always includes the primary track first", () => {
    expect(trackedDomains({ primary: "web", followed: ["ai_ml"], available: ["web", "ai_ml", "dsa"] }))
      .toEqual(["web", "ai_ml"]);
  });

  it("does not duplicate the primary when it is also followed", () => {
    expect(trackedDomains({ primary: "web", followed: ["web", "ai_ml"], available: ["web", "ai_ml"] }))
      .toEqual(["web", "ai_ml"]);
  });

  it("drops a followed domain the chapter has not published", () => {
    expect(trackedDomains({ primary: "web", followed: ["blockchain"], available: ["web"] }))
      .toEqual(["web"]);
  });

  it("ignores junk rows instead of rendering them", () => {
    expect(trackedDomains({ primary: null, followed: ["not-a-domain", null], available: ["dsa"] }))
      .toEqual([]);
  });
});

describe("trackProgress", () => {
  it("counts verified nodes per track, not across the whole catalogue", () => {
    const tracks = trackProgress({
      nodes,
      verifiedIds: ["w1", "a1"],
      followed: ["ai_ml"],
      primary: "web"
    });
    expect(tracks).toHaveLength(2);
    expect(tracks[0]).toMatchObject({ domain: "web", done: 1, total: 3, percent: 33 });
    expect(tracks[1]).toMatchObject({ domain: "ai_ml", done: 1, total: 2, percent: 50 });
  });

  it("points at the first unverified node in roadmap order", () => {
    const [web] = trackProgress({ nodes, verifiedIds: ["w1"], primary: "web" });
    expect(web.next).toEqual({ id: "w2", title: "CSS" });
  });

  it("reports completion instead of inventing a next node", () => {
    const [web] = trackProgress({ nodes, verifiedIds: ["w1", "w2", "w3"], primary: "web" });
    expect(web.percent).toBe(100);
    expect(web.next).toBeNull();
  });

  it("returns no tracks when the chapter published nothing", () => {
    expect(trackProgress({ nodes: [], verifiedIds: [], primary: "web" })).toEqual([]);
  });
});

describe("loadFollowedTracks", () => {
  it("degrades to no extra tracks when the table is missing", async () => {
    const sql = () => {
      throw new Error("relation student_tracks does not exist");
    };
    await expect(loadFollowedTracks(sql, { userId: "u1", tenantId: "t1" })).resolves.toEqual([]);
  });

  it("filters rows that are not real track keys", async () => {
    const sql = () => Promise.resolve([{ domain: "web" }, { domain: "robotics" }]);
    await expect(loadFollowedTracks(sql, { userId: "u1", tenantId: "t1" })).resolves.toEqual(["web"]);
  });

  it("needs both a user and a tenant", async () => {
    await expect(loadFollowedTracks(() => Promise.resolve([]), { userId: "u1" })).resolves.toEqual([]);
  });
});

describe("isTrackDomain", () => {
  it("accepts canonical keys only", () => {
    expect(isTrackDomain("ai_ml")).toBe(true);
    expect(isTrackDomain("AI/ML")).toBe(false);
    expect(isTrackDomain(null)).toBe(false);
  });
});
