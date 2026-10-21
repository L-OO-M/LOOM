import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { studentNav, usesDropdowns } from "@/lib/nav";
import {
  BUILD_TABS,
  COMMUNITY_TABS,
  CONNECT_TABS,
  DISCOVER_TABS,
  LEARN_TABS,
  PROVE_TABS
} from "@/components/student/SectionRails";

const RAILS = {
  learn: LEARN_TABS,
  build: BUILD_TABS,
  prove: PROVE_TABS,
  connect: CONNECT_TABS,
  discover: DISCOVER_TABS
};

const groups = studentNav.filter((item) => item.children);

describe("student section rails", () => {
  it("gives every verb a rail that mirrors its nav children, in order", () => {
    for (const group of groups) {
      const rail = RAILS[group.id];
      expect(rail, `${group.id} needs a section rail`).toBeTruthy();
      expect(rail.map((tab) => tab.href), `${group.id} rail order`).toEqual(
        group.children.map((child) => child.href)
      );
    }
  });

  it("never sends two verbs to the same destination", () => {
    const hrefs = Object.values(RAILS).flat().map((tab) => tab.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("points every rail entry at a real student page", () => {
    for (const tab of Object.values(RAILS).flat()) {
      expect(existsSync(`app/(app)${tab.href}/page.jsx`), tab.href).toBe(true);
    }
  });

  it("keeps community rooms as a second-level rail", () => {
    expect(COMMUNITY_TABS.map((tab) => tab.href)).toEqual([
      "/student/community",
      "/student/community/forums",
      "/student/community/wiki",
      "/student/community/snippets"
    ]);
    for (const tab of COMMUNITY_TABS) {
      expect(existsSync(`app/(app)${tab.href}/page.jsx`), tab.href).toBe(true);
    }
  });

  it("reserves top-bar dropdowns for admin and lead", () => {
    expect(usesDropdowns("student")).toBe(false);
    expect(usesDropdowns("admin")).toBe(true);
    expect(usesDropdowns("lead")).toBe(true);
  });

  it("renders student verbs as plain links, not menus", () => {
    const shell = readFileSync("components/AppShell.jsx", "utf8");
    expect(shell).toContain("usesDropdowns(area)");
    expect(shell).toContain("if (!item.children || !showMenus)");
  });
});
