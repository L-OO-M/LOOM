import { describe, expect, it } from "vitest";
import { adminNav, groupForTab, pathToTab, studentNav } from "@/lib/nav";

describe("grouped navigation", () => {
  it("resolves leaf destinations, not groups", () => {
    expect(pathToTab("/student", "student")).toBe("dashboard");
    expect(pathToTab("/student/roadmap", "student")).toBe("roadmap");
    expect(pathToTab("/student/roadmap/node_1", "student")).toBe("roadmap");
    expect(pathToTab("/student/opensource", "student")).toBe("opensource");
    expect(pathToTab("/student/community/forums/abc", "student")).toBe("community");
    expect(pathToTab("/student/unknown-xyz", "student")).toBe("dashboard");
    expect(pathToTab("/admin", "admin")).toBe("overview");
    expect(pathToTab("/admin/events", "admin")).toBe("events");
  });

  it("maps leaves back to their group for highlighting", () => {
    expect(groupForTab(studentNav, "resources")?.id).toBe("learn");
    expect(groupForTab(studentNav, "github")?.id).toBe("build");
    expect(groupForTab(studentNav, "discover")?.id).toBe("people");
    expect(groupForTab(studentNav, "credentials")?.id).toBe("credentials");
    expect(groupForTab(adminNav, "audit")?.id).toBe("system");
    expect(groupForTab(adminNav, "overview")?.id).toBe("overview");
  });

  it("keeps every destination reachable exactly once", () => {
    for (const [name, pool] of [["student", studentNav], ["admin", adminNav]]) {
      const leaves = pool.flatMap((n) => (n.children ? n.children : [n]));
      const hrefs = leaves.map((n) => n.href);
      expect(new Set(hrefs).size).toBe(hrefs.length, `${name} nav has duplicate hrefs`);
    }
    expect(studentNav.length).toBeLessThanOrEqual(7);
    expect(adminNav.length).toBeLessThanOrEqual(7);
  });
});
