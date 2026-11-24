import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { AREA_INTROS, PAGE_INTRO_VERSION, PAGE_INTROS, introForPath, introStorageKey } from "@/lib/page-intros";

/**
 * Coverage gate for page intros.
 *
 * The promise is "every private page explains itself once". That is only true
 * if a new page cannot ship without an entry, so this walks the real page tree
 * instead of trusting a hand-written list.
 */

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) out.push(...walk(path));
    else if (entry.name === "page.jsx") out.push(path);
  }
  return out;
}

const AREAS = ["student", "lead", "admin"];

const ROUTES = AREAS.flatMap((area) =>
  walk(`app/(app)/${area}`).map((file) => {
    const route = file
      .replace("app/(app)", "")
      .replace("/page.jsx", "")
      .replace(/\[[^\]]+\]/g, "sample");
    return { file, route, dynamic: /\[[^\]]+\]/.test(file) };
  })
);

describe("page intro coverage", () => {
  it("finds the real page tree", () => {
    expect(ROUTES.length).toBeGreaterThan(60);
  });

  it("gives every private page an entry, not just the area fallback", () => {
    for (const { route, dynamic } of ROUTES) {
      const intro = introForPath(route);
      expect(intro, route).toBeTruthy();
      if (dynamic) {
        const parent = route.slice(0, route.lastIndexOf("/"));
        expect([`${parent}/*`, `${parent}/:member`], route).toContain(intro.key);
      } else {
        expect(intro.key, route).toBe(route);
      }
    }
  });

  it("keeps ids unique, tour-shaped and stable", () => {
    const ids = new Map();
    for (const [key, entry] of Object.entries(PAGE_INTROS)) {
      const intro = introForPath(key.replace(/\/\*$/, "/sample"));
      expect(intro.id, key).toMatch(/^[a-z][a-z0-9-]{0,31}$/);
      expect(ids.has(intro.id), `${key} collides with ${ids.get(intro.id)}`).toBe(false);
      ids.set(intro.id, key);
      expect(entry.title.length, key).toBeGreaterThanOrEqual(3);
      expect(entry.body.length, key).toBeGreaterThan(30);
      expect(entry.points.length, key).toBeGreaterThanOrEqual(2);
      expect(entry.points.length, key).toBeLessThanOrEqual(4);
    }
  });

  it("resolves the longest wildcard for detail pages", () => {
    expect(introForPath("/student/projects/sample").key).toBe("/student/projects/*");
    expect(introForPath("/student/projects").key).toBe("/student/projects");
    expect(introForPath("/student/projects/sample").id).not.toBe(introForPath("/student/projects").id);
  });

  it("uses the member-profile copy for a handle, not the area default", () => {
    const intro = introForPath("/student/some-handle");
    expect(intro.key).toBe("/student/:member");
  });

  it("falls back per workspace and stays quiet on public routes", () => {
    expect(introForPath("/admin/not-a-page").key).toBe("/admin");
    expect(introForPath("/lead/not-a-page").title).toBe(AREA_INTROS.lead.title);
    expect(introForPath("/")).toBeNull();
    expect(introForPath("/about")).toBeNull();
  });

  it("honours the stored version, including a bump", () => {
    const intro = introForPath("/student/practice", null);
    expect(intro.seen).toBe(false);
    expect(introForPath("/student/practice", { [intro.id]: PAGE_INTRO_VERSION }).seen).toBe(true);
    expect(introForPath("/student/practice", { [intro.id]: PAGE_INTRO_VERSION - 1 }).seen).toBe(false);
    expect(introForPath("/student/practice", { [intro.id]: "yes" }).seen).toBe(false);
  });

  it("keeps new copy ASCII, like the rest of the repository's new edits", () => {
    const source = readFileSync("lib/page-intros.js", "utf8");
    expect(source).toMatch(/^[\x00-\x7F]*$/);
  });

  it("keys local storage per member and version", () => {
    const intro = introForPath("/student/practice");
    expect(introStorageKey("user-1", intro)).toBe(`loom-intro:user-1:${intro.id}:${intro.version}`);
    expect(introStorageKey(null, intro)).toBe(`loom-intro:anon:${intro.id}:${intro.version}`);
  });
});
