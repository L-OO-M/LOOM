const { test, expect } = require("@playwright/test");

// Unauthenticated route protection: every protected page redirects to /login,
// every protected API returns 401 (except the HMAC-verified GitHub webhook).
const protectedPages = [
  "/student",
  "/student/roadmap",
  "/student/resources",
  "/student/projects",
  "/student/projects/new",
  "/student/github",
  "/student/contests",
  "/student/mentorship",
  "/student/mentorship/sessions",
  "/student/mentorship/manage",
  "/student/mentorship/some-mentor-id",
  "/student/leaderboard",
  "/student/notifications",
  "/student/privacy",
  "/student/settings",
  "/student/onboarding",
  "/admin",
  "/admin/analytics",
  "/admin/students",
  "/admin/roadmaps",
  "/admin/resources",
  "/admin/projects",
  "/admin/contests",
  "/admin/mentors",
  "/admin/flags",
  "/admin/audit",
  "/admin/settings",
  "/admin/faq",
  "/admin/finance",
  "/admin/reports",
  "/admin/handover",
  "/admin/departments",
  "/lead"
];

test.describe("route protection", () => {
  for (const path of protectedPages) {
    test(`${path} redirects to login when unauthenticated`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login\?redirect=/);
    });
  }

  // Server-level publicity: /setup must serve 200, not a login redirect.
  // (The page itself bounces logged-out browsers to /login via client JS
  // because claiming admin needs a user — asserting on page URL races that
  // bounce and flakes. The status code tests exactly what "public" means here.)
  test("setup is public (first-admin bootstrap)", async ({ request }) => {
    const res = await request.get("/setup");
    expect(res.status()).toBe(200);
    expect(res.url()).toMatch(/\/setup$/);
  });
});

test.describe("api authorization", () => {
  const apis = [
    "/api/roadmap",
    "/api/resources",
    "/api/projects",
    "/api/contests",
    "/api/mentorship",
    "/api/mentors",
    "/api/my-sessions",
    "/api/mentor/overview",
    "/api/analytics/summary",
    "/api/leaderboard",
    "/api/notifications",
    "/api/profile",
    "/api/github",
    "/api/departments",
    "/api/announcements",
    "/api/contributions",
    "/api/admin/overview",
    "/api/lead/overview",
    "/api/admin/students",
    "/api/admin/flags",
    "/api/admin/audit"
  ];
  for (const path of apis) {
    test(`GET ${path} returns 401 without session`, async ({ request }) => {
      const res = await request.get(path);
      expect(res.status()).toBe(401);
      const body = await res.json();
      expect(body.ok).toBe(false);
    });
  }

  test("POST /api/roadmap/progress returns 401 without session", async ({ request }) => {
    const res = await request.post("/api/roadmap/progress", { data: { nodeId: "x", status: "completed" } });
    expect(res.status()).toBe(401);
  });

  test("department membership writes return 401 without session", async ({ request }) => {
    const id = "00000000-0000-0000-0000-000000000000";
    for (const [method, url, data] of [
      ["post", `/api/departments/${id}/join`, {}],
      ["post", `/api/departments/${id}/request-core`, {}],
      ["patch", `/api/departments/${id}/members/some-user`, { level: "core" }]
    ]) {
      const res = method === "post"
        ? await request.post(url, { data })
        : await request.patch(url, { data });
      expect(res.status()).toBe(401);
    }
  });

  test("announcement and contribution writes return 401 without session", async ({ request }) => {
    const post = await request.post("/api/announcements", { data: { scope: "society", title: "x", body: "y" } });
    expect(post.status()).toBe(401);
    const log = await request.post("/api/contributions", { data: { kind: "project", title: "Public proof" } });
    expect(log.status()).toBe(401);
  });

  test("lead console and approvals return 401 without session", async ({ request }) => {
    const succession = await request.patch("/api/lead/succession", { data: { userId: "x", departmentId: "00000000-0000-0000-0000-000000000000", ready: true } });
    expect(succession.status()).toBe(401);
    const bulk = await request.post("/api/admin/students/bulk", { data: { userIds: ["x"], role: "core" } });
    expect(bulk.status()).toBe(401);
    const approve = await request.post("/api/events/00000000-0000-0000-0000-000000000000/approve", { data: { approve: true } });
    expect(approve.status()).toBe(401);
  });

  test("POST /api/github/webhook without signature returns 401 (not redirect)", async ({ request }) => {
    const res = await request.post("/api/github/webhook", {
      headers: { "x-github-event": "push", "x-github-delivery": "test" },
      data: "{}"
    });
    expect([400, 401]).toContain(res.status());
  });
});

test.describe("operations api authorization", () => {
  const id = "00000000-0000-0000-0000-000000000000";
  const getApis = [
    "/api/volunteers",
    "/api/reports",
    "/api/reports/export?scope=semester",
    "/api/handover",
    "/api/finance"
  ];
  for (const path of getApis) {
    test(`GET ${path} returns 401 without session`, async ({ request }) => {
      const res = await request.get(path);
      expect(res.status()).toBe(401);
      const body = await res.json();
      expect(body.ok).toBe(false);
    });
  }

  test("volunteer signup writes return 401 without session", async ({ request }) => {
    const post = await request.post(`/api/volunteers/${id}/signup`, { data: {} });
    expect(post.status()).toBe(401);
    const del = await request.delete(`/api/volunteers/${id}/signup`);
    expect(del.status()).toBe(401);
  });

  test("volunteer slot creation returns 401 without session", async ({ request }) => {
    const res = await request.post("/api/volunteers", { data: { eventId: id, title: "Help out", capacity: 5 } });
    expect(res.status()).toBe(401);
  });

  test("report writes return 401 without session", async ({ request }) => {
    const post = await request.post("/api/reports", { data: { departmentId: id, month: "2026-09-01" } });
    expect(post.status()).toBe(401);
    const patch = await request.patch(`/api/reports/${id}`, { data: { status: "submitted" } });
    expect(patch.status()).toBe(401);
  });

  test("handover writes return 401 without session", async ({ request }) => {
    const post = await request.post("/api/handover", { data: { title: "Keys", category: "general" } });
    expect(post.status()).toBe(401);
    const patch = await request.patch(`/api/handover/${id}`, { data: { done: true } });
    expect(patch.status()).toBe(401);
  });

  test("finance writes return 401 without session", async ({ request }) => {
    const propose = await request.post("/api/finance/expenses", { data: { amount: 500, note: "Snacks for workshop" } });
    expect(propose.status()).toBe(401);
    const decide = await request.patch("/api/finance/expenses", { data: { id, decision: "approved" } });
    expect(decide.status()).toBe(401);
    const create = await request.post("/api/finance/sponsorships", { data: { name: "Acme", amount: 1000 } });
    expect(create.status()).toBe(401);
    const update = await request.put("/api/finance/sponsorships", { data: { id, status: "received" } });
    expect(update.status()).toBe(401);
  });
});
