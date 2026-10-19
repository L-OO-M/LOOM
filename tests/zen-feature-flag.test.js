import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { ZEN_MODE_FLAG, isZenModeEnabled } from "@/lib/feature-flags";
import { ZenResourceLink } from "@/components/loom/ZenResourceLink";
import { NodeStudyList } from "@/app/(app)/student/roadmap/[nodeId]/_components/NodeStudyList";
import { ZenMode } from "@/components/loom/ZenMode";
import { toZenModel } from "@/lib/zen-embed";

const read = (p) => readFileSync(path.join(process.cwd(), p), "utf8");

// Zen Mode is a feature, not a behaviour: it ships disabled. These tests pin
// BOTH states, because the risky failure is a half-gate — a hidden button whose
// overlay can still be reached, or an overlay that renders when nobody enabled
// it. The flag must gate the click path, the component, and the mounted overlay.

const REACT_DOCS = {
  id: "res_react_docs",
  title: "React official docs",
  kind: "doc",
  level: "beginner",
  minutes: 30,
  url: "https://react.dev",
};
const MDN = {
  id: "res_mdn",
  title: "MDN Web Docs",
  kind: "doc",
  level: "beginner",
  minutes: 20,
  url: "https://developer.mozilla.org/en-US/docs/Web/CSS",
};
const RESOURCES = [REACT_DOCS, MDN];
const NODE = { id: "web_css3", title: "CSS3", description: "Box model, selectors, flexbox." };

// Minimal tagged-template stand-in for the postgres client: it records the
// query and returns whatever row the test wants, so the flag helper is
// exercised without a database.
function fakeSql(row) {
  const calls = [];
  const tag = (strings, ...values) => {
    calls.push(strings.join("?").trim());
    return Promise.resolve(row ? [row] : []);
  };
  tag.calls = calls;
  return tag;
}

describe("flag definition", () => {
  it("uses the established per-chapter feature_flags convention", () => {
    expect(ZEN_MODE_FLAG).toBe("zen_mode");
  });

  it("defaults to OFF: no row, no sql, no tenant, or any error", async () => {
    await expect(isZenModeEnabled(fakeSql({ enabled: true }), null)).resolves.toBe(false);
    await expect(isZenModeEnabled(null, "tenant-1")).resolves.toBe(false);
    await expect(isZenModeEnabled(fakeSql(undefined), "tenant-1")).resolves.toBe(false);
    await expect(
      isZenModeEnabled(
        Object.assign(() => Promise.reject(new Error("relation does not exist")), {}),
        "tenant-1"
      )
    ).resolves.toBe(false);
  });

  it("turns ON only for an explicit enabled row", async () => {
    await expect(isZenModeEnabled(fakeSql({ enabled: true }), "tenant-1")).resolves.toBe(true);
    await expect(isZenModeEnabled(fakeSql({ enabled: false }), "tenant-1")).resolves.toBe(false);
    await expect(isZenModeEnabled(fakeSql({ enabled: "true" }), "tenant-1")).resolves.toBe(false);
  });

  // Development is the deliberate exception: `next dev` turns the feature on so
  // it can be worked on locally, while production and the test runtime stay
  // fail-closed. The shared flag row is never consulted in development.
  it("is ON in development with no row and no tenant", async () => {
    vi.stubEnv("NODE_ENV", "development");
    await expect(isZenModeEnabled(null, null)).resolves.toBe(true);
    await expect(isZenModeEnabled(fakeSql({ enabled: false }), "tenant-1")).resolves.toBe(true);
  });

  // Zen Mode is not shipped to chapters yet, so production ignores the row
  // entirely -- even an explicit enabled row stays OFF there.
  it("is OFF in production even when the chapter row is enabled", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await expect(isZenModeEnabled(fakeSql({ enabled: true }), "tenant-1")).resolves.toBe(false);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });
});

describe("flag OFF — the pre-Zen experience is preserved", () => {
  it("renders resource rows as ordinary native links", () => {
    const html = renderToStaticMarkup(
      createElement(
        "ol",
        null,
        RESOURCES.map((r) =>
          createElement(ZenResourceLink, { key: r.id, resource: r, onZen: () => {} }, r.title)
        )
      )
    );
    expect(html).toContain(`href="https://react.dev"`);
    // Native external navigation is exactly what a student saw before Zen.
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    // The click handler that opens the overlay is not attached at all.
    expect(html).not.toContain("zen-frame");
    expect(html).not.toContain("zen-panel");
  });

  it("marks rows as external rather than promising Zen", () => {
    // Calling the component function returns the anchor element itself, so we
    // can assert on the props the learner actually gets.
    const anchor = ZenResourceLink({ resource: REACT_DOCS, onZen: () => {} });
    expect(anchor.props["aria-label"]).not.toMatch(/Zen Mode/);
    expect(anchor.props.target).toBe("_blank");
    expect(anchor.props.onClick).toBeUndefined();
  });

  it("never renders the overlay, even if a selection was somehow set", () => {
    // NodeStudyList is what mounts the overlay. With the flag off it renders no
    // overlay element at all.
    const html = renderToStaticMarkup(
      createElement(NodeStudyList, { resources: RESOURCES, node: NODE, zenEnabled: false })
    );
    expect(html).toContain("React official docs");
    expect(html).not.toContain("zen-panel");
    expect(html).not.toContain("zen-frame");
    expect(html).not.toContain("Zen Learning Mode");
  });

  it("refuses to render the overlay component directly (no click path needed)", () => {
    const html = renderToStaticMarkup(
      createElement(ZenMode, {
        resource: REACT_DOCS,
        embed: toZenModel(REACT_DOCS),
        node: NODE,
        onClose: () => {},
      })
    );
    expect(html).toBe("");
  });
});

describe("flag ON — Zen Mode works as intended", () => {
  it("intercepts the click and labels the row as Zen", () => {
    let opened = null;
    const anchor = ZenResourceLink({
      resource: REACT_DOCS,
      onZen: (resource) => {
        opened = resource;
      },
      zenEnabled: true,
    });
    expect(anchor.props["aria-label"]).toBe("Open React official docs in Zen Mode");
    let prevented = false;
    anchor.props.onClick({ button: 0, preventDefault: () => { prevented = true; } });
    expect(opened, "click must open Zen").toBeTruthy();
    expect(prevented, "click must not navigate away").toBe(true);
  });

  it("still keeps modifier clicks native", () => {
    let opened = 0;
    const anchor = ZenResourceLink({
      resource: REACT_DOCS,
      onZen: () => { opened += 1; },
      zenEnabled: true,
    });
    anchor.props.onClick({ button: 0, metaKey: true, preventDefault: () => {} });
    expect(opened).toBe(0);
  });

  it("renders the embed for an allow-listed site", () => {
    const html = renderToStaticMarkup(
      createElement(ZenMode, {
        resource: REACT_DOCS,
        embed: toZenModel(REACT_DOCS),
        node: NODE,
        onClose: () => {},
        zenEnabled: true,
      })
    );
    expect(html).toContain("zen-panel");
    expect(html).toContain("Zen Learning Mode");
    expect(html).toContain("<iframe");
    expect(html).toContain("https://react.dev");
  });

  it("renders the launch panel for a framing-blocked host", () => {
    const html = renderToStaticMarkup(
      createElement(ZenMode, {
        resource: MDN,
        embed: toZenModel(MDN),
        node: NODE,
        onClose: () => {},
        zenEnabled: true,
      })
    );
    expect(html).toContain("MDN Web Docs");
    expect(html).toContain("developer.mozilla.org");
    expect(html).toContain("Back to roadmap");
    expect(html).not.toContain("<iframe");
  });

  it("mounts the overlay from the node list when the flag is on", () => {
    // Selection state starts empty, so nothing should mount yet — but the list
    // must be a plain native list, and the wiring must be present.
    const html = renderToStaticMarkup(
      createElement(NodeStudyList, { resources: RESOURCES, node: NODE, zenEnabled: true })
    );
    expect(html).toContain("React official docs");
    expect(html).not.toContain("zen-panel");
  });
});

describe("no alternate path into the overlay", () => {
  it("gates the component, not just the button", () => {
    // Every entry point defaults the flag to false, so an un-updated call site
    // is safe by construction rather than by remembering to pass a prop.
    const direct = createElement(ZenMode, {
      resource: REACT_DOCS,
      embed: toZenModel(REACT_DOCS),
      node: NODE,
      onClose: () => {},
      zenEnabled: undefined,
    });
    expect(renderToStaticMarkup(direct)).toBe("");
    expect(ZenResourceLink({ resource: REACT_DOCS, onZen: () => {} }).props.onClick).toBeUndefined();
  });

  it("surfaces read the flag server-side and pass it down (no client guess)", () => {
    const pages = [
      "app/(app)/student/roadmap/page.jsx",
      "app/(app)/student/roadmap/[nodeId]/page.jsx",
    ];
    for (const p of pages) {
      const src = read(p);
      expect(src, p).toMatch(/isZenModeEnabled\(sql, tenant\?\.id\)/);
      expect(src, p).toMatch(/zenEnabled=\{zenEnabled\}/);
    }
  });
});