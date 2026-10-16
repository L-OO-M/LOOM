import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { studentNav, studentAliases, pathToTab } from "@/lib/nav";

// The help feature was fully built and completely unreachable: migration 028
// created the tables, lib/recommend.js implemented matching, four API routes
// were permission-checked -- and nothing in the UI called them. Two
// notifications linked to /student/help, which did not exist. These guard the
// pieces that made it invisible.
describe("help feature reachability", () => {
  it("exposes a /student/help page", () => {
    expect(existsSync("app/(app)/student/help/page.jsx")).toBe(true);
  });

  // studentNav is nested: groups hold children. Flatten before asserting.
  const flatNav = studentNav.flatMap((item) => (item.children ? item.children : [item]));

  it("links /student/help from the student nav", () => {
    const item = flatNav.find((i) => i.id === "help");
    expect(item, "nav must contain a help entry").toBeTruthy();
    expect(item.href).toBe("/student/help");
  });

  it("maps /student/help back to the help tab", () => {
    expect(pathToTab("/student/help", "student")).toBe("help");
  });

  it("has an icon for the nav entry", () => {
    const item = flatNav.find((i) => i.id === "help");
    const shell = readFileSync("components/AppShell.jsx", "utf8");
    // An unmapped icon silently renders Home, so assert the mapping exists.
    expect(shell).toContain(`"${item.icon}":`);
  });

  it("every studentNav href resolves to a real page", () => {
    // /student/certificates is a dynamic route: certificates/[code] owns it.
    const dynamic = new Set(["/student/certificates"]);
    const missing = flatNav
      .filter((i) => i.href && i.href.startsWith("/") && !dynamic.has(i.href))
      .filter((i) => !existsSync(`app/(app)${i.href}/page.jsx`) && !existsSync(`app${i.href}/page.jsx`));
    expect(missing.map((m) => m.href)).toEqual([]);
  });

  it("every alias href resolves too", () => {
    // Same dynamic-route exception as the nav check.
    const dynamic = new Set(["/student/certificates"]);
    const missing = studentAliases
      .filter((a) => a.href.startsWith("/") && !dynamic.has(a.href))
      .filter((a) => !existsSync(`app/(app)${a.href}/page.jsx`));
    expect(missing.map((m) => m.href)).toEqual([]);
  });
});

describe("helper enrollment requires consent", () => {
  it("does not auto-enroll every member as an available helper", () => {
    const authServer = readFileSync("lib/auth-server.js", "utf8");
    const insert = authServer.slice(
      authServer.indexOf("INSERT INTO helper_profiles"),
      authServer.indexOf("INSERT INTO helper_profiles") + 260
    );
    // This used to insert available = true on every authenticated request,
    // silently listing every member as a helper with no opt-out anywhere.
    expect(insert).toContain("false");
    expect(insert).not.toMatch(/VALUES[^;]*\btrue\b/);
  });

  it("only refreshes last_active_at on conflict, never flips availability", () => {
    const authServer = readFileSync("lib/auth-server.js", "utf8");
    const i = authServer.indexOf("INSERT INTO helper_profiles");
    const stmt = authServer.slice(i, i + 400);
    expect(stmt).toContain("ON CONFLICT (user_id) DO UPDATE SET last_active_at");
    expect(stmt).not.toMatch(/DO UPDATE SET[^;]*available=/);
  });

  it("still offers an explicit opt-in through the API", () => {
    const route = readFileSync("app/api/help/profile/route.js", "utf8");
    expect(route).toContain("available: z.boolean()");
  });
});