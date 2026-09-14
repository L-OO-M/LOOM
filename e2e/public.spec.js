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

  test("domain page loads for the web department", async ({ page }) => {
    const res = await page.goto("/domains/web");
    expect(res?.status()).toBe(200);
    // Real department when seeded; honest empty state otherwise.
    await expect(page.locator("h1")).toContainText(/Web Development|Domain not found/);
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