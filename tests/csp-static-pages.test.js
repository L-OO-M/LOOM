import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";

// The policy in lib/csp.js carries a per-request nonce, and Next only stamps
// that nonce onto the inline bootstrap scripts of dynamically rendered HTML.
// A page marked `force-static` is prerendered at build time: its scripts ship
// with no nonce and the browser blocks them, which silently kills client
// interactivity (theme toggle, mobile nav, footer canvas). These pages were all
// force-static before the nonce CSP landed, so guard them.
const PUBLIC_PAGES = ["about", "contact", "domains", "faq", "privacy", "terms"];

const root = process.cwd();
const read = (...parts) => readFile(path.join(root, ...parts), "utf8");

describe("nonce CSP requires dynamic rendering", () => {
  it.each(PUBLIC_PAGES)("app/%s/page.jsx is not prerendered", async (page) => {
    const source = await read("app", page, "page.jsx");
    expect(source).not.toMatch(/export\s+const\s+dynamic\s*=\s*["']force-static["']/);
    expect(source).not.toMatch(/export\s+const\s+revalidate\s*=/);
    expect(source).toMatch(/export\s+const\s+dynamic\s*=\s*["']force-(static|dynamic)["']/);
    expect(source).toMatch(/["']force-dynamic["']/);
  });

  it("the root layout reads request headers so every route can be nonced", async () => {
    const source = await read("app", "layout.jsx");
    expect(source).toMatch(/from\s+["']next\/headers["']/);
    expect(source).toMatch(/await\s+headers\(\)/);
  });

  it("middleware publishes the policy on the response, not only the request", async () => {
    const source = await read("middleware.js");
    expect(source).toMatch(/Content-Security-Policy/);
    expect(source).toMatch(/x-nonce/);
  });

  it("keeps SEO text files inside the matcher so they still carry the CSP", async () => {
    // These paths were excluded from the matcher when the CSP lived in
    // next.config.mjs. Now that middleware owns the header, an exclusion means
    // /sitemap.xml, /robots.txt and *.txt silently lose it -- e2e/public.spec.js
    // asserts /sitemap.xml carries the header, so guard the matcher.
    const source = await read("middleware.js");
    const matcher = source.match(/matcher:\s*\[([\s\S]*?)\]/);
    expect(matcher).not.toBeNull();
    // Only the quoted pattern counts; the comments above it explain the change.
    const pattern = (matcher[1].match(/"[^"]*"/g) || []).join(" ");
    expect(pattern).not.toContain("sitemap.xml");
    expect(pattern).not.toContain("robots.txt");
    expect(pattern).not.toMatch(/\|txt\|/);
    expect(source).toMatch(/SEO_TEXT_PATHS/);
  });
});
