import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";

// Google Search Console's HTML-file verification method requires that
// /google<token>.html be fetchable by an anonymous crawler at the site root.
// Two things silently break that, and neither is visible until verification
// fails days later:
//
//   1. The middleware auth-gates anything not in its matcher exclusion list.
//      A redirect to /login instead of the file is a verification failure that
//      looks like a Search Console problem.
//   2. The file must sit in public/ so Next serves it from the root.
const VERIFY_FILES = [
  // First Search Console property for lets-loom.xyz.
  "public/google98eae5c43ea32d19.html",
  // Current property token. A domain keeps every verification file it has ever
  // used; removing one un-verifies the property that owns it.
  "public/googleqSiVffVox-zKvotGZAva73O1SMfVMxaf_qiCl24FIZc.html",
];

describe("Search Console HTML-file verification", () => {
  it("ships every verification file in public/ so it is served at the root", () => {
    for (const file of VERIFY_FILES) expect(existsSync(file), file).toBe(true);
  });

  it("contains the exact token Google expects", () => {
    for (const file of VERIFY_FILES) {
      const body = readFileSync(file, "utf8").trim();
      const name = file.replace("public/", "");
      expect(body, file).toBe(`google-site-verification: ${name}`);
    }
  });

  it("is excluded from the middleware matcher so it is never auth-gated", () => {
    const middleware = readFileSync("middleware.js", "utf8");
    const matcher = middleware.slice(middleware.indexOf("matcher:"));
    // Without html in the extension alternation, a crawler request is redirected
    // to /login and verification silently fails. `txt` left the alternation when
    // the CSP moved into middleware: *.txt now passes through an early public
    // branch that returns before auth, which is stronger than an exclusion.
    expect(matcher).toMatch(/html\|woff2\?/);
  });

  it("is not blocked by robots.txt", () => {
    const robots = readFileSync("app/robots.js", "utf8");
    expect(robots).toContain('allow: ["/"');
    expect(robots).not.toMatch(/disallow:\s*\[[^\]]*google/i);
  });
});