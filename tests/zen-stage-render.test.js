import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { ZenMode } from "@/components/loom/ZenMode";
import { toZenModel, zenUnsupportedFallback } from "@/lib/zen-embed";

// Render-level proof for the blank-stage defect. The stage must never be empty
// for any classification: SSR renders the same branch tree the browser gets
// (effects never run), so this asserts the actual markup, not the classifier.

const NODE = {
  id: "py_a_pythonic_object",
  title: "A Pythonic Object",
  description: "How dunder methods make Python objects behave natively.",
};

function render(resource, extra = {}) {
  const embed = toZenModel(resource);
  return renderToStaticMarkup(
    createElement(ZenMode, {
      // Zen Mode is opt-in (zen_mode feature flag). These tests cover what the
      // overlay renders once a chapter has turned it ON; the disabled path is
      // asserted in tests/zen-feature-flag.test.js.
      zenEnabled: true,
      resource,
      embed,
      node: NODE,
      onClose: () => {},
      onNext: null,
      onPrev: null,
      position: { index: 0, total: 1 },
      ...extra,
    })
  );
}

describe("Zen overlay stage is never blank", () => {
  it("paints the external-launch panel for a resource with a normal web link", () => {
    const resource = {
      id: "r_generic",
      title: "pytest documentation",
      kind: "doc",
      level: "beginner",
      minutes: 15,
      url: "https://docs.pytest.org/en/stable/",
    };
    const html = render(resource);
    const copy = zenUnsupportedFallback(true);
    expect(html).toContain(copy.title);
    expect(html).toContain("No preview");
    expect(html).toContain("https://docs.pytest.org/en/stable/");
    expect(html).toContain("noopener noreferrer");
    expect(html).toContain("Back to roadmap");
    // Real stored context, not invented copy.
    expect(html).toContain(NODE.description);
    expect(html).toContain("≈ 15 min");
    // The stage is not an empty rectangle: an action exists inside it.
    expect(html).toMatch(/class="zen-pdf"/);
  });

  it("paints an unavailable state when the resource has no usable link", () => {
    const html = render({ id: "r_broken", title: "Broken link", url: "javascript:alert(1)" });
    expect(html).toContain(zenUnsupportedFallback(false).title);
    expect(html).toContain("Back to roadmap");
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("<iframe");
  });

  it("gives the MDN row its launch panel instead of an empty stage", () => {
    const resource = {
      id: "res_html_semantic",
      title: "MDN Web Docs",
      kind: "doc",
      level: "beginner",
      minutes: 20,
      url: "https://developer.mozilla.org/en-US/docs/Web/CSS",
    };
    const html = render(resource);
    expect(html).toContain("developer.mozilla.org");
    expect(html).toContain("MDN Web Docs");
    expect(html).toContain(resource.url);
    expect(html).toContain("Back to roadmap");
    expect(html).not.toContain("<iframe");
  });

  it("mounts the iframe only for embeddable classifications", () => {
    const site = render({ id: "r_site", title: "React docs", url: "https://react.dev/learn" });
    expect(site).toContain("<iframe");
    expect(site).toContain("https://react.dev/learn");

    const video = render({ id: "r_yt", title: "Video", url: "https://youtu.be/aircAruvnKk" });
    expect(video).toContain("<iframe");
    expect(video).toContain("youtube-nocookie.com/embed/aircAruvnKk");

    for (const resource of [
      { id: "r_pdf", title: "Notes", url: "https://example.com/notes.pdf" },
      { id: "r_playlist", title: "Playlist", url: "https://www.youtube.com/playlist?list=PLabc" },
    ]) {
      expect(render(resource), resource.id).not.toContain("<iframe");
    }
  });

  it("wires prev/next and close when the surface offers navigation", () => {
    const html = render(
      { id: "r_site", title: "React docs", url: "https://react.dev/learn" },
      { onPrev: () => {}, onNext: () => {} }
    );
    expect(html).toContain("Previous resource");
    expect(html).toContain("Next resource");
    expect(html).toContain("Close Zen Mode and return to the roadmap");
  });
});