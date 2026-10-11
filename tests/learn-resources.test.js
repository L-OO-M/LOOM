import { describe, expect, it } from "vitest";
import {
  detailHrefFor,
  getResourceHref,
  hasUsableUrl,
  isExternalResource,
  isExternalUrl,
  isInternalPath,
  openPropsFor,
} from "@/lib/resource-link";
import { pathToTab } from "@/lib/nav";

// Primary Learn flow: every opener resolves to the actual destination.
// The detail page stays alive for bookmarks/metadata, but no primary action
// may point at it when a real destination exists.
describe("resource-link destinations", () => {
  it("passes external https URLs through untouched", () => {
    const r = { id: "a", url: "https://developer.mozilla.org/docs/Web/HTML" };
    expect(getResourceHref(r)).toBe("https://developer.mozilla.org/docs/Web/HTML");
    expect(isExternalResource(r)).toBe(true);
  });

  it("passes internal LOOM pages through in the same tab", () => {
    const r = { id: "a", url: "/student/community/wiki/hello" };
    expect(getResourceHref(r)).toBe("/student/community/wiki/hello");
    expect(openPropsFor(r)).toEqual({ href: "/student/community/wiki/hello" });
  });

  it("opens external destinations in a new tab with safe rel", () => {
    const props = openPropsFor({ id: "a", url: "https://example.com/guide" });
    expect(props).toEqual({
      href: "https://example.com/guide",
      target: "_blank",
      rel: "noopener noreferrer",
    });
  });

  it("upgrades bare hosts instead of misrouting them as site paths", () => {
    expect(getResourceHref({ id: "a", url: "docs.example.com/guide" })).toBe(
      "https://docs.example.com/guide"
    );
  });

  it("returns null for missing, blank, or unsafe URLs", () => {
    expect(getResourceHref({ id: "a", url: null })).toBeNull();
    expect(getResourceHref({ id: "a", url: "   " })).toBeNull();
    expect(getResourceHref({ id: "a" })).toBeNull();
    expect(getResourceHref({ id: "a", url: "javascript:alert(1)" })).toBeNull();
    expect(getResourceHref({ id: "a", url: "not a url at all" })).toBeNull();
    expect(openPropsFor({ id: "a", url: "" })).toBeNull();
    expect(hasUsableUrl({ url: "" })).toBe(false);
  });

  it("keeps the detail page addressable for bookmarks and metadata", () => {
    expect(detailHrefFor({ id: "res_1" })).toBe("/student/resources/res_1");
  });

  it("classifies url shapes", () => {
    expect(isExternalUrl("http://example.com")).toBe(true);
    expect(isExternalUrl("/student/x")).toBe(false);
    expect(isInternalPath("/student/x")).toBe(true);
    expect(isInternalPath("//evil.com/x")).toBe(false);
    expect(isInternalPath("https://evil.com/x")).toBe(false);
  });
});

describe("learn deep-link navigation state", () => {
  it("keeps Learn highlighted on resource and topic deep links", () => {
    expect(pathToTab("/student/resources/res_1", "student")).toBe("resources");
    expect(pathToTab("/student/roadmap/node_1", "student")).toBe("roadmap");
  });
});
