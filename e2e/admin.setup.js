const { test: setup, expect } = require("@playwright/test");
const fs = require("node:fs");
const path = require("node:path");
const { ADMIN_STATE_FILE } = require("./auth-state");

// Operator (admin) sign-in for e2e/admin-audit.spec.js.
//
// The student session in auth.setup.js proves the member surface. It cannot
// reach /admin or /lead, so nothing exercised those pages in a browser and two
// admin APIs were returning 500 in production (a dropped column in the ranking
// queue and a dropped email column in the attendee export) without a single
// failing test. This setup creates the second, separate session the operator
// audit needs.
//
// Skips itself when E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD are absent, exactly like
// auth.setup.js, so a clone without operator credentials still runs everything
// else.
const EMAIL = process.env.E2E_ADMIN_EMAIL;
const PASSWORD = process.env.E2E_ADMIN_PASSWORD;

setup.skip(!EMAIL || !PASSWORD, "set E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD to create the operator session");
setup.setTimeout(120_000);

setup("sign in once as the operator and save the session", async ({ page }) => {
  const clientErrors = [];
  page.on("pageerror", (error) => clientErrors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") clientErrors.push(`console: ${message.text()}`);
  });

  await page.goto("/login");
  // Wait for hydration before submitting: a click that lands before React
  // attaches the form's onSubmit handler makes the browser perform a native
  // GET /login? instead of calling /api/auth/login.
  await page.waitForLoadState("networkidle").catch(() => {});
  try {
    await page.waitForFunction(
      () => {
        const form = document.querySelector("form");
        return form && Object.keys(form).some((key) => key.startsWith("__reactProps$"));
      },
      undefined,
      { timeout: 30_000 }
    );
  } catch {
    throw new Error(`Login form did not hydrate. ${clientErrors.join(" | ") || "No client errors reported."}`);
  }
  await page.fill("#email", EMAIL);
  await page.fill("#password", PASSWORD);
  const [loginResponse] = await Promise.all([
    page.waitForResponse((response) => response.url().includes("/api/auth/login"), { timeout: 60_000 }),
    page.click('button[type="submit"]')
  ]);
  expect(loginResponse.status(), "POST /api/auth/login").toBe(200);
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 60_000 });
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});

  // The probe runs inside the page: the session cookie is Secure in a production
  // build, and Playwright's APIRequestContext will not send it over HTTP.
  const probe = await page.evaluate(async () => {
    const response = await fetch("/api/profile");
    const body = await response.json().catch(() => null);
    return { status: response.status, role: body?.data?.profile?.role ?? null };
  });
  expect(probe.status, "session is usable after sign-in").toBe(200);
  expect(["admin", "platform_admin"], "the account really is an operator").toContain(probe.role);

  fs.mkdirSync(path.dirname(ADMIN_STATE_FILE), { recursive: true });
  await page.context().storageState({ path: ADMIN_STATE_FILE });
});
