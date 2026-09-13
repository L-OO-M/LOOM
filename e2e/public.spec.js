const { test, expect } = require("@playwright/test");

test.describe("L.O.O.M. public pages", () => {
  test("home page loads with correct title", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("h1")).toContainText("Build the future");
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