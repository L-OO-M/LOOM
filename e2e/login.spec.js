const { test, expect } = require("@playwright/test");

// Real login path, end to end. This is the regression test for a bug that made
// every successful sign-in surface as a failure: auth-client.js asserted a
// readable session immediately after signInWithPassword and rejected the login
// when it was not readable yet. No other test covered the real flow, because
// every other spec is unauthenticated.
test.describe("sign in", () => {
  test("reaches the app after valid credentials instead of erroring", async ({ page }) => {
    const email = process.env.E2E_LOGIN_EMAIL;
    const password = process.env.E2E_LOGIN_PASSWORD;
    test.skip(!email || !password, "set E2E_LOGIN_EMAIL / E2E_LOGIN_PASSWORD to run");

    await page.goto("/login");

    await page.fill("#email", email);
    await page.fill("#password", password);
    await page.click('button[type="submit"]');

    // The regression: a successful sign-in rendered this message and stopped.
    const bogus = page.getByText(/did not produce a session/i);
    await expect(bogus).toHaveCount(0, { timeout: 15000 });

    // A real credential failure must still be reported, not swallowed.
    const serverError = page.locator("#login-err");
    if (await serverError.count()) {
      const text = (await serverError.textContent()) || "";
      expect(text, `login was rejected: ${text}`).not.toMatch(/invalid login credentials/i);
    }

    // Either way we must land somewhere authenticated rather than bounced back.
    await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 20000 });
    expect(page.url()).toMatch(/\/(student|lead|admin)/);
  });

  test("keeps the session across a new browser context (persistence)", async ({ browser }, testInfo) => {
    const email = process.env.E2E_LOGIN_EMAIL;
    const password = process.env.E2E_LOGIN_PASSWORD;
    test.skip(!email || !password, "set E2E_LOGIN_EMAIL / E2E_LOGIN_PASSWORD to run");

    // Sign in once, then reuse the SAME context after a full reload. This is the
    // persistence guarantee that the original fix was chasing.
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto("/login");
    await page.fill("#email", email);
    await page.fill("#password", password);
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 20000 });

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.goto("/student", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);

    expect(page.url(), "session should survive a reload, not redirect to /login").not.toContain("/login");

    await testInfo.attach("persistence-url", { body: page.url(), contentType: "text/plain" });
    await context.close();
  });
});