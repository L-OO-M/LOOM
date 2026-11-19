import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Contract for the HTTP surface: every route file exports at least one real
// handler, every admin/lead route imports an authorisation helper, and no route
// hands a client-supplied tenant id to a query. The last rule is the one that
// cannot be caught at runtime, so it is checked statically here.

const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) out.push(...walk(path));
    else if (entry.name === "route.js") out.push(path);
  }
  return out;
}

const ROUTES = walk("app/api");

// Public bootstrap endpoint that reports whether a first admin exists. It
// cannot read a session by definition (there is no member yet) and returns only
// a boolean, no tenant data.
const AUTH_EXEMPT = new Set(["app/api/admin/check-setup/route.js"]);

function relative(path) {
  return path.replace(/\\/g, "/");
}

function exportedMethods(source) {
  const methods = [];
  for (const method of HTTP_METHODS) {
    const pattern = new RegExp(
      `export\\s+(?:async\\s+)?(?:function\\s+${method}\\b|const\\s+${method}\\s*=)`
    );
    if (pattern.test(source)) methods.push(method);
  }
  return methods;
}

describe("API route contract", () => {
  it("discovers the full route tree", () => {
    expect(ROUTES.length).toBeGreaterThan(100);
  });

  it("exports at least one HTTP handler from every route file", () => {
    const offenders = [];
    for (const path of ROUTES) {
      const source = readFileSync(path, "utf8");
      if (exportedMethods(source).length === 0) offenders.push(relative(path));
    }
    expect(offenders).toEqual([]);
  });

  it("never exports the same method twice in one file", () => {
    const offenders = [];
    for (const path of ROUTES) {
      const source = readFileSync(path, "utf8");
      const counts = {};
      for (const method of HTTP_METHODS) {
        counts[method] = (
          source.match(
            new RegExp(`export\\s+(?:async\\s+)?(?:function|const)\\s+${method}\\b`, "g")
          ) || []
        ).length;
      }
      if (Object.values(counts).some((n) => n > 1)) offenders.push(relative(path));
    }
    expect(offenders).toEqual([]);
  });

  it("wraps admin and lead routes in an explicit authorisation check", () => {
    const offenders = [];
    const AUTH_IMPORT =
      /lib\/auth-server|lib\/requirePermission|lib\/permissions|getRequestContext|requirePermission|requireRole/;
    for (const path of ROUTES) {
      const rel = relative(path);
      if (!rel.startsWith("app/api/admin/") && !rel.startsWith("app/api/lead/")) continue;
      if (AUTH_EXEMPT.has(rel)) continue;
      if (!AUTH_IMPORT.test(readFileSync(path, "utf8"))) offenders.push(rel);
    }
    expect(offenders).toEqual([]);
  });

  it("never reads a tenant id from the request body or query string", () => {
    // Tenant is resolved server-side from the session/host, so a handler that
    // accepts `tenant_id` from input is either dead code or a leak waiting for a
    // caller. The literal string is allowed only in comments; matching on
    // destructuring keeps this from flagging documentation.
    const offenders = [];
    for (const path of ROUTES) {
      const source = readFileSync(path, "utf8");
      const lines = source.split("\n");
      lines.forEach((line, i) => {
        if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
        if (/(?:body|query|params|searchParams|data)\s*\.\s*tenant_?id\b/i.test(line)) {
          offenders.push(`${relative(path)}:${i + 1} ${line.trim()}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });

  it("keeps the GitHub webhook authenticated by signature, not by session", () => {
    const source = readFileSync("app/api/github/webhook/route.js", "utf8");
    expect(source).toMatch(/verify|signature|hmac|x-hub-signature/i);
    expect(source).not.toMatch(/getRequestContext|requireRole/);
  });

  it("keeps the public verification pages session-free", () => {
    for (const path of [
      "app/api/public/summary/route.js",
      "app/api/public/events/route.js",
      "app/api/public/projects/route.js",
      "app/api/public/departments/route.js"
    ]) {
      const source = readFileSync(path, "utf8");
      // Comments may explain why the route is not behind getRequestContext;
      // what matters is that no session helper is imported.
      expect(source, path).not.toMatch(/from\s+["']@\/lib\/auth-server["']/);
      expect(source, path).not.toMatch(/from\s+["']@\/lib\/requirePermission["']/);
    }
  });
});
