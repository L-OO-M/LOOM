import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  adminNav,
  groupForTab,
  leadNav,
  mobileNav,
  mobileNavForArea,
  navHasUnread,
  pathToTab,
  settingsForArea,
  studentAliases,
  studentNav,
  studentSecondary,
  unreadTabsFor,
  workspaceForPath
} from "@/lib/nav";

describe("workspace chrome ownership", () => {
  it("claims only student, lead, and admin routes", () => {
    expect(workspaceForPath("/student")).toBe("student");
    expect(workspaceForPath("/student/roadmap")).toBe("student");
    expect(workspaceForPath("/lead/challenges")).toBe("lead");
    expect(workspaceForPath("/admin")).toBe("admin");
    expect(workspaceForPath("/admin/students/abc")).toBe("admin");
  });

  it("leaves public routes on the site header", () => {
    expect(workspaceForPath("/")).toBeNull();
    expect(workspaceForPath("/about")).toBeNull();
    expect(workspaceForPath("/u/aarav")).toBeNull();
    expect(workspaceForPath("/studentish")).toBeNull();
    expect(workspaceForPath(null)).toBeNull();
  });
});

describe("five-verb navigation", () => {
  it("resolves leaf destinations, not groups", () => {
    expect(pathToTab("/student", "student")).toBe("dashboard");
    expect(pathToTab("/student/roadmap", "student")).toBe("roadmap");
    expect(pathToTab("/student/roadmap/node_1", "student")).toBe("roadmap");
    // Challenges are reached from the roadmap's domain panel, not a tab, so
    // the hub and the practice room fold back into Learn / Roadmap.
    expect(pathToTab("/student/challenges", "student")).toBe("roadmap");
    expect(pathToTab("/student/practice", "student")).toBe("practice");
    expect(pathToTab("/student/opensource", "student")).toBe("opensource");
    expect(pathToTab("/student/community/forums/abc", "student")).toBe("community");
    expect(pathToTab("/student/contests", "student")).toBe("contests");
    expect(pathToTab("/student/leaderboard", "student")).toBe("standings");
    expect(pathToTab("/student/credentials", "student")).toBe("proof");
    expect(pathToTab("/student/mentorship", "student")).toBe("mentors");
    expect(pathToTab("/student/network", "student")).toBe("chapters");
    expect(pathToTab("/student/unknown-xyz", "student")).toBe("people");
    expect(pathToTab("/admin", "admin")).toBe("overview");
    expect(pathToTab("/admin/events", "admin")).toBe("events");
    expect(pathToTab("/lead/challenges", "lead")).toBe("challenges");
  });

  it("folds demoted routes into their owning verb", () => {
    expect(pathToTab("/student/onboarding", "student")).toBe("dashboard");
    expect(pathToTab("/student/privacy", "student")).toBe("settings");
    expect(pathToTab("/student/certificates/ABC123", "student")).toBe("proof");
  });

  it("gives insights its own leaf instead of folding it into Home", () => {
    expect(pathToTab("/student/insights", "student")).toBe("insights");
    expect(groupForTab(studentNav, "insights")?.id).toBe("prove");
  });

  it("treats bare usernames as people", () => {
    expect(pathToTab("/student/aarav", "student")).toBe("people");
  });

  it("maps leaves back to their verb for highlighting", () => {
    expect(groupForTab(studentNav, "resources")?.id).toBe("learn");
    expect(groupForTab(studentNav, "github")?.id).toBe("build");
    expect(groupForTab(studentNav, "opensource")?.id).toBe("build");
    expect(groupForTab(studentNav, "proof")?.id).toBe("prove");
    expect(groupForTab(studentNav, "challenges")).toBeNull();
    expect(groupForTab(studentNav, "contests")?.id).toBe("prove");
    expect(groupForTab(studentNav, "standings")?.id).toBe("prove");
    expect(groupForTab(studentNav, "mentors")?.id).toBe("connect");
    expect(groupForTab(studentNav, "people")?.id).toBe("discover");
    expect(groupForTab(studentNav, "chapters")?.id).toBe("discover");
    expect(groupForTab(adminNav, "audit")?.id).toBe("system");
    expect(groupForTab(adminNav, "overview")?.id).toBe("overview");
  });

  it("keeps every destination reachable exactly once", () => {
    for (const [name, pool] of [["student", studentNav], ["admin", adminNav]]) {
      const leaves = pool.flatMap((n) => (n.children ? n.children : [n]));
      const hrefs = leaves.map((n) => n.href);
      expect(new Set(hrefs).size).toBe(hrefs.length, `${name} nav has duplicate hrefs`);
    }
    const secondary = studentSecondary.map((n) => n.href);
    expect(new Set(secondary).size).toBe(secondary.length, "secondary nav has duplicate hrefs");
    const aliases = studentAliases.map((n) => n.href);
    expect(new Set(aliases).size).toBe(aliases.length, "aliases have duplicate hrefs");
    expect(studentNav.length).toBeLessThanOrEqual(7);
    expect(adminNav.length).toBeLessThanOrEqual(7);
  });

  it("holds exactly five verbs plus home", () => {
    expect(studentNav.map((n) => n.id)).toEqual(["dashboard", "learn", "build", "prove", "connect", "discover"]);
  });

  it("opens challenges from the roadmap instead of a tab or the mobile bar", () => {
    const hrefs = mobileNav.map((n) => n.href);
    expect(hrefs).not.toContain("/student/challenges");
    expect(hrefs).toContain("/student/roadmap");
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });
});

describe("area-aware shell chrome", () => {
  it("routes settings to the workspace that owns a real page", () => {
    expect(settingsForArea("student").href).toBe("/student/settings");
    expect(settingsForArea("admin").href).toBe("/admin/settings");
    // Lead has no /lead/settings page; the personal account surface is the
    // existing destination for every signed-in role.
    expect(settingsForArea("lead").href).toBe("/student/settings");
    expect(settingsForArea("lead").href).not.toBe("/lead/settings");
  });

  it("derives admin and lead mobile bars from their desktop nav data", () => {
    expect(mobileNavForArea("student")).toBe(mobileNav);
    expect(mobileNavForArea("admin").map((n) => n.href)).toEqual(adminNav.map((n) => n.href));
    expect(mobileNavForArea("lead").map((n) => n.href)).toEqual(leadNav.map((n) => n.href));
    expect(mobileNavForArea("admin").some((n) => n.href === "/admin/settings")).toBe(true);
    expect(mobileNavForArea("lead").some((n) => n.href === "/lead/overview")).toBe(true);
  });

  it("wires the shell to one main target and the area helpers", () => {
    const shell = readFileSync("components/AppShell.jsx", "utf8");
    expect(shell.match(/id="main"/g)).toHaveLength(1);
    expect(shell).toContain("settingsForArea(area)");
    expect(shell).toContain("mobileNavForArea(area)");
    expect(shell).toContain("prefetch={false}");
    // The workspace switcher marks the area it was rendered in, never a
    // hardcoded Student row.
    expect(shell).not.toContain("active: true");
    expect(shell).toContain('active: area === "admin"');
  });
});

describe("per-tab unread dots", () => {
  const note = (link, read_at = null) => ({ id: `n-${link}-${read_at}`, link, read_at });

  it("maps unread notification links to the leaf tab that owns the page", () => {
    expect(unreadTabsFor([note("/student/work")], "student").has("work")).toBe(true);
    expect(unreadTabsFor([note("/student/roles")], "student").has("seats")).toBe(true);
    expect(unreadTabsFor([note("/student/notifications")], "student").has("notifications")).toBe(true);
  });

  it("ignores read notifications, external links, and empty rows", () => {
    const tabs = unreadTabsFor([
      note("/student/work", "2026-01-01T00:00:00Z"),
      note("https://example.com/student/work"),
      { id: "no-link", read_at: null },
      null
    ], "student");
    expect(tabs.size).toBe(0);
  });

  it("strips query strings and hashes before matching", () => {
    expect(unreadTabsFor([note("/student/roadmap?node=1#top")], "student").has("roadmap")).toBe(true);
  });

  it("resolves lead and admin links inside their own nav pools", () => {
    expect(unreadTabsFor([note("/lead/workshops")], "lead").has("workshops")).toBe(true);
    expect(unreadTabsFor([note("/admin/requests")], "admin").has("seats")).toBe(true);
  });

  it("does not light up a console tab for a link that workspace cannot open", () => {
    // Department-task notifications link /student/work. A lead sees the board
    // elsewhere, and the admin console has no student tab; a dot on Console or
    // Overview would point at a page that does not contain the thing.
    expect(unreadTabsFor([note("/student/work")], "lead").size).toBe(0);
    expect(unreadTabsFor([note("/student/work")], "admin").size).toBe(0);
    expect(unreadTabsFor([note("/lead/roster")], "admin").size).toBe(0);
  });

  it("marks a group when any of its children is unread", () => {
    const unread = unreadTabsFor([note("/student/work")], "student");
    const build = studentNav.find((n) => n.id === "build");
    expect(navHasUnread(build, unread)).toBe(true);
    expect(navHasUnread(studentNav.find((n) => n.id === "learn"), unread)).toBe(false);
  });

  it("marks a top-level leaf with no children", () => {
    const unread = unreadTabsFor([note("/lead/roster")], "lead");
    expect(navHasUnread(leadNav.find((n) => n.id === "roster"), unread)).toBe(true);
  });
});
