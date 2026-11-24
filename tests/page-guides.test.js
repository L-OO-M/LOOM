import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { AREA_GUIDES, PAGE_GUIDE_VERSION, PAGE_GUIDES, guideForPath, guideStorageKey } from "@/lib/page-guides";

/**
 * Coverage and accuracy gate for the page guides.
 *
 * The promise is "every private page explains itself, and explains its real
 * controls". That only holds if:
 *   - a new page cannot ship without an entry (walks the real page tree),
 *   - the entry has a purpose, an order of work and named controls,
 *   - every control label still exists in the product source, so a renamed
 *     button fails here instead of leaving a lie on the page.
 */

function walkPages(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkPages(path));
    else if (entry.name === "page.jsx") out.push(path.split("\\").join("/"));
  }
  return out;
}

function walkSource(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walkSource(path, out);
    else if (/\.(jsx?|mjs)$/.test(entry.name)) out.push(path);
  }
  return out;
}

const AREAS = ["student", "lead", "admin"];

/** `/lead` is a redirect to `/lead/overview`, so it never renders a page. */
const REDIRECT_PAGES = new Set(["/lead"]);

const ROUTES = AREAS.flatMap((area) =>
  walkPages(`app/(app)/${area}`).map((file) => {
    const route = file.replace("app/(app)", "").replace("/page.jsx", "");
    return {
      file,
      route,
      dynamic: /\[[^\]]+\]/.test(file),
      parent: route.slice(0, route.lastIndexOf("/"))
    };
  })
);

const decode = (text) =>
  text
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&rarr;/g, "->")
    .replace(/&mdash;/g, "-")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .toLowerCase();

const SOURCE = decode(
  [...walkSource("app"), ...walkSource("components")].map((file) => readFileSync(file, "utf8")).join("\n")
);

describe("page guide coverage", () => {
  it("finds the real page tree", () => {
    expect(ROUTES.length).toBeGreaterThan(60);
  });

  it("gives every private page an entry, not just the area fallback", () => {
    for (const { route, dynamic, parent } of ROUTES) {
      if (REDIRECT_PAGES.has(route)) continue;
      const guide = guideForPath(route);
      expect(guide, route).toBeTruthy();
      if (dynamic) {
        expect([`${parent}/*`, `${parent}/:member`, `${parent}/*/*`], route).toContain(guide.key);
      } else {
        expect(guide.key, route).toBe(route);
      }
    }
  });

  it("keeps ids unique, tour-shaped and within the telemetry id limit", () => {
    const ids = new Map();
    for (const [key, entry] of Object.entries(PAGE_GUIDES)) {
      const guide = guideForPath(key.replace(/\/\*$/, "/sample"));
      expect(guide.id, key).toMatch(/^[a-z][a-z0-9-]{0,31}$/);
      expect(ids.has(guide.id), `${key} collides with ${ids.get(guide.id)}`).toBe(false);
      ids.set(guide.id, key);
      expect(entry.title.length, key).toBeGreaterThanOrEqual(3);
      expect(entry.body.length, key).toBeGreaterThan(30);
    }
  });

  it("explains the page in an order and names its controls", () => {
    // Read-only ledgers have one or two actions and nothing else to press.
    // Every other page must name at least three, so a new page cannot ship a
    // stub guide.
    const readOnly = new Set(["/student/sponsors", "/student/notifications", "/lead/directory", "/admin/directory"]);
    for (const [key, entry] of Object.entries(PAGE_GUIDES)) {
      expect(entry.flow.length, key).toBeGreaterThanOrEqual(3);
      expect(entry.flow.length, key).toBeLessThanOrEqual(5);
      expect(entry.controls.length, key).toBeGreaterThanOrEqual(readOnly.has(key) ? 1 : 3);
      expect(entry.controls.length, key).toBeLessThanOrEqual(6);
      for (const step of entry.flow) {
        expect(step.length, key).toBeGreaterThan(20);
      }
      const labels = entry.controls.map(([label]) => label);
      expect(new Set(labels).size, key).toBe(labels.length);
      for (const [label, does] of entry.controls) {
        expect(label.length, key).toBeLessThanOrEqual(60);
        expect(does.length, key).toBeGreaterThan(15);
        expect(does.length, key).toBeLessThanOrEqual(160);
      }
    }
  });

  it("documents controls that actually exist in the product source", () => {
    const missing = [];
    for (const [key, entry] of Object.entries(PAGE_GUIDES)) {
      for (const [label] of entry.controls) {
        const needle = decode(label).replace(/->$/, "").trim();
        if (!SOURCE.includes(needle)) missing.push(`${key} -> ${label}`);
      }
    }
    expect(missing, `labels not found in app/ or components/:\n${missing.join("\n")}`).toEqual([]);
  });

  it("resolves the longest wildcard for detail pages", () => {
    expect(guideForPath("/student/projects/sample").key).toBe("/student/projects/*");
    expect(guideForPath("/student/projects").key).toBe("/student/projects");
    expect(guideForPath("/student/projects/sample").id).not.toBe(guideForPath("/student/projects").id);
  });

  it("uses the member-profile copy for a handle, not the area default", () => {
    expect(guideForPath("/student/some-handle").key).toBe("/student/:member");
  });

  it("falls back per workspace and stays quiet on public routes", () => {
    expect(guideForPath("/admin/not-a-page").key).toBe("/admin");
    expect(guideForPath("/lead/not-a-page").title).toBe(AREA_GUIDES.lead.title);
    expect(guideForPath("/")).toBeNull();
    expect(guideForPath("/about")).toBeNull();
  });

  it("honours the stored version, including a bump", () => {
    const guide = guideForPath("/student/practice", null);
    expect(guide.seen).toBe(false);
    expect(guideForPath("/student/practice", { [guide.id]: PAGE_GUIDE_VERSION }).seen).toBe(true);
    expect(guideForPath("/student/practice", { [guide.id]: PAGE_GUIDE_VERSION - 1 }).seen).toBe(false);
    expect(guideForPath("/student/practice", { [guide.id]: "yes" }).seen).toBe(false);
  });

  it("keeps new copy ASCII, like the rest of the repository's new edits", () => {
    const source = readFileSync("lib/page-guides.js", "utf8");
    expect(source).toMatch(/^[\x00-\x7F]*$/);
  });

  it("keys local storage per member and version", () => {
    const guide = guideForPath("/student/practice");
    expect(guideStorageKey("user-1", guide)).toBe(`loom-guide:user-1:${guide.id}:${guide.version}`);
    expect(guideStorageKey(null, guide)).toBe(`loom-guide:anon:${guide.id}:${guide.version}`);
  });
});
