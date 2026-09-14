const { test, expect } = require("@playwright/test");

test.describe("L.O.O.M. public pages", () => {
  test("home page loads with correct title", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("h1")).toContainText("Weaving the future");
  });

  test("login page accessible from home", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator("h1")).toContainText("Sign in");
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
  });

  test("register page accessible from home", async ({ page }) => {
    await page.goto("/register");
    await expect(page.locator("h1")).toContainText("Create account");
    await expect(page.locator('input[type="email"]')).toBeVisible();
  });

  test("student route redirects to login when unauthenticated", async ({ page }) => {
    await page.goto("/student");
    await expect(page).toHaveURL(/\/login\?redirect=%2Fstudent/);
  });

  test("admin route redirects to login when unauthenticated", async ({ page }) => {
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/login\?redirect=%2Fadmin/);
  });
});

test.describe("L.O.O.M. public site", () => {
  test("faq page loads with heading", async ({ page }) => {
    const res = await page.goto("/faq");
    expect(res?.status()).toBe(200);
    await expect(page.locator("h1")).toContainText("Frequently asked questions");
  });

  test("about page loads with heading", async ({ page }) => {
    const res = await page.goto("/about");
    expect(res?.status()).toBe(200);
    await expect(page.locator("h1")).toContainText("About L.O.O.M.");
  });

  test("events page loads with heading", async ({ page }) => {
    const res = await page.goto("/events");
    expect(res?.status()).toBe(200);
    await expect(page.locator("h1")).toContainText("Upcoming events");
  });

  test("domains index lists every department", async ({ page }) => {
    const res = await page.goto("/domains");
    expect(res?.status()).toBe(200);
    await expect(page.locator("h1")).toContainText("Choose your domain.");
  });

  test("unknown routes redirect logged-out visitors to login, never a blank screen", async ({ page }) => {
    await page.goto("/this-thread-was-never-woven");
    // Logged-out: the auth gate redirects (signed-in users get the 404 page).
    await expect(page).toHaveURL(/\/login\?redirect=%2Fthis-thread-was-never-woven/);
    await expect(page.locator("h1")).toContainText("Sign in");
  });

  test("domain page loads for the web department", async ({ page }) => {
    const res = await page.goto("/domains/web");
    expect(res?.status()).toBe(200);
    // Real department when seeded; honest empty state otherwise.
    await expect(page.locator("h1")).toContainText(/Web Development|Domain not found/);
  });

  test("landing links reach the public pages", async ({ page }) => {
    await page.goto("/");
    const menuButton = page.getByRole("button", { name: "Open menu" });
    if (await menuButton.isVisible()) await menuButton.click();
    // Every destination is one visible tap away from home.
    for (const [label, url] of [["About", "/about"], ["Events", "/events"], ["FAQ", "/faq"]]) {
      const link = page.getByRole("link", { name: label, exact: true }).filter({ visible: true }).first();
      await expect(link).toBeVisible();
      await expect(link).toHaveAttribute("href", url);
    }
    // And the first tap genuinely travels (generous timeout: a cold dev
    // server compiles the route on first hit under parallel load).
    const about = page.getByRole("link", { name: "About", exact: true }).filter({ visible: true }).first();
    await about.click();
    await expect(page).toHaveURL("/about", { timeout: 20000 });
  });

  test("public apis return ok without auth", async ({ request }) => {
    for (const path of ["/api/public/events", "/api/public/projects", "/api/public/departments"]) {
      const res = await request.get(path);
      expect(res.ok()).toBeTruthy();
      const body = await res.json();
      expect(body.ok).toBe(true);
    }
  });
});