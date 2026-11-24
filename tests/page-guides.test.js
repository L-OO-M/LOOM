import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PAGE_GUIDE_VERSION, PAGE_GUIDES, guideForPath, guideStorageKey } from "@/lib/page-guides";

/**
 * Coverage and accuracy gate for the page walkthroughs.
 *
 * The promise is "every private page walks you through its own sections". That
 * only holds if:
 *   - a new page cannot ship without an entry (this walks the real page tree),
 *   - every entry names the sections a person actually sees,
 *   - every `at` string still exists in the product source, so renaming a
 *     heading fails here instead of silently dropping a step from the tour.
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

/** `/lead` redirects to `/lead/overview`, so it never renders a page. */
const REDIRECT_PAGES = new Set(["/lead"]);

const ROUTES = AREAS.flatMap((area) =>
  walkPages(`app/(app)/${area}`).map((file) => {
    const route = file.replace("app/(app)", "").replace("/page.jsx", "");
    return {
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

describe("page walkthrough coverage", () => {
  it("finds the real page tree", () => {
    expect(ROUTES.length).toBeGreaterThan(60);
  });

  it("gives every private page an entry", () => {
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

  it("names the sections of each page, with copy for each", () => {
    for (const [key, entry] of Object.entries(PAGE_GUIDES)) {
      expect(entry.sections.length, key).toBeGreaterThanOrEqual(2);
      expect(entry.sections.length, key).toBeLessThanOrEqual(6);
      const seen = new Set();
      for (const section of entry.sections) {
        expect(section.at.length, key).toBeGreaterThanOrEqual(3);
        expect(section.at.length, key).toBeLessThanOrEqual(60);
        expect(section.say.length, `${key} / ${section.at}`).toBeGreaterThan(40);
        expect(section.say.length, `${key} / ${section.at}`).toBeLessThanOrEqual(200);
        expect(seen.has(section.at), `${key} repeats ${section.at}`).toBe(false);
        seen.add(section.at);
      }
    }
  });

  it("only spotlights text that exists in the product", () => {
    const missing = [];
    for (const [key, entry] of Object.entries(PAGE_GUIDES)) {
      for (const section of entry.sections) {
        if (!SOURCE.includes(decode(section.at))) missing.push(`${key} -> ${section.at}`);
      }
    }
    expect(missing, `sections not found in app/ or components/:\n${missing.join("\n")}`).toEqual([]);
  });

  it("resolves the longest wildcard for detail pages", () => {
    expect(guideForPath("/student/projects/sample").key).toBe("/student/projects/*");
    expect(guideForPath("/student/projects").key).toBe("/student/projects");
    expect(guideForPath("/student/projects/sample").id).not.toBe(guideForPath("/student/projects").id);
  });

  it("uses the member-profile walkthrough for a handle", () => {
    expect(guideForPath("/student/some-handle").key).toBe("/student/:member");
  });

  it("returns nothing outside the private workspaces", () => {
    expect(guideForPath("/")).toBeNull();
    expect(guideForPath("/about")).toBeNull();
    expect(guideForPath("/student/tracks/not-a-real-page")).toBeNull();
    expect(guideForPath("/lead/unknown/unknown")).toBeNull();
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
