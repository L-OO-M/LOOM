import { describe, expect, it } from "vitest";
import { adminNav, groupForTab, mobileNav, pathToTab, studentAliases, studentNav, studentSecondary } from "@/lib/nav";

describe("five-verb navigation", () => {
  it("resolves leaf destinations, not groups", () => {
    expect(pathToTab("/student", "student")).toBe("dashboard");
    expect(pathToTab("/student/roadmap", "student")).toBe("roadmap");
    expect(pathToTab("/student/roadmap/node_1", "student")).toBe("roadmap");
    expect(pathToTab("/student/opensource", "student")).toBe("opensource");
    expect(pathToTab("/student/community/forums/abc", "student")).toBe("community");
    expect(pathToTab("/student/contests", "student")).toBe("challenges");
    expect(pathToTab("/student/leaderboard", "student")).toBe("standings");
    expect(pathToTab("/student/credentials", "student")).toBe("proof");
    expect(pathToTab("/student/mentorship", "student")).toBe("mentors");
    expect(pathToTab("/student/network", "student")).toBe("chapters");
    expect(pathToTab("/student/unknown-xyz", "student")).toBe("people");
    expect(pathToTab("/admin", "admin")).toBe("overview");
    expect(pathToTab("/admin/events", "admin")).toBe("events");
  });

  it("folds demoted routes into their owning verb", () => {
    expect(pathToTab("/student/insights", "student")).toBe("dashboard");
    expect(pathToTab("/student/onboarding", "student")).toBe("dashboard");
    expect(pathToTab("/student/privacy", "student")).toBe("settings");
    expect(pathToTab("/student/certificates/ABC123", "student")).toBe("proof");
  });

  it("treats bare usernames as people", () => {
    expect(pathToTab("/student/aarav", "student")).toBe("people");
  });

  it("maps leaves back to their verb for highlighting", () => {
    expect(groupForTab(studentNav, "resources")?.id).toBe("learn");
    expect(groupForTab(studentNav, "github")?.id).toBe("build");
    expect(groupForTab(studentNav, "opensource")?.id).toBe("build");
    expect(groupForTab(studentNav, "proof")?.id).toBe("prove");
    expect(groupForTab(studentNav, "challenges")?.id).toBe("prove");
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

  it("exposes challenges in the mobile bar without duplicate destinations", () => {
    const hrefs = mobileNav.map((n) => n.href);
    expect(hrefs).toContain("/student/contests");
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });
});
