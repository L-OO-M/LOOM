import { describe, expect, it } from "vitest";
import { toZenModel, zenHostOf, zenUnsupportedFallback } from "@/lib/zen-embed";
import { ZEN_OUTCOME, zenStageInit, zenStageNext, zenStageOutcome, zenStageView } from "@/lib/zen-stage";
import { zenRowModel } from "@/components/loom/ZenResourceLink";

// Regression for the blank-stage defect: Zen Mode opened, showed its header,
// and rendered nothing under it. Root cause: the "unsupported" classification
// had no renderer, so it fell through every branch of the stage and left an
// empty rectangle. The contract these tests pin is exhaustiveness — every
// classification owns the stage, and an owned panel always carries a real,
// safe action or an honest "no destination" message.

// One real row per classification the classifier can produce.
const ROWS = [
  { id: "r_yt", title: "3Blue1Brown", url: "https://www.youtube.com/watch?v=aircAruvnKk" },
  { id: "r_site", title: "React docs", url: "https://react.dev/reference/react" },
  { id: "r_pdf", title: "Dive into Deep Learning", url: "https://d2l.ai/d2l-en.pdf" },
  { id: "r_mdn", title: "MDN Web Docs", url: "https://developer.mozilla.org/en-US/docs/Web/CSS" },
  { id: "r_playlist", title: "Linux CLI playlist", url: "https://www.youtube.com/playlist?list=PLKjXcH5O0KvJnCT3H5FJmnLAsaGrVW3v" },
  { id: "r_generic", title: "PyPI", url: "https://pypi.org/project/pytest" },
  { id: "r_nourl", title: "concurrent.futures", url: null },
  { id: "r_unsafe", title: "Bad link", url: "javascript:alert(1)" },
];

describe("every classification owns the stage", () => {
  it("maps every status the classifier can return to exactly one outcome", () => {
    const statuses = new Set(ROWS.map((r) => toZenModel(r).status));
    expect(statuses.size).toBeGreaterThanOrEqual(5);
    const outcomes = [...statuses].map((s) => zenStageOutcome(s));
    expect(outcomes.every((o) => Object.values(ZEN_OUTCOME).includes(o))).toBe(true);
  });

  it("has no unowned status — the blank-stage contract", () => {
    // Any status, including unknown ones from a future classifier version,
    // must resolve to a panel or the iframe. Nothing may return nothing.
    for (const status of ["youtube", "site", "pdf", "external", "unsupported", "brand-new-kind", undefined, null, ""]) {
      const outcome = zenStageOutcome(status);
      expect(Object.values(ZEN_OUTCOME), String(status)).toContain(outcome);
    }
  });

  it("only iframe-capable statuses ever reach the iframe renderer", () => {
    for (const status of ["youtube", "site"]) {
      expect(zenStageOutcome(status), status).toBe(ZEN_OUTCOME.IFRAME);
    }
    for (const status of ["pdf", "external", "unsupported", "weird"]) {
      expect(zenStageOutcome(status), status).not.toBe(ZEN_OUTCOME.IFRAME);
    }
  });
});

describe("non-embeddable resources get a useful panel, not an empty stage", () => {
  it("offers a validated external destination when the resource has a safe link", () => {
    const m = toZenModel(ROWS.find((r) => r.id === "r_generic"));
    expect(m.status).toBe("unsupported");
    expect(m.embedUrl).toBeNull();
    expect(m.originUrl).toBe("https://pypi.org/project/pytest");
    const copy = zenUnsupportedFallback(true);
    expect(copy.linkLabel).toMatch(/externally/i);
    expect(copy.eyebrow).toBeTruthy();
    expect(copy.title).toBeTruthy();
    expect(copy.body.length).toBeGreaterThan(40);
  });

  it("says so plainly when there is no destination at all", () => {
    for (const row of [ROWS.find((r) => r.id === "r_nourl"), ROWS.find((r) => r.id === "r_unsafe")]) {
      const m = toZenModel(row);
      expect(m.status, row.id).toBe("unsupported");
      expect(m.originUrl, row.id).toBeNull();
      const copy = zenUnsupportedFallback(Boolean(m.originUrl));
      expect(copy.linkLabel).toBeNull();
      expect(`${copy.title} ${copy.body}`.toLowerCase()).toMatch(/no link|nothing to open/);
    }
  });

  it("never promises an embed it cannot deliver", () => {
    for (const row of ROWS) {
      const m = toZenModel(row);
      // Only iframe-capable classifications may carry an embed URL. The
      // document path (pdf) keeps the same validated link as its destination,
      // but nothing frames it — zenStageOutcome proves that.
      if (m.status === "youtube") expect(m.embedUrl, row.id).toContain("youtube-nocookie.com");
      else if (m.status === "site") {
        expect(m.embedUrl, row.id).toBe(m.originUrl);
        expect(zenStageOutcome(m.status)).toBe(ZEN_OUTCOME.IFRAME);
      } else {
        expect(zenStageOutcome(m.status), row.id).not.toBe(ZEN_OUTCOME.IFRAME);
        if (m.status === "pdf") expect(m.embedUrl, row.id).toBe(m.originUrl);
        else expect(m.embedUrl, row.id).toBeNull();
      }
    }
  });
});

describe("panel outcomes never leave the iframe painting over the stage", () => {
  it("keeps a blocked site's fallback on top even after a late load event", () => {
    let s = zenStageInit();
    s = zenStageNext(s, { type: "timeout" });
    s = zenStageNext(s, { type: "loaded" });
    const v = zenStageView(s, "site");
    expect(v.showSitePanel).toBe(true);
    expect(v.iframeVisible).toBe(false);
  });

  it("resets to loading when the learner switches to another resource", () => {
    const ready = zenStageNext(zenStageInit(), { type: "loaded" });
    const switched = zenStageNext(ready, { type: "reset", key: "r_generic" });
    expect(switched.phase).toBe("loading");
    expect(zenStageView(switched, "site").iframeVisible).toBe(false);
    expect(zenStageView(switched, "site").showLoading).toBe(true);
  });
});

describe("routing to Zen stays a single decision", () => {
  it("sends every row with a destination into the overlay", () => {
    for (const row of ROWS) {
      const m = zenRowModel(row);
      // A row with no destination at all has no Zen model either — the surface
      // renders it as an honest "unavailable" item and never opens the overlay.
      if (!m.zen) {
        expect(m.direct, row.id).toBeNull();
        expect(m.zenSupported, row.id).toBe(false);
        continue;
      }
      expect(m.zenSupported, row.id).toBe(true);
      expect(m.hint, row.id).toBe("· Zen");
      expect(m.ariaLabel, row.id).toMatch(/in Zen Mode/);
    }
  });

  it("reports Zen rows without promising a new tab, and vice versa", () => {
    const yt = zenRowModel(ROWS[0]);
    expect(yt.zenSupported).toBe(true);
    expect(yt.hint).toBe("· Zen");
    expect(yt.ariaLabel).not.toMatch(/new tab/);
    // A row with no validated destination has no arrow and no Zen either.
    const broken = zenRowModel(ROWS[6]);
    expect(broken.zenSupported).toBe(false);
    expect(broken.hint).toBe("");
  });

  it("keeps the reported host free of credentials and unsafe schemes", () => {
    expect(zenHostOf(toZenModel(ROWS[3]).originUrl)).toBe("developer.mozilla.org");
    expect(zenHostOf("javascript:alert(1)")).toBeNull();
  });
});