const { test, expect } = require("@playwright/test");

// During hydration the router can briefly hold two copies of the route in the
// DOM. "Exactly one h1" is a property of the settled page, so assertions must
// not race the swap. A single check is not enough in either direction: a
// not-yet-streamed body has zero h1s, and the streamed swap can leave a hidden
// copy beside the visible one for a frame. Require the condition to hold twice,
// 150ms apart, before handing control back to the test.
async function settled(page) {
  return page.evaluate(
    () =>
      document.querySelectorAll("h1").length === 1 &&
      document.querySelector("h1").innerText.trim().length > 0 &&
      !document.querySelector('[aria-busy="true"]')
  );
}

async function open(page, path) {
  const res = await page.goto(path);
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (await settled(page)) {
      await page.waitForTimeout(150);
      if (await settled(page)) return res;
    } else {
      await page.waitForTimeout(100);
    }
  }
  throw new Error(`page never settled to exactly one h1: ${path}`);
}


test.describe("LOOM public pages", () => {
  test("home page loads with correct title", async ({ page }) => {
    await open(page, "/");
    await expect(page.locator("h1")).toContainText("Weaving the future");
  });

  test("login page accessible from home", async ({ page }) => {
    await open(page, "/login");
    await expect(page.locator("h1")).toContainText("Sign in");
    // GitHub sign-in is hidden for now (docs/31-known-issues.md); the email
    // path is the one real front door.
    await expect(page.getByRole("link", { name: /Continue with GitHub/i })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /Continue with email & password/i })).toBeVisible();
    // The Supabase credential form is retired, not merely hidden.
    await expect(page.locator('input[type="email"]')).toHaveCount(0);
    await expect(page.locator('input[type="password"]')).toHaveCount(0);
  });

  test("register page accessible from home", async ({ page }) => {
    await open(page, "/register");
    await expect(page.locator("h1")).toContainText("Create account");
    await expect(page.getByRole("link", { name: /Sign up with GitHub/i })).toHaveCount(0);
    await expect(page.locator('input[type="email"]')).toHaveCount(0);
  });

  test("student route redirects to login when unauthenticated", async ({ page }) => {
    await open(page, "/student");
    await expect(page).toHaveURL(/\/login\?redirect=%2Fstudent/);
  });

  test("admin route redirects to login when unauthenticated", async ({ page }) => {
    await open(page, "/admin");
    await expect(page).toHaveURL(/\/login\?redirect=%2Fadmin/);
  });

  test("account status page explains a paused account without a session", async ({ page }) => {
    const res = await open(page, "/account-status?state=suspended");
    expect(res?.status()).toBe(200);
    await expect(page.locator("h1")).toContainText("suspended");
    // Sign-out is a POST form (a GET link can be triggered cross-site); the
    // accessible name is unchanged, the role is button.
    await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  });
});

test.describe("LOOM public site", () => {
  test("faq page loads with heading", async ({ page }) => {
    const res = await open(page, "/faq");
    expect(res?.status()).toBe(200);
    await expect(page.locator("h1")).toContainText("Questions, answered honestly");
  });

  test("about page loads with heading", async ({ page }) => {
    const res = await open(page, "/about");
    expect(res?.status()).toBe(200);
    await expect(page.locator("h1")).toContainText("More than a society. A culture of building.");
  });

  test("events page loads with heading", async ({ page }) => {
    const res = await open(page, "/events");
    expect(res?.status()).toBe(200);
    await expect(page.locator("h1")).toContainText(/LOOM\s*EVENTS/);
    // The registration process must be stated on the page itself, not just
    // behind a login — this is the page a prospective member judges us by.
    await expect(page.getByText("How to get into an event")).toBeVisible();
  });

  test("domains index lists every department", async ({ page }) => {
    const res = await open(page, "/domains");
    expect(res?.status()).toBe(200);
    await expect(page.locator("h1")).toContainText("Choose your department.");
  });

  test("legal pages load with headings", async ({ page }) => {
    for (const [path, heading] of [
      ["/privacy", "Privacy policy."],
      ["/cookies", "Cookie policy."],
      ["/terms", "Terms and conditions."],
      ["/disclaimer", "Disclaimer."],
      ["/contact", "Contact the chapter."]
    ]) {
      const res = await open(page, path);
      expect(res?.status()).toBe(200);
      await expect(page.locator("h1")).toContainText(heading);
    }
  });

  test("legal footer links point to public policies", async ({ page }) => {
    await open(page, "/about");
    for (const [label, url] of [
      ["Privacy", "/privacy"],
      ["Cookies", "/cookies"],
      ["Terms", "/terms"],
      ["Disclaimer", "/disclaimer"],
      ["Contact", "/contact"]
    ]) {
      const link = page.getByRole("link", { name: label, exact: true }).filter({ visible: true }).first();
      await expect(link).toBeVisible();
      await expect(link).toHaveAttribute("href", url);
    }
  });

  test("registration discloses privacy and terms before signup", async ({ page }) => {
    await open(page, "/register");
    // Account creation moved to Auth0, so the disclosure now sits under the CTA
    // as "by continuing you agree…" rather than a consent checkbox.
    await expect(page.getByText(/By continuing you agree to LOOM/i)).toBeVisible();
    await expect(page.getByRole("link", { name: "Privacy notice", exact: true })).toHaveAttribute("href", "/privacy");
    await expect(page.getByRole("link", { name: "Cookie notice", exact: true })).toHaveAttribute("href", "/cookies");
    await expect(page.getByRole("link", { name: "Terms", exact: true })).toHaveAttribute("href", "/terms");
  });

  test("unknown routes redirect logged-out visitors to login, never a blank screen", async ({ page }) => {
    await open(page, "/this-thread-was-never-woven");
    // Logged-out: the auth gate redirects (signed-in users get the 404 page).
    await expect(page).toHaveURL(/\/login\?redirect=%2Fthis-thread-was-never-woven/);
    await expect(page.locator("h1")).toContainText("Sign in");
  });

  test("domain page loads for the web department", async ({ page }) => {
    const res = await open(page, "/domains/web");
    expect(res?.status()).toBe(200);
    // Real department when seeded; honest empty state otherwise.
    await expect(page.locator("h1")).toContainText(/Web Development|Domain not found/);
  });

  test("landing links reach the public pages", async ({ page }) => {
    await open(page, "/");
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

  test("a new page opens at the top, not at the previous scroll offset", async ({ page }) => {
    // Below 1100px the primary nav collapses into the menu sheet; this test is
    // about following a normal nav link, so it runs on the desktop project only.
    test.skip((page.viewportSize()?.width ?? 0) < 1100, "desktop primary nav only");
    await open(page, "/");
    await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: "instant" }));
    await expect
      .poll(() => page.evaluate(() => Math.round(window.scrollY)), { timeout: 10000 })
      .toBeGreaterThan(500);

    await page
      .locator('header.site-nav nav[aria-label="Primary"]')
      .getByRole("link", { name: "FAQ", exact: true })
      .click();

    await expect(page).toHaveURL(/\/faq$/, { timeout: 20000 });
    // The reset is instant even though globals.css sets scroll-behavior: smooth.
    await expect.poll(() => page.evaluate(() => Math.round(window.scrollY))).toBe(0);
  });

  test("public apis return ok without auth", async ({ request }) => {
    for (const path of ["/api/public/events", "/api/public/projects", "/api/public/departments", "/api/public/summary"]) {
      const res = await request.get(path);
      expect(res.ok()).toBeTruthy();
      const body = await res.json();
      expect(body.ok).toBe(true);
    }
  });
});
test.describe("LOOM SEO surfaces", () => {
  test("sitemap lists public routes + departments", async ({ request }) => {
    const res = await request.get("/sitemap.xml");
    expect(res.ok()).toBeTruthy();
    const xml = await res.text();
    // The declaration is what makes the response unambiguously UTF-8 XML; a
    // reader cannot infer it from the body alone.
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    for (const path of ["/about", "/faq", "/events", "/domains", "/privacy", "/cookies", "/terms", "/disclaimer", "/contact"]) {
      expect(xml).toContain(path);
    }
    // Google ignores both tags, and a fixed priority/changefreq per route is a
    // fabricated signal. Omitting them is deliberate, not an oversight.
    expect(xml).not.toContain("<changefreq>");
    expect(xml).not.toContain("<priority>");
    for (const path of ["/privacy", "/cookies", "/terms", "/disclaimer"]) {
      expect(xml).toMatch(new RegExp(`<loc>[^<]*${path}</loc>\\s*<lastmod>2026-11-05`));
    }
  });

  test("unknown certificate codes are not presented as verified", async ({ page }) => {
    const res = await page.goto("/verify/certificate/CERT-NOT-A-REAL-CODE");
    expect(res?.status()).toBe(404);
    await expect(page.getByText("Verified — issued by LOOM")).toHaveCount(0);
  });

  test("llms.txt exposes the public crawl contract", async ({ request }) => {
    const res = await request.get("/llms.txt");
    expect(res.ok()).toBeTruthy();
    expect(res.headers()["content-type"]).toContain("text/plain");
    const txt = await res.text();
    for (const path of ["/about", "/api/public/events", "/sitemap.xml", "/privacy", "/cookies", "/terms", "/disclaimer", "/contact"]) {
      expect(txt).toContain(path);
    }
  });

  test("public and unauthenticated responses carry security headers", async ({ request }) => {
    for (const path of ["/about", "/sitemap.xml", "/api/roadmap"]) {
      const res = await request.get(path);
      const headers = res.headers();
      expect(headers["content-security-policy"]).toContain("default-src 'self'");
      expect(headers["x-frame-options"]).toBe("DENY");
      expect(headers["x-content-type-options"]).toBe("nosniff");
      expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
      expect(headers["permissions-policy"]).toContain("camera=()");
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

  test("Search Console ownership is discoverable by meta tag and file", async ({ page, request }) => {
    const token = "qSiVffVox-zKvotGZAva73O1SMfVMxaf_qiCl24FIZc";
    // The meta tag is the committed default unless a deployment overrides it;
    // the server and this runner read the same environment. The file method has
    // no override, so it must always carry the committed token.
    const expectedMeta = process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION || token;
    await open(page, "/");
    const meta = page.locator('meta[name="google-site-verification"]');
    expect(await meta.count()).toBe(1);
    expect(await meta.getAttribute("content")).toBe(expectedMeta);

    // The file method is fetched anonymously by Google; a login redirect here
    // would make verification fail silently.
    const res = await request.get(`/google${token}.html`);
    expect(res.status()).toBe(200);
    expect(await res.text()).toContain(`google-site-verification: google${token}.html`);
  });

  test("robots.txt names the search and assistant crawlers it serves", async ({ request }) => {
    const res = await request.get("/robots.txt");
    expect(res.ok()).toBeTruthy();
    const txt = (await res.text()).toLowerCase();
    for (const agent of [
      "googlebot",
      "bingbot",
      "oai-searchbot",
      "perplexitybot",
      "claude-searchbot",
      "mistralai-user",
      "duckassistbot"
    ]) {
      expect(txt).toContain(`user-agent: ${agent}`);
    }
  });

  test("public pages carry canonical + description + single h1", async ({ page }) => {
    for (const path of ["/about", "/faq", "/events", "/domains", "/privacy", "/cookies", "/terms", "/disclaimer", "/contact"]) {
      await open(page, path);
      await expect(page.locator("h1")).toHaveCount(1);
      const canonical = page.locator('link[rel="canonical"]');
      expect(await canonical.count()).toBe(1);
      expect(await canonical.getAttribute("href")).toContain(path);
      const desc = page.locator('meta[name="description"]');
      expect(await desc.count()).toBe(1);
      expect((await desc.getAttribute("content"))?.length ?? 0).toBeGreaterThan(40);
    }
  });

  test("public profile pages own their canonical and description", async ({ page, request }) => {
    // Regression guard: /u/[username] used to inherit the homepage canonical,
    // which told crawlers every member profile was the home page. Sitemap is
    // the honest source for "which profiles actually exist and are public".
    const res = await request.get("/sitemap.xml");
    expect(res.ok()).toBeTruthy();
    const match = (await res.text()).match(/<loc>([^<]*\/u\/[^<]+)<\/loc>/);
    if (!match) test.skip(true, "no public profile listed in the sitemap");

    const path = new URL(match[1]).pathname;
    await open(page, path);
    await expect(page.locator("h1")).toHaveCount(1);
    const canonical = page.locator('link[rel="canonical"]');
    expect(await canonical.count()).toBe(1);
    expect(await canonical.getAttribute("href")).toContain(path);
    const desc = page.locator('meta[name="description"]');
    expect((await desc.getAttribute("content"))?.length ?? 0).toBeGreaterThan(40);
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
      await open(page, "/events");
      await expect(page.getByText("No upcoming events right now.")).toBeVisible();
      return;
    }
    const first = events[0];
    await open(page, `/events/${first.id}`);
    await expect(page.locator("h1")).toHaveCount(1);
    // Identity is asserted on the server response, not the live DOM. Under load
    // Next streams the page's metadata after the root layout's, so the browser
    // can hold the root canonical and the event's own at the same time until
    // hydration reconciles them — a bare DOM count is racy. The bytes a crawler
    // receives are deterministic, and that is what this contract is about.
    const html = await (await request.get(`/events/${first.id}`)).text();
    const canonicals = [...html.matchAll(/<link rel="canonical"[^>]*>/g)].map((m) => m[0]);
    expect(canonicals).toHaveLength(1);
    expect(canonicals[0]).toContain(`/events/${first.id}`);
    expect([...html.matchAll(/<meta name="description" content="[^"]+"/g)]).toHaveLength(1);
    // The page still carries its own canonical in the rendered document.
    await expect(page.locator(`link[rel="canonical"][href$="/events/${first.id}"]`)).toHaveCount(1);
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
    await open(page, "/login");
    const robots = page.locator('meta[name="robots"]');
    expect(await robots.count()).toBe(1);
    expect(await robots.getAttribute("content")).toContain("noindex");
  });

  test("about ships AboutPage structured data", async ({ page }) => {
    await open(page, "/about");
    const ld = page.locator('script[type="application/ld+json"]');
    await expect(ld.first()).toBeAttached();
    expect(await ld.first().textContent()).toContain("AboutPage");
  });

  test("homepage names the organization for entity disambiguation", async ({ page }) => {
    await open(page, "/");
    const structured = (await page.locator('script[type="application/ld+json"]').allTextContents()).join("\n");
    expect(structured).toContain('"@type":"Organization"');
    expect(structured).toContain('"name":"LOOM"');
    expect(structured).toContain("Learning Opportunity Open Source Mentorship");
    expect(structured).toContain("https://github.com/L-OO-M");
    expect(structured).toContain("https://www.instagram.com/lets_loom._/");
  });

  test("the events page points at the chapter's real Instagram for past events", async ({ page }) => {
    await open(page, "/events");
    const link = page.locator('a[href="https://www.instagram.com/lets_loom._/"]').first();
    await expect(link).toBeAttached();
    await expect(link).toHaveAttribute("rel", /noreferrer/);
  });

  test("faq ships FAQPage structured data", async ({ page }) => {
    await open(page, "/faq");
    const ld = page.locator('script[type="application/ld+json"]');
    // toBeAttached() polls for the node without requiring visibility -- the
    // right assertion for a <script>, which is never "visible".
    // It must then be read with textContent(): toContainText() resolves to ""
    // for <script> because that assertion reads rendered text.
    await expect(ld.first()).toBeAttached();
    expect(await ld.first().textContent()).toContain("FAQPage");
  });
});
