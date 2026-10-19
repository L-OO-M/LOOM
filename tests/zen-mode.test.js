import { describe, expect, it } from "vitest";
import { toZenModel, zenHostOf, zenSiteFallback } from "@/lib/zen-embed";
import { ZEN_STAGE, zenStageInit, zenStageNext, zenStageView } from "@/lib/zen-stage";

// Zen Mode behaviour contract, per resource type. These are the rules the
// overlay renders from — no DOM required.
describe("Zen resource types", () => {
  it("embeds direct YouTube videos", () => {
    const m = toZenModel({ id: "v", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" });
    expect(m.status).toBe("youtube");
    expect(m.embedUrl).toContain("youtube-nocookie.com/embed/dQw4w9WgXcQ");
  });

  it("treats playlists and channel URLs as external navigation, not embeds", () => {
    for (const url of [
      "https://www.youtube.com/playlist?list=PLabc123",
      "https://www.youtube.com/@NetworkChuck",
      "https://youtu.be/PLIhvC56v63IJIujb5cyE13oLuyORZpdkL",
    ]) {
      const m = toZenModel({ id: "x", url });
      expect(m.status, url).not.toBe("youtube");
      expect(m.embedUrl, url).toBeNull();
      expect(m.originUrl, url).toBeTruthy();
    }
  });

  it("routes known framing-blocked hosts to the external launch panel", () => {
    for (const host of [
      "developer.mozilla.org", "web.dev", "javascript.info", "developers.google.com",
    ]) {
      expect(toZenModel({ id: "x", url: `https://${host}/docs` }).status, host).toBe("external");
    }
  });

  it("embeds allowlisted sites and leaves unknown hosts to native navigation", () => {
    expect(toZenModel({ id: "x", url: "https://react.dev/reference/react" }).status).toBe("site");
    expect(toZenModel({ id: "x", url: "https://pypi.org/project/pytest" }).status).toBe(
      "unsupported"
    );
  });

  it("keeps PDFs on the document panel", () => {
    expect(toZenModel({ id: "x", url: "https://example.com/a.pdf" }).status).toBe("pdf");
  });

  it("never surfaces unsafe or malformed input", () => {
    for (const url of [
      "javascript:alert(1)", "data:text/html,<h1>x</h1>", "file:///etc/passwd",
      "not a url", "//evil.com/x", "",
    ]) {
      const m = toZenModel({ id: "x", url });
      expect(["unsupported", "external"], url).toContain(m.status);
      expect(m.embedUrl, url).toBeNull();
      expect(zenHostOf(url), url).toBeNull();
    }
  });

  it("exposes a safe display host only", () => {
    expect(zenHostOf("https://react.dev/reference")).toBe("react.dev");
    expect(zenHostOf("https://user:pw@react.dev/")).toBeNull();
    expect(zenHostOf("https://react.dev:8443/")).toBeNull();
  });
});

describe("Zen overlay state", () => {
  it("keeps the fallback visible after a late load event", () => {
    let s = zenStageInit();
    s = zenStageNext(s, { type: "timeout" });
    s = zenStageNext(s, { type: "loaded" }); // browser painted its refusal page
    const v = zenStageView(s, "site");
    expect(v.showSitePanel).toBe(true);
    expect(v.iframeVisible).toBe(false);
  });

  it("never shows the iframe when a panel owns the stage", () => {
    for (const status of ["external", "pdf"]) {
      const s = zenStageNext(zenStageInit(), { type: "show" });
      expect(zenStageView(s, status).iframeVisible, status).toBe(false);
    }
  });

  it("resets cleanly when the selected resource changes (no stale embed)", () => {
    const ready = zenStageNext(zenStageInit(), { type: "loaded" });
    const afterReset = zenStageNext(ready, { type: "reset", key: "res_b" });
    expect(afterReset.phase).toBe(ZEN_STAGE.LOADING);
    expect(zenStageView(afterReset, "site").iframeVisible).toBe(false);
    // A late load from the previous resource must not leak into the new one.
    expect(zenStageNext(afterReset, { type: "loaded" }).phase).toBe(ZEN_STAGE.READY);
  });

  it("recovers on retry and ignores timers that fire after", () => {
    let s = zenStageNext(zenStageInit(), { type: "error" });
    expect(zenStageView(s, "youtube").showInlineHint).toBe(true);
    s = zenStageNext(s, { type: "retry" });
    expect(s.phase).toBe(ZEN_STAGE.LOADING);
    expect(s.frameKey).toBe(1);
    expect(zenStageNext(s, { type: "timeout" }).phase).toBe(ZEN_STAGE.FALLBACK);
  });

  it("states the blocking reason without claiming detection", () => {
    const copy = zenSiteFallback();
    expect(copy.body).toMatch(/opens? externally|always works/i);
    expect(`${copy.title} ${copy.body}`.toLowerCase()).not.toMatch(/we detected/);
  });
});