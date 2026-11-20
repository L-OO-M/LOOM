const { test, expect } = require("@playwright/test");
const { AUTH_STATE_FILE } = require("./auth-state");

// Authenticated STUDENT audit. Every other spec in this repo is unauthenticated
// (route protection only), so the student surface had no runtime coverage at
// all: a page could render an error boundary, a button could dead-end, and no
// test would notice. This suite logs in as the dedicated local E2E student
// (load/seed-e2e-student.js) and walks the real pages.
//
// Requires E2E_AUTH0_READY=1 and an Auth0 test identity plus the seeded fixture
// rows. Skips otherwise.
//
// This used to key on E2E_LOGIN_EMAIL / E2E_LOGIN_PASSWORD, which the retired
// Supabase form consumed. Those variables no longer describe a usable session.
test.skip(
  process.env.E2E_AUTH0_READY !== "1",
  "authenticated E2E needs E2E_AUTH0_READY=1 and an Auth0 test identity"
);

// The sweep touches ~30 routes on a dev server that compiles them on demand.
test.describe.configure({ timeout: 300_000 });

// Fixture ids from the seed script / tenant data.
const NODE = "ai_feature_engineering_preprocessing";
const RESOURCE = "res_ml_crash";
const THREAD = "1e0c8c7d-724b-46b6-a9a2-f8f2bde88b15";
const PEER = "gameryash";

const STATIC_ROUTES = [
  "/student",
  "/student/roadmap",
  "/student/challenges",
  "/student/practice",
  "/student/practice/leaderboard",
  "/student/resources",
  "/student/projects",
  "/student/projects/new",
  "/student/github",
  "/student/opensource",
  "/student/credentials",
  "/student/contests",
  "/student/leaderboard",
  "/student/mentorship",
  "/student/help",
  "/student/community",
  "/student/community/forums",
  "/student/community/wiki",
  "/student/community/snippets",
  "/student/events",
  "/student/discover",
  "/student/network",
  "/student/feature-requests",
  "/student/notifications",
  "/student/settings",
];

const DYNAMIC_ROUTES = [
  `/student/roadmap/${NODE}`,
  `/student/resources/${RESOURCE}`,
  `/student/community/forums/${THREAD}`,
  "/student/community/wiki/welcome",
  "/student/network/demo-college",
  `/student/${PEER}`,
];

// Detail ids are discovered from the list pages instead of being hardcoded:
// every reseed creates new uuids, so a pinned fixture id rots into a 404 that
// says nothing about the product. Returns null when the list is honestly empty.
async function firstDetailHref(page, listPath, prefix, exclude = []) {
  await page.goto(listPath, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
  const hrefs = await page.evaluate(
    ({ prefix, exclude }) =>
      [
        ...new Set(
          [...document.querySelectorAll(`a[href^="${prefix}/"]`)].map((a) =>
            a.getAttribute("href")
          )
        ),
      ].filter((href) => href && !exclude.includes(href)),
    { prefix, exclude }
  );
  return hrefs[0] ?? null;
}

const REDIRECT_ROUTES = [
  // alias routes that should land somewhere real, never 404 or blank
  "/student/onboarding",
  "/student/insights",
  "/student/privacy",
];

// One sign-in, shared across the whole suite. The `setup` project
// (e2e/auth.setup.js) performs it and saves the session; signing in per test
// file, per project, is what used to exhaust the login rate limit and fail
// whichever spec ran ninth. See e2e/auth-state.js.
//
// Unconditional on purpose: test files are collected before the `setup`
// dependency runs, so probing for the file here would be false on a clean
// checkout and silently run these specs logged out. The dependency guarantees
// the file exists by the time a test starts, and the skip above keeps a
// credential-less clone from needing it at all.
test.use({ storageState: AUTH_STATE_FILE });

test("workspace owns the top chrome", async ({ page }) => {
  await page.goto("/student");
  await expect(page.locator(".site-nav")).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Workspace", exact: true })).toBeVisible();
  expect(await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector(".site-content")).paddingTop))).toBe(0);
});

// Visit a route and collect everything a student would judge it by: HTTP
// status, console/page errors, and any visible hard-failure text.
async function visit(page, path) {
  const errors = [];
  const failedResponses = [];
  const onResponse = (r) => {
    if (r.status() >= 400) {
      try {
        failedResponses.push(`${r.status()} ${new URL(r.url()).pathname}`);
      } catch {
        failedResponses.push(`${r.status()} ${r.url()}`);
      }
    }
  };
  const onConsole = (m) => {
    if (m.type() !== "error") return;
    const t = m.text();
    if (/favicon|Download the React DevTools|React DevTools/i.test(t)) return;
    errors.push(t);
  };
  const onPageError = (e) => errors.push(`pageerror: ${e.message}`);
  page.on("console", onConsole);
  page.on("pageerror", onPageError);
  page.on("response", onResponse);

  let status = 0;
  try {
    const res = await page.goto(path, { waitUntil: "domcontentloaded", timeout: 60_000 });
    status = res ? res.status() : 0;
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
  } catch (e) {
    errors.push(`goto failed: ${e.message}`);
  }

  page.off("console", onConsole);
  page.off("pageerror", onPageError);
  page.off("response", onResponse);

  const body = await page.locator("body").innerText().catch(() => "");
  return { status, url: page.url(), errors, failedResponses, body };
}

function assertClean(label, r) {
  expect.soft(r.status, `${label} -> HTTP status`).toBeGreaterThan(0);
  expect.soft(r.status, `${label} -> HTTP status`).toBeLessThan(400);
  expect.soft(r.errors, `${label} -> console/page errors`).toEqual([]);
  expect.soft(r.failedResponses, `${label} -> failed responses`).toEqual([]);
  expect
    .soft(r.body, `${label} -> rendered a hard failure`)
    .not.toMatch(/Application error|Unhandled Runtime Error|Internal Server Error|This page could not be found/i);
}

test("every static student route loads with no console errors", async ({ page }) => {
  for (const path of STATIC_ROUTES) {
    const r = await visit(page, path);
    assertClean(path, r);
  }
});

test("first-week journey and practice room show real account state", async ({ page }) => {
  await page.goto("/student", { waitUntil: "domcontentloaded" });
  const journey = page.getByRole("region", { name: "Your first week" });
  await expect(journey).toBeVisible();
  await expect(journey.getByText("Set your direction").first()).toBeVisible();
  await expect(journey.getByText("Finish your first milestone").first()).toBeVisible();
  await expect(journey.getByText("Connect GitHub").first()).toBeVisible();
  await expect(journey.getByText("Put a project on the board").first()).toBeVisible();

  await page.goto("/student/practice", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("Your practice record")).toBeVisible();
  if (await page.getByText("Starter practice").count()) {
    await expect(page.getByText("not scored")).toBeVisible();
  }
});

test("every dynamic student route loads with no console errors", async ({ page }) => {
  const discovered = [
    await firstDetailHref(page, "/student/projects", "/student/projects", [
      "/student/projects/new",
    ]),
    await firstDetailHref(page, "/student/events", "/student/events"),
    await firstDetailHref(page, "/student/contests", "/student/contests"),
  ].filter(Boolean);

  for (const path of [...DYNAMIC_ROUTES, ...discovered]) {
    const r = await visit(page, path);
    assertClean(path, r);
  }
});

test("alias routes redirect to a real page instead of dead-ending", async ({ page }) => {
  for (const path of REDIRECT_ROUTES) {
    const r = await visit(page, path);
    assertClean(path, r);
    expect.soft(r.url, `${path} -> final URL`).not.toContain("/login");
    expect.soft(r.url, `${path} -> final URL`).toContain("/student");
  }
});

// --- interactions: the buttons must call the real API and show feedback -----

// Client components stream in after `domcontentloaded`, so an immediate
// count() on a role locator races the hydration and yields a false "absent".
// Wait for visibility first, then decide whether to skip.
async function appears(locator, timeout = 20_000) {
  return await locator.first().waitFor({ state: "visible", timeout }).then(() => true).catch(() => false);
}

test("roadmap node page renders the node and its dependency graph", async ({ page }) => {
  await page.goto(`/student/roadmap/${NODE}`, { waitUntil: "domcontentloaded" });
  await expect(page.locator("h1")).toHaveCount(1);
  // A node detail is useless if it 404s into an error boundary.
  await expect(page.getByText(/could not be found|not found/i)).toHaveCount(0);
});

test("following a peer issues the real connection request", async ({ page }) => {
  await page.goto(`/student/${PEER}`, { waitUntil: "domcontentloaded" });
  const follow = page.getByRole("button", { name: new RegExp(`Follow ${PEER}`, "i") });
  test.skip(!(await appears(follow)), "no follow button for the fixture peer");

  const [req] = await Promise.all([
    page.waitForResponse((r) => r.url().includes("/api/social/connections") && r.request().method() === "POST"),
    follow.first().click()
  ]);
  expect(req.status(), "POST /api/social/connections").toBeLessThan(400);

  // Undo so the fixture peer's follower list is left as we found it.
  const unfollow = page.getByRole("button", { name: new RegExp(`Unfollow ${PEER}`, "i") });
  if (await appears(unfollow, 10_000)) {
    await Promise.all([
      page.waitForResponse((r) => r.url().includes("/api/social/connections")),
      unfollow.first().click()
    ]);
  }
});

test("creating a credential share link returns a real URL", async ({ page }) => {
  await page.goto("/student/credentials", { waitUntil: "domcontentloaded" });
  // The control's accessible name is stable ("Create signed proof link for …")
  // whether the form is open or revealed; if a link already exists the form
  // starts collapsed behind "Issue another link…".
  const submit = page.getByRole("button", { name: /create signed proof link/i });
  if (!(await appears(submit, 8_000))) {
    const reveal = page.getByRole("button", { name: /issue another link/i });
    if (await appears(reveal, 5_000)) await reveal.click();
  }
  test.skip(!(await appears(submit)), "no share control on this account");

  const [req] = await Promise.all([
    page.waitForResponse((r) => r.url().includes("/api/credentials") && r.request().method() === "POST"),
    submit.first().click()
  ]);
  expect(req.status(), "POST /api/credentials").toBeLessThan(400);
});

test("helper opt-in toggle issues the real profile request", async ({ page }) => {
  await page.goto("/student/help", { waitUntil: "domcontentloaded" });
  const toggle = page.getByRole("button", { name: /offer to help|stop being a helper/i });
  test.skip(!(await appears(toggle)), "no helper toggle on this page");

  const [req] = await Promise.all([
    page.waitForResponse((r) => r.url().includes("/api/help/profile")),
    toggle.first().click()
  ]);
  expect(req.status(), "PATCH /api/help/profile").toBeLessThan(400);
  // Leave the pool as we found it.
  const again = page.getByRole("button", { name: /offer to help|stop being a helper/i });
  if (await appears(again, 10_000)) await again.first().click();
});

test("peer profile Projects link is scoped to that peer", async ({ page }) => {
  await page.goto(`/student/${PEER}`, { waitUntil: "domcontentloaded" });
  const link = page.getByRole("link", { name: "Projects", exact: true }).first();
  await expect(link).toBeVisible({ timeout: 20_000 });
  const href = await link.getAttribute("href");
  expect(href, "peer Projects link carries ?owner=").toContain("/student/projects?owner=");

  await page.goto(href, { waitUntil: "domcontentloaded" });
  // The page must announce whose portfolio this is — not silently show your own.
  await expect(page.getByText(new RegExp(`@${PEER}'s portfolio`, "i"))).toBeVisible({ timeout: 20_000 });
});

test("event page hands off to a pre-filled forum composer", async ({ page }) => {
  // Same reason as DYNAMIC_ROUTES: ids come from the live list, not a reseed-old constant.
  const event = await firstDetailHref(page, "/student/events", "/student/events");
  test.skip(!event, "no event rows to open");
  await page.goto(event, { waitUntil: "domcontentloaded" });
  const link = page.getByRole("link", { name: /continue the conversation/i });
  test.skip(!(await appears(link)), "event has no conversation hand-off (past/archived)");

  await link.click();
  // Client-side nav fires no `load`, so assert on rendered state, then URL.
  await expect(page.getByText(/starting a thread about the event/i)).toBeVisible({ timeout: 20_000 });
  expect(page.url(), "handed off to the forums composer").toContain("/student/community/forums?new=1");
  await expect(page.getByLabel("Question title")).toHaveValue(/Discussion:/, { timeout: 20_000 });
});

test("same-origin links on core student pages do not 404", async ({ page, request }) => {
  const origins = ["/student", "/student/community", "/student/projects", "/student/events"];
  const seen = new Set();
  for (const from of origins) {
    await page.goto(from, { waitUntil: "domcontentloaded" });
    const hrefs = await page.$$eval("a[href]", (as) => as.map((a) => a.getAttribute("href")));
    for (const href of hrefs) {
      if (!href || !href.startsWith("/") || href.startsWith("//")) continue;
      const clean = href.split("#")[0].split("?")[0];
      if (!clean || seen.has(clean)) continue;
      seen.add(clean);
      const res = await request.get(clean, { maxRedirects: 5 });
      expect.soft(res.status(), `link ${clean} (from ${from})`).toBeLessThan(400);
    }
  }
});
