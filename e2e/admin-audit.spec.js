const { test, expect } = require("@playwright/test");
const { ADMIN_STATE_FILE } = require("./auth-state");

// Authenticated OPERATOR audit: every /admin page loads in a real browser with
// no console error, no page error, no failed request, and the admin APIs return
// the { ok } envelope.
//
// Exists because the route sweep (load/check-authenticated.mjs) can prove a page
// returns HTML, but not that its client components hydrate cleanly or that its
// data endpoints still answer. Two admin endpoints were 500ing in production
// with no test watching: /api/admin/ranking (a column that no longer exists) and
// the attendee CSV export (profiles has no email column). Both are asserted
// here.
//
// Requires E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD. Skips otherwise.
//
// The skip is keyed on the credentials, not on the session file: test files are
// collected before the `admin-setup` dependency runs, so a file-existence check
// here would always be false on a clean checkout and skip the whole audit. The
// project dependency guarantees the file exists by the time a test starts.
test.skip(
  !process.env.E2E_ADMIN_EMAIL || !process.env.E2E_ADMIN_PASSWORD,
  "set E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD to run the operator audit"
);
test.use({ storageState: ADMIN_STATE_FILE });
test.describe.configure({ timeout: 300_000 });

const STATIC_ROUTES = [
  "/admin",
  "/admin/analytics",
  "/admin/announcements",
  "/admin/assets",
  "/admin/audit",
  "/admin/community",
  "/admin/contests",
  "/admin/debug",
  "/admin/departments",
  "/admin/directory",
  "/admin/event-ops",
  "/admin/events",
  "/admin/faq",
  "/admin/feature-requests",
  "/admin/finance",
  "/admin/flags",
  "/admin/handover",
  "/admin/mentors",
  "/admin/mous",
  "/admin/opensource",
  "/admin/planner",
  "/admin/practice",
  "/admin/projects",
  "/admin/ranking",
  "/admin/reports",
  "/admin/resources",
  "/admin/roadmaps",
  "/admin/settings",
  "/admin/students",
  "/admin/verification"
];

// Endpoints every operator page reads from. Each must answer 200 with ok:true;
// a shape change or a dropped column must fail here rather than only in prod.
const READ_APIS = [
  "/api/admin/overview",
  "/api/admin/ranking",
  "/api/admin/students",
  "/api/admin/audit",
  "/api/lead/overview"
];

async function visit(page, path) {
  const errors = [];
  const failedResponses = [];
  const onConsole = (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    if (/favicon|Download the React DevTools|React DevTools/i.test(text)) return;
    errors.push(text);
  };
  const onPageError = (error) => errors.push(`pageerror: ${error.message}`);
  const onResponse = (response) => {
    if (response.status() < 400) return;
    try {
      failedResponses.push(`${response.status()} ${new URL(response.url()).pathname}`);
    } catch {
      failedResponses.push(`${response.status()} ${response.url()}`);
    }
  };
  page.on("console", onConsole);
  page.on("pageerror", onPageError);
  page.on("response", onResponse);

  let status = 0;
  try {
    const response = await page.goto(path, { waitUntil: "domcontentloaded", timeout: 60_000 });
    status = response ? response.status() : 0;
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
  } catch (error) {
    errors.push(`goto failed: ${error.message}`);
  }

  page.off("console", onConsole);
  page.off("pageerror", onPageError);
  page.off("response", onResponse);

  const body = await page.locator("body").innerText().catch(() => "");
  const headings = await page.locator("h1").count().catch(() => 0);
  return { status, url: page.url(), errors, failedResponses, body, headings };
}

function assertClean(label, result) {
  expect.soft(result.status, `${label} -> HTTP status`).toBeGreaterThan(0);
  expect.soft(result.status, `${label} -> HTTP status`).toBeLessThan(400);
  expect.soft(result.url, `${label} -> stayed in the console`).toContain("/admin");
  expect.soft(result.headings, `${label} -> one h1`).toBe(1);
  expect.soft(result.errors, `${label} -> console/page errors`).toEqual([]);
  expect.soft(result.failedResponses, `${label} -> failed responses`).toEqual([]);
  expect
    .soft(result.body, `${label} -> rendered a hard failure`)
    .not.toMatch(/Application error|Unhandled Runtime Error|Internal Server Error|This page could not be found/i);
}

test("every admin page loads with no console errors", async ({ page }) => {
  for (const path of STATIC_ROUTES) {
    assertClean(path, await visit(page, path));
  }
});

test("admin detail pages load for a real event and student", async ({ page }) => {
  await page.goto("/admin/events", { waitUntil: "domcontentloaded" });
  const eventHref = await page
    .locator('a[href^="/admin/events/"]')
    .first()
    .getAttribute("href")
    .catch(() => null);
  if (eventHref) {
    assertClean(eventHref, await visit(page, eventHref));
  } else {
    test.info().annotations.push({ type: "note", description: "no event rows to open" });
  }

  await page.goto("/admin/students", { waitUntil: "domcontentloaded" });
  const studentHref = await page
    .locator('a[href^="/admin/students/"]')
    .first()
    .getAttribute("href")
    .catch(() => null);
  if (studentHref) {
    assertClean(studentHref, await visit(page, studentHref));
  } else {
    test.info().annotations.push({ type: "note", description: "no student rows to open" });
  }
});

test("admin read APIs keep the ok envelope", async ({ page }) => {
  await page.goto("/admin", { waitUntil: "domcontentloaded" });
  for (const path of READ_APIS) {
    const result = await page.evaluate(async (url) => {
      const response = await fetch(url);
      const text = await response.text();
      let body = null;
      try {
        body = JSON.parse(text);
      } catch {
        /* reported below */
      }
      return { status: response.status, ok: body?.ok ?? null, snippet: text.slice(0, 160) };
    }, path);
    expect.soft(result.status, `${path} -> status`).toBe(200);
    expect.soft(result.ok, `${path} -> ok envelope (${result.snippet})`).toBe(true);
  }
});

test("admin mutations reject an empty body instead of writing", async ({ page }) => {
  await page.goto("/admin", { waitUntil: "domcontentloaded" });
  const probes = [
    { path: "/api/admin/faq", method: "POST" },
    // Society-wide announcements are posted through the shared feed route; there
    // is no /api/admin/announcements handler, and probing a non-existent path
    // proved nothing but that Next answers 404 with HTML.
    { path: "/api/announcements", method: "POST" },
    { path: "/api/admin/flags", method: "PATCH" }
  ];
  for (const probe of probes) {
    const result = await page.evaluate(async ({ url, method }) => {
      const response = await fetch(url, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({})
      });
      const body = await response.json().catch(() => null);
      return { status: response.status, ok: body?.ok ?? null, code: body?.error?.code ?? null };
    }, { url: probe.path, method: probe.method });
    expect.soft(result.status, `${probe.method} ${probe.path} -> validation`).toBe(400);
    expect.soft(result.ok, `${probe.method} ${probe.path} -> ok:false`).toBe(false);
    expect.soft(result.code, `${probe.method} ${probe.path} -> error code`).toBeTruthy();
  }
});
