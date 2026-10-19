import { describe, expect, it } from "vitest";
import { getResourceHref } from "@/lib/resource-link";
import { isZenSupported, toZenModel } from "@/lib/zen-embed";

// Detail-page ("Study this" on /student/roadmap/[nodeId]) integration
// contract. Fixtures mirror the real catalog rows (observed read-only);
// NodeStudyList opens Zen exactly when toZenModel() is supported, and
// keeps the previous anchor behavior otherwise. No DB access here.
//
// Routing (Oct 2026): evidence-clean hosts embed inline (`site`);
// known framing refusers open the Zen external launchpad (`external`)
// instead of a doomed iframe; everything else keeps native navigation.
const STUDY_ROWS = [
  { id: "res_git_branching", title: "Git branching strategies", kind: "doc", url: "https://learngitbranching.js.org/", minutes: 25 },
  { id: "res_html_semantic", title: "Semantic HTML structure", kind: "doc", url: "https://developer.mozilla.org/docs/Web/HTML", minutes: 20 },
  { id: "res_webdev_learn", title: "web.dev Learn: modern web fundamentals", kind: "doc", url: "https://web.dev/learn", minutes: 30 },
  { id: "res_no_dest", title: "Untitled draft", kind: "article", url: null, minutes: 10 },
];

function zenOpensFor(r) {
  return getResourceHref(r) !== null && isZenSupported(r);
}

describe("node detail study-list Zen routing", () => {
  it("embeds the evidence-clean study row inline", () => {
    expect(zenOpensFor(STUDY_ROWS[0])).toBe(true);
    const m = toZenModel(STUDY_ROWS[0]);
    expect(m.status).toBe("site");
    expect(m.embedUrl).toBe("https://learngitbranching.js.org/");
  });

  it("opens the launchpad — never an iframe — for known framing refusers", () => {
    for (const r of [STUDY_ROWS[1], STUDY_ROWS[2]]) {
      expect(zenOpensFor(r)).toBe(true);
      const m = toZenModel(r);
      expect(m.status).toBe("external");
      expect(m.embedUrl).toBeNull();
      expect(m.originUrl).toBe(r.url);
    }
  });

  it("keeps native navigation for unknown hosts", () => {
    const r = { id: "x", title: "Elsewhere", kind: "article", url: "https://example.com/guide" };
    expect(getResourceHref(r)).toBe("https://example.com/guide");
    expect(zenOpensFor(r)).toBe(false);
  });

  it("keeps the unavailable state for rows without a destination", () => {
    expect(getResourceHref(STUDY_ROWS[3])).toBeNull();
    expect(zenOpensFor(STUDY_ROWS[3])).toBe(false);
  });

  it("never routes YouTube-shaped rows by kind alone", () => {
    expect(zenOpensFor({ id: "x", title: "Video lesson", kind: "video", url: "https://example.com/lesson" })).toBe(false);
  });
});
