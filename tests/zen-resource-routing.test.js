import { describe, expect, it } from "vitest";
import { zenRowModel, isPrimaryActivation } from "@/components/loom/ZenResourceLink";
import { toZenModel } from "@/lib/zen-embed";

// Problem 2 regression: one decision path per resource, shared by every
// surface (node detail list, journey drawer, roadmap overview card).
//
// The reported bug was an icon/destination mismatch — a row showing the
// external arrow opened in a new tab even though Zen Mode could host it, and
// the roadmap overview bypassed Zen entirely while the drawer opened it for
// the identical row. A second, larger bug showed up in real use: gating the
// overlay on "Zen can embed this" sent every non-allowlisted host straight to
// a new tab, so almost nothing ever opened Zen. Click routing is Zen-FIRST —
// the classifier decides what Zen shows inside the overlay, never whether the
// overlay opens at all. These tests pin that model for every surface.

const ROWS = {
  embeddable: { id: "res_git_branching", title: "Git branching strategies", kind: "doc", level: "beginner", url: "https://learngitbranching.js.org/", minutes: 25 },
  refusal: { id: "res_html_semantic", title: "MDN Web Docs", kind: "doc", level: "beginner", url: "https://developer.mozilla.org/en-US/docs/Web/CSS", minutes: 20 },
  webdev: { id: "res_webdev_learn", title: "web.dev Learn CSS", kind: "doc", level: "beginner", url: "https://web.dev/learn/css", minutes: 30 },
  youtube: { id: "res_css_video", title: "CSS crash course", kind: "video", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", minutes: 45 },
  pdf: { id: "res_css_pdf", title: "CSS spec", kind: "doc", level: "advanced", url: "https://example.org/specs/css.pdf", minutes: 90 },
  unknown: { id: "res_unknown", title: "Somewhere else", kind: "article", url: "https://example.com/guide" },
  noUrl: { id: "res_no_dest", title: "Untitled draft", kind: "article", url: null },
  unsafe: { id: "res_unsafe", title: "Bad link", kind: "article", url: "javascript:alert(1)" },
};

describe("zenRowModel — destination decides the marker, never the reverse", () => {
  it("sends every Zen-capable row to Zen and never labels it with the external arrow", () => {
    for (const key of ["embeddable", "refusal", "webdev", "youtube", "pdf"]) {
      const row = zenRowModel(ROWS[key]);
      expect(row.zenSupported, key).toBe(true);
      // An arrow here is exactly the reported bug: it promises a new tab that
      // the primary click will not perform.
      expect(row.hint, key).not.toContain("↗");
      expect(row.hint, key).toContain("Zen");
      expect(row.ariaLabel, key).toBe(`Open ${ROWS[key].title} in Zen Mode`);
    }
  });

  it("opens Zen for EVERY row that has a destination, including unknown hosts", () => {
    for (const key of ["embeddable", "refusal", "webdev", "youtube", "pdf", "unknown"]) {
      const row = zenRowModel(ROWS[key]);
      expect(row.zenSupported, key).toBe(true);
      // An arrow here is exactly the reported bug: it promises a new tab that
      // the primary click will not perform.
      expect(row.hint, key).not.toContain("↗");
      expect(row.hint, key).toContain("Zen");
      expect(row.ariaLabel, key).toBe(`Open ${ROWS[key].title} in Zen Mode`);
    }
  });

  it("still classifies an unknown host as non-embeddable inside Zen", () => {
    // Zen-first must not turn into iframe-everything: the classifier decides
    // the stage, so an unknown host gets the launch panel, never a doomed frame.
    expect(toZenModel(ROWS.unknown).status).toBe("unsupported");
    expect(toZenModel(ROWS.unknown).embedUrl).toBeNull();
    // The row still has a destination, so the click still lands in Zen.
    expect(zenRowModel(ROWS.unknown).direct).toBe(ROWS.unknown.url);
  });

  it("reports no destination for rows without a usable URL", () => {
    for (const key of ["noUrl", "unsafe"]) {
      const row = zenRowModel(ROWS[key]);
      expect(row.direct, key).toBeNull();
      expect(row.zenSupported, key).toBe(false);
      expect(row.hint, key).toBe("");
    }
  });

  it("keeps PDFs on their own document path, not the site embed path", () => {
    const model = toZenModel(ROWS.pdf);
    expect(model.status).toBe("pdf");
    expect(model.embedUrl).toBe(ROWS.pdf.url);
  });

  it("never frames a known framing refuser", () => {
    for (const key of ["refusal", "webdev"]) {
      const model = toZenModel(ROWS[key]);
      expect(model.status, key).toBe("external");
      expect(model.embedUrl, key).toBeNull();
      // The launchpad still needs a real destination.
      expect(model.originUrl, key).toBe(ROWS[key].url);
    }
  });

  it("resolves the same row identically on every surface", () => {
    // The overview card and the journey drawer both call this; if they could
    // disagree, the same resource would open two different ways.
    const fromOverview = zenRowModel(ROWS.refusal);
    const fromDrawer = zenRowModel(ROWS.refusal);
    expect(fromOverview).toEqual(fromDrawer);
  });
});

describe("primary activation gating", () => {
  const plain = { button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false };

  it("intercepts a plain left click and keyboard Enter", () => {
    expect(isPrimaryActivation(plain)).toBe(true);
    expect(isPrimaryActivation({ ...plain, button: undefined })).toBe(true);
  });

  it("leaves modifier and middle clicks native so new-tab habits keep working", () => {
    expect(isPrimaryActivation({ ...plain, metaKey: true })).toBe(false);
    expect(isPrimaryActivation({ ...plain, ctrlKey: true })).toBe(false);
    expect(isPrimaryActivation({ ...plain, shiftKey: true })).toBe(false);
    expect(isPrimaryActivation({ ...plain, altKey: true })).toBe(false);
    expect(isPrimaryActivation({ ...plain, button: 1 })).toBe(false);
  });
});