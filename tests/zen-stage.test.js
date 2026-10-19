import { describe, expect, it } from "vitest";
import { ZEN_STAGE, zenStageInit, zenStageNext, zenStageView } from "@/lib/zen-stage";

// Fallback-persistence contract for the Zen overlay stage. The browser
// fires iframe `load` even for its own refusal/error pages, so the machine
// — not the component — decides what a load event, a timer, or a retry
// may change. The component under test renders directly from zenStageView.

function run(actions) {
  let s = zenStageInit();
  for (const a of actions) s = zenStageNext(s, a);
  return s;
}

describe("zenStageNext transitions", () => {
  it("starts loading with a zero remount key", () => {
    expect(zenStageInit()).toEqual({ phase: "loading", frameKey: 0, key: null });
  });

  it("moves loading to ready on a clean load", () => {
    const s = run([{ type: "loaded" }]);
    expect(s.phase).toBe("ready");
    expect(s.frameKey).toBe(0);
  });

  it("keeps a manual fallback when a late load arrives (the reported bug)", () => {
    // User clicks "Blocked? View options", THEN the refusal page finishes
    // loading and fires onLoad. The fallback must survive.
    const s = run([{ type: "show" }, { type: "loaded" }]);
    expect(s.phase).toBe("fallback");
  });

  it("keeps a timeout fallback when a late load arrives", () => {
    const s = run([{ type: "timeout" }, { type: "loaded" }]);
    expect(s.phase).toBe("fallback");
  });

  it("ignores a timer that fires after the user already chose", () => {
    const manual = run([{ type: "show" }, { type: "timeout" }]);
    expect(manual.phase).toBe("fallback");
    const afterReady = run([{ type: "loaded" }, { type: "timeout" }]);
    expect(afterReady.phase).toBe("ready");
  });

  it("falls back on timeout or error only while still loading", () => {
    expect(run([{ type: "timeout" }]).phase).toBe("fallback");
    expect(run([{ type: "error" }]).phase).toBe("fallback");
    expect(run([{ type: "loaded" }, { type: "error" }]).phase).toBe("ready");
  });

  it("retries back to loading with a bumped remount key", () => {
    const s = run([{ type: "timeout" }, { type: "retry" }]);
    expect(s.phase).toBe("loading");
    expect(s.frameKey).toBe(1);
    expect(run([{ type: "retry" }, { type: "retry" }]).frameKey).toBe(2);
  });

  it("resets to loading on a new selection without losing the remount key", () => {
    const s = run([{ type: "retry" }, { type: "reset", key: "res_b" }]);
    expect(s).toEqual({ phase: "loading", frameKey: 1, key: "res_b" });
  });

  it("ignores unknown actions", () => {
    const s = run([{ type: "loaded" }]);
    expect(zenStageNext(s, { type: "nope" })).toBe(s);
    expect(zenStageNext(s, null)).toBe(s);
  });
});

describe("zenStageView visibility matrix", () => {
  it("shows only the loader while loading", () => {
    expect(zenStageView(zenStageInit(), "site")).toEqual({
      showLoading: true,
      iframeVisible: false,
      showSitePanel: false,
      showInlineHint: false,
    });
  });

  it("paints the iframe only when ready, with no fallback chrome", () => {
    expect(zenStageView(run([{ type: "loaded" }]), "site")).toEqual({
      showLoading: false,
      iframeVisible: true,
      showSitePanel: false,
      showInlineHint: false,
    });
  });

  it("hides the iframe whenever the site fallback panel shows", () => {
    for (const state of [
      run([{ type: "show" }]),
      run([{ type: "timeout" }]),
      run([{ type: "show" }, { type: "loaded" }]),
      run([{ type: "timeout" }, { type: "loaded" }]),
    ]) {
      const v = zenStageView(state, "site");
      expect(v.showSitePanel).toBe(true);
      expect(v.iframeVisible).toBe(false);
      expect(v.showLoading).toBe(false);
      expect(v.showInlineHint).toBe(false);
    }
  });

  it("keeps YouTube on the small inline hint, never the site panel", () => {
    const v = zenStageView(run([{ type: "timeout" }]), "youtube");
    expect(v.showInlineHint).toBe(true);
    expect(v.showSitePanel).toBe(false);
    expect(v.iframeVisible).toBe(false);
  });

  it("shows no stage chrome for PDFs (dedicated panel owns that state)", () => {
    const v = zenStageView(run([{ type: "timeout" }]), "pdf");
    expect(v).toEqual({
      showLoading: false,
      iframeVisible: false,
      showSitePanel: false,
      showInlineHint: false,
    });
  });

  it("treats missing state as loading", () => {
    expect(zenStageView(undefined, "site").showLoading).toBe(true);
    expect(zenStageView(null, "site").iframeVisible).toBe(false);
  });
});
