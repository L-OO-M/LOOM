import { describe, expect, it } from "vitest";
import { zenLearningSummary, zenResourceFacts, zenHostOf, toZenModel, zenSiteFallback } from "@/lib/zen-embed";

// Problem 3 regression: the Zen fallback panel (the MDN case in the report)
// used to render as a black rectangle with a few grey lines — it said nothing
// about what the learner was about to study. These tests pin that a fallback
// panel can render real context, and that it never invents any.

const MDN = { id: "res_html_semantic", title: "MDN Web Docs", kind: "doc", level: "beginner", url: "https://developer.mozilla.org/en-US/docs/Web/CSS", minutes: 20 };
const CSS_NODE = { id: "web_css", title: "CSS", description: "Selectors, the box model, flexbox and grid — the layout vocabulary every frontend job assumes." };

describe("MDN fallback classification", () => {
  it("is an intentional external hand-off, never a doomed iframe", () => {
    const model = toZenModel(MDN);
    expect(model.status).toBe("external");
    expect(model.embedUrl).toBeNull();
    expect(model.originUrl).toBe(MDN.url);
  });

  it("exposes the host the panel reports, and nothing unsafe", () => {
    expect(zenHostOf(MDN.url)).toBe("developer.mozilla.org");
    expect(zenHostOf("javascript:alert(1)")).toBeNull();
    expect(zenHostOf("https://user:pw@example.com/")).toBeNull();
    expect(zenHostOf("not a url")).toBeNull();
  });

  it("keeps honest wording about why it cannot frame the site", () => {
    expect(zenSiteFallback().body).toMatch(/embedding rules/i);
  });
});

describe("fallback context", () => {
  it("prefers the resource's own summary when the catalogue has one", () => {
    const r = { ...MDN, description: "How CSS selectors match elements." };
    const s = zenLearningSummary(r, CSS_NODE);
    expect(s.text).toBe("How CSS selectors match elements.");
    expect(s.source).toBeNull();
  });

  it("falls back to the roadmap node's description and labels where it came from", () => {
    const s = zenLearningSummary(MDN, CSS_NODE);
    expect(s.text).toBe(CSS_NODE.description);
    expect(s.source).toBe("Roadmap node · CSS");
  });

  it("renders nothing rather than inventing copy", () => {
    expect(zenLearningSummary(MDN, null)).toBeNull();
    expect(zenLearningSummary(MDN, { title: "CSS", description: "   " })).toBeNull();
    expect(zenLearningSummary({ description: "" }, CSS_NODE).source).toBe("Roadmap node · CSS");
  });

  it("reports only real stored facts", () => {
    expect(zenResourceFacts(MDN)).toEqual(["doc", "beginner", "≈ 20 min"]);
    expect(zenResourceFacts({ id: "x", title: "t" })).toEqual([]);
    expect(zenResourceFacts({ minutes: 0 })).toEqual([]);
  });

  it("still gives the learner a working external destination and a way back", () => {
    // The panel's primary action must be a real, validated https link.
    const model = toZenModel(MDN);
    expect(model.originUrl.startsWith("https://")).toBe(true);
    expect(zenHostOf(model.originUrl)).toBeTruthy();
  });
});