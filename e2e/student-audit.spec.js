const { test, expect } = require("@playwright/test");

// Authenticated STUDENT audit. Every other spec in this repo is unauthenticated
// (route protection only), so the student surface had no runtime coverage at
// all: a page could render an error boundary, a button could dead-end, and no
// test would notice. This suite logs in as the dedicated local E2E student
// (load/seed-e2e-student.js) and walks the real pages.
//
// Requires E2E_LOGIN_EMAIL / E2E_LOGIN_PASSWORD in .env.local, and the seeded
// fixture rows. Skips itself otherwise, like login.spec.js.

const EMAIL = process.env.E2E_LOGIN_EMAIL;
const PASSWORD = process.env.E2E_LOGIN_PASSWORD;
test.skip(!EMAIL || !PASSWORD, "set E2E_LOGIN_EMAIL / E2E_LOGIN_PASSWORD to run the student audit");

// The sweep touches ~30 routes on a dev server that compiles them on demand.
test.describe.configure({ timeout: 300_000 });

// Fixture ids from the seed script / tenant data.
const NODE = "ai_feature_engineering_preprocessing";
const RESOURCE = "res_ml_crash";
const PROJECT = "8a2e855d-0e6b-49d3-bcb9-de2afca1e6cf";
const EVENT = "6239a0db-56b8-491c-9766-b694929d74d2";
const CONTEST = "3f16900b-277b-4ab6-9472-95147d3c34d8";
const THREAD = "1e0c8c7d-724b-46b6-a9a2-f8f2bde88b15";
const PEER = "gameryash";

const STATIC_ROUTES = [
  "/student",
  "/student/roadmap",
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
  `/student/projects/${PROJECT}`,
  `/student/events/${EVENT}`,
  `/student/contests/${CONTEST}`,
  `/student/community/forums/${THREAD}`,
  "/student/community/wiki/welcome",
  "/student/network/demo-college",
  `/student/${PEER}`,
];

const REDIRECT_ROUTES = [
  // alias routes that should land somewhere real, never 404 or blank
  "/student/onboarding",
  "/student/insights",
  "/student/privacy",
];

// One sign-in, reused across every test in the worker.
let statePromise;
function signedInState(browser) {
  if (!statePromise) {
    statePromise = (async () => {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      await page.goto("/login");
      await page.fill("#email", EMAIL);
      await page.fill("#password", PASSWORD);
      await page.click('button[type="submit"]');
      await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 30_000 });
      const state = await ctx.storageState();
      await ctx.close();
      return state;
    })();
  }
  return statePromise;
}

test.beforeEach(async ({ context, browser }) => {
  const state = await signedInState(browser);
  if (state.cookies?.length) await context.addCookies(state.cookies);
});

// Visit a route and collect everything a student would judge it by: HTTP
// status, console/page errors, and any visible hard-failure text.
async function visit(page, path) {
  const errors = [];
  const onConsole = (m) => {
    if (m.type() !== "error") return;
    const t = m.text();
    if (/favicon|Download the React DevTools|React DevTools/i.test(t)) return;
    errors.push(t);
  };
  const onPageError = (e) => errors.push(`pageerror: ${e.message}`);
  page.on("console", onConsole);
  page.on("pageerror", onPageError);

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

  const body = await page.locator("body").innerText().catch(() => "");
  return { status, url: page.url(), errors, body };
}

function assertClean(label, r) {
  expect.soft(r.status, `${label} -> HTTP status`).toBeGreaterThan(0);
  expect.soft(r.status, `${label} -> HTTP status`).toBeLessThan(400);
  expect.soft(r.errors, `${label} -> console/page errors`).toEqual([]);
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

test("every dynamic student route loads with no console errors", async ({ page }) => {
  for (const path of DYNAMIC_ROUTES) {
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
  const share = page.getByRole("button", { name: /create signed proof link|issue link/i });
  test.skip(!(await appears(share)), "no share control on this account");

  const [req] = await Promise.all([
    page.waitForResponse((r) => r.url().includes("/api/credentials") && r.request().method() === "POST"),
    share.first().click()
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
  await page.goto(`/student/events/${EVENT}`, { waitUntil: "domcontentloaded" });
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
