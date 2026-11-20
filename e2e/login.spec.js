const { test, expect } = require("@playwright/test");

// The login surface is one door now.
//
// This replaces the old credential regression suite (a successful Supabase
// sign-in used to render "did not produce a session"). There is no credential
// form left to drive, so the assertions are about the shape of the surface and
// about the retired endpoint staying retired.
test.describe("sign in", () => {
  test("shows only the Auth0 front door", async ({ page }) => {
    await page.goto("/login");

    const cta = page.getByRole("link", { name: /Continue with Auth0/i });
    await expect(cta).toBeVisible();
    await expect(cta).toHaveAttribute("href", /^\/auth\/login\?returnTo=/);

    // The retired controls must not creep back in a future restyle.
    await expect(page.locator("input#email")).toHaveCount(0);
    await expect(page.locator("input#password")).toHaveCount(0);
    await expect(page.locator("form")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Continue with GitHub/i })).toHaveCount(0);
    await expect(page.getByText(/legacy email\/password/i)).toHaveCount(0);
  });

  test("carries a sanitized destination to Auth0", async ({ page }) => {
    await page.goto("/login?redirect=/student/roadmap");
    const cta = page.getByRole("link", { name: /Continue with Auth0/i });
    await expect(cta).toHaveAttribute(
      "href",
      `/auth/login?returnTo=${encodeURIComponent("/student/roadmap")}`
    );
  });

  test("explains a retired callback instead of looping", async ({ page }) => {
    await page.goto("/auth/supabase-callback?code=abc");
    await page.waitForURL(/\/login\?error=auth0_only/);
    await expect(page.getByRole("alert").filter({ hasText: /retired/i })).toBeVisible();
  });

  test("the retired email endpoint answers 410, not 200", async ({ request }) => {
    const res = await request.post("/api/auth/login", {
      data: { email: "someone@example.com", password: "not-a-real-password" }
    });
    expect(res.status()).toBe(410);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("AUTH0_ONLY");
  });

  test("register is Auth0-only too", async ({ page }) => {
    await page.goto("/register");
    await expect(page.getByRole("link", { name: /Continue with Auth0/i })).toBeVisible();
    await expect(page.locator("form")).toHaveCount(0);
    await expect(page.locator("input#password")).toHaveCount(0);
  });
});
