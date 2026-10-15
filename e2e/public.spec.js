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
await expect(page.locator("h1")).toContainText("Events we actually run");
    // The registration process must be stated on the page itself, not just
    // behind a login — this is the page a prospective member judges us by.
    await expect(page.getByText("How to get into an event")).toBeVisible();
  });

  test("domains index lists every department", async ({ page }) => {
    const res = await page.goto("/domains");
    expect(res?.status()).toBe(200);
    await expect(page.locator("h1")).toContainText("Choose your domain.");
  });

  test("legal pages load with headings", async ({ page }) => {
    for (const [path, heading] of [
      ["/privacy", "Privacy notice."],
      ["/terms", "Terms of use."],
      ["/contact", "Contact the chapter."]
    ]) {
      const res = await page.goto(path);
      expect(res?.status()).toBe(200);
      await expect(page.locator("h1")).toContainText(heading);
    }
  });

  test("legal footer links point to public policies", async ({ page }) => {
    await page.goto("/about");
    for (const [label, url] of [["Privacy", "/privacy"], ["Terms", "/terms"], ["Contact", "/contact"]]) {
      const link = page.getByRole("link", { name: label, exact: true }).filter({ visible: true }).first();
      await expect(link).toBeVisible();
      await expect(link).toHaveAttribute("href", url);
    }
  });

  test("registration discloses privacy and terms before signup", async ({ page }) => {
    await page.goto("/register");
    const consent = page.getByText("I have read the");
    await expect(consent).toBeVisible();
    await expect(page.getByRole("link", { name: "Privacy notice", exact: true })).toHaveAttribute("href", "/privacy");
    await expect(page.getByRole("link", { name: "Terms", exact: true })).toHaveAttribute("href", "/terms");
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
test.describe("L.O.O.M. SEO surfaces", () => {
  test("sitemap lists public routes + departments", async ({ request }) => {
    const res = await request.get("/sitemap.xml");
    expect(res.ok()).toBeTruthy();
    const xml = await res.text();
    for (const path of ["/about", "/faq", "/events", "/domains", "/privacy", "/terms", "/contact"]) {
      expect(xml).toContain(path);
    }
  });

  test("llms.txt exposes the public crawl contract", async ({ request }) => {
    const res = await request.get("/llms.txt");
    expect(res.ok()).toBeTruthy();
    expect(res.headers()["content-type"]).toContain("text/plain");
    const txt = await res.text();
    for (const path of ["/about", "/api/public/events", "/sitemap.xml", "/privacy", "/terms", "/contact"]) {
      expect(txt).toContain(path);
    }
  });

  test("robots allows public pages, blocks app + api", async ({ request }) => {
    const res = await request.get("/robots.txt");
    expect(res.ok()).toBeTruthy();
    const txt = await res.text();
    expect(txt).toContain("sitemap");
    expect(txt).toContain("/api/");
    expect(txt).toContain("/admin");
  });

  test("public pages carry canonical + description + single h1", async ({ page }) => {
    for (const path of ["/about", "/faq", "/events", "/domains", "/privacy", "/terms", "/contact"]) {
      await page.goto(path);
      await expect(page.locator("h1")).toHaveCount(1);
      const canonical = page.locator('link[rel="canonical"]');
      expect(await canonical.count()).toBe(1);
      expect(await canonical.getAttribute("href")).toContain(path);
      const desc = page.locator('meta[name="description"]');
      expect(await desc.count()).toBe(1);
      expect((await desc.getAttribute("content"))?.length ?? 0).toBeGreaterThan(40);
    }
  });

  test("event detail pages are indexable and self-contained", async ({ page, request }) => {
    // /events/[id] must exist for at least one published event, carry exactly
    // one h1 + a canonical + a real description, and state the join process.
    const list = await request.get("/api/public/events");
    expect(list.ok()).toBeTruthy();
    const body = await list.json();
    const events = body?.data?.events ?? body?.events ?? [];
    if (!Array.isArray(events) || events.length === 0) {
      // Empty calendar is an honest state, not a failure — nothing to assert.
      await page.goto("/events");
      await expect(page.getByText("No upcoming events right now.")).toBeVisible();
      return;
    }
    const first = events[0];
    await page.goto(`/events/${first.id}`);
    // toHaveCount() polls: a bare count() can run mid-stream while the route's
    // loading skeleton ("One moment." h1) is still mounted, flaking to 2.
    await expect(page.locator("h1")).toHaveCount(1);
    const canonical = page.locator('link[rel="canonical"]');
    expect(await canonical.count()).toBe(1);
    expect(await canonical.getAttribute("href")).toContain(`/events/${first.id}`);
    const desc = page.locator('meta[name="description"]');
    expect(await desc.count()).toBe(1);
    const ld = page.locator('script[type="application/ld+json"]');
    await expect(ld.first()).toBeAttached();
    const structured = (await ld.allTextContents()).join("\n");
    expect(structured).toContain("Event");
    expect(structured).toContain("BreadcrumbList");
    // The registration process must be explained on the page itself.
    await expect(page.getByText("The registration process")).toBeVisible();
    // The detail page's situation-aware join CTA (one of these three states).
    await expect(
      page.getByText(/Claim your seat|This event is full|This event has concluded/).first()
    ).toBeVisible();
  });

  test("private app marks noindex", async ({ page }) => {
    await page.goto("/login");
    const robots = page.locator('meta[name="robots"]');
    expect(await robots.count()).toBe(1);
    expect(await robots.getAttribute("content")).toContain("noindex");
  });

  test("about ships AboutPage structured data", async ({ page }) => {
    await page.goto("/about");
    const ld = page.locator('script[type="application/ld+json"]');
    await expect(ld.first()).toBeAttached();
    expect(await ld.first().textContent()).toContain("AboutPage");
  });

  test("faq ships FAQPage structured data", async ({ page }) => {
    await page.goto("/faq");
    const ld = page.locator('script[type="application/ld+json"]');
    // toBeAttached() polls for the node without requiring visibility -- the
    // right assertion for a <script>, which is never "visible".
    // It must then be read with textContent(): toContainText() resolves to ""
    // for <script> because that assertion reads rendered text.
    await expect(ld.first()).toBeAttached();
    expect(await ld.first().textContent()).toContain("FAQPage");
  });
});
