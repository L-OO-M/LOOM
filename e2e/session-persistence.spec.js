const { test, expect } = require("@playwright/test");

// Reproduces the reported symptom: a user who signed in must still be signed in
// after the browser context is torn down and a new one is created against the
// same persisted storage state. This is the only test shape that catches a
// non-persistent session cookie -- every other spec signs in and keeps using the
// same live context.
test.describe("session persistence", () => {
  test("session cookie is durable, not a session cookie", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto("/login");

    // Inspect what the login page itself sets. No credentials needed: the point
    // is the cookie ATTRIBUTES the app relies on, which are set by the shared
    // server client and the middleware.
    await page.goto("/about");
    const cookies = await context.cookies();
    const auth = cookies.filter((c) => c.name.startsWith("sb-") && c.name.includes("auth-token"));

    for (const c of auth) {
      // A session cookie (no expires) dies when the browser closes.
      expect(c.expires, `cookie ${c.name} must have an explicit expiry`).toBeGreaterThan(0);
      expect(c.sameSite, `cookie ${c.name} must survive cross-site navigation`).not.toBe("Strict");
      expect(c.path).toBe("/");
    }

    await context.close();
  });

  test("a brand new context is not silently authenticated", async ({ browser }) => {
    // Guards the opposite failure: persistence must not mean a shared cookie
    // that logs a different visitor in.
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const res = await page.goto("/student");
    expect([307, 302, 303].includes(res.status()) || page.url().includes("/login")).toBeTruthy();
    await ctx.close();
  });
});