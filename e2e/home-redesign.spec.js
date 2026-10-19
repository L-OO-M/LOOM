import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";

// Storyloom replaces the previous homepage's pillar tabs and FAQs.
test("homepage sign in and join buttons reach the existing auth pages", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Sign in", exact: true }).first().click();
  await expect(page).toHaveURL("/login");
  await expect(page.locator("#email")).toBeVisible();
  await expect(page.locator("#password")).toBeVisible();
  await page.goto("/");
  await page.getByRole("link", { name: "Start Your Journey", exact: true }).click();
  await expect(page).toHaveURL("/register");
  await expect(page.locator("h1")).toContainText("Create account");
});

test("homepage feature and legal links retain real routes", async ({ page }) => {
  await page.goto("/");
  for (const href of ["/about", "/domains", "/events", "/faq", "/contact", "/student/roadmap", "/student/opensource", "/student/mentorship", "/privacy", "/terms"]) {
    await expect(page.locator(`a[href="${href}"]`).first()).toBeAttached();
  }
  await expect(page.locator('a[href="#"]')).toHaveCount(0);
  await page.locator('a[href="/student/mentorship"]').click();
  await expect(page).toHaveURL(/\/login\?redirect=%2Fstudent%2Fmentorship/);
});

test("homepage mobile navigation closes with Escape and restores focus", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const button = page.getByRole("button", { name: "Open menu" });
  await button.click();
  await expect(page.getByRole("navigation", { name: "Mobile", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(button).toBeFocused();
  await expect(page.getByRole("navigation", { name: "Mobile", exact: true })).toHaveCount(0);
});

test("homepage carousel supports buttons and keyboard", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const carousel = page.getByRole("region", { name: "Technical domains" });
  await carousel.scrollIntoViewIfNeeded();
  await expect(carousel.locator(".pl-sr")).toContainText("AI & Machine Learning");
  await carousel.getByRole("button", { name: "Next", exact: true }).click();
  await expect(carousel.locator(".pl-sr")).toContainText("Web Development");
  await carousel.focus();
  await carousel.press("ArrowLeft");
  await expect(carousel.locator(".pl-sr")).toContainText("AI & Machine Learning");
});

for (const theme of ["dark", "light"]) {
  for (const width of [1440, 390]) {
    test(`homepage layout and screenshot: ${theme} at ${width}px`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== "chromium", "Viewport is explicitly selected here.");
      await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.addInitScript(value => localStorage.setItem("loom-theme", value), theme);
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.goto("/");
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      await expect(page.locator("h1")).toContainText("Weaving the future");
      await expect(page.locator("h1")).toHaveCount(1);
      await expect(page.getByRole("link", { name: "Start Your Journey", exact: true })).toBeVisible();
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /^https?:\/\//);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      for (const image of await page.locator('img[src^="/storyloom/"]').all()) {
        await image.scrollIntoViewIfNeeded();
        await expect(image).toHaveJSProperty("complete", true);
        expect(await image.evaluate(node => node.naturalWidth)).toBeGreaterThan(0);
      }
      await page.getByRole("link", { name: "L.O.O.M. home" }).scrollIntoViewIfNeeded();
      await mkdir(".screenshots", { recursive: true });
      await page.screenshot({ path: `.screenshots/storyloom-${theme}-${width}.png`, fullPage: true, style: "nextjs-portal { display: none; }" });
      expect(errors).toEqual([]);
    });
  }
}

test("homepage theme selection persists when opening login", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("loom-theme", "dark"));
  await page.goto("/");
  await page.getByRole("button", { name: "Switch to light mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByRole("link", { name: "Sign in", exact: true }).first().click();
  await expect(page).toHaveURL("/login");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator(".story-home")).toHaveCount(0);
});
