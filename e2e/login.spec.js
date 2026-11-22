const { test, expect } = require("@playwright/test");

// The auth surface: two real paths, no credential form on our origin.
//
// This replaces the old credential regression suite (a successful Supabase
// sign-in used to render "did not produce a session"). Sign-in now completes on
// Auth0, so the assertions are about the shape of the surface, the destination
// each button carries, and the retired endpoint staying retired.
test.describe("sign in", () => {
  test("offers email/password without a local credential form", async ({ page }) => {
    await page.goto("/login");

    // GitHub sign-in is hidden for now (lib/auth-providers.js,
    // docs/31-known-issues.md). The route and Auth0 connection still exist, so
    // this asserts the button is absent -- not that the path was deleted.
    await expect(page.getByRole("link", { name: /Continue with GitHub/i })).toHaveCount(0);

    // `screen_hint=login` is the whole point: without it Auth0 can open the
    // "Create account" tab, and a member who just set a password is told their
    // account already exists.
    const email = page.getByRole("link", { name: /Continue with email & password/i });
    await expect(email).toBeVisible();
    await expect(email).toHaveAttribute("href", /^\/auth\/login\?screen_hint=login&returnTo=/);

    // Credentials are entered on Auth0, never here; a stray form would mean a
    // second credential path exists again.
    await expect(page.locator("input#email")).toHaveCount(0);
    await expect(page.locator("input#password")).toHaveCount(0);
    await expect(page.locator("form")).toHaveCount(0);
    await expect(page.getByText(/legacy email\/password/i)).toHaveCount(0);

    // Bootstrap is operator-driven (a code handed out of band). The public
    // sign-in page must not advertise /setup as a self-service land grab.
    await expect(page.getByText(/claim the first admin/i)).toHaveCount(0);
    await expect(page.locator('a[href="/setup"]')).toHaveCount(0);
  });

  test("renders a coded callback failure as a message, not a raw error page", async ({ page }) => {
    await page.goto("/login?error=provider_disabled");
    // Next's route announcer is also role=alert; target the page's own banner.
    await expect(page.locator('p[role="alert"]')).toContainText(/GitHub sign-in is not available/i);
    // The provider's own wording never reaches the page.
    await expect(page.getByText(/connection is not enabled/i)).toHaveCount(0);
  });

  test("carries a sanitized destination to the email path", async ({ page }) => {
    await page.goto("/login?redirect=/student/roadmap");
    const target = encodeURIComponent("/student/roadmap");

    await expect(page.getByRole("link", { name: /Continue with email & password/i })).toHaveAttribute(
      "href",
      `/auth/login?screen_hint=login&returnTo=${target}`
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

  test("register offers the same single path", async ({ page }) => {
    await page.goto("/register");
    await expect(page.getByRole("link", { name: /Sign up with GitHub/i })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /Sign up with email or username/i })).toBeVisible();
    await expect(page.locator("form")).toHaveCount(0);
    await expect(page.locator("input#password")).toHaveCount(0);
  });
});
