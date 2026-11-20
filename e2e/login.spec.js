const { test, expect } = require("@playwright/test");

// The auth surface: two real paths, no credential form on our origin.
//
// This replaces the old credential regression suite (a successful Supabase
// sign-in used to render "did not produce a session"). Sign-in now completes on
// Auth0, so the assertions are about the shape of the surface, the destination
// each button carries, and the retired endpoint staying retired.
test.describe("sign in", () => {
  test("offers GitHub and email/username without a local credential form", async ({ page }) => {
    await page.goto("/login");

    const github = page.getByRole("link", { name: /Continue with GitHub/i });
    await expect(github).toBeVisible();
    await expect(github).toHaveAttribute("href", /^\/auth\/login\?connection=github&returnTo=/);

    const email = page.getByRole("link", { name: /Continue with email or username/i });
    await expect(email).toBeVisible();
    await expect(email).toHaveAttribute("href", /^\/auth\/login\?returnTo=/);

    // Credentials are entered on Auth0, never here; a stray form would mean a
    // second credential path exists again.
    await expect(page.locator("input#email")).toHaveCount(0);
    await expect(page.locator("input#password")).toHaveCount(0);
    await expect(page.locator("form")).toHaveCount(0);
    await expect(page.getByText(/legacy email\/password/i)).toHaveCount(0);
  });

  test("carries a sanitized destination to both paths", async ({ page }) => {
    await page.goto("/login?redirect=/student/roadmap");
    const target = encodeURIComponent("/student/roadmap");

    await expect(page.getByRole("link", { name: /Continue with GitHub/i })).toHaveAttribute(
      "href",
      `/auth/login?connection=github&returnTo=${target}`
    );
    await expect(page.getByRole("link", { name: /Continue with email or username/i })).toHaveAttribute(
      "href",
      `/auth/login?returnTo=${target}`
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

  test("register offers the same two paths", async ({ page }) => {
    await page.goto("/register");
    await expect(page.getByRole("link", { name: /Sign up with GitHub/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /Sign up with email or username/i })).toBeVisible();
    await expect(page.locator("form")).toHaveCount(0);
    await expect(page.locator("input#password")).toHaveCount(0);
  });
});
